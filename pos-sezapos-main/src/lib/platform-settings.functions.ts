import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Safe merchant-facing subset of the private global platform configuration.
// Secrets and internal addresses are intentionally never returned.
export const getMerchantPlatformNotice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin.from as any)("platform_settings")
      .select(
        "company_name,support_email,live_chat_enabled,maintenance_mode,maintenance_message,merchant_banner,updated_at",
      )
      .eq("id", "global")
      .maybeSingle();
    if (error) throw new Error(error.message);
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
