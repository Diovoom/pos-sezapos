import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { publicReadRateLimit } from "@/lib/security/rate-limit";

/**
 * Dev-only helper: returns the most recent signup email log entry
 * for the given address, so the /signup screen can show delivery status
 * during local testing. Reads a limited safe projection via service role.
 */
export const getLatestSignupEmailStatus = createServerFn({ method: "POST" })
  .middleware([publicReadRateLimit])
  .inputValidator((input: { email: string }) => {
    if (!input || typeof input.email !== "string" || !input.email.includes("@")) {
      throw new Error("Invalid email");
    }
    return { email: input.email.toLowerCase().trim().slice(0, 320) };
  })
  .handler(async ({ data }) => {
    if (process.env.NODE_ENV === "production") return { status: "disabled" as const };
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return { status: "unknown", error: "server_not_configured" as const };
    const supabase = createClient(url, key);
    const { data: rows, error } = await supabase
      .from("email_send_log")
      .select("status,error_message,created_at,template_name")
      .eq("recipient_email", data.email)
      .eq("template_name", "signup")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return { status: "unknown", error: error.message };
    const row = rows?.[0];
    if (!row) return { status: "none" as const };
    return {
      status: row.status as string,
      error_message: (row.error_message as string | null) ?? null,
      created_at: row.created_at as string,
    };
  });
