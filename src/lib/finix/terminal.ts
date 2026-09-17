import { supabase } from "@/integrations/supabase/client";
import type { PaymentEvent, PaymentProvider, PaymentRequest, PaymentResult } from "@/lib/pos/payment-terminal";

const API_BASE = typeof window !== "undefined" && (window as any).Capacitor
  ? "https://sezapos.com"
  : "";

async function bearer() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to SEZA POS again.");
  return token;
}

async function api(path: string, init: RequestInit) {
  const token = await bearer();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  let payload: any = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.error || `Payment request failed (${response.status}).`);
  return payload;
}

export async function checkFinixTerminal() {
  return api("/api/public/pos/finix/status", { method: "GET" });
}

export const finixTerminalProvider: PaymentProvider = {
  id: "finix",
  name: "Finix",
  async charge(req: PaymentRequest, onEvent: (e: PaymentEvent) => void, signal: AbortSignal): Promise<PaymentResult> {
    if (signal.aborted) return { approved: false, finalStatus: "cancelled", message: "Payment cancelled" };
    const idempotencyId = req.idempotencyId || crypto.randomUUID();
    onEvent({ status: "connecting", message: "Connecting to Finix terminal" });
    onEvent({ status: "waiting_for_customer", message: "Tap, insert, or swipe on the payment terminal" });

    try {
      const result = await api("/api/public/pos/finix/sale", {
        method: "POST",
        signal,
        body: JSON.stringify({
          amount_cents: Math.round(req.amount * 100),
          currency: req.currency,
          idempotency_id: idempotencyId,
        }),
      });
      const finalStatus = String(result.final_status ?? "error") as PaymentResult["finalStatus"];
      const event: PaymentEvent = {
        status: finalStatus,
        message: result.message || (result.ok ? "Payment approved" : "Payment not approved"),
        reference: result.reference ?? undefined,
        cardBrand: result.card_brand ?? undefined,
        last4: result.last4 ?? undefined,
      };
      onEvent(event);
      return {
        approved: finalStatus === "approved",
        finalStatus,
        message: event.message,
        reference: event.reference,
        cardBrand: event.cardBrand,
        last4: event.last4,
      };
    } catch (error) {
      if (signal.aborted) return { approved: false, finalStatus: "cancelled", message: "Payment cancelled" };
      const message = error instanceof Error ? error.message : "Finix payment failed";
      const network = !navigator.onLine || /network|fetch|offline/i.test(message);
      const finalStatus = network ? "network_error" : "error";
      onEvent({ status: finalStatus, message });
      return { approved: false, finalStatus, message };
    }
  },
  async cancel() {
    await api("/api/public/pos/finix/cancel", { method: "POST", body: "{}" })
      .then(() => undefined)
      .catch(() => undefined);
  },
};
