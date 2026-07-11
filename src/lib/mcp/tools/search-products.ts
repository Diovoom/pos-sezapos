import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, supabaseForUser } from "../supabase-client";

export default defineTool({
  name: "search_products",
  title: "Search products",
  description: "Search inventory for the signed-in user's store. Matches name, SKU, or barcode.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Search text — matches product name, SKU, or barcode.").optional(),
    limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of products to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    requireAuth(ctx);
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("products")
      .select("id, name, sku, barcode, price, cost, stock, min_stock, unit, status")
      .eq("status", "active")
      .order("name", { ascending: true })
      .limit(limit);
    if (query) {
      const safe = query.replace(/[%,]/g, " ").trim();
      q = q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,barcode.ilike.%${safe}%`);
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { products: data ?? [] },
    };
  },
});
