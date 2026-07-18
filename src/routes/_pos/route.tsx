import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PosShell } from "@/components/pos/PosShell";
import { hasAnyPlatformRole } from "@/lib/platform-roles";

// POS register surface — cashiers, managers, admins, owners.
// Mandatory clock-in gate: any employee who is not an owner must have an
// open time_entries row before accessing POS features. Owners bypass.
// Platform staff (super_admin, operations_admin, etc.) are NEVER permitted
// here — they are redirected to /admin.
export const Route = createFileRoute("/_pos")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Load roles once — used for both platform-staff bounce and owner shortcut.
    let roles: string[] = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: roleRows } = await (supabase as any)
        .from("user_roles").select("role").eq("user_id", data.user.id);
      roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
    } catch {
      // Transient failure — proceed with empty roles; downstream checks handle it.
    }

    // Platform staff must never enter the POS.
    if (hasAnyPlatformRole(roles)) throw redirect({ to: "/admin" as string as "/" });

    // /timeclock must always be reachable so employees can clock in.
    if (location.pathname === "/timeclock") return { user: data.user };

    // Owners skip the clock-in requirement.
    if (roles.includes("owner")) return { user: data.user };

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: openEntry } = await (supabase as any)
        .from("time_entries")
        .select("id")
        .eq("user_id", data.user.id)
        .is("clock_out", null)
        .limit(1)
        .maybeSingle();
      if (!openEntry) throw redirect({ to: "/timeclock" });
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((err as any)?.isRedirect) throw err;
    }

    return { user: data.user };
  },
  component: PosLayout,
});

function PosLayout() {
  return (
    <PosShell>
      <Outlet />
    </PosShell>
  );
}
