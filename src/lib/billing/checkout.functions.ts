import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { expensiveActionRateLimit } from "@/lib/security/rate-limit";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";
import {
  SEZA_PLAN_BY_ID,
  SEZA_PLAN_LOOKUP_PRICE_CENTS,
  type SezaPlanId,
} from "@/lib/plans";

type CheckoutSessionResult = { clientSecret: string } | { error: string };
type PortalSessionResult = { url: string } | { error: string };
type PlanChangeResult =
  | { ok: true; plan: string; status: string; cancelAtPeriodEnd: boolean }
  | { error: string };

const VALID_PRICES = new Set(["starter_monthly", "pro_monthly", "business_monthly"]);

const SAFE_BILLING_ERROR_PREFIXES = [
  "No store is assigned",
  "Only the store owner",
  "This store already has a subscription",
  "Price not found",
  "Stripe price ",
  "No active Stripe subscription",
  "Unknown SEZA plan",
  "Before switching to ",
  "The Stripe subscription has no billable plan item",
] as const;

function billingErrorMessage(error: unknown) {
  if (error instanceof Error && SAFE_BILLING_ERROR_PREFIXES.some((prefix) => error.message.startsWith(prefix))) {
    return error.message;
  }
  return getStripeErrorMessage(error);
}

async function requireBillingOwner(supabase: any, userId: string) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("store_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile?.store_id) throw new Error("No store is assigned to this account");

  const { data: role, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("store_id", profile.store_id)
    .eq("role", "owner")
    .maybeSingle();
  if (roleError) throw roleError;
  if (!role) throw new Error("Only the store owner can manage billing and subscription plans.");
  return profile.store_id as string;
}

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string; storeId: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(options.storeId)) throw new Error("Invalid storeId");

  // Billing is store-scoped. A separate Stripe customer per store prevents an
  // owner with multiple businesses from seeing/changing another store's plan
  // in the Customer Portal.
  const byStore = await stripe.customers.search({
    query: `metadata['storeId']:'${options.storeId}'`,
    limit: 1,
  });
  if (byStore.data.length) return byStore.data[0].id;

  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    metadata: {
      ...(options.userId && { userId: options.userId }),
      storeId: options.storeId,
    },
  });
  return created.id;
}

/**
 * Start a Stripe Checkout session for a SEZA POS subscription plan.
 * Uses embedded UI mode; server returns clientSecret.
 */
export const createSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, expensiveActionRateLimit])
  .inputValidator((data: { priceId: string; returnUrl: string; environment: StripeEnv }) => {
    if (!VALID_PRICES.has(data.priceId)) throw new Error("Invalid priceId");
    return data;
  })
  .handler(async ({ data, context }): Promise<CheckoutSessionResult> => {
    try {
      const { userId, supabase } = context;
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const storeId = await requireBillingOwner(supabase, userId);

      // Existing paid stores change plans through the plan-change endpoint below.
      // Prevent Checkout from creating duplicate active subscriptions.
      const { data: existingSubscription, error: existingSubscriptionError } = await supabase
        .from("subscriptions")
        .select("id,status")
        .eq("store_id", storeId)
        .eq("environment", data.environment)
        .in("status", ["active", "trialing", "past_due", "paused"])
        .limit(1)
        .maybeSingle();
      if (existingSubscriptionError) throw existingSubscriptionError;
      if (existingSubscription) {
        throw new Error("This store already has a subscription. Use Manage subscription to change plans.");
      }

      const stripe = createStripeClient(data.environment);

      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!prices.data.length) throw new Error("Price not found");
      const stripePrice = prices.data[0];
      const expectedAmount = SEZA_PLAN_LOOKUP_PRICE_CENTS[data.priceId];
      if (stripePrice.unit_amount !== expectedAmount || stripePrice.recurring?.interval !== "month") {
        throw new Error(
          `Stripe price ${data.priceId} does not match SEZA pricing. Expected $${(expectedAmount / 100).toFixed(2)}/month.`,
        );
      }

      const customerId = await resolveOrCreateCustomer(stripe, {
        email: user?.email ?? undefined,
        userId,
        storeId,
      });

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: "subscription",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        metadata: { userId, storeId, planLookupKey: data.priceId },
        subscription_data: { metadata: { userId, storeId, planLookupKey: data.priceId } },
        managed_payments: { enabled: true },
      } as any);

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: billingErrorMessage(error) };
    }
  });

/** Change an existing store subscription without creating a second one. */
export const changeStoreSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, expensiveActionRateLimit])
  .inputValidator((data: { priceId: string; environment: StripeEnv }) => {
    if (!VALID_PRICES.has(data.priceId)) throw new Error("Invalid priceId");
    return data;
  })
  .handler(async ({ data, context }): Promise<PlanChangeResult> => {
    try {
      const { userId, supabase } = context;
      const storeId = await requireBillingOwner(supabase, userId);

      const { data: row, error: rowError } = await supabase
        .from("subscriptions")
        .select("id,stripe_subscription_id,price_id,status")
        .eq("user_id", userId)
        .eq("store_id", storeId)
        .eq("environment", data.environment)
        .not("stripe_subscription_id", "is", null)
        .in("status", ["active", "trialing", "past_due", "paused"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (rowError) throw rowError;
      if (!row?.stripe_subscription_id) throw new Error("No active Stripe subscription was found for this store");
      if (row.price_id === data.priceId) {
        return { ok: true, plan: data.priceId, status: row.status, cancelAtPeriodEnd: false };
      }

      const targetPlanId = data.priceId.replace(/_monthly$/, "") as SezaPlanId;
      const targetPlan = SEZA_PLAN_BY_ID[targetPlanId];
      if (!targetPlan) throw new Error("Unknown SEZA plan");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin: any = supabaseAdmin;
      const { getStorePlanUsage } = await import("@/lib/billing/plan-entitlements.server");
      const usage = await getStorePlanUsage(admin, storeId);
      const blockers: string[] = [];
      if (targetPlan.limits.employees != null && usage.employees > targetPlan.limits.employees) {
        blockers.push(`${usage.employees} active employees (limit ${targetPlan.limits.employees})`);
      }
      if (targetPlan.limits.registers != null && usage.registers > targetPlan.limits.registers) {
        blockers.push(`${usage.registers} active POS registers (limit ${targetPlan.limits.registers})`);
      }
      if (blockers.length) {
        throw new Error(
          `Before switching to ${targetPlan.name}, reduce usage: ${blockers.join("; ")}. SEZA will never delete employees or revoke registers automatically.`,
        );
      }

      const stripe = createStripeClient(data.environment);
      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!prices.data.length) throw new Error("Price not found");
      const targetPrice = prices.data[0];
      const expectedAmount = SEZA_PLAN_LOOKUP_PRICE_CENTS[data.priceId];
      if (targetPrice.unit_amount !== expectedAmount || targetPrice.recurring?.interval !== "month") {
        throw new Error(
          `Stripe price ${data.priceId} does not match SEZA pricing. Expected $${(expectedAmount / 100).toFixed(2)}/month.`,
        );
      }

      const current = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      const item = current.items.data[0];
      if (!item) throw new Error("The Stripe subscription has no billable plan item");
      const updated = await stripe.subscriptions.update(row.stripe_subscription_id, {
        items: [{ id: item.id, price: targetPrice.id, quantity: 1 }],
        proration_behavior: "create_prorations",
        metadata: {
          ...current.metadata,
          userId,
          storeId: storeId,
          planLookupKey: data.priceId,
        },
      });

      // Make the dashboard reflect the successful Stripe change immediately;
      // the signed webhook remains the long-term source of truth.
      const { error: updateError } = await admin
        .from("subscriptions")
        .update({
          price_id: data.priceId,
          status: updated.status,
          cancel_at_period_end: updated.cancel_at_period_end ?? false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("store_id", storeId);
      if (updateError) throw new Error(updateError.message);
      await admin.rpc("recompute_store_plan", { _store_id: storeId });

      return {
        ok: true,
        plan: data.priceId,
        status: updated.status,
        cancelAtPeriodEnd: updated.cancel_at_period_end ?? false,
      };
    } catch (error) {
      return { error: billingErrorMessage(error) };
    }
  });

/**
 * Open Stripe's hosted Billing Portal so the merchant can manage
 * their subscription, payment method, or view invoices.
 */
export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, expensiveActionRateLimit])
  .inputValidator((data: { returnUrl?: string; environment: StripeEnv }) => data)
  .handler(async ({ data, context }): Promise<PortalSessionResult> => {
    const { supabase, userId } = context;

    let storeId: string;
    try {
      storeId = await requireBillingOwner(supabase, userId);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Billing access denied." };
    }

    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .eq("store_id", storeId)
      .eq("environment", data.environment)
      .not("stripe_customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError || !sub?.stripe_customer_id) {
      return { error: "No subscription found for this account." };
    }

    try {
      const stripe = createStripeClient(data.environment);
      const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 1 });
      const configuration = configs.data[0] ??
        (await stripe.billingPortal.configurations.create({
          ...(data.returnUrl && { default_return_url: data.returnUrl }),
          business_profile: { headline: "Manage your SEZA POS billing" },
          features: {
            invoice_history: { enabled: true },
            payment_method_update: { enabled: true },
            subscription_cancel: { enabled: true, mode: "at_period_end" },
          },
        } as any));
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id,
        configuration: configuration.id,
        ...(data.returnUrl && { return_url: data.returnUrl }),
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
