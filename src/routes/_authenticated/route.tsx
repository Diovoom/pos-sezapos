import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/pos/AppShell";
import { useMe } from "@/hooks/useMe";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!me.data) return;
    const isOwner = me.data.roles.includes("owner");
    const store = me.data.store as { setup_completed_at?: string | null } | null;
    const needsSetup = isOwner && store && !store.setup_completed_at;
    const onSetupOrOnboarding = location.pathname === "/setup" || location.pathname === "/onboarding";
    if (needsSetup && !onSetupOrOnboarding) {
      navigate({ to: "/setup", replace: true });
    }
  }, [me.data, location.pathname, navigate]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
