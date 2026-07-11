import { defineTool } from "@lovable.dev/mcp-js";
import { requireAuth, supabaseForUser } from "../supabase-client";

export default defineTool({
  name: "get_store_info",
  title: "Get store info",
  description: "Get the signed-in user's SEZA POS store details (name, code, currency, plan status).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    requireAuth(ctx);
    const supabase = supabaseForUser(ctx);
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("store_id, full_name, email")
      .eq("id", ctx.getUserId())
      .maybeSingle();
    if (profileErr) return { content: [{ type: "text", text: profileErr.message }], isError: true };
    if (!profile?.store_id) {
      return { content: [{ type: "text", text: "No store associated with this user." }] };
    }
    const { data: store, error } = await supabase
      .from("stores")
      .select("id, name, store_code, country, currency, time_zone, plan_tier, plan_status, plan_period_end, trial_ends_at")
      .eq("id", profile.store_id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify({ user: profile, store }, null, 2) }],
      structuredContent: { user: profile, store },
    };
  },
});
