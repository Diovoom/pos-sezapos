import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { expensiveActionRateLimit } from "@/lib/security/rate-limit";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "@/lib/stripe.server";

// -----------------------------------------------------------------------------
// Stripe Terminal (in-person card payments at the register).
// -----------------------------------------------------------------------------
// Scaffold only. These endpoints are ready for a Stripe Terminal integration
// once a physical reader has been paired to the merchant's Stripe account:
//   - createConnectionToken → issues a short-lived token the JS SDK uses to
//     talk to the reader (Stripe Terminal SDK required on the client).
//   - createReaderPaymentIntent → creates a PaymentIntent server-side, then
//     the client calls terminal.collectPaymentMethod → processPayment.
//   - capturePaymentIntent → captures the authorization after processing.
//
// Until a reader is paired, the POS UI keeps card tender disabled with a
// "Coming soon" state. Cash tender is unaffected.
// -----------------------------------------------------------------------------

type ConnectionTokenResult = { secret: string } | { error: string };
type PaymentIntentResult = { id: string; clientSecret: string } | { error: string };
type CaptureResult = { id: string; status: string } | { error: string };

export const createTerminalConnectionToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, expensiveActionRateLimit])
  .inputValidator((data: { environment: StripeEnv }) => data)
  .handler(async ({ data }): Promise<ConnectionTokenResult> => {
    try {
      const stripe = createStripeClient(data.environment);
      const token = await stripe.terminal.connectionTokens.create();
      return { secret: token.secret };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const createReaderPaymentIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, expensiveActionRateLimit])
  .inputValidator(
    (data: {
      amountCents: number;
      currency?: string;
      description?: string;
      saleId?: string;
      environment: StripeEnv;
    }) => {
      if (!Number.isInteger(data.amountCents) || data.amountCents <= 0) {
        throw new Error("Invalid amount");
      }
      return data;
    },
  )
  .handler(async ({ data, context }): Promise<PaymentIntentResult> => {
    try {
      const stripe = createStripeClient(data.environment);
      const intent = await stripe.paymentIntents.create({
        amount: data.amountCents,
        currency: (data.currency ?? "usd").toLowerCase(),
        payment_method_types: ["card_present"],
        capture_method: "manual",
        ...(data.description && { description: data.description }),
        metadata: {
          userId: context.userId,
          ...(data.saleId && { saleId: data.saleId }),
        },
      });
      return { id: intent.id, clientSecret: intent.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const captureReaderPaymentIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, expensiveActionRateLimit])
  .inputValidator((data: { paymentIntentId: string; environment: StripeEnv }) => {
    if (!/^pi_[A-Za-z0-9_]+$/.test(data.paymentIntentId)) {
      throw new Error("Invalid paymentIntentId");
    }
    return data;
  })
  .handler(async ({ data }): Promise<CaptureResult> => {
    try {
      const stripe = createStripeClient(data.environment);
      const intent = await stripe.paymentIntents.capture(data.paymentIntentId);
      return { id: intent.id, status: intent.status };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
