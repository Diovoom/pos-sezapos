// Rate-limit + audit for /admin/auth sign-in attempts.
// This module is client-reachable  -  the admin client (browser) calls
// recordAdminLoginAttempt after each sign-in. All writes go through the
// service-role admin client, loaded lazily inside the handler.

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;

const InputSchema = z.object({
  email: z.string().email().max(320),
  success: z.boolean(),
});

export type LoginAttemptResult = {
  rate_limited: boolean;
  remaining_seconds: number;
};

/**
 * Called BEFORE attempting sign-in (with success=false as a probe) to check
 * whether the caller is currently rate-limited, and AFTER sign-in to record
 * the outcome. The endpoint is intentionally callable without an auth token.
 */
export const recordAdminLoginAttempt = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<LoginAttemptResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const req = getRequest();
    const ip =
      req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req?.headers.get("cf-connecting-ip") ??
      null;
    const ua = req?.headers.get("user-agent") ?? null;
    const emailNorm = data.email.trim().toLowerCase();
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

    // Record the attempt. We ignore insert errors  -  never block the user's
    // sign-in on audit-write failure.
    await supabaseAdmin
      .from("admin_login_attempts")
      .insert({ email: emailNorm, success: data.success, ip, user_agent: ua });

    // Count recent failures.
    const { data: rows } = await supabaseAdmin
      .from("admin_login_attempts")
      .select("attempted_at")
      .eq("success", false)
      .gte("attempted_at", windowStart)
      .ilike("email", emailNorm);

    const failures = rows?.length ?? 0;
    if (failures >= MAX_FAILURES) {
      const oldest = rows!
        .map((r) => new Date(r.attempted_at as string).getTime())
        .sort((a, b) => a - b)[0];
      const unlockAt = oldest + WINDOW_MINUTES * 60_000;
      const remaining = Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000));
      return { rate_limited: true, remaining_seconds: remaining };
    }
    return { rate_limited: false, remaining_seconds: 0 };
  });
