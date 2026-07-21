// Dashboard-side server functions for managing paired POS devices at the
// signed-in user's store. Owner / admin / manager only.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function assertManager(ctx: Ctx) {
  const { data: roles } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId);
  const set = new Set<string>((roles ?? []).map((r: { role: string }) => r.role));
  if (!(set.has("owner") || set.has("admin") || set.has("manager"))) {
    throw new Error("Only owners, admins, or managers can manage POS devices");
  }
}

export const listPosDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await assertManager(ctx);
    const { data, error } = await ctx.supabase
      .from("device_registrations")
      .select("id, label, platform, status, paired_at, last_seen_at, revoked_at, revoke_reason")
      .order("paired_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { devices: data ?? [] };
  });

export const createPairingCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { label?: string; ttl_minutes?: number }) => data)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertManager(ctx);
    const label = (data.label ?? "POS Register").trim().slice(0, 60) || "POS Register";
    const ttl = Math.min(Math.max(data.ttl_minutes ?? 15, 5), 60);

    const { data: prof } = await ctx.supabase
      .from("profiles").select("store_id").eq("id", ctx.userId).maybeSingle();
    if (!prof?.store_id) throw new Error("You are not assigned to a store");

    const { generatePairingCode, hashPairingCode } = await import("@/lib/pos/device.server");
    const code = generatePairingCode();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;

    const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();
    const { error } = await admin.from("device_pairing_codes").insert({
      code_hash: hashPairingCode(code),
      store_id: prof.store_id,
      label,
      created_by: ctx.userId,
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);

    return { code, label, expires_at: expiresAt };
  });

export const revokePosDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { device_id: string; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertManager(ctx);
    const reason = (data.reason ?? "").trim();
    if (reason.length < 4) throw new Error("A reason of at least 4 characters is required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;

    // Ownership check via RLS-scoped read on ctx.supabase first, then admin write.
    const { data: dev } = await ctx.supabase
      .from("device_registrations").select("id").eq("id", data.device_id).maybeSingle();
    if (!dev) throw new Error("Device not found at your store");

    const { error } = await admin.from("device_registrations").update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: ctx.userId,
      revoke_reason: reason,
    }).eq("id", data.device_id);
    if (error) throw new Error(error.message);

    try {
      await admin.from("audit_log").insert({
        actor_id: ctx.userId, action: "device.revoke", entity: "device",
        entity_id: data.device_id, details: { reason },
      });
    } catch { /* ignore */ }
    return { ok: true };
  });
