// Public HTTPS endpoint for merchant-side response to a platform admin
// "Request Support View" from the bundled Android shell.
//
// Mirrors `merchantRespondSupportSession` (a TanStack Start server fn that
// the APK cannot reach). Web merchant dashboard continues to use the
// server-fn path — this endpoint only exists for the APK.
//
// Security:
//   - Requires a valid Supabase bearer token — caller must be signed in.
//   - Session must belong to the caller's own store; cross-tenant blocked.
//   - Session must still be in status 'pending' (single-decision).
//   - Every accept/decline is written to audit_log.
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

export const Route = createFileRoute("/api/public/pos/support-respond")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.support_respond",
          limit: 30,
          windowSeconds: 60,
          blockSeconds: 300,
          maxBodyBytes: 16384,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;
        const authz = request.headers.get("authorization") ?? "";
        const token = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : "";
        if (!token) return json({ error: "Unauthorized" }, 401);

        let body: {
          sessionId?: unknown;
          decision?: unknown;
          note?: unknown;
          clientCapability?: unknown;
          clientMetadata?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
        const decision =
          body.decision === "accept" || body.decision === "decline" ? body.decision : null;
        const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
        const capability =
          body.clientCapability === "web_screen_share" ||
          body.clientCapability === "android_diagnostics_only" ||
          body.clientCapability === "android_screen_share"
            ? body.clientCapability
            : null;
        // Redact obvious secret keys from client-supplied metadata.
        const FORBIDDEN =
          /(pin|password|token|secret|apikey|api_key|authorization|card|cvv|cvc|track|pan|refresh)/i;
        const scrub = (v: unknown): unknown => {
          if (v == null || typeof v !== "object") return v;
          const out: Record<string, unknown> = Array.isArray(v)
            ? ([] as unknown as Record<string, unknown>)
            : {};
          for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
            if (FORBIDDEN.test(k)) continue;
            out[k] = typeof val === "object" && val !== null ? scrub(val) : val;
          }
          return out;
        };
        const safeMetadata =
          body.clientMetadata && typeof body.clientMetadata === "object"
            ? scrub(body.clientMetadata)
            : null;
        if (!sessionId || !decision) return json({ error: "Invalid request" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const admin: any = supabaseAdmin;

        const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
        if (userErr || !userRes.user) return json({ error: "Unauthorized" }, 401);
        const callerId = userRes.user.id;

        const { data: profile } = await admin
          .from("profiles")
          .select("id, store_id, full_name, email, employee_id, status")
          .eq("id", callerId)
          .maybeSingle();
        if (!profile?.store_id) return json({ error: "No store" }, 403);
        if (profile.status && profile.status !== "active")
          return json({ error: "Inactive employee" }, 403);

        const { data: sess } = await admin
          .from("admin_support_sessions")
          .select("id, store_id, status, admin_id, admin_email, reason, expires_at")
          .eq("id", sessionId)
          .maybeSingle();
        if (!sess) return json({ error: "Support request not found" }, 404);
        if (sess.store_id !== profile.store_id) return json({ error: "Not authorized" }, 403);
        if (sess.status !== "pending") return json({ error: "Request already resolved" }, 409);
        if (sess.expires_at && new Date(sess.expires_at).getTime() < Date.now()) {
          return json({ error: "This request has expired." }, 410);
        }

        const now = new Date().toISOString();
        const patch =
          decision === "accept"
            ? {
                status: "active",
                decided_at: now,
                decided_by: callerId,
                decision_note: note,
                started_at: now,
                expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
                client_capability: capability ?? "android_diagnostics_only",
                client_metadata: safeMetadata,
              }
            : {
                status: "declined",
                decided_at: now,
                decided_by: callerId,
                decision_note: note,
                ended_at: now,
              };

        const { error, data: updated } = await admin
          .from("admin_support_sessions")
          .update(patch)
          .eq("id", sessionId)
          .eq("status", "pending")
          .select("id, status")
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!updated) return json({ error: "Request already resolved" }, 409);

        try {
          await admin.from("audit_log").insert({
            actor_id: callerId,
            actor_email: profile.email,
            action:
              decision === "accept"
                ? "merchant.support_view.accept"
                : "merchant.support_view.decline",
            entity: "support_session",
            entity_id: sessionId,
            details: {
              admin_id: sess.admin_id,
              admin_email: sess.admin_email,
              employee_name: profile.full_name ?? profile.email,
              employee_id: profile.employee_id,
              reason: sess.reason,
              note,
              channel: "native_shell",
              client_capability: capability ?? "android_diagnostics_only",
            },
          });
        } catch {
          /* ignore */
        }

        return json({ ok: true, status: updated.status });
      },
    },
  },
});
