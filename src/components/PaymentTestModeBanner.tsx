import { getStripeEnvironment } from "@/lib/stripe";

export function PaymentTestModeBanner() {
  if (getStripeEnvironment() === "sandbox") {
    return (
      <div className="w-full border-b border-orange-300 bg-orange-100 px-4 py-2 text-center text-sm text-orange-800">
        SEZA billing is in Stripe test mode. No real card will be charged. Use Stripe test cards only.
      </div>
    );
  }
  return null;
}
