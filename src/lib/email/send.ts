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
  /** Disable re-queueing while the sync worker is already draining this action. */
  queueOnNetworkFailure?: boolean;
};

export type SendTransactionalResult =
  { ok: true; messageId?: string; queued?: boolean } | { ok: false; error: string };

// In the bundled Android APK the WebView origin is not sezapos.com, so a
// relative fetch resolves to the local WebView instead of the live server.
function sendUrl(): string {
  const path = "/lovable/email/transactional/send";
  if (isNativeMode()) return `https://sezapos.com${path}`;
  return path;
}

async function queueEmail(args: SendTransactionalArgs): Promise<SendTransactionalResult> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) {
    return { ok: false, error: "Sign in once online before using offline receipt delivery." };
  }
  const idempotencyKey = args.idempotencyKey || `email-${crypto.randomUUID()}`;
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

/**
 * Sends a transactional email through the SEZA transactional email queue.
 * When the register is offline, the request is encrypted by the browser's
 * storage boundary and queued locally until authenticated connectivity returns.
 */
export async function sendTransactionalEmail(
  args: SendTransactionalArgs,
  options: SendOptions = {},
): Promise<SendTransactionalResult> {
  const queueOnNetworkFailure = options.queueOnNetworkFailure !== false;

  if (!isOnlineNow()) {
    return queueOnNetworkFailure ? queueEmail(args) : { ok: false, error: "Offline" };
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "You must be signed in to send email." };

  try {
    const res = await fetch(sendUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        templateName: args.templateName,
        recipientEmail: args.recipientEmail,
        templateData: args.templateData ?? {},
        idempotencyKey: args.idempotencyKey,
        replyTo: args.replyTo,
      }),
    });

    const body = await res.json().catch(() => ({}) as any);
    if (!res.ok) {
      // Provider/configuration errors must be shown to the operator instead of
      // silently queued forever. Only transport failures are queued below.
      return { ok: false, error: body?.error || `Send failed (${res.status})` };
    }
    return { ok: true, messageId: body?.messageId };
  } catch (err) {
    if (queueOnNetworkFailure) return queueEmail(args);
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}
