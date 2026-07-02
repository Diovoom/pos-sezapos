import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/pos/AppShell";
import { useMe } from "@/hooks/useMe";
import { useSubscription } from "@/hooks/useSubscription";

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

// Routes that mutate business data — blocked in read-only mode
const READ_ONLY_BLOCKED = new Set([
  "/pos",
  "/register",
  "/refunds",
  "/inventory",
  "/timeclock",
  "/payroll",
  "/products",
  "/customers",
  "/employees",
]);

// Routes still viewable in read-only mode
const READ_ONLY_ALLOWED = new Set([
  "/dashboard",
  "/sales",
  "/reports",
  "/shifts",
  "/settings",
  "/setup",
  "/onboarding",
]);

function AuthedLayout() {
  const me = useMe();
  const { data: plan } = useSubscription();
  const location = useLocation();
  const navigate = useNavigate();
  const toastedRef = useRef(false);

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

  // Enforce read-only mode when trial + subscription have both lapsed
  useEffect(() => {
    if (!plan?.isReadOnly) {
      toastedRef.current = false;
      return;
    }
    const path = location.pathname;
    const isBlocked = READ_ONLY_BLOCKED.has(path) || [...READ_ONLY_BLOCKED].some((p) => path.startsWith(p + "/"));
    const isAllowed = READ_ONLY_ALLOWED.has(path) || [...READ_ONLY_ALLOWED].some((p) => path.startsWith(p + "/"));
    if (isBlocked && !isAllowed) {
      if (!toastedRef.current) {
        toast.error("Read-only mode — subscribe to keep using this feature", { duration: 5000 });
        toastedRef.current = true;
      }
      navigate({ to: "/settings", search: { section: "billing" } as any, replace: true });
    }
  }, [plan?.isReadOnly, location.pathname, navigate]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
