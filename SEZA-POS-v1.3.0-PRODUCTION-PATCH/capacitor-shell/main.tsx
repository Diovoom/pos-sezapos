import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { SplashScreen as SplashScreenUi } from "./screens/SplashScreen";
import { BrandedBootScreen } from "./screens/BrandedBootScreen";
import { createShellRouter } from "./router";
import { supabase } from "./supabase";
import { ExitConfirmToast, initAndroidLifecycle } from "./lifecycle";
import "@/i18n";
import "@/styles.css";
import { startDeviceHeartbeat } from "./lib/deviceHeartbeat";
import { SupportRequestListener } from "./support/SupportRequestListener";
import { initializePairing } from "./lib/pairing";

function ShellApp() {
  const [sessionReady, setSessionReady] = useState(false);
  const [booted, setBooted] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const queryClient = useMemo(() => new QueryClient({
    defaultOptions: {
      mutations: { networkMode: "always" },
      queries: { networkMode: "offlineFirst" },
    },
  }), []);
  const router = useMemo(() => createShellRouter(queryClient), [queryClient]);

  useEffect(() => {
    let alive = true;
    void initAndroidLifecycle(router, queryClient);
    const stopHeartbeat = startDeviceHeartbeat();
    // Warm the session cache so beforeLoad guards are decisive on first render.
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setHasSession(!!data.session);
      setSessionReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event === "SIGNED_OUT") {
          queryClient.clear();
          setHasSession(false);
          setBooted(false);
          router.navigate({ to: "/auth", replace: true });
        } else if (event === "SIGNED_IN") {
          setHasSession(true);
          setBooted(false);
        }
      }
    });

    // Hide the Android native splash + kick off OTA update check.
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cap = (window as any).Capacitor;
        if (cap?.Plugins?.SplashScreen?.hide) {
          await cap.Plugins.SplashScreen.hide({ fadeOutDuration: 300 });
        }
      } catch { /* noop */ }
      // Capgo OTA — background check on cold boot. Free tier, no key required.
      try {
        const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
        await CapacitorUpdater.notifyAppReady();
        // Latest published bundle is applied on next restart automatically.
      } catch { /* not running on native */ }
    })();

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      stopHeartbeat();
    };
  }, [router, queryClient]);

  if (!sessionReady) return <SplashScreenUi />;

  // Signed-in users see the branded boot screen (with live status) before POS
  // mounts. Signed-out users go straight to the PIN screen.
  if (hasSession && !booted) {
    return (
      <BrandedBootScreen
        onReady={() => {
          setBooted(true);
          router.navigate({ to: "/pos", replace: true });
        }}
      />
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <SupportRequestListener />
      <Toaster />
      <ExitConfirmToast />
    </QueryClientProvider>
  );
}

async function bootstrap() {
  await initializePairing();
  const root = document.getElementById("root")!;
  createRoot(root).render(
    <StrictMode>
      <ShellApp />
    </StrictMode>,
  );
}

void bootstrap();
