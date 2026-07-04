// Server functions for employee management, first-login onboarding, and
// PIN-based quick sign-in. All privileged writes go through `supabaseAdmin`
// but require the caller to be an authenticated owner (via has_role).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ------------------------------- helpers ------------------------------- */

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  for (let i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
  return out + "!7";
}

async function assertOwner(context: { supabase: SupabaseCtx; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_any_role", {
    _user_id: context.userId,
    _roles: ["owner"],
  });
  if (error || !data) throw new Error("Forbidden: owner role required");
}

async function assertOwnerOrAdmin(context: { supabase: SupabaseCtx; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_any_role", {
    _user_id: context.userId,
    _roles: ["owner", "admin"],
  });
  if (error || !data) throw new Error("Forbidden: owner or admin role required");
}

async function assertOwnerAdminOrManager(context: { supabase: SupabaseCtx; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_any_role", {
    _user_id: context.userId,
    _roles: ["owner", "admin", "manager"],
  });
  if (error || !data) throw new Error("Forbidden: owner, admin or manager role required");
}

async function isOwnerOrAdmin(context: { supabase: SupabaseCtx; userId: string }): Promise<boolean> {
  const { data } = await context.supabase.rpc("has_any_role", {
    _user_id: context.userId,
    _roles: ["owner", "admin"],
  });
  return !!data;
}

function generateSixDigitId(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

function generatePin(): string {
  return generateSixDigitId();
}

// Minimal typing so we don't need the generated Database type here.
type SupabaseCtx = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/* ---------------------------- create employee -------------------------- */

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      first_name: string;
      last_name: string;
      email: string;
      phone?: string;
      role: "manager" | "cashier";
      hire_date?: string;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context as unknown as { supabase: SupabaseCtx; userId: string });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tempPassword = generateTempPassword();
    const email = data.email.trim().toLowerCase();

    // Create auth user (auto-confirmed so first sign-in works immediately).
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: `${data.first_name} ${data.last_name}`.trim(),
        first_name: data.first_name,
        last_name: data.last_name,
      },
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message || "Failed to create user");
    }

    // Fetch this owner's store so we assign the employee to the same store.
    const { data: ownerProfile } = await supabaseAdmin
      .from("profiles")
      .select("store_id")
      .eq("id", (context as { userId: string }).userId)
      .maybeSingle();

    // handle_new_user() trigger already created a profile + a `cashier`
    // user_role. Update the profile with the extra fields and, if the
    // caller wanted `manager`, overwrite the role.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;

    const { error: profileErr } = await admin
      .from("profiles")
      .update({
        first_name: data.first_name,
        last_name: data.last_name,
        full_name: `${data.first_name} ${data.last_name}`.trim(),
        phone: data.phone || null,
        hire_date: data.hire_date || null,
        must_change_password: true,
        status: "active",
        store_id: ownerProfile?.store_id ?? null,
      })
      .eq("id", created.user.id);
    if (profileErr) throw new Error(profileErr.message);

    if (data.role === "manager") {
      await admin
        .from("user_roles")
        .update({ role: "manager" })
        .eq("user_id", created.user.id);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("employee_id, email")
      .eq("id", created.user.id)
      .maybeSingle();

    return {
      user_id: created.user.id,
      email,
      employee_id: profile?.employee_id as string,
      temp_password: tempPassword,
    };
  });

/* -------------------- toggle status / reset password ------------------- */

export const setEmployeeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string; status: "active" | "disabled" }) => data)
  .handler(async ({ data, context }) => {
    await assertOwner(context as unknown as { supabase: SupabaseCtx; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;
    const { error } = await admin
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    // Also ban / unban at the auth layer to fully block sign-in.
    await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.status === "disabled" ? "876000h" : "none",
    });
    return { ok: true };
  });

export const resetEmployeeCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertOwnerAdminOrManager(context as unknown as { supabase: SupabaseCtx; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tempPassword = generateTempPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: tempPassword,
    });
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;
    await admin
      .from("profiles")
      .update({ must_change_password: true, pin_hash: null })
      .eq("id", data.user_id);
    return { temp_password: tempPassword };
  });

/* ------------------------- first-login onboarding --------------------- */

export const completeFirstLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { new_password: string; pin?: string }) => data)
  .handler(async ({ data, context }) => {
    const ctx = context as { userId: string };
    if (data.new_password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    if (data.pin && !/^\d{6}$/.test(data.pin)) {
      throw new Error("PIN must be exactly 6 digits");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashPin } = await import("./pin.server");

    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(ctx.userId, {
      password: data.new_password,
    });
    if (pwErr) throw new Error(pwErr.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;
    const patch: Record<string, unknown> = { must_change_password: false };
    if (data.pin) patch.pin_hash = hashPin(data.pin);

    const { error: profErr } = await admin
      .from("profiles")
      .update(patch)
      .eq("id", ctx.userId);
    if (profErr) throw new Error(profErr.message);

    return { ok: true };
  });

/* ------------------- set / clear PIN for signed-in user --------------- */

export const setMyPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { pin: string | null }) => data)
  .handler(async ({ data, context }) => {
    const ctx = context as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;

    if (data.pin === null || data.pin === "") {
      await admin.from("profiles").update({ pin_hash: null }).eq("id", ctx.userId);
      return { ok: true };
    }
    if (!/^\d{6}$/.test(data.pin)) throw new Error("PIN must be exactly 6 digits");

    const { hashPin } = await import("./pin.server");
    await admin
      .from("profiles")
      .update({ pin_hash: hashPin(data.pin) })
      .eq("id", ctx.userId);
    return { ok: true };
  });

/* ------------------------ quick sign-in with PIN ----------------------- */

// PUBLIC (no requireSupabaseAuth). Returns a magic-link token_hash the
// client can pass to `supabase.auth.verifyOtp` to establish a real session.
// Never returns the user's password or any auth secret.
export const signInWithEmployeePin = createServerFn({ method: "POST" })
  .inputValidator((data: { employee_id: string; pin: string }) => data)
  .handler(async ({ data }) => {
    if (!/^\d{6}$/.test(data.employee_id)) throw new Error("Invalid employee ID");
    if (!/^\d{6}$/.test(data.pin)) throw new Error("Invalid PIN");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;

    const { data: profile, error } = await admin
      .from("profiles")
      .select("id, email, pin_hash, status")
      .eq("employee_id", data.employee_id)
      .maybeSingle();

    if (error) throw new Error(`Lookup failed: ${error.message}`);
    if (!profile) throw new Error("No employee found with that ID");
    if (!profile.email) throw new Error("Employee has no email on file");
    if (profile.status !== "active") throw new Error("Account is disabled");
    if (!profile.pin_hash) {
      throw new Error("No PIN set. Sign in with email/password first, then set a PIN in your profile.");
    }

    const { verifyPin } = await import("./pin.server");
    if (!verifyPin(data.pin, profile.pin_hash as string)) {
      throw new Error("Incorrect PIN");
    }

    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email as string,
    });
    if (linkErr || !link.properties) throw new Error("Could not create session");

    return {
      email: profile.email as string,
      // hashed_token is what verifyOtp expects for magiclink OTP verification.
      token_hash: (link.properties as { hashed_token: string }).hashed_token,
    };
  });

/* --------------------- quick sign-in with PIN only --------------------- */

// PIN-only sign-in. Scans active employees with a pin_hash and verifies
// each with scrypt. Returns a magic-link token_hash for verifyOtp.
// If multiple employees share the same PIN, the caller must fall back to
// PIN + Employee ID mode.
export const signInWithPin = createServerFn({ method: "POST" })
  .inputValidator((data: { pin: string }) => data)
  .handler(async ({ data }) => {
    if (!/^\d{6}$/.test(data.pin)) throw new Error("PIN must be exactly 6 digits");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;

    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, email, pin_hash, status")
      .eq("status", "active")
      .not("pin_hash", "is", null);

    if (error) throw new Error(`Lookup failed: ${error.message}`);
    if (!profiles || profiles.length === 0) throw new Error("Incorrect PIN");

    const { verifyPin } = await import("./pin.server");
    const matches = profiles.filter((p: { pin_hash: string }) =>
      verifyPin(data.pin, p.pin_hash as string),
    );
    if (matches.length === 0) throw new Error("Incorrect PIN");
    if (matches.length > 1) {
      throw new Error("MULTIPLE_MATCHES:This PIN is used by more than one employee. Please also enter your 6-digit Employee ID.");
    }
    const profile = matches[0];
    if (!profile.email) throw new Error("Employee has no email on file");

    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email as string,
    });
    if (linkErr || !link.properties) throw new Error("Could not create session");

    return {
      email: profile.email as string,
      token_hash: (link.properties as { hashed_token: string }).hashed_token,
    };
  });

/* ---------------------- update employee (admin edit) ------------------- */

export const updateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      user_id: string;
      first_name?: string | null;
      last_name?: string | null;
      phone?: string | null;
      email?: string | null;
      hire_date?: string | null;
      photo_url?: string | null;
      role?: "owner" | "manager" | "cashier" | "admin";
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await assertOwnerAdminOrManager(context as unknown as { supabase: SupabaseCtx; userId: string });
    const callerIsOwnerOrAdmin = await isOwnerOrAdmin(context as unknown as { supabase: SupabaseCtx; userId: string });
    if (data.role && !callerIsOwnerOrAdmin) {
      throw new Error("Only owners or admins can change a role");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;

    const patch: Record<string, unknown> = {};
    for (const k of ["first_name", "last_name", "phone", "hire_date", "photo_url"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (data.first_name !== undefined || data.last_name !== undefined) {
      const { data: cur } = await admin.from("profiles").select("first_name,last_name").eq("id", data.user_id).maybeSingle();
      const first = data.first_name ?? cur?.first_name ?? "";
      const last = data.last_name ?? cur?.last_name ?? "";
      patch.full_name = `${first} ${last}`.trim() || null;
    }
    if (data.email !== undefined && data.email !== null) {
      const email = data.email.trim().toLowerCase();
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { email });
      if (authErr) throw new Error(authErr.message);
      patch.email = email;
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from("profiles").update(patch).eq("id", data.user_id);
      if (error) throw new Error(error.message);
    }

    if (data.role) {
      const { data: existing } = await admin.from("user_roles").select("id").eq("user_id", data.user_id).limit(1).maybeSingle();
      if (existing) {
        await admin.from("user_roles").update({ role: data.role }).eq("user_id", data.user_id);
      } else {
        await admin.from("user_roles").insert({ user_id: data.user_id, role: data.role });
      }
    }
    return { ok: true };
  });

/* -------------------------- employee ID mgmt --------------------------- */

export const setEmployeeCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string; employee_id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context as unknown as { supabase: SupabaseCtx; userId: string });
    if (!/^\d{6}$/.test(data.employee_id)) throw new Error("Employee ID must be 6 digits");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;
    const { data: dup } = await admin.from("profiles").select("id").eq("employee_id", data.employee_id).neq("id", data.user_id).maybeSingle();
    if (dup) throw new Error("That Employee ID is already taken");
    const { error } = await admin.from("profiles").update({ employee_id: data.employee_id }).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { employee_id: data.employee_id };
  });

export const regenerateEmployeeCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context as unknown as { supabase: SupabaseCtx; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;
    for (let i = 0; i < 20; i++) {
      const candidate = generateSixDigitId();
      const { data: dup } = await admin.from("profiles").select("id").eq("employee_id", candidate).maybeSingle();
      if (!dup) {
        const { error } = await admin.from("profiles").update({ employee_id: candidate }).eq("id", data.user_id);
        if (error) throw new Error(error.message);
        return { employee_id: candidate };
      }
    }
    throw new Error("Could not generate a unique Employee ID");
  });

/* ------------------------------ PIN admin ------------------------------ */

// Set a specific PIN OR generate a random one. If `force_change` is true the
// employee will be required to pick a new PIN at next sign-in.
export const adminResetPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { user_id: string; pin?: string | null; force_change?: boolean; clear?: boolean }) => data,
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context as unknown as { supabase: SupabaseCtx; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;

    if (data.clear) {
      await admin.from("profiles").update({ pin_hash: null, must_change_pin: !!data.force_change }).eq("id", data.user_id);
      return { pin: null };
    }

    const pin = data.pin && /^\d{6}$/.test(data.pin) ? data.pin : generatePin();
    const { hashPin } = await import("./pin.server");
    const { error } = await admin
      .from("profiles")
      .update({ pin_hash: hashPin(pin), must_change_pin: !!data.force_change })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { pin };
  });

/* --------------------------- delete employee --------------------------- */

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string }) => data)
  .handler(async ({ data, context }) => {
    const ctx = context as { userId: string };
    await assertOwner(context as unknown as { supabase: SupabaseCtx; userId: string });
    if (data.user_id === ctx.userId) throw new Error("You cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

