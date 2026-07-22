// Pluggable payment terminal interface.
//
// This module defines the contract that real payment providers
// (Stripe Terminal, Clover, Ingenico, PAX, Adyen, etc.) must implement.
// It intentionally contains NO simulated approvals, NO auto-cancellations,
// and NO timers that resolve payments on their own. A charge only reaches
// a terminal state (approved / declined / cancelled / timeout / error)
// when the connected provider reports it.
//
// Until a real provider is registered via `registerProvider(...)`, card
// payments cannot be taken — the checkout UI surfaces a clear "no terminal
// connected" state and blocks completion.

import { supabase } from "@/integrations/supabase/client";
import { charge as chargeStripeTerminal, disconnect as disconnectStripeTerminal } from "@/lib/hardware/terminal-stripe";

export type PaymentStatus =
  | "idle"
  | "payment_requested"
  | "connecting"
  | "waiting_for_customer"
  | "card_presented"
  | "processing"
  | "approved"
  | "declined"
  | "cancelled"
  | "timeout"
  | "network_error"
  | "error";

export type PaymentEvent = {
  status: PaymentStatus;
  message: string;
  reference?: string;
  cardBrand?: string;
  last4?: string;
};

export type PaymentMethodKind =
  | "card"
  | "tap"
  | "apple_pay"
  | "google_pay"
  | "gift_card";

export type PaymentRequest = {
  amount: number;
  currency: string;
  method: PaymentMethodKind;
};

export type PaymentResult = {
  approved: boolean;
  reference?: string;
  cardBrand?: string;
  last4?: string;
  finalStatus: PaymentStatus;
  message: string;
};

export interface PaymentProvider {
  readonly id: string;
  readonly name: string;
  /**
   * Start a charge. The promise MUST NOT resolve until the connected
   * terminal / gateway reports a real outcome. Providers are responsible
   * for their own timeout policies — this layer never fabricates one.
   */
  charge(
    req: PaymentRequest,
    onEvent: (e: PaymentEvent) => void,
    signal: AbortSignal,
  ): Promise<PaymentResult>;
  cancel?(): void;
}


const stripeTerminalProvider: PaymentProvider = {
  id: "stripe-terminal",
  name: "Stripe Terminal",
  async charge(req, onEvent, signal) {
    if (signal.aborted) return { approved: false, finalStatus: "cancelled", message: "Payment cancelled" };
    onEvent({ status: "payment_requested", message: "Payment requested" });
    const result = await chargeStripeTerminal(
      "none",
      {
        amountCents: Math.round(req.amount * 100),
        currency: req.currency.toLowerCase(),
        description: `SEZA POS ${req.method.replaceAll("_", " ")} sale`,
      },
      (message) => {
        const lower = message.toLowerCase();
        const status: PaymentStatus = lower.includes("approved")
          ? "approved"
          : lower.includes("processing") || lower.includes("creating")
            ? "processing"
            : lower.includes("tap") || lower.includes("insert") || lower.includes("swipe")
              ? "waiting_for_customer"
              : "connecting";
        onEvent({ status, message });
      },
    );
    if (signal.aborted) return { approved: false, finalStatus: "cancelled", message: "Payment cancelled" };
    if (!result.ok) {
      onEvent({ status: navigator.onLine ? "error" : "network_error", message: result.error });
      return { approved: false, finalStatus: navigator.onLine ? "error" : "network_error", message: result.error };
    }
    onEvent({ status: "approved", message: "Payment approved", reference: result.ref });
    return { approved: true, finalStatus: "approved", message: "Payment approved", reference: result.ref };
  },
  cancel() {
    void disconnectStripeTerminal();
  },
};

// Registry — empty by default. Real integrations register themselves at
// app boot (e.g. `registerProvider(stripeTerminalProvider)`).
const providers = new Map<string, PaymentProvider>();

export function registerProvider(p: PaymentProvider) {
  providers.set(p.id, p);
}

registerProvider(stripeTerminalProvider);

export function listProviders(): PaymentProvider[] {
  return Array.from(providers.values());
}

/**
 * Returns the active provider, or `null` if none is connected. The UI
 * must handle the null case by refusing to accept card payments.
 */
export function getActiveProvider(): PaymentProvider | null {
  const first = providers.values().next();
  return first.done ? null : first.value;
}

/**
 * Best-effort audit log of every payment attempt / state transition.
 * Never throws — logging failures must not affect the checkout flow.
 */
export async function logPaymentAttempt(entry: {
  provider: string | null;
  method: PaymentMethodKind | "cash";
  amount: number;
  currency: string;
  status: PaymentStatus | "initiated" | "completed";
  message?: string;
  reference?: string | null;
}) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from as any)("payment_attempts").insert({
      provider: entry.provider,
      method: entry.method,
      amount: entry.amount,
      currency: entry.currency,
      status: entry.status,
      message: entry.message ?? null,
      reference: entry.reference ?? null,
    });
  } catch {
    // swallow — audit log is best-effort
  }
  // Structured console log for local dev visibility.
  // eslint-disable-next-line no-console
  console.info("[payment]", new Date().toISOString(), entry);
}
