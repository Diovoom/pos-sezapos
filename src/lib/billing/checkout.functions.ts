import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { expensiveActionRateLimit } from "@/lib/security/rate-limit";
import {
  createStripeClient,
  getStripeBillingMode,
  getStripeErrorMessage,
} from "@/lib/stripe.server";
import {
  SEZA_PLAN_BY_ID,
  SEZA_PLAN_LOOKUP_PRICE_CENTS,
  type SezaPlanId,
} from "@/lib/plans";

type CheckoutSessionResult =
  | { url: string; environment: "sandbox" | "live" }
  | { existing: true; environment: "sandbox" | "live"; currentPlan: string }
  | { error: string };
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
  "Invalid Stripe checkout",
  "Stripe checkout",
  "Stripe subscription",
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

async function persistStripeSubscription(
  subscription: any,
  environment: "sandbox" | "live",
  expected: { userId: string; storeId: string },
) {
  const metadataStoreId = String(subscription?.metadata?.storeId ?? "").trim();
  const metadataUserId = String(subscription?.metadata?.userId ?? "").trim();
  if (!metadataStoreId || metadataStoreId !== expected.storeId) {
    throw new Error("Stripe subscription does not belong to this store.");
  }
  if (metadataUserId && metadataUserId !== expected.userId) {
    throw new Error("Stripe subscription does not belong to this owner.");
  }

  const item = subscription?.items?.data?.[0];
  const lookupKey = String(item?.price?.lookup_key ?? "").trim();
  if (!VALID_PRICES.has(lookupKey)) {
    throw new Error("Stripe subscription uses an unknown SEZA plan.");
  }
  const expectedAmount = SEZA_PLAN_LOOKUP_PRICE_CENTS[lookupKey];
  if (item?.price?.unit_amount !== expectedAmount || item?.price?.recurring?.interval !== "month") {
    throw new Error("Stripe subscription price does not match SEZA pricing.");
  }

  const product = item?.price?.product;
  const productId = typeof product === "string" ? product : product?.id ?? "unknown";
  const periodStart = item?.current_period_start ?? subscription?.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription?.current_period_end;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin: any = supabaseAdmin;
  const { error: upsertError } = await admin.from("subscriptions").upsert(
    {
      user_id: expected.userId,
      store_id: expected.storeId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id:
        typeof subscription?.customer === "string"
          ? subscription.customer
          : subscription?.customer?.id ?? null,
      product_id: productId,
      price_id: lookupKey,
      status: subscription.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      environment,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (upsertError) throw new Error(upsertError.message);

  const { error: recomputeError } = await admin.rpc("recompute_store_plan", {
    _store_id: expected.storeId,
  });
  if (recomputeError) throw new Error(recomputeError.message);

  return {
    plan: lookupKey,
    status: String(subscription.status ?? "active"),
  };
}


async function switchExistingStripeSubscription(options: {
  stripe: ReturnType<typeof createStripeClient>;
  environment: "sandbox" | "live";
  userId: string;
  storeId: string;
  stripeSubscriptionId: string;
  targetLookupKey: string;
}) {
  const { stripe, environment, userId, storeId, stripeSubscriptionId, targetLookupKey } = options;
  const targetPlanId = targetLookupKey.replace(/_monthly$/, "") as SezaPlanId;
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

  const prices = await stripe.prices.list({ lookup_keys: [targetLookupKey] });
  if (!prices.data.length) throw new Error("Price not found");
  const targetPrice = prices.data[0];
  const expectedAmount = SEZA_PLAN_LOOKUP_PRICE_CENTS[targetLookupKey];
  if (targetPrice.unit_amount !== expectedAmount || targetPrice.recurring?.interval !== "month") {
    throw new Error(
      `Stripe price ${targetLookupKey} does not match SEZA pricing. Expected $${(expectedAmount / 100).toFixed(2)}/month.`,
    );
  }

  const current = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const metadataStoreId = String(current.metadata?.storeId ?? "").trim();
  if (metadataStoreId && metadataStoreId !== storeId) {
    throw new Error("Stripe subscription does not belong to this store.");
  }
  const item = current.items.data[0];
  if (!item) throw new Error("The Stripe subscription has no billable plan item");

  if (item.price.lookup_key === targetLookupKey) {
    const synced = await persistStripeSubscription(current, environment, { userId, storeId });
    return { updated: true as const, ...synced };
  }

  const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
    items: [{ id: item.id, price: targetPrice.id, quantity: 1 }],
    proration_behavior: "create_prorations",
    metadata: {
      ...current.metadata,
      userId,
      storeId,
      planLookupKey: targetLookupKey,
      environment,
    },
  });

  const synced = await persistStripeSubscription(updated, environment, { userId, storeId });
  return { updated: true as const, ...synced };
}


export const getCurrentStoreSubscriptionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const storeId = await requireBillingOwner(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = supabaseAdmin;

    // Reconcile the denormalized store entitlement fields from the latest
    // subscription row before the dashboard decides whether features are read-only.
    const { error: recomputeError } = await admin.rpc("recompute_store_plan", {
      _store_id: storeId,
    });
    if (recomputeError) throw new Error(recomputeError.message);

    const { data: store, error } = await admin
      .from("stores")
      .select("plan_tier, plan_status, plan_period_end, plan_cancel_at_period_end, trial_ends_at")
      .eq("id", storeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return store ?? null;
  });

/**
 * Verify a completed Stripe Checkout session and immediately synchronize the
 * paid subscription into SEZA. This makes checkout completion independent from
 * webhook delivery latency and prevents a paid store from remaining Expired.
 */
export const syncCompletedSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, expensiveActionRateLimit])
  .inputValidator((data: { sessionId: string }) => {
    const sessionId = String(data.sessionId ?? "").trim();
    if (!/^cs_(test_)?[A-Za-z0-9_]+$/.test(sessionId) || sessionId.length > 255) {
      throw new Error("Invalid Stripe checkout session.");
    }
    return { sessionId };
  })
  .handler(async ({ data, context }) => {
    try {
      const { userId, supabase } = context;
      const storeId = await requireBillingOwner(supabase, userId);
      const environment = getStripeBillingMode();
      const stripe = createStripeClient(environment);
      const session: any = await stripe.checkout.sessions.retrieve(data.sessionId, {
        expand: ["subscription"],
      });

      if (session.mode !== "subscription" || session.status !== "complete") {
        throw new Error("Stripe checkout session is not complete.");
      }
      if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
        throw new Error("Stripe checkout payment is not complete.");
      }
      if (String(session.metadata?.storeId ?? "") !== storeId) {
        throw new Error("Stripe checkout session does not belong to this store.");
      }
      if (String(session.metadata?.userId ?? "") !== userId) {
        throw new Error("Stripe checkout session does not belong to this owner.");
      }

      const subscription =
        typeof session.subscription === "string"
          ? await stripe.subscriptions.retrieve(session.subscription)
          : session.subscription;
      if (!subscription?.id) throw new Error("Stripe checkout did not create a subscription.");

      const synced = await persistStripeSubscription(subscription, environment, { userId, storeId });
      return { ok: true as const, environment, ...synced };
    } catch (error) {
      return { error: billingErrorMessage(error) };
    }
  });

/**
 * Start a Stripe Checkout session for a SEZA POS subscription plan.
 * Uses Stripe-hosted Checkout; the server returns a redirect URL.
 */
export const createSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, expensiveActionRateLimit])
  .inputValidator((data: { priceId: string; successUrl: string; cancelUrl: string }) => {
    if (!VALID_PRICES.has(data.priceId)) throw new Error("Invalid priceId");
    for (const value of [data.successUrl, data.cancelUrl]) {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol)) throw new Error("Invalid checkout return URL");
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<CheckoutSessionResult> => {
    try {
      const { userId, supabase } = context;
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const storeId = await requireBillingOwner(supabase, userId);
      const environment = getStripeBillingMode();

      // One plan-selection path for both first-time subscriptions and upgrades/downgrades.
      // If Stripe is already attached to this store, update that subscription in place instead
      // of sending the merchant into a second Checkout session. This intentionally does not
      // trust the client-side plan badge, which can be stale for a moment after billing changes.
      const { data: existingSubscription, error: existingSubscriptionError } = await supabase
        .from("subscriptions")
        .select("id,status,price_id,stripe_subscription_id")
        .eq("store_id", storeId)
        .eq("environment", environment)
        .not("stripe_subscription_id", "is", null)
        .in("status", ["active", "trialing", "past_due", "paused"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingSubscriptionError) throw existingSubscriptionError;

      const stripe = createStripeClient(environment);
      if (existingSubscription?.stripe_subscription_id) {
        return {
          existing: true,
          environment,
          currentPlan: String(existingSubscription.price_id ?? ""),
        };
      }

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
        success_url: data.successUrl,
        cancel_url: data.cancelUrl,
        customer: customerId,
        metadata: { userId, storeId, planLookupKey: data.priceId, environment },
        subscription_data: {
          metadata: { userId, storeId, planLookupKey: data.priceId, environment },
        },
      });

      if (!session.url) throw new Error("Stripe did not return a checkout URL");
      return { url: session.url, environment };
    } catch (error) {
      return { error: billingErrorMessage(error) };
    }
  });

/** Change an existing store subscription without creating a second one. */
export const changeStoreSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, expensiveActionRateLimit])
  .inputValidator((data: { priceId: string }) => {
    if (!VALID_PRICES.has(data.priceId)) throw new Error("Invalid priceId");
    return data;
  })
  .handler(async ({ data, context }): Promise<PlanChangeResult> => {
    try {
      const { userId, supabase } = context;
      const storeId = await requireBillingOwner(supabase, userId);
      const environment = getStripeBillingMode();

      const { data: row, error: rowError } = await supabase
        .from("subscriptions")
        .select("id,stripe_subscription_id,price_id,status")
        .eq("store_id", storeId)
        .eq("environment", environment)
        .not("stripe_subscription_id", "is", null)
        .in("status", ["active", "trialing", "past_due", "paused"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (rowError) throw rowError;
      if (!row?.stripe_subscription_id) throw new Error("No active Stripe subscription was found for this store");

      const stripe = createStripeClient(environment);
      const changed = await switchExistingStripeSubscription({
        stripe,
        environment,
        userId,
        storeId,
        stripeSubscriptionId: row.stripe_subscription_id,
        targetLookupKey: data.priceId,
      });

      return {
        ok: true,
        plan: changed.plan,
        status: changed.status,
        cancelAtPeriodEnd: false,
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
  .inputValidator((data: { returnUrl?: string }) => data)
  .handler(async ({ data, context }): Promise<PortalSessionResult> => {
    const { supabase, userId } = context;
    const environment = getStripeBillingMode();

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
      .eq("environment", environment)
      .not("stripe_customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError || !sub?.stripe_customer_id) {
      return { error: "No subscription found for this account." };
    }

    try {
      const stripe = createStripeClient(environment);
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
