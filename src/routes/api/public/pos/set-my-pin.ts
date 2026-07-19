// Public HTTPS endpoint for the bundled Android POS shell.
//
// Sets or clears the signed-in employee's 6-digit POS PIN. Requires a
// valid Supabase bearer token in the Authorization header — we resolve
// the user via supabaseAdmin.auth.getUser(token) and update only that
// user's own profile.pin_hash. Never trust a user_id from the body.
import { createFileRoute } from "@tanstack/react-router";

type Body = { pin?: unknown };

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

export const Route = createFileRoute("/api/public/pos/set-my-pin")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return json({ error: "Missing bearer token" }, 401);

        let body: Body;
        try { body = (await request.json()) as Body; } catch { return json({ error: "Invalid JSON" }, 400); }
        const raw = body.pin;
        const pin: string | null =
          raw === null || raw === "" ? null : typeof raw === "string" ? raw : "";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: userRes, error: uerr } = await supabaseAdmin.auth.getUser(token);
        if (uerr || !userRes.user) return json({ error: "Unauthorized" }, 401);
        const userId = userRes.user.id;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const admin: any = supabaseAdmin;

        if (pin === null) {
          const { error } = await admin.from("profiles").update({ pin_hash: null }).eq("id", userId);
          if (error) return json({ error: error.message }, 500);
          return json({ ok: true });
        }
        if (!/^\d{6}$/.test(pin)) return json({ error: "PIN must be exactly 6 digits" }, 400);

        const { hashPin } = await import("@/lib/pin.server");
        const { error } = await admin
          .from("profiles")
          .update({ pin_hash: hashPin(pin), must_change_pin: false })
          .eq("id", userId);
        if (error) return json({ error: error.message }, 500);

        try {
          await admin.from("audit_log").insert({
            actor_id: userId, action: "pin_set", entity: "employee", entity_id: userId,
            details: { channel: "native_shell" },
          });
        } catch { /* ignore */ }

        return json({ ok: true });
      },
    },
  },
});
