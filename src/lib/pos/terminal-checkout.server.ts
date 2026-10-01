import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createTerminalStripeClient,
  type StripeTerminalMerchantContext,
  type StripeTerminalCaller,
} from "@/lib/stripe-terminal.server";
import { validateTerminalCheckout } from "./terminal-checkout";

const admin: any = supabaseAdmin;

export async function prepareTerminalCheckout(
  merchant: StripeTerminalMerchantContext,
  request: unknown,
  cents: number,
  currency: string,
) {
  const frozen = validateTerminalCheckout(request, merchant.userId, merchant.storeId, cents);
  const { data: previous, error: previousError } = await admin
    .from("pos_terminal_checkouts")
    .select("id")
    .eq("id", frozen.sale.id)
    .maybeSingle();
  if (previousError) throw previousError;
  // Reject foreign/removed products and register references BEFORE money moves.
  const ids = [...new Set(frozen.items.map((i) => i.product_id).filter(Boolean))];
  if (!previous && ids.length) {
    const { data, error } = await admin
      .from("products")
      .select("id,stock,track_inventory")
      .eq("store_id", merchant.storeId)
      .in("id", ids);
    if (error) throw error;
    if (data.length !== ids.length)
      throw new Error("Checkout product belongs to another store or was removed");
    for (const p of data)
      if (
        p.track_inventory &&
        Number(p.stock) <
          frozen.items.filter((i) => i.product_id === p.id).reduce((n, i) => n + i.quantity, 0)
      )
        throw new Error("Insufficient stock before payment");
  }
  if (!previous && frozen.sale.register_session_id) {
    const { data, error } = await admin
      .from("register_sessions")
      .select("id")
      .eq("id", frozen.sale.register_session_id)
      .eq("store_id", merchant.storeId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Checkout register belongs to another store or was removed");
  }
  const { data, error } = await admin.rpc("prepare_terminal_checkout", {
    p_actor: merchant.userId,
    p_store: merchant.storeId,
    p_account: merchant.stripeAccountId,
    p_environment: merchant.environment,
    p_request: frozen,
    p_amount: cents,
    p_currency: currency,
  });
  if (error) throw error;
  return data;
}

export function verifyCheckoutIntent(checkout: any, intent: any, account: string) {
  if (
    checkout.stripe_account_id !== account ||
    intent.metadata?.seza_checkout_id !== checkout.id ||
    intent.metadata?.seza_store_id !== checkout.store_id ||
    intent.metadata?.seza_cashier_id !== checkout.cashier_id ||
    Boolean(intent.livemode) !== (checkout.environment === "live") ||
    intent.amount !== checkout.amount_cents ||
    intent.currency !== checkout.currency ||
    (checkout.payment_intent_id && checkout.payment_intent_id !== intent.id)
  )
    throw new Error("Checkout payment verification failed");
  if (intent.status === "succeeded" && intent.amount_received !== checkout.amount_cents)
    throw new Error("Checkout received amount differs");
}

export async function bindCheckoutIntent(checkout: any, intent: any, account: string) {
  verifyCheckoutIntent(checkout, intent, account);
  if (checkout.payment_intent_id === intent.id) return;
  const { data, error } = await admin
    .from("pos_terminal_checkouts")
    .update({ payment_intent_id: intent.id })
    .eq("id", checkout.id)
    .eq("acknowledged", false)
    .or(`payment_intent_id.is.null,payment_intent_id.eq.${intent.id}`)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Checkout payment mapping conflict");
}

// Retrieval/finalization only: this function NEVER creates or confirms a charge.
export async function recoverTerminalCheckout(checkout: any) {
  if (checkout.sale_result)
    return { checkoutId: checkout.id, status: "saved", sale: checkout.sale_result };
  if (!checkout.payment_intent_id)
    return {
      checkoutId: checkout.id,
      status: "unprepared",
      message:
        "Payment preparation was interrupted before a client secret was released to the reader.",
    };
  const stripe = createTerminalStripeClient(checkout.environment);
  const intent = await stripe.paymentIntents.retrieve(
    checkout.payment_intent_id,
    {},
    { stripeAccount: checkout.stripe_account_id },
  );
  verifyCheckoutIntent(checkout, intent, checkout.stripe_account_id);
  if (intent.status !== "succeeded") return { checkoutId: checkout.id, status: intent.status };
  const { data, error } = await admin.rpc("finalize_terminal_checkout", {
    p_checkout: checkout.id,
    p_reference: intent.id,
  });
  if (error)
    throw new Error("Payment approved but sale still needs recovery. Do not charge again.");
  return { checkoutId: checkout.id, status: "saved", sale: data };
}

export async function recoverTerminalWebhook(event: any) {
  const id = event.data?.object?.metadata?.seza_checkout_id;
  // Historical/unmapped payments must never manufacture a basket or sale.
  if (!id) return;
  const { data: checkout, error } = await admin
    .from("pos_terminal_checkouts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!checkout) throw new Error("Checkout mapping not found");
  if (event.account !== checkout.stripe_account_id) throw new Error("Connected account mismatch");
  const stripe = createTerminalStripeClient(checkout.environment);
  const intent = await stripe.paymentIntents.retrieve(
    event.data.object.id,
    {},
    { stripeAccount: checkout.stripe_account_id },
  );
  await bindCheckoutIntent(checkout, intent, event.account);
  await recoverTerminalCheckout({ ...checkout, payment_intent_id: intent.id });
}

export async function checkoutAction(
  caller: StripeTerminalCaller,
  action: string,
  checkoutId?: string,
) {
  let query = admin
    .from("pos_terminal_checkouts")
    .select("*")
    .eq("store_id", caller.storeId)
    .eq("cashier_id", caller.userId);
  query = checkoutId ? query.eq("id", checkoutId) : query.eq("acknowledged", false);
  const { data, error } = await query;
  if (error) throw error;
  if (checkoutId && !data.length) throw new Error("Checkout not available to this employee");
  const results = [];
  for (const checkout of data) {
    if (action === "abandon") {
      if (!checkout.payment_intent_id) {
        // The API withholds the client secret until binding succeeds. Race the
        // binder atomically: if it won, this update returns no row and we must
        // retrieve/cancel the actual PI instead. If we win, it cannot release
        // that secret later. No financial operation is involved here.
        const { data: discarded, error: discardError } = await admin
          .from("pos_terminal_checkouts")
          .update({ acknowledged: true })
          .eq("id", checkout.id)
          .eq("acknowledged", false)
          .is("payment_intent_id", null)
          .select("id")
          .maybeSingle();
        if (discardError) throw discardError;
        if (!discarded) throw new Error("Payment preparation changed; check payment again");
        results.push({ checkoutId: checkout.id, status: "canceled" });
        continue;
      }
      const stripe = createTerminalStripeClient(checkout.environment);
      const intent = await stripe.paymentIntents.retrieve(
        checkout.payment_intent_id,
        {},
        { stripeAccount: checkout.stripe_account_id },
      );
      verifyCheckoutIntent(checkout, intent, checkout.stripe_account_id);
      // Never abandon an approved/processing payment. Stripe arbitrates races
      // between cancellation and confirmation; a failed cancel leaves it pending.
      if (!["requires_payment_method", "requires_confirmation", "canceled"].includes(intent.status))
        throw new Error("Payment may be approved; recover it instead");
      if (intent.status !== "canceled") {
        const canceled = await stripe.paymentIntents.cancel(
          intent.id,
          {},
          { stripeAccount: checkout.stripe_account_id },
        );
        if (canceled.id !== intent.id || canceled.status !== "canceled")
          throw new Error("Payment cancellation is not confirmed; recover it instead");
      }
      const { error: updateError } = await admin
        .from("pos_terminal_checkouts")
        .update({ acknowledged: true })
        .eq("id", checkout.id);
      if (updateError) throw updateError;
      results.push({ checkoutId: checkout.id, status: "canceled" });
    } else {
      const result = await recoverTerminalCheckout(checkout);
      if (action === "acknowledge") {
        if (result.status !== "saved") throw new Error("Checkout is not saved");
        const { error: updateError } = await admin
          .from("pos_terminal_checkouts")
          .update({ acknowledged: true })
          .eq("id", checkout.id);
        if (updateError) throw updateError;
      }
      results.push(result);
    }
  }
  return { checkouts: results };
}
