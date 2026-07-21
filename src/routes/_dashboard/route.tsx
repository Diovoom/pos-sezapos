import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { AppShell } from "@/components/pos/AppShell";
import { useMe } from "@/hooks/useMe";
import { useSubscription } from "@/hooks/useSubscription";
import { hasAnyPlatformRole } from "@/lib/platform-roles";

// Browser management surface for store owners only.
// Employees use the paired Android POS app instead of the website.
export const Route = createFileRoute("/_dashboard")({
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

      if (!roles.includes("owner")) {
        await supabase.auth.signOut();
        throw redirect({ to: "/auth" });
      }
    } catch (routeError) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((routeError as any)?.isRedirect) throw routeError;
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }

    return { user: data.user };
  },
  component: DashboardLayout,
});

const READ_ONLY_BLOCKED = new Set([
  "/refunds",
  "/inventory",
  "/timeclock",
  "/payroll",
  "/products",
  "/customers",
  "/employees",
]);
const READ_ONLY_ALLOWED = new Set([
  "/dashboard",
  "/sales",
  "/reports",
  "/shifts",
  "/settings",
  "/setup",
  "/onboarding",
]);

function DashboardLayout() {
  const me = useMe();
  const { data: plan } = useSubscription();
  const location = useLocation();
  const navigate = useNavigate();
  const toastedRef = useRef(false);

  useEffect(() => {
    if (!me.data) return;
    const store = me.data.store as {
      setup_completed_at?: string | null;
    } | null;
    const needsSetup = store && !store.setup_completed_at;
    const onSetupOrOnboarding =
      location.pathname === "/setup" || location.pathname === "/onboarding";

    if (needsSetup && !onSetupOrOnboarding) {
      navigate({ to: "/setup", replace: true });
    }
  }, [me.data, location.pathname, navigate]);

  useEffect(() => {
    if (!plan?.isReadOnly) {
      toastedRef.current = false;
      return;
    }

    const path = location.pathname;
    const isBlocked =
      READ_ONLY_BLOCKED.has(path) ||
      [...READ_ONLY_BLOCKED].some((blockedPath) =>
        path.startsWith(`${blockedPath}/`),
      );
    const isAllowed =
      READ_ONLY_ALLOWED.has(path) ||
      [...READ_ONLY_ALLOWED].some((allowedPath) =>
        path.startsWith(`${allowedPath}/`),
      );

    if (isBlocked && !isAllowed) {
      if (!toastedRef.current) {
        toast.error("Read-only mode — subscribe to keep using this feature", {
          duration: 5000,
        });
        toastedRef.current = true;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({
        to: "/settings",
        search: { section: "billing" } as any,
        replace: true,
      });
    }
  }, [plan?.isReadOnly, location.pathname, navigate]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
