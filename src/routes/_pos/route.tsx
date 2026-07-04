import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PosShell } from "@/components/pos/PosShell";

// POS register surface — cashiers, managers, admins, owners.
// Session (via PIN or email login) is required; cashiers reach here after PIN sign-in.
export const Route = createFileRoute("/_pos")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
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
