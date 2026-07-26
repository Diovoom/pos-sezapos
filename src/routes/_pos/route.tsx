import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PosShell } from "@/components/pos/PosShell";
import { hasAnyPlatformRole } from "@/lib/platform-roles";

// Temporary browser POS for hardware testing. Keep this route isolated from
// the public marketing bundle; remove the dashboard navigation item when the
// Android rollout is complete.
export const Route = createFileRoute("/_pos")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    try {
      const { data: roleRows, error: roleError } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      if (roleError) throw roleError;

      const roles = ((roleRows ?? []) as { role: string }[]).map((row) => row.role);
      if (hasAnyPlatformRole(roles)) {
        throw redirect({ to: "/admin" as string as "/" });
      }

      const merchantRoles = ["owner", "manager", "cashier", "employee"];
      if (!roles.some((role) => merchantRoles.includes(role))) {
        throw redirect({ to: "/auth" });
      }
    } catch (routeError) {
      if ((routeError as any)?.isRedirect) throw routeError;
      throw redirect({ to: "/auth" });
    }
  },
  component: () => (
    <PosShell>
      <Outlet />
    </PosShell>
  ),
});
