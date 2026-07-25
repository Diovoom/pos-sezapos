import { createFileRoute } from "@tanstack/react-router";
import { createStripeClient, type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

// Lazy service-role client so env vars are read at request time.
async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function resolvePriceLookupKey(item: any): string | null {
  return item?.price?.lookup_key ?? item?.price?.metadata?.lovable_external_id ?? item?.price?.id ?? null;
}

function resolveProductId(item: any): string | null {
  const product = item?.price?.product;
  if (typeof product === "string") return product;
  return product?.id ?? null;
}

function objectId(value: any): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id ?? null;
}

function invoiceSubscriptionId(invoice: any): string | null {
  return objectId(invoice?.subscription)
    ?? objectId(invoice?.parent?.subscription_details?.subscription)
    ?? objectId(invoice?.lines?.data?.[0]?.subscription);
}

function invoicePaymentIntentId(invoice: any): string | null {
  return objectId(invoice?.payment_intent)
    ?? objectId(invoice?.payments?.data?.[0]?.payment?.payment_intent)
    ?? objectId(invoice?.charge?.payment_intent);
}

async function storeIdForUser(userId: string): Promise<string | null> {
  const admin = await getAdmin();
  const { data } = await admin.from("profiles").select("store_id").eq("id", userId).maybeSingle();
  return (data?.store_id as string | null) ?? null;
}

async function handleSubscriptionUpsert(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId as string | undefined;
  if (!userId) {
    console.error("Stripe webhook: no userId in subscription metadata", subscription.id);
    return;
  }
  const storeId = await storeIdForUser(userId);
  if (!storeId) {
    console.error("Stripe webhook: no store found for user", userId);
    return;
  }

  const item = subscription.items?.data?.[0];
  const priceId = resolvePriceLookupKey(item);
  const productId = resolveProductId(item);
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  const admin = await getAdmin();
  await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      store_id: storeId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: objectId(subscription.customer),
      product_id: productId ?? "unknown",
      price_id: priceId ?? "unknown",
      status: subscription.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  const admin = await getAdmin();
  await admin
    .from("subscriptions")
    .update({
      status: "canceled",
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

async function subscriptionContext(subscriptionId: string | null, customerId: string | null, env: StripeEnv) {
  const admin = await getAdmin();
  let row: any = null;
  if (subscriptionId) {
    const { data } = await admin
      .from("subscriptions")
      .select("store_id,user_id,stripe_subscription_id,stripe_customer_id")
      .eq("stripe_subscription_id", subscriptionId)
      .eq("environment", env)
      .maybeSingle();
    row = data;
  }
  if (!row && customerId) {
    const { data } = await admin
      .from("subscriptions")
      .select("store_id,user_id,stripe_subscription_id,stripe_customer_id")
      .eq("stripe_customer_id", customerId)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    row = data;
  }
  return row;
}

async function handleInvoice(invoice: any, env: StripeEnv, event: { id?: string; type: string; created?: number }) {
  const admin = await getAdmin();
  const subscriptionId = invoiceSubscriptionId(invoice);
  const customerId = objectId(invoice.customer);
  let context = await subscriptionContext(subscriptionId, customerId, env);

  // Stripe may deliver the first invoice before the subscription-created event.
  // Retrieve and persist the subscription so the payment is never left
  // unmatched to its SEZA merchant.
  if (!context && subscriptionId) {
    try {
      const stripe = createStripeClient(env);
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await handleSubscriptionUpsert(subscription, env);
      context = await subscriptionContext(subscriptionId, customerId, env);
    } catch (error) {
      console.error("Stripe webhook: could not hydrate subscription context", subscriptionId, error);
    }
  }

  const occurredAt = event.created ? new Date(event.created * 1000).toISOString() : new Date().toISOString();
  const paidAtSeconds = invoice?.status_transitions?.paid_at;
  const periodStart = invoice?.period_start;
  const periodEnd = invoice?.period_end;
  const status =
    event.type === "invoice.payment_succeeded"
      ? "paid"
      : event.type === "invoice.payment_failed"
        ? "failed"
        : String(invoice.status ?? "unknown");

  const record = {
    stripe_event_id: event.id ?? null,
    stripe_invoice_id: invoice.id,
    stripe_payment_intent_id: invoicePaymentIntentId(invoice),
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId ?? context?.stripe_subscription_id ?? null,
    store_id: context?.store_id ?? null,
    user_id: context?.user_id ?? null,
    environment: env,
    status,
    amount_due_cents: Number(invoice.amount_due ?? 0),
    amount_paid_cents: Number(invoice.amount_paid ?? 0),
    currency: String(invoice.currency ?? "usd").toLowerCase(),
    billing_reason: invoice.billing_reason ?? null,
    hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    invoice_pdf_url: invoice.invoice_pdf ?? null,
    failure_message:
      invoice.last_finalization_error?.message
      ?? invoice.last_payment_error?.message
      ?? invoice.charge?.failure_message
      ?? null,
    period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    paid_at: paidAtSeconds ? new Date(paidAtSeconds * 1000).toISOString() : (status === "paid" ? occurredAt : null),
    occurred_at: occurredAt,
    metadata: {
      number: invoice.number ?? null,
      collection_method: invoice.collection_method ?? null,
      attempt_count: invoice.attempt_count ?? null,
    },
  };

  const { error } = await (admin.from as any)("merchant_billing_payments")
    .upsert(record, { onConflict: "stripe_invoice_id" });
  if (error) {
    // Keep webhooks retryable after the migration is deployed, but do not hide
    // a real persistence failure.
    console.error("Stripe billing ledger upsert failed", error);
    throw error;
  }
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpsert(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, env);
      break;
    case "invoice.payment_failed":
    case "invoice.payment_succeeded":
      await handleInvoice(event.data.object, env, event);
      break;
    case "checkout.session.completed":
      // Subscription and invoice events are the source of truth. Checkout is
      // intentionally not counted as revenue until Stripe confirms payment.
      console.log("Stripe checkout completed", event.data.object?.id);
      break;
    default:
      console.log("Stripe webhook: unhandled event", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.stripe_webhook",
          limit: 300,
          windowSeconds: 60,
          blockSeconds: 60,
          maxBodyBytes: 1048576,
          allowMissingOrigin: true,
          skipOriginCheck: true,
        });
        if (blocked) return blocked;
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Stripe webhook: invalid env query param", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv as StripeEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Stripe webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
