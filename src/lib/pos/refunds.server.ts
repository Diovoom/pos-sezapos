import type Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createTerminalStripeClient, resolveStripeTerminalCaller, resolveStripeTerminalMerchant, type NativeTerminalAuth } from "@/lib/stripe-terminal.server";
import { verifyPosGrant } from "./authorization.server";

type RefundRequest = { id: string; sale_id: string; type: string; reason: string; notes: string | null; restock: boolean; items: Array<{ sale_item_id: string; quantity: number }> };
export async function createPosRefund(input: { bearerToken: string; nativeAuth?: NativeTerminalAuth; request: RefundRequest; approvalToken?: string }) {
  const admin: any = supabaseAdmin;
  const caller = await resolveStripeTerminalCaller(input);
  const request = input.request;
  if (!request || !/^[0-9a-f-]{36}$/i.test(request.id) || !/^[0-9a-f-]{36}$/i.test(request.sale_id) || !Array.isArray(request.items)) throw new Error("Invalid refund request");
  const { data: sale, error: saleError } = await admin.from("sales").select("id,store_id,payment_method,terminal_ref").eq("id", request.sale_id).eq("store_id", caller.storeId).single();
  if (saleError || !sale) throw new Error("Sale not found");
  if (sale.payment_method === "split") throw new Error("Split-tender refunds need an explicit allocation between payment methods. Contact the owner.");
  const { data: roles, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", caller.userId).eq("store_id", caller.storeId);
  if (roleError) throw roleError;
  const names: string[] = (roles ?? []).map((r: { role: string }) => r.role);
  const { data: permissions, error: permissionError } = await admin.from("role_permissions").select("permission").eq("store_id", caller.storeId).in("role", names);
  if (permissionError) throw permissionError;
  const granted = new Set<string>((permissions ?? []).map((r: { permission: string }) => r.permission));
  const canApprove = names.some((r) => r === "owner" || r === "admin") || granted.has("*") || (granted.has("refunds.create") && granted.has(request.type === "void" ? "sales.void" : "refunds.approve"));
  let approverId: string | null = null;
  let approvedAmount: number | null = null;
  if (!canApprove) {
    const approval = verifyPosGrant(input.approvalToken, "manager");
    const details = approval.details as Record<string, unknown> | undefined;
    if (approval.actorId !== caller.userId || approval.storeId !== caller.storeId || approval.action !== (request.type === "void" ? "sales.void" : "refunds.approve") || details?.sale_id !== sale.id || details?.type !== request.type || details?.refund_attempt_id !== request.id) throw new Error("Refund changed after manager approval. Ask the manager to approve again.");
    const { data: manager, error } = await admin.from("profiles").select("id").eq("id", approval.managerId).eq("store_id", caller.storeId).eq("status", "active").maybeSingle();
    const { data: managerRoles, error: managerRoleError } = await admin.from("user_roles").select("role").eq("user_id", approval.managerId).eq("store_id", caller.storeId).in("role", ["owner", "admin", "manager"]);
    if (error || managerRoleError || !manager || !managerRoles?.length) throw new Error("Manager approval is no longer valid");
    approverId = manager.id;
    approvedAmount = Number(details.amount);
    if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) throw new Error("Invalid manager approval amount");
  }
  const processor = ["card", "tap", "apple_pay", "google_pay"].includes(sale.payment_method) && !["exchange", "store_credit"].includes(request.type);
  const merchant = processor ? await resolveStripeTerminalMerchant({ ...input, requireActiveTerminal: false }) : null;
  const stripe = merchant ? createTerminalStripeClient(merchant.environment) : null;
  if (stripe && merchant) {
    const intent = await stripe.paymentIntents.retrieve(sale.terminal_ref, {}, { stripeAccount: merchant.stripeAccountId });
    if (intent.metadata.seza_store_id !== caller.storeId || intent.livemode !== (merchant.environment === "live") || intent.status !== "succeeded") throw new Error("The original card payment is not available for this refund");
  }
  const { data: prepared, error: prepareError } = await admin.rpc("prepare_pos_refund", {
    p_refund: { store_id: caller.storeId, sale_id: sale.id, cashier_id: caller.userId, approver_id: approverId, idempotency_key: request.id, refund_type: request.type, reason: request.reason, notes: request.notes, restock: request.restock, processor: processor ? "stripe" : null },
    p_items: request.items,
  });
  if (prepareError) throw prepareError;
  const refund = prepared.refund;
  if (approvedAmount !== null && Math.round(Number(refund.total) * 100) > Math.round(approvedAmount * 100)) {
    if (!prepared.already_existed) await admin.rpc("fail_pos_refund", { p_refund_id: refund.id, p_failure_message: "Manager approval amount exceeded" });
    throw new Error("Refund amount exceeds manager approval");
  }
  if (refund.status === "completed") return { refund, effectiveItems: prepared.effective_items };
  let providerId: string | null = null;
  let providerStatus: string | null = null;
  if (stripe && merchant) {
    const options = { stripeAccount: merchant.stripeAccountId };
    let providerRefund: Stripe.Refund | null = refund.processor_refund_id ? await stripe.refunds.retrieve(refund.processor_refund_id, {}, options) : null;
    // A lost response can outlive Stripe's idempotency cache. Find the durable
    // operation metadata before creating another refund for an existing intent.
    if (!providerRefund && prepared.already_existed) {
      for await (const candidate of stripe.refunds.list({ payment_intent: sale.terminal_ref, limit: 100 }, options)) {
        if (candidate.metadata?.seza_refund_id === refund.id) { providerRefund = candidate; break; }
      }
    }
    if (!providerRefund) providerRefund = await stripe.refunds.create({ payment_intent: sale.terminal_ref, amount: Math.round(Number(refund.total) * 100), metadata: { seza_store_id: caller.storeId, seza_sale_id: sale.id, seza_refund_id: refund.id } }, { ...options, idempotencyKey: `seza-refund-${refund.id}` });
    providerId = providerRefund.id;
    providerStatus = providerRefund.status ?? "pending";
    const { error } = await admin.from("refunds").update({ processor_refund_id: providerId, processor_refund_status: providerStatus }).eq("id", refund.id);
    if (error) throw new Error("Processor refund submitted. Retry this same refund to reconcile its record.");
    if (providerStatus === "failed" || providerStatus === "canceled") {
      const { error: failError } = await admin.rpc("fail_pos_refund", { p_refund_id: refund.id, p_processor_status: providerStatus, p_failure_message: "Processor rejected refund" });
      if (failError) throw failError;
      throw new Error("The processor rejected this refund. No inventory was restocked.");
    }
    if (providerStatus !== "succeeded") return { refund: { ...refund, status: "pending" }, effectiveItems: prepared.effective_items };
  }
  const { data: completed, error: completeError } = await admin.rpc("complete_pos_refund", { p_refund_id: refund.id, p_processor_refund_id: providerId, p_processor_status: providerStatus });
  if (completeError) throw new Error("Refund is awaiting ledger reconciliation. Retry this same refund.");
  return { refund: completed, effectiveItems: prepared.effective_items };
}

/** Called only after Stripe's webhook signature has been verified. */
export async function reconcileRefundedCharge(event: { account?: string; livemode?: boolean; data: { object: { payment_intent?: string; id: string } } }) {
  if (!event.account || !event.livemode) return;
  const charge = event.data.object;
  if (typeof charge.payment_intent !== "string") return;
  const admin: any = supabaseAdmin;
  const { data: store, error } = await admin.from("stores").select("id").eq("stripe_connected_account_id", event.account).maybeSingle();
  if (error) throw error;
  if (!store) return;
  const stripe = createTerminalStripeClient("live");
  for await (const providerRefund of stripe.refunds.list({ payment_intent: charge.payment_intent, limit: 100 }, { stripeAccount: event.account })) {
    const refundId = providerRefund.metadata?.seza_refund_id;
    if (!refundId || providerRefund.metadata?.seza_store_id !== store.id) continue;
    const { data: refund, error: readError } = await admin.from("refunds").select("id,sale_id,total,status").eq("id", refundId).eq("store_id", store.id).eq("processor", "stripe").maybeSingle();
    if (readError) throw readError;
    if (!refund || refund.status === "completed") continue;
    const { data: sale, error: saleError } = await admin.from("sales").select("id").eq("id", refund.sale_id).eq("store_id", store.id).eq("terminal_ref", charge.payment_intent).maybeSingle();
    if (saleError) throw saleError;
    if (!sale || providerRefund.amount !== Math.round(Number(refund.total) * 100)) throw new Error("Refund webhook ledger mismatch");
    if (providerRefund.status === "succeeded") {
      const { error: completionError } = await admin.rpc("complete_pos_refund", { p_refund_id: refund.id, p_processor_refund_id: providerRefund.id, p_processor_status: providerRefund.status });
      if (completionError) throw completionError;
    }
  }
}
