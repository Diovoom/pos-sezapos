import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "cache-control": "no-store",
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

type Action = "clock_in" | "clock_out" | "start_break" | "end_break";

export const Route = createFileRoute("/api/public/pos/timeclock")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration error" }, 500);

        const authorization = request.headers.get("authorization");
        if (!authorization?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
        const admin = createClient(supabaseUrl, serviceKey);
        const token = authorization.slice(7).trim();
        const { data: auth, error: authError } = await admin.auth.getUser(token);
        if (authError || !auth.user) return json({ error: "Unauthorized" }, 401);

        let payload: { action?: Action; occurredAt?: string; idempotencyKey?: string };
        try { payload = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
        if (!payload.action || !["clock_in", "clock_out", "start_break", "end_break"].includes(payload.action)) {
          return json({ error: "Invalid time-clock action" }, 400);
        }

        const requested = payload.occurredAt ? new Date(payload.occurredAt) : new Date();
        if (Number.isNaN(requested.getTime())) return json({ error: "Invalid time-clock timestamp" }, 400);
        const now = Date.now();
        if (requested.getTime() > now + 5 * 60_000) return json({ error: "Time-clock timestamp is in the future" }, 400);
        if (requested.getTime() < now - 14 * 24 * 60 * 60_000) {
          return json({ error: "Time-clock action is too old to synchronize automatically" }, 409);
        }
        const at = requested.toISOString();

        const { data: profile, error: profileError } = await admin
          .from("profiles")
          .select("id,store_id,status")
          .eq("id", auth.user.id)
          .maybeSingle();
        if (profileError) return json({ error: profileError.message }, 500);
        if (!profile) return json({ error: "Employee profile not found" }, 404);
        if (profile.status === "disabled" || profile.status === "removed") return json({ error: "Account is disabled" }, 403);

        const { data: existing, error: readError } = await admin
          .from("time_entries")
          .select("*")
          .eq("user_id", auth.user.id)
          .is("clock_out", null)
          .order("clock_in", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (readError) return json({ error: readError.message }, 500);

        if (payload.action === "clock_in") {
          if (existing) return json({ ok: true, entry: existing, alreadyApplied: true });
          const { data: created, error } = await admin
            .from("time_entries")
            .insert({ user_id: auth.user.id, store_id: profile.store_id ?? null, clock_in: at })
            .select("*")
            .single();
          if (error) return json({ error: error.message }, 500);
          return json({ ok: true, entry: created, alreadyApplied: false });
        }

        if (!existing) {
          if (payload.action === "clock_out") return json({ ok: true, entry: null, alreadyApplied: true });
          return json({ error: "You are not currently clocked in" }, 409);
        }

        const patch: Record<string, unknown> = {};
        if (payload.action === "clock_out") {
          const breakStart = existing.break_start ? new Date(existing.break_start).getTime() : null;
          const extraBreak = breakStart == null ? 0 : Math.max(0, Math.round((requested.getTime() - breakStart) / 60000));
          patch.clock_out = at;
          patch.break_start = null;
          patch.break_minutes = Number(existing.break_minutes ?? 0) + extraBreak;
        } else if (payload.action === "start_break") {
          if (existing.break_start) return json({ ok: true, entry: existing, alreadyApplied: true });
          patch.break_start = at;
        } else if (payload.action === "end_break") {
          if (!existing.break_start) return json({ ok: true, entry: existing, alreadyApplied: true });
          const minutes = Math.max(0, Math.round((requested.getTime() - new Date(existing.break_start).getTime()) / 60000));
          patch.break_start = null;
          patch.break_minutes = Number(existing.break_minutes ?? 0) + minutes;
        }

        const { data: updated, error } = await admin
          .from("time_entries")
          .update(patch)
          .eq("id", existing.id)
          .eq("user_id", auth.user.id)
          .select("*")
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, entry: updated ?? null, alreadyApplied: false });
      },
    },
  },
});
