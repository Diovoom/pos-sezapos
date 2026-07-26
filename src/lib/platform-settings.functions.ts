import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function isMissingPlatformSettings(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes("platform_settings") ||
    message.includes("schema cache")
  );
}

// Safe merchant-facing subset of the private global platform configuration.
// If the optional platform_settings table has not been deployed yet, the
// latest audited settings snapshot is used so maintenance mode still works.
export const getMerchantPlatformNotice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await (supabaseAdmin.from as any)("platform_settings")
      .select(
        "company_name,support_email,live_chat_enabled,maintenance_mode,maintenance_message,merchant_banner,updated_at",
      )
      .eq("id", "global")
      .maybeSingle();

    if (result.error && !isMissingPlatformSettings(result.error)) {
      throw new Error(result.error.message);
    }

    let data = result.data as any;
    if (!data) {
      const fallback = await supabaseAdmin
        .from("audit_log")
        .select("details,created_at")
        .eq("action", "admin.platform_settings.update")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      data = fallback.data?.details
        ? {
            ...(fallback.data.details as Record<string, unknown>),
            updated_at: fallback.data.created_at,
          }
        : null;
    }

    return {
      company_name: data?.company_name ?? "SEZA POS",
      support_email: data?.support_email ?? "support@sezapos.com",
      live_chat_enabled: data?.live_chat_enabled ?? true,
      maintenance_mode: data?.maintenance_mode ?? false,
      maintenance_message: data?.maintenance_message ?? null,
      merchant_banner: data?.merchant_banner ?? null,
      updated_at: data?.updated_at ?? null,
    };
  });
