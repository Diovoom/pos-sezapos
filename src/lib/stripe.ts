export type StripeEnv = "sandbox" | "live";

function paymentsEnvironment(): StripeEnv {
  const raw = String(
    import.meta.env.VITE_STRIPE_BILLING_MODE ?? import.meta.env.VITE_STRIPE_MODE ?? "sandbox",
  )
    .trim()
    .toLowerCase();
  return raw === "live" ? "live" : "sandbox";
}

/**
 * Browser-visible billing mode only. Billing secrets and the final environment
 * decision are enforced again on the server. The default remains sandbox so a
 * missing client build variable can never silently enable real charges.
 */
export function getStripeEnvironment(): StripeEnv {
  return paymentsEnvironment();
}

