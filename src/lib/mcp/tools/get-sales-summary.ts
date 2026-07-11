import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, supabaseForUser } from "../supabase-client";

export default defineTool({
  name: "get_sales_summary",
  title: "Get sales summary",
  description: "Aggregate sales totals for the signed-in user's store over the last N days (default 1 = today).",
  inputSchema: {
    days: z.number().int().min(1).max(90).default(1).describe("Rolling window in days."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    requireAuth(ctx);
    const supabase = supabaseForUser(ctx);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("sales")
      .select("total, subtotal, tax, discount, refunded_amount, status, payment_method, created_at")
      .gte("created_at", since);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    const completed = rows.filter((r) => r.status !== "voided");
    const gross = completed.reduce((s, r) => s + Number(r.total ?? 0), 0);
    const refunded = completed.reduce((s, r) => s + Number(r.refunded_amount ?? 0), 0);
    const tax = completed.reduce((s, r) => s + Number(r.tax ?? 0), 0);
    const discount = completed.reduce((s, r) => s + Number(r.discount ?? 0), 0);
    const byMethod: Record<string, { count: number; total: number }> = {};
    for (const r of completed) {
      const m = String(r.payment_method ?? "unknown");
      byMethod[m] ??= { count: 0, total: 0 };
      byMethod[m].count += 1;
      byMethod[m].total += Number(r.total ?? 0);
    }
    const summary = {
      window_days: days,
      since,
      transactions: completed.length,
      voided: rows.length - completed.length,
      gross_sales: Number(gross.toFixed(2)),
      refunded: Number(refunded.toFixed(2)),
      net_sales: Number((gross - refunded).toFixed(2)),
      tax: Number(tax.toFixed(2)),
      discount: Number(discount.toFixed(2)),
      by_payment_method: byMethod,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
