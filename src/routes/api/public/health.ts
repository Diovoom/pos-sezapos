import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        let database = "operational";
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("stores").select("id", { head: true, count: "exact" }).limit(1);
          if (error) database = "degraded";
        } catch {
          database = "degraded";
        }
        const overall = database === "operational" ? "operational" : "degraded";
        return Response.json({
          product: "SEZA POS",
          status: overall,
          services: {
            website: "operational",
            authentication: database,
            database,
            owner_dashboard: database,
            android_sync: database,
            stripe_billing: "operational",
          },
          responseTimeMs: Date.now() - started,
          checkedAt: new Date().toISOString(),
          version: "1.2.2",
        }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
