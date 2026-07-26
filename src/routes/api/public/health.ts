import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.health",
          limit: 30,
          windowSeconds: 60,
          blockSeconds: 0,
          maxBodyBytes: 1024,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;
        const started = Date.now();
        let database = "operational";
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin
            .from("stores")
            .select("id", { head: true, count: "exact" })
            .limit(1);
          if (error) database = "degraded";
        } catch {
          database = "degraded";
        }
        const overall = database === "operational" ? "operational" : "degraded";
        return Response.json(
          {
            product: "SEZA POS",
            status: overall,
            services: {
              website: "operational",
              authentication: "not_checked",
              database,
              owner_dashboard: database,
              android_sync: "not_checked",
              stripe_billing: "not_checked",
            },
            responseTimeMs: Date.now() - started,
            checkedAt: new Date().toISOString(),
            version: "1.3.2",
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
