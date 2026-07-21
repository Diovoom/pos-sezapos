import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { hasAnyPlatformRole } from "@/lib/platform-roles";

// The browser website is the owner dashboard only.
// The Android Capacitor shell imports the POS screens directly and does not use
// this web route, so blocking /pos here does not affect the Android register.
export const Route = createFileRoute("/_pos")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: roleRows, error: roleError } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      if (roleError) throw roleError;

      const roles = ((roleRows ?? []) as { role: string }[]).map(
        (row) => row.role,
      );

      if (hasAnyPlatformRole(roles)) {
        throw redirect({ to: "/admin" as string as "/" });
      }

      if (roles.includes("owner")) {
        throw redirect({ to: "/dashboard" });
      }

      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any)?.isRedirect) throw error;
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
  },
  component: () => null,
});
