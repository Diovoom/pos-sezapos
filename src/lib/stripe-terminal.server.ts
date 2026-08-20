import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StripeTerminalMerchantContext = {
  userId: string;
  storeId: string;
  stripeAccountId: string;
  testMode: boolean;
};

function terminalSecretKey(testMode: boolean) {
  const name = testMode ? "STRIPE_TERMINAL_TEST_SECRET_KEY" : "STRIPE_TERMINAL_LIVE_SECRET_KEY";
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not configured on the SEZA server. Add the secret key from the dedicated SEZA Payments Stripe account; never put it in the Android APK.`,
    );
  }
  return value;
}

/**
 * Stripe Terminal uses the dedicated SEZA Payments platform account, separate
 * from SEZA's SaaS/subscription billing Stripe account. Keeping a dedicated
 * client here prevents a POS payment from accidentally being created under
 * the billing account.
 */
export function createTerminalStripeClient(testMode: boolean) {
  return new Stripe(terminalSecretKey(testMode));
}

/**
 * Resolve the signed-in employee to exactly one store and the active Stripe
 * terminal configured for that store. The connected account ID is resolved
 * on the server; the Android APK never decides which merchant receives a
 * charge.
 */
export async function resolveStripeTerminalMerchant(
  bearerToken: string,
): Promise<StripeTerminalMerchantContext> {
  const { data: userRes, error: userError } = await supabaseAdmin.auth.getUser(bearerToken);
  if (userError || !userRes.user) throw new Error("Unauthorized");

  const admin: any = supabaseAdmin;
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("store_id")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  const storeId = String(profile?.store_id || "").trim();
  if (!storeId) throw new Error("This employee is not assigned to a store");

  const { data: terminal, error: terminalError } = await admin
    .from("payment_terminals")
    .select("config")
    .eq("store_id", storeId)
    .eq("provider", "stripe")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (terminalError) throw terminalError;

  const config = (terminal?.config ?? {}) as Record<string, unknown>;
  const stripeAccountId = String(config.stripe_account_id || "").trim();
  if (!/^acct_[A-Za-z0-9]+$/.test(stripeAccountId)) {
    throw new Error(
      "Stripe merchant setup is incomplete. The owner must connect the store’s Stripe account before card payments can be accepted.",
    );
  }

  return {
    userId: userRes.user.id,
    storeId,
    stripeAccountId,
    testMode: config.test_mode !== false,
  };
}
