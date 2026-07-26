import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, supabaseForUser } from "../supabase-client";

export default defineTool({
  name: "list_low_stock",
  title: "List low-stock products",
  description:
    "List active tracked products whose stock is at or below their reorder threshold (min_stock).",
  inputSchema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .describe("Maximum number of products to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    requireAuth(ctx);
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("products")
      .select("id, name, sku, stock, min_stock, unit")
      .eq("status", "active")
      .eq("track_inventory", true)
      .order("stock", { ascending: true })
      .limit(500);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const low = (data ?? []).filter((p) => (p.stock ?? 0) <= (p.min_stock ?? 0)).slice(0, limit);
    return {
      content: [{ type: "text", text: JSON.stringify(low, null, 2) }],
      structuredContent: { products: low, count: low.length },
    };
  },
});
