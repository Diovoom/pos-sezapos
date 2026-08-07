import { createFileRoute } from "@tanstack/react-router";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
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
        if (blocked) {
          const headers = new Headers(blocked.headers);
          for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
          return new Response(blocked.body, { status: blocked.status, headers });
        }
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
            version: "1.3.3",
          },
          { headers: { "cache-control": "no-store", ...CORS } },
        );
      },
    },
  },
});
