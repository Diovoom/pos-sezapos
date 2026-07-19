// Public HTTPS endpoint for the bundled Android POS shell — first-login
// onboarding (set permanent password + optional PIN). Mirrors the
// `completeFirstLogin` TanStack server function.
import { createFileRoute } from "@tanstack/react-router";

type Body = { new_password?: unknown; pin?: unknown };

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/pos/complete-first-login")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return json({ error: "Missing bearer token" }, 401);

        let body: Body;
        try { body = (await request.json()) as Body; } catch { return json({ error: "Invalid JSON" }, 400); }
        const pwd = typeof body.new_password === "string" ? body.new_password : "";
        const pin = typeof body.pin === "string" && body.pin ? body.pin : undefined;
        if (pwd.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
        if (pin && !/^\d{6}$/.test(pin)) return json({ error: "PIN must be exactly 6 digits" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: userRes, error: uerr } = await supabaseAdmin.auth.getUser(token);
        if (uerr || !userRes.user) return json({ error: "Unauthorized" }, 401);
        const userId = userRes.user.id;

        const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: pwd });
        if (pwErr) return json({ error: pwErr.message }, 500);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const admin: any = supabaseAdmin;
        const patch: Record<string, unknown> = { must_change_password: false };
        if (pin) {
          const { hashPin } = await import("@/lib/pin.server");
          patch.pin_hash = hashPin(pin);
          patch.must_change_pin = false;
        }
        const { error: profErr } = await admin.from("profiles").update(patch).eq("id", userId);
        if (profErr) return json({ error: profErr.message }, 500);

        try {
          await admin.from("audit_log").insert({
            actor_id: userId, action: "onboarding_complete", entity: "employee", entity_id: userId,
            details: { channel: "native_shell", pin_set: !!pin },
          });
        } catch { /* ignore */ }

        return json({ ok: true });
      },
    },
  },
});
