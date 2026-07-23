import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { AppShell } from "@/components/pos/AppShell";
import { useMe } from "@/hooks/useMe";
import { useSubscription } from "@/hooks/useSubscription";
import { hasAnyPlatformRole } from "@/lib/platform-roles";
import { getMerchantPlatformNotice } from "@/lib/platform-settings.functions";
import { AlertTriangle, Info } from "lucide-react";

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
  const loadPlatformNotice = useServerFn(getMerchantPlatformNotice);
  const platformNotice = useQuery({
    queryKey: ["merchant_platform_notice"],
    queryFn: () => loadPlatformNotice(),
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

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

  const notice = platformNotice.data;

  return (
    <AppShell>
      {notice?.maintenance_mode && (
        <div className="mx-4 mt-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm md:mx-6">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <div className="font-medium">SEZA maintenance notice</div>
            <div className="text-muted-foreground">{notice.maintenance_message || "Some platform services may be temporarily limited."}</div>
          </div>
        </div>
      )}
      {notice?.merchant_banner && (
        <div className="mx-4 mt-4 flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm md:mx-6">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="whitespace-pre-wrap">{notice.merchant_banner}</div>
        </div>
      )}
      <Outlet />
    </AppShell>
  );
}
