import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { installSessionBridge } from "@/integrations/supabase/session-bridge";
import { initializeAppUpdateWorkflow } from "@/lib/app-update";
import {
  clearOwnerQueryCache,
  persistOwnerQueryCache,
  restoreOwnerQueryCache,
} from "@/lib/owner-query-cache";
import { clearOwnerLoginIntent, clearOwnerSessionIdentity } from "@/lib/owner-session-lock";
import { detectAndPersistNative, isPathAllowedInNative } from "@/lib/native";
import { currentApp, dashboardUrl, marketingUrl } from "@/lib/host";
import { applyLanguage } from "@/i18n";
import { GlobalLanguageRuntime } from "@/components/i18n/GlobalLanguageRuntime";
import { NativeLoadingOverlay } from "@/components/NativeLoadingOverlay";
import { NativeRuntime } from "@/components/NativeRuntime";
import { NativeConnectionBanner } from "@/components/NativeConnectionBanner";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { AppUpdateNotice } from "@/components/AppUpdateNotice";
import { Toaster } from "@/components/ui/sonner";

/**
 * Runtime used only by authenticated/admin/POS/native surfaces.
 *
 * Keeping this module behind a dynamic import is intentional: the public
 * marketing site must not download Supabase auth, Android/native runtime,
 * update workflow, payment-preview UI, or owner cache code on first paint.
 */
export function OperationalRuntime({
  queryClient,
  router,
}: {
  queryClient: QueryClient;
  router: any;
}) {
  const ownerSessionUserRef = useRef<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("i18nextLng");
    if (saved) applyLanguage(saved);
    installSessionBridge();
    void initializeAppUpdateWorkflow();
  }, []);

  useEffect(() => {
    const app = currentApp();
    const ownerPath = [
      "/dashboard",
      "/sales",
      "/products",
      "/inventory",
      "/customers",
      "/employees",
      "/reports",
      "/shifts",
      "/settings",
      "/help",
      "/profile",
    ].some(
      (prefix) =>
        window.location.pathname === prefix ||
        window.location.pathname.startsWith(`${prefix}/`),
    );

    if (app !== "dashboard" && !(app === "unknown" && ownerPath)) return;

    let stopPersistence: (() => void) | undefined;

    const attachOwnerCache = (userId: string) => {
      stopPersistence?.();
      restoreOwnerQueryCache(queryClient, userId);
      stopPersistence = persistOwnerQueryCache(queryClient, userId);
      ownerSessionUserRef.current = userId;
    };

    void supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user.id;
      if (!userId) return;
      attachOwnerCache(userId);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;

      const nextUserId = session?.user.id ?? null;
      const previousUserId = ownerSessionUserRef.current;

      if (event === "SIGNED_OUT") {
        stopPersistence?.();
        stopPersistence = undefined;
        ownerSessionUserRef.current = null;
        queryClient.clear();
        clearOwnerQueryCache();
        clearOwnerSessionIdentity();
        clearOwnerLoginIntent();
        router.invalidate();
        return;
      }

      // Switching owners on the same browser must start from an empty in-memory
      // query cache. Otherwise queries such as ["me"] can briefly retain the
      // previous merchant and then be persisted under the new user's cache.
      if (nextUserId && previousUserId !== nextUserId) {
        stopPersistence?.();
        stopPersistence = undefined;
        queryClient.clear();
        if (previousUserId) clearOwnerQueryCache(previousUserId);
        attachOwnerCache(nextUserId);
      } else if (nextUserId && !stopPersistence) {
        attachOwnerCache(nextUserId);
      }

      router.invalidate();
      queryClient.invalidateQueries();
    });

    return () => {
      stopPersistence?.();
      sub.subscription.unsubscribe();
    };
  }, [queryClient, router]);


  useEffect(() => {
    const app = currentApp();
    if (app === "unknown" || app === "marketing") return;

    const path = window.location.pathname;
    const suffix = `${path}${window.location.search}${window.location.hash}`;

    const dashboardPrefixes = [
      "/auth",
      "/signup",
      "/select-plan",
      "/reset-password",
      "/dashboard",
      "/sales",
      "/products",
      "/inventory",
      "/customers",
      "/employees",
      "/payroll",
      "/shifts",
      "/reports",
      "/devices",
      "/settings",
      "/help",
      "/setup",
      "/onboarding",
      "/customer-display",
    ];

    const isDashboardPath = dashboardPrefixes.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );

    if (app === "admin") {
      if (path === "/" || (!path.startsWith("/admin") && !path.startsWith("/reset-password"))) {
        window.location.replace("/admin");
      }
      return;
    }

    if (app === "pos") {
      const posPrefixes = [
        "/auth",
        "/pos",
        "/register",
        "/refunds",
        "/timeclock",
        "/inventory",
        "/customers",
        "/products",
        "/shifts",
        "/settings",
        "/payment-terminal",
        "/manager-tools",
        "/help",
        "/support",
        "/pending-sync",
        "/customer-display",
      ];
      if (path === "/") {
        window.location.replace("/auth");
        return;
      }
      const allowed = posPrefixes.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
      );
      if (!allowed) window.location.replace("/auth");
      return;
    }

    if (app === "dashboard") {
      if (path === "/") {
        void supabase.auth.getSession().then(({ data }) => {
          window.location.replace(data.session ? "/dashboard" : "/auth");
        });
        return;
      }
      if (!isDashboardPath) window.location.replace(marketingUrl(suffix));
      return;
    }

    // Defensive fallback for future non-marketing hosts.
    if (isDashboardPath) window.location.replace(dashboardUrl(suffix));
  }, []);

  useEffect(() => {
    const native = detectAndPersistNative();
    if (!native) return;

    document.documentElement.classList.add("native-app");
    const enforce = () => {
      const path = window.location.pathname;
      if (!isPathAllowedInNative(path)) {
        router.navigate({ to: "/auth", replace: true });
      }
    };

    enforce();
    const unsub = router.subscribe("onResolved", enforce);
    return () => unsub();
  }, [router]);

  return (
    <>
      <GlobalLanguageRuntime />
      <NativeRuntime queryClient={queryClient} />
      <NativeConnectionBanner />
      <PaymentTestModeBanner />
      <AppUpdateNotice />
      <Toaster richColors position="top-right" />
      <NativeLoadingOverlay />
    </>
  );
}
