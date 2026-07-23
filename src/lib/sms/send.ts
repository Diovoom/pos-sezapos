import { supabase } from "@/integrations/supabase/client";
import { isNativeMode } from "@/lib/native";
import { saveOfflineAction, readMeta } from "@/lib/offline/db";
import { isOnlineNow } from "@/lib/offline/useOnline";

export type SendSmsArgs = {
  to: string; // E.164
  body: string;
  saleId?: string | null;
  idempotencyKey?: string;
  test?: boolean;
};

type SendOptions = {
  queueOnNetworkFailure?: boolean;
};

export type SendSmsResult =
  | { ok: true; providerMessageId?: string; alreadySent?: boolean; queued?: boolean }
  | { ok: false; error: string };

function sendUrl(): string {
  const path = "/lovable/sms/send";
  return isNativeMode() ? `https://sezapos.com${path}` : path;
}

async function queueSms(args: SendSmsArgs): Promise<SendSmsResult> {
  // Configuration tests should fail immediately rather than being replayed
  // later as customer-facing messages.
  if (args.test) return { ok: false, error: "Connect to the internet to test SMS settings." };

  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) {
    return { ok: false, error: "Sign in once online before using offline receipt delivery." };
  }
  const idempotencyKey = args.idempotencyKey || `sms-${crypto.randomUUID()}`;
  const storeId = await readMeta<string>("store_id");
  await saveOfflineAction({
    id: crypto.randomUUID(),
    idempotency_key: idempotencyKey,
    kind: "receipt_sms",
    store_id: storeId ?? null,
    user_id: user.id,
    payload: { ...args, idempotencyKey },
    local_created_at: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  });
  return { ok: true, queued: true };
}

export async function sendSms(
  args: SendSmsArgs,
  options: SendOptions = {},
): Promise<SendSmsResult> {
  const queueOnNetworkFailure = options.queueOnNetworkFailure !== false;

  if (!isOnlineNow()) {
    return queueOnNetworkFailure ? queueSms(args) : { ok: false, error: "Offline" };
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "You must be signed in." };

  try {
    const res = await fetch(sendUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(args),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body?.error || `Send failed (${res.status})` };
    return {
      ok: true,
      providerMessageId: body?.providerMessageId,
      alreadySent: body?.alreadySent,
    };
  } catch (err) {
    if (queueOnNetworkFailure) return queueSms(args);
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export function buildReceiptSms(params: {
  storeName: string;
  receiptNumber: string | number;
  total: string;
  paymentMethod: string;
  date: string;
  link: string;
}): string {
  return (
    `Thank you for shopping at ${params.storeName}!\n` +
    `Receipt #: ${params.receiptNumber}\n` +
    `Total Paid: ${params.total}\n` +
    `Payment: ${params.paymentMethod}\n` +
    `Date: ${params.date}\n\n` +
    `View your receipt: ${params.link}`
  );
}
