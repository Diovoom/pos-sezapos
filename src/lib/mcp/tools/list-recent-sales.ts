import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, supabaseForUser } from "../supabase-client";

export default defineTool({
  name: "list_recent_sales",
  title: "List recent sales",
  description: "List the most recent completed sales for the signed-in user's store.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("How many sales to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    requireAuth(ctx);
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("sales")
      .select("id, receipt_number, created_at, subtotal, tax, discount, total, payment_method, status, refund_status, customer_name")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { sales: data ?? [] },
    };
  },
});
