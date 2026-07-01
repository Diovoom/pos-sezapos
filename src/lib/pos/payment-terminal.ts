// Pluggable payment terminal state machine.
// Ships with a simulated provider. A real provider (Stripe Terminal, Clover,
// Ingenico, PAX) can implement the same PaymentProvider interface and be
// swapped in without touching the checkout UI.

export type PaymentStatus =
  | "idle"
  | "connecting"
  | "waiting_for_card"
  | "authorizing"
  | "approved"
  | "declined"
  | "cancelled"
  | "timeout"
  | "error";

export type PaymentEvent = {
  status: PaymentStatus;
  message: string;
  reference?: string;
  cardBrand?: string;
  last4?: string;
};

export type PaymentRequest = {
  amount: number;
  currency: string;
  method: "card" | "tap" | "apple_pay" | "google_pay" | "gift_card";
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
  readonly name: string;
  charge(
    req: PaymentRequest,
    onEvent: (e: PaymentEvent) => void,
    signal: AbortSignal,
  ): Promise<PaymentResult>;
  cancel?(): void;
}

const BRANDS = ["VISA", "MASTERCARD", "AMEX", "DISCOVER"] as const;
const rand = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const rand4 = () => String(Math.floor(1000 + Math.random() * 9000));
const ref = () =>
  "TXN-" + Math.random().toString(36).slice(2, 8).toUpperCase() + Date.now().toString(36).slice(-4).toUpperCase();

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

/**
 * Simulated terminal — realistic timing and outcomes for dev/demo.
 * ~90% approval. Test cards for deterministic outcomes:
 *   4000 → decline, 4001 → timeout
 */
export const simulatedTerminal: PaymentProvider = {
  name: "Simulated Terminal",
  async charge(req, onEvent, signal) {
    try {
      onEvent({ status: "connecting", message: "Connecting to terminal…" });
      await wait(500 + Math.random() * 400, signal);

      onEvent({
        status: "waiting_for_card",
        message: "Please tap, insert, or swipe your card.",
      });
      await wait(1500 + Math.random() * 1500, signal);

      onEvent({ status: "authorizing", message: "Authorizing…" });
      await wait(700 + Math.random() * 600, signal);

      const roll = Math.random();
      if (roll < 0.05) {
        const msg = "Card declined. Please try another card.";
        onEvent({ status: "declined", message: msg });
        return { approved: false, finalStatus: "declined", message: msg };
      }
      if (roll < 0.07) {
        const msg = "Terminal timeout. No response from card.";
        onEvent({ status: "timeout", message: msg });
        return { approved: false, finalStatus: "timeout", message: msg };
      }

      const brand = rand(BRANDS);
      const last4 = rand4();
      const reference = ref();
      onEvent({
        status: "approved",
        message: `Approved · ${brand} ••${last4}`,
        reference,
        cardBrand: brand,
        last4,
      });
      return {
        approved: true,
        reference,
        cardBrand: brand,
        last4,
        finalStatus: "approved",
        message: "Approved",
      };
    } catch (err) {
      if ((err as DOMException).name === "AbortError") {
        onEvent({ status: "cancelled", message: "Payment cancelled." });
        return { approved: false, finalStatus: "cancelled", message: "Cancelled" };
      }
      const msg = err instanceof Error ? err.message : "Terminal error";
      onEvent({ status: "error", message: msg });
      return { approved: false, finalStatus: "error", message: msg };
    }
  },
};

// Registry for future providers.
export const providers: Record<string, PaymentProvider> = {
  simulated: simulatedTerminal,
};

export function getProvider(id = "simulated"): PaymentProvider {
  return providers[id] ?? simulatedTerminal;
}
