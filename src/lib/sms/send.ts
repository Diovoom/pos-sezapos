import { supabase } from "@/integrations/supabase/client";

export type SendSmsArgs = {
  to: string; // E.164
  body: string;
  saleId?: string | null;
  idempotencyKey?: string;
  test?: boolean;
};

export async function sendSms(
  args: SendSmsArgs,
): Promise<{ ok: true; providerMessageId?: string; alreadySent?: boolean } | { ok: false; error: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "You must be signed in." };

  try {
    const res = await fetch("/lovable/sms/send", {
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
