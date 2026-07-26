// Public HTTPS endpoint for merchant-side end of an active Support View
// session from the bundled Android shell. Mirrors `merchantEndSupportSession`.
import { createFileRoute } from "@tanstack/react-router";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Max-Age": "86400",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

export const Route = createFileRoute("/api/public/pos/support-end")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.support_end",
          limit: 20,
          windowSeconds: 60,
          blockSeconds: 300,
          maxBodyBytes: 8192,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;
        const authz = request.headers.get("authorization") ?? "";
        const token = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : "";
        if (!token) return json({ error: "Unauthorized" }, 401);

        let body: { sessionId?: unknown; note?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
        const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
        if (!sessionId) return json({ error: "Invalid request" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const admin: any = supabaseAdmin;

        const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
        if (userErr || !userRes.user) return json({ error: "Unauthorized" }, 401);
        const callerId = userRes.user.id;

        const { data: profile } = await admin
          .from("profiles")
          .select("id, store_id, full_name, email")
          .eq("id", callerId)
          .maybeSingle();
        if (!profile?.store_id) return json({ error: "No store" }, 403);

        const { data: sess } = await admin
          .from("admin_support_sessions")
          .select("id, store_id, status")
          .eq("id", sessionId)
          .maybeSingle();
        if (!sess) return json({ error: "Session not found" }, 404);
        if (sess.store_id !== profile.store_id) return json({ error: "Not authorized" }, 403);
        if (["ended", "declined", "expired"].includes(sess.status)) {
          return json({ ok: true });
        }

        const { error } = await admin
          .from("admin_support_sessions")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", sessionId);
        if (error) return json({ error: error.message }, 500);

        try {
          await admin.from("audit_log").insert({
            actor_id: callerId,
            actor_email: profile.email,
            action: "merchant.support_view.end",
            entity: "support_session",
            entity_id: sessionId,
            details: {
              employee_name: profile.full_name ?? profile.email,
              note,
              channel: "native_shell",
            },
          });
        } catch {
          /* ignore */
        }

        return json({ ok: true });
      },
    },
  },
});
