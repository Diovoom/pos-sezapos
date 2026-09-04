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
  phone: z.string().trim().min(10).max(30),
  address: z.string().trim().min(5).max(160),
  zip: z.string().trim().min(5).max(10),
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
    const { isDisposableEmail, DISPOSABLE_EMAIL_MESSAGE } =
      await import("@/lib/security/disposable-email");
    if (isDisposableEmail(data.email)) {
      return { ok: false, error: DISPOSABLE_EMAIL_MESSAGE };
    }

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
      // Prefer a dedicated anti-abuse secret, but do not make merchant signup
      // depend on one extra Cloudflare variable. The server-only Supabase
      // service key is already required in production and is a safe fallback
      // HMAC source. Nothing derived from it is ever returned to the browser.
      const fingerprintSecret =
        process.env.TRIAL_FINGERPRINT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!fingerprintSecret || fingerprintSecret.length < 32) {
        throw new Error("Signup security is not configured");
      }
      const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      const identity = [normalize(data.businessName), normalize(data.address), normalize(data.zip), normalize(data.phone)].join("|");
      const sign = async (value: string) => {
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(fingerprintSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        return Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))).toString("hex");
      };
      const businessFingerprint = await sign(`business:${identity}`);
      const { getClientIp } = await import("@/lib/security/rate-limit.server");
      const ipHash = await sign(`ip:${getClientIp(request)}`);
      const emailHash = await sign(`email:${data.email}`);
      const userAgentHash = await sign(`ua:${request.headers.get("user-agent") || "unknown"}`);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [{ count: ipCount }, { data: priorBusiness }] = await Promise.all([
        (supabaseAdmin as any).from("signup_risk_events").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since),
        (supabaseAdmin as any).from("business_trial_registry").select("status").eq("business_fingerprint", businessFingerprint).maybeSingle(),
      ]);
      if (priorBusiness && ["trial_active", "trial_used", "paid", "blocked"].includes(priorBusiness.status)) {
        await (supabaseAdmin as any).from("signup_risk_events").insert({ event_type: "duplicate_business_blocked", ip_hash: ipHash, email_hash: emailHash, business_fingerprint: businessFingerprint, user_agent_hash: userAgentHash, risk_score: 100 });
        return { ok: false, error: "This business has already used its SEZA free trial. Sign in or choose a paid plan." };
      }
      const riskScore = Math.min(60, Math.max(0, Number(ipCount || 0) - 2) * 10);
      await (supabaseAdmin as any).from("signup_risk_events").insert({ event_type: "signup_attempt", ip_hash: ipHash, email_hash: emailHash, business_fingerprint: businessFingerprint, user_agent_hash: userAgentHash, risk_score: riskScore, details: { recent_ip_signups: ipCount || 0 } });
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
            business_phone: data.phone,
            phone: data.phone,
            business_address: data.address,
            business_zip: data.zip,
            business_fingerprint: businessFingerprint,
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
      if (signedUp.user?.id) {
        await (supabaseAdmin as any).from("signup_risk_events").update({ user_id: signedUp.user.id, event_type: "signup_created" }).eq("email_hash", emailHash).eq("business_fingerprint", businessFingerprint).eq("event_type", "signup_attempt");
      }
      return {
        ok: true,
        user_id: signedUp.user?.id,
        session: sessionShape(signedUp.session),
        verification_required: !signedUp.session,
      };
    } catch (error) {
      console.error("[merchant-signup] failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : "Unknown signup error",
      });
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
      const requestUrl = new URL(request.url);
      const requestOrigin = requestUrl.origin;
      const adminOrigin =
        requestUrl.protocol === "https:" &&
        (requestUrl.hostname === "admin.sezapos.com" || requestUrl.hostname.endsWith(".sezapos.com"))
          ? requestOrigin
          : safeDashboardOrigin(request);
      const resetOrigin = data.surface === "admin" ? adminOrigin : safeDashboardOrigin(request);
      await auth.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${resetOrigin}/reset-password?surface=${data.surface}`,
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
