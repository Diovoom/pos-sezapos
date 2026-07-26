import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email().max(320);
const passwordSchema = z.string().min(8).max(128);
const captchaSchema = z.string().trim().max(4096).optional();

const sessionShape = (session: any) =>
  session
    ? {
        access_token: String(session.access_token),
        refresh_token: String(session.refresh_token),
        expires_at: typeof session.expires_at === "number" ? session.expires_at : null,
      }
    : null;

export type SecureAuthResult =
  | {
      ok: true;
      user_id?: string;
      session: ReturnType<typeof sessionShape>;
      verification_required?: boolean;
    }
  | { ok: false; error: string; retry_after_seconds?: number };

async function limit(
  scope: string,
  email: string,
  maximum: number,
  windowSeconds: number,
  blockSeconds: number,
): Promise<{ ok: true } | { ok: false; retry: number }> {
  const request = getRequest();
  const { consumeRateLimit, getClientIp } = await import("@/lib/security/rate-limit.server");
  const result = await consumeRateLimit({
    scope,
    limit: maximum,
    windowSeconds,
    blockSeconds,
    identifier: `${getClientIp(request)}:${email}`,
    request,
    durable: true,
  });
  return result.allowed ? { ok: true } : { ok: false, retry: result.retryAfterSeconds };
}

async function rolesFor(userId: string): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Authorization check failed");
  return (data ?? []).map((row) => String(row.role));
}

async function auditLogin(userId: string, surface: "owner" | "admin") {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      actor_id: userId,
      action: "login",
      entity: surface,
      entity_id: userId,
      details: { method: "password", surface, server_verified: true },
    });
  } catch {
    // Login must not fail because audit storage is temporarily unavailable.
  }
}

const loginInput = z.object({
  email: emailSchema,
  password: passwordSchema,
  captchaToken: captchaSchema,
});

export const secureOwnerPasswordSignIn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => loginInput.parse(input))
  .handler(async ({ data }): Promise<SecureAuthResult> => {
    const allowed = await limit("auth.owner.password", data.email, 5, 15 * 60, 30 * 60);
    if (!allowed.ok) {
      return {
        ok: false,
        error: "Too many attempts. Please wait and try again.",
        retry_after_seconds: allowed.retry,
      };
    }

    try {
      const { createPublicAuthClient } = await import("./auth.server");
      const auth = createPublicAuthClient();
      const { data: signedIn, error } = await auth.auth.signInWithPassword({
        email: data.email,
        password: data.password,
        options: data.captchaToken ? { captchaToken: data.captchaToken } : undefined,
      });
      if (error || !signedIn.user || !signedIn.session) {
        return { ok: false, error: "Invalid email or password." };
      }

      const roles = await rolesFor(signedIn.user.id);
      const { hasAnyPlatformRole } = await import("@/lib/platform-roles");
      if (hasAnyPlatformRole(roles) || !roles.includes("owner")) {
        return { ok: false, error: "This account cannot access the owner dashboard." };
      }

      await auditLogin(signedIn.user.id, "owner");
      return { ok: true, user_id: signedIn.user.id, session: sessionShape(signedIn.session) };
    } catch {
      return { ok: false, error: "Sign in is temporarily unavailable. Please try again." };
    }
  });

export const secureAdminPasswordSignIn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => loginInput.parse(input))
  .handler(async ({ data }): Promise<SecureAuthResult> => {
    const allowed = await limit("auth.admin.password", data.email, 3, 15 * 60, 60 * 60);
    if (!allowed.ok) {
      return {
        ok: false,
        error: "Too many attempts. Please wait and try again.",
        retry_after_seconds: allowed.retry,
      };
    }

    try {
      const { createPublicAuthClient } = await import("./auth.server");
      const auth = createPublicAuthClient();
      const { data: signedIn, error } = await auth.auth.signInWithPassword({
        email: data.email,
        password: data.password,
        options: data.captchaToken ? { captchaToken: data.captchaToken } : undefined,
      });
      if (error || !signedIn.user || !signedIn.session) {
        return { ok: false, error: "Invalid credentials or insufficient permissions." };
      }

      const roles = await rolesFor(signedIn.user.id);
      const { hasAnyPlatformRole } = await import("@/lib/platform-roles");
      if (!hasAnyPlatformRole(roles)) {
        return { ok: false, error: "Invalid credentials or insufficient permissions." };
      }

      await auditLogin(signedIn.user.id, "admin");
      return { ok: true, user_id: signedIn.user.id, session: sessionShape(signedIn.session) };
    } catch {
      return { ok: false, error: "Sign in is temporarily unavailable. Please try again." };
    }
  });

const signupInput = z.object({
  businessName: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
  timeZone: z.string().trim().min(1).max(100),
  selectedPlan: z.enum(["starter", "pro", "business"]).nullable().optional(),
  termsVersion: z.string().trim().min(1).max(50),
  privacyVersion: z.string().trim().min(1).max(50),
  captchaToken: captchaSchema,
});

export const secureMerchantSignUp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => signupInput.parse(input))
  .handler(async ({ data }): Promise<SecureAuthResult> => {
    const allowed = await limit("auth.merchant.signup", data.email, 3, 60 * 60, 6 * 60 * 60);
    if (!allowed.ok) {
      return {
        ok: false,
        error: "Too many signup attempts. Please try again later.",
        retry_after_seconds: allowed.retry,
      };
    }

    try {
      const request = getRequest();
      if (!request) throw new Error("Request unavailable");
      const { createPublicAuthClient, safeDashboardOrigin } = await import("./auth.server");
      const auth = createPublicAuthClient();
      const planQuery = data.selectedPlan ? `?plan=${encodeURIComponent(data.selectedPlan)}` : "";
      const emailRedirectTo = `${safeDashboardOrigin(request)}/select-plan${planQuery}`;
      const { data: signedUp, error } = await auth.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo,
          captchaToken: data.captchaToken,
          data: {
            business_name: data.businessName,
            time_zone: data.timeZone,
            country: "US",
            selected_plan: data.selectedPlan ?? null,
            legal_accepted_at: new Date().toISOString(),
            terms_version: data.termsVersion,
            privacy_version: data.privacyVersion,
          },
        },
      });
      if (error) {
        // Keep the message generic so the endpoint does not become an account
        // enumeration tool.
        return {
          ok: false,
          error: "We could not create the account. Check your information or try again later.",
        };
      }
      return {
        ok: true,
        user_id: signedUp.user?.id,
        session: sessionShape(signedUp.session),
        verification_required: !signedUp.session,
      };
    } catch {
      return { ok: false, error: "Signup is temporarily unavailable. Please try again." };
    }
  });

const resetInput = z.object({
  email: emailSchema,
  surface: z.enum(["owner", "admin"]).default("owner"),
  captchaToken: captchaSchema,
});

export const securePasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => resetInput.parse(input))
  .handler(async ({ data }) => {
    const allowed = await limit(`auth.${data.surface}.reset`, data.email, 3, 60 * 60, 60 * 60);
    if (!allowed.ok) {
      return { ok: true, retry_after_seconds: allowed.retry };
    }
    try {
      const request = getRequest();
      if (!request) throw new Error("Request unavailable");
      const { createPublicAuthClient, safeDashboardOrigin } = await import("./auth.server");
      const auth = createPublicAuthClient();
      await auth.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${safeDashboardOrigin(request)}/reset-password`,
        captchaToken: data.captchaToken,
      } as any);
    } catch {
      // Always return the same response to prevent email enumeration.
    }
    return { ok: true };
  });

const resendInput = z.object({ email: emailSchema, captchaToken: captchaSchema });

export const secureResendVerification = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => resendInput.parse(input))
  .handler(async ({ data }) => {
    const short = await limit("auth.signup.resend.minute", data.email, 1, 60, 60);
    const daily = await limit("auth.signup.resend.day", data.email, 5, 24 * 60 * 60, 24 * 60 * 60);
    if (!short.ok || !daily.ok) {
      return {
        ok: false,
        error: "Please wait before requesting another verification email.",
        retry_after_seconds: Math.max(short.ok ? 0 : short.retry, daily.ok ? 0 : daily.retry),
      };
    }
    try {
      const { createPublicAuthClient } = await import("./auth.server");
      const auth = createPublicAuthClient();
      await auth.auth.resend({
        type: "signup",
        email: data.email,
        options: data.captchaToken ? { captchaToken: data.captchaToken } : undefined,
      });
    } catch {
      // Generic response; do not reveal whether the account exists.
    }
    return { ok: true };
  });
