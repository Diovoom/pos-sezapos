import { supabase } from "@/integrations/supabase/client";
import { isNativeMode } from "@/lib/native";
import { saveOfflineAction, readMeta } from "@/lib/offline/db";
import { isOnlineNow } from "@/lib/offline/useOnline";

export type SendTransactionalArgs = {
  templateName: string;
  recipientEmail: string;
  templateData?: Record<string, unknown>;
  idempotencyKey?: string;
  replyTo?: string;
};

type SendOptions = {
  queueOnNetworkFailure?: boolean;
};

type NativeEmailAuth = {
  store_id: string;
  device_id: string;
  device_secret: string;
  caller_id: string;
};

export type SendTransactionalResult =
  | { ok: true; messageId?: string; queued?: boolean }
  | { ok: false; error: string };

function sendUrl(): string {
  const path = "/api/email/transactional/send";
  if (isNativeMode()) return `https://sezapos.com${path}`;
  return path;
}

async function nativeEmailAuth(): Promise<NativeEmailAuth | null> {
  if (!isNativeMode()) return null;
  const [{ getPairing }, callerId] = await Promise.all([
    import("../../../capacitor-shell/lib/pairing"),
    readMeta<string>("authenticated_me_current_user"),
  ]);
  const pairing = getPairing();
  if (!pairing || !callerId) return null;
  return {
    store_id: pairing.storeId,
    device_id: pairing.deviceId,
    device_secret: pairing.deviceSecret,
    caller_id: callerId,
  };
}

async function queueEmail(args: SendTransactionalArgs): Promise<SendTransactionalResult> {
  const idempotencyKey = args.idempotencyKey || `email-${crypto.randomUUID()}`;

  if (isNativeMode()) {
    const nativeAuth = await nativeEmailAuth();
    if (!nativeAuth) {
      return { ok: false, error: "The register session is unavailable. Enter the employee PIN again." };
    }
    await saveOfflineAction({
      id: crypto.randomUUID(),
      idempotency_key: idempotencyKey,
      kind: "receipt_email",
      store_id: nativeAuth.store_id,
      user_id: nativeAuth.caller_id,
      payload: { ...args, idempotencyKey },
      local_created_at: new Date().toISOString(),
      status: "pending",
      attempts: 0,
    });
    return { ok: true, queued: true };
  }

  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return { ok: false, error: "You must be signed in to send email." };

  const storeId = await readMeta<string>("store_id");
  await saveOfflineAction({
    id: crypto.randomUUID(),
    idempotency_key: idempotencyKey,
    kind: "receipt_email",
    store_id: storeId ?? null,
    user_id: user.id,
    payload: { ...args, idempotencyKey },
    local_created_at: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  });
  return { ok: true, queued: true };
}

export async function sendTransactionalEmail(
  args: SendTransactionalArgs,
  options: SendOptions = {},
): Promise<SendTransactionalResult> {
  const queueOnNetworkFailure = options.queueOnNetworkFailure !== false;

  if (!isOnlineNow()) {
    return queueOnNetworkFailure ? queueEmail(args) : { ok: false, error: "Offline" };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let nativeAuth: NativeEmailAuth | null = null;

  if (isNativeMode()) {
    nativeAuth = await nativeEmailAuth();
    if (!nativeAuth) {
      return { ok: false, error: "The register session is unavailable. Enter the employee PIN again." };
    }
  } else {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, error: "You must be signed in to send email." };
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(sendUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        templateName: args.templateName,
        recipientEmail: args.recipientEmail,
        templateData: args.templateData ?? {},
        idempotencyKey: args.idempotencyKey,
        replyTo: args.replyTo,
        nativeAuth,
      }),
    });

    const body = await res.json().catch(() => ({}) as any);
    if (!res.ok) {
      return { ok: false, error: body?.error || `Send failed (${res.status})` };
    }
    return { ok: true, messageId: body?.messageId ?? body?.providerMessageId };
  } catch (err) {
    if (queueOnNetworkFailure) return queueEmail(args);
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}
