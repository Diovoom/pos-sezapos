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

// Registry — empty by default. Real integrations register themselves at
// app boot (e.g. `registerProvider(stripeTerminalProvider)`).
const providers = new Map<string, PaymentProvider>();

export function registerProvider(p: PaymentProvider) {
  providers.set(p.id, p);
}

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
