import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

// Lazy service-role client so env vars are read at request time.
async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function resolvePriceLookupKey(item: any): string | null {
  return (
    item?.price?.lookup_key ??
    item?.price?.metadata?.lovable_external_id ??
    item?.price?.id ??
    null
  );
}

function resolveProductId(item: any): string | null {
  const product = item?.price?.product;
  if (typeof product === "string") return product;
  return product?.id ?? null;
}

async function storeIdForUser(userId: string): Promise<string | null> {
  const admin = await getAdmin();
  const { data } = await admin
    .from("profiles")
    .select("store_id")
    .eq("id", userId)
    .maybeSingle();
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
      stripe_customer_id:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id,
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
    case "checkout.session.completed":
      // No-op — subscription lifecycle events above already sync state.
      console.log("Stripe webhook:", event.type);
      break;
    default:
      console.log("Stripe webhook: unhandled event", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
