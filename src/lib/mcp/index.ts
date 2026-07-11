import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getStoreInfo from "./tools/get-store-info";
import searchProducts from "./tools/search-products";
import listLowStock from "./tools/list-low-stock";
import listRecentSales from "./tools/list-recent-sales";
import getSalesSummary from "./tools/get-sales-summary";

// The OAuth issuer MUST be the direct Supabase host. On publish, SUPABASE_URL is
// rewritten to the `.lovable.cloud` proxy, which mcp-js rejects (RFC 8414 issuer
// mismatch). The project ref survives publish unchanged and Vite inlines
// import.meta.env.VITE_SUPABASE_PROJECT_ID as a literal at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "seza-pos-mcp",
  title: "SEZA POS",
  version: "0.1.0",
  instructions:
    "Read-only tools for the signed-in SEZA POS merchant. Use `get_store_info` for store context, `search_products` and `list_low_stock` for inventory, and `list_recent_sales` / `get_sales_summary` for sales data. All calls run under the caller's account with row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getStoreInfo, searchProducts, listLowStock, listRecentSales, getSalesSummary],
});
