import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { AppShell } from "@/components/pos/AppShell";
import { useMe } from "@/hooks/useMe";
import { useSubscription } from "@/hooks/useSubscription";
import { hasAnyPlatformRole } from "@/lib/platform-roles";
import { getMerchantPlatformNotice } from "@/lib/platform-settings.functions";
import { AlertTriangle, Info } from "lucide-react";
import { installAutoSync } from "@/lib/offline/sync";
import { syncCompletedSubscriptionCheckout } from "@/lib/billing/checkout.functions";
import {
  clearOwnerLoginIntent,
  clearOwnerSessionIdentity,
  getOwnerLoginIntent,
  hasOwnerSessionIdentity,
  ownerSessionIdentityMatches,
  rememberOwnerSessionIdentity,
} from "@/lib/owner-session-lock";

// Browser management surface for store owners only.
// Employees use the paired Android POS app instead of the website.
export const Route = createFileRoute("/_dashboard")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const normalizedEmail = (data.user.email ?? "").trim().toLowerCase();
    const loginIntent = getOwnerLoginIntent();
    const intentMismatch = Boolean(loginIntent && normalizedEmail !== loginIntent);
    const lockedIdentityMismatch =
      hasOwnerSessionIdentity() && !ownerSessionIdentityMatches(data.user);

    // Never render an owner dashboard under an identity different from the
    // one that was just authenticated/locked on this browser. This turns a
    // stale Safari/Supabase session into a forced sign-out instead of showing
    // another merchant's store for even one render.
    if (intentMismatch || lockedIdentityMismatch) {
      await supabase.auth.signOut({ scope: "local" } as any).catch(() => undefined);
      clearOwnerSessionIdentity();
      clearOwnerLoginIntent();
      throw redirect({ to: "/auth" });
    }
    if (!hasOwnerSessionIdentity()) rememberOwnerSessionIdentity(data.user);
    clearOwnerLoginIntent();

    try {
      const [{ data: profile, error: profileError }, { data: roleRows, error: roleError }] =
        await Promise.all([
          (supabase as any)
            .from("profiles")
            .select("store_id")
            .eq("id", data.user.id)
            .maybeSingle(),
          (supabase as any)
            .from("user_roles")
            .select("role,store_id")
            .eq("user_id", data.user.id),
        ]);
      if (profileError) throw profileError;
      if (roleError) throw roleError;

      const roles = ((roleRows ?? []) as { role: string; store_id?: string | null }[]).map(
        (row) => row.role,
      );

      if (hasAnyPlatformRole(roles)) {
        throw redirect({ to: "/admin" as string as "/" });
      }

      const profileStoreId = profile?.store_id ?? null;
      const ownsProfileStore = Boolean(
        profileStoreId &&
          ((roleRows ?? []) as { role: string; store_id?: string | null }[]).some(
            (row) => row.role === "owner" && row.store_id === profileStoreId,
          ),
      );
      if (!ownsProfileStore) {
        await supabase.auth.signOut();
        clearOwnerSessionIdentity();
        throw redirect({ to: "/auth" });
      }
    } catch (routeError) {
      if ((routeError as any)?.isRedirect) throw routeError;
      await supabase.auth.signOut();
      clearOwnerSessionIdentity();
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
  useEffect(() => {
    // If the owner keeps the dashboard open through a network outage, queued
    // local-first catalog/employee mutations are pushed automatically as soon
    // as connectivity returns. No manual Publish/Sync button is required.
    installAutoSync();
  }, []);
  const { data: plan } = useSubscription();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toastedRef = useRef(false);
  const checkoutSyncRef = useRef<string | null>(null);
  const syncCheckout = useServerFn(syncCompletedSubscriptionCheckout);
  const loadPlatformNotice = useServerFn(getMerchantPlatformNotice);
  const platformNotice = useQuery({
    queryKey: ["merchant_platform_notice"],
    queryFn: () => loadPlatformNotice(),
    staleTime: 5_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;
    const sessionId = params.get("session_id");
    if (!sessionId || checkoutSyncRef.current === sessionId) return;

    checkoutSyncRef.current = sessionId;
    const toastId = toast.loading("Confirming your SEZA subscription…");
    let cancelled = false;

    void (async () => {
      try {
        const result = await syncCheckout({ data: { sessionId } });
        if (cancelled) return;
        if ("error" in result) throw new Error(result.error);

        await Promise.all([
          qc.invalidateQueries({ queryKey: ["subscription"] }),
          qc.invalidateQueries({ queryKey: ["billing-plan-usage"] }),
          qc.invalidateQueries({ queryKey: ["me"] }),
        ]);
        toast.success("Subscription activated", { id: toastId });
        navigate({
          to: "/settings",
          search: { section: "billing" } as any,
          replace: true,
        });
      } catch (error) {
        checkoutSyncRef.current = null;
        toast.error(
          error instanceof Error ? error.message : "Could not confirm the subscription",
          { id: toastId },
        );
        navigate({
          to: "/settings",
          search: { section: "billing" } as any,
          replace: true,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, qc, syncCheckout]);

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
      [...READ_ONLY_BLOCKED].some((blockedPath) => path.startsWith(`${blockedPath}/`));
    const isAllowed =
      READ_ONLY_ALLOWED.has(path) ||
      [...READ_ONLY_ALLOWED].some((allowedPath) => path.startsWith(`${allowedPath}/`));

    if (isBlocked && !isAllowed) {
      if (!toastedRef.current) {
        toast.error("Read-only mode  -  subscribe to keep using this feature", {
          duration: 5000,
        });
        toastedRef.current = true;
      }

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
            <div className="text-muted-foreground">
              {notice.maintenance_message || "Some platform services may be temporarily limited."}
            </div>
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
