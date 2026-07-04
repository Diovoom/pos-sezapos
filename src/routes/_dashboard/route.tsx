import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { hydrateSessionFromCookie } from "@/integrations/supabase/session-bridge";

import { AppShell } from "@/components/pos/AppShell";
import { useMe } from "@/hooks/useMe";
import { useSubscription } from "@/hooks/useSubscription";
import { currentApp, dashboardUrl, posUrl } from "@/lib/host";

// Owner / manager surface. Cashiers get pushed to /pos.
export const Route = createFileRoute("/_dashboard")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  beforeLoad: async () => {
    // Wrong subdomain? Send visitors to the right one.
    if (typeof window !== "undefined") {
      const app = currentApp();
      if (app === "pos") {
        throw redirect({ to: "/pos" });
      }
      if (app === "marketing") {
        window.location.replace(dashboardUrl("/dashboard"));
        throw redirect({ to: "/" });
      }
    }
    // Wait for the shared-cookie session to hydrate before checking auth.
    await hydrateSessionFromCookie();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };

  },
  component: DashboardLayout,
});

const READ_ONLY_BLOCKED = new Set([
  "/refunds", "/inventory", "/timeclock", "/payroll",
  "/products", "/customers", "/employees",
]);
const READ_ONLY_ALLOWED = new Set([
  "/dashboard", "/sales", "/reports", "/shifts",
  "/settings", "/setup", "/onboarding",
]);

const DASHBOARD_ROLES = new Set(["owner", "admin", "manager"]);

function DashboardLayout() {
  const me = useMe();
  const { data: plan } = useSubscription();
  const location = useLocation();
  const navigate = useNavigate();
  const toastedRef = useRef(false);
  const bouncedRef = useRef(false);

  // Cashiers don't get dashboard access — send them to POS (cross-subdomain aware).
  useEffect(() => {
    if (!me.data || bouncedRef.current) return;
    const roles = me.data.roles ?? [];
    const canDashboard = roles.some((r) => DASHBOARD_ROLES.has(r));
    if (!canDashboard) {
      bouncedRef.current = true;
      toast.info("Cashiers use the POS register");
      const target = posUrl("/pos");
      if (target.startsWith("http")) window.location.replace(target);
      else navigate({ to: "/pos", replace: true });
    }
  }, [me.data, navigate]);

  // First-run setup for owners.
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

  // Read-only mode enforcement.
  useEffect(() => {
    if (!plan?.isReadOnly) { toastedRef.current = false; return; }
    const path = location.pathname;
    const isBlocked = READ_ONLY_BLOCKED.has(path) || [...READ_ONLY_BLOCKED].some((p) => path.startsWith(p + "/"));
    const isAllowed = READ_ONLY_ALLOWED.has(path) || [...READ_ONLY_ALLOWED].some((p) => path.startsWith(p + "/"));
    if (isBlocked && !isAllowed) {
      if (!toastedRef.current) {
        toast.error("Read-only mode — subscribe to keep using this feature", { duration: 5000 });
        toastedRef.current = true;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({ to: "/settings", search: { section: "billing" } as any, replace: true });
    }
  }, [plan?.isReadOnly, location.pathname, navigate]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
