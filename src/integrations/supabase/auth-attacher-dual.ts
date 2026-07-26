// Dual-client bearer attacher. Server functions may be invoked from either
// the merchant surface (default supabase client) or the admin surface
// (isolated supabaseAdminAuth client). Attach whichever session applies:
// on /admin/* paths prefer the admin session, otherwise prefer merchant.
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";
import { supabaseAdminAuth } from "./admin-client";

export const attachDualAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const onAdmin =
    typeof window !== "undefined" &&
    (window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/"));

  const primary = onAdmin ? supabaseAdminAuth : supabase;
  const fallback = onAdmin ? supabase : supabaseAdminAuth;

  const { data: primaryData } = await primary.auth.getSession();
  let token = primaryData.session?.access_token;
  if (!token) {
    const { data: fallbackData } = await fallback.auth.getSession();
    token = fallbackData.session?.access_token;
  }
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
