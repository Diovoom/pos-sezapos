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
        let authentication = "operational";
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
        try {
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!url || !key) authentication = "degraded";
        } catch {
          authentication = "degraded";
        }
        const email = process.env.RESEND_API_KEY ? "configured" : "not_configured";
        const sms = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_AUTH_TOKEN ? "configured" : "not_configured";
        const payments =
          process.env.STRIPE_SANDBOX_SECRET_KEY || process.env.STRIPE_LIVE_SECRET_KEY
            ? "configured"
            : "not_configured";
        const overall = database === "operational" && authentication === "operational" ? "operational" : "degraded";
        return Response.json(
          {
            product: "SEZA POS",
            status: overall,
            services: {
              website: "operational",
              authentication,
              database,
              owner_dashboard: database === "operational" && authentication === "operational" ? "operational" : "degraded",
              android_sync: database,
              email,
              sms,
              stripe_billing: payments,
            },
            responseTimeMs: Date.now() - started,
            checkedAt: new Date().toISOString(),
            version: "1.3.4",
          },
          { headers: { "cache-control": "no-store", ...CORS } },
        );
      },
    },
  },
});
