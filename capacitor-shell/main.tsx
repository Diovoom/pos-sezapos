import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { SplashScreen as SplashScreenUi } from "./screens/SplashScreen";
import { BrandedBootScreen } from "./screens/BrandedBootScreen";
import { AppLoadBoundary } from "./screens/AppLoadBoundary";
import { createShellRouter } from "./router";
import { supabase } from "./supabase";
import { ExitConfirmToast, initAndroidLifecycle } from "./lifecycle";
import "@/i18n";
import "@/styles.css";
import { startDeviceHeartbeat } from "./lib/deviceHeartbeat";
import { SupportRequestListener } from "./support/SupportRequestListener";
import { initializePairing } from "./lib/pairing";

const SESSION_BOOT_TIMEOUT_MS = 4_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms)),
  ]);
}

function ShellApp() {
  const [sessionReady, setSessionReady] = useState(false);
  const [booted, setBooted] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: { networkMode: "always" },
          queries: {
            networkMode: "offlineFirst",
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
    [],
  );
  const router = useMemo(() => createShellRouter(queryClient), [queryClient]);

  useEffect(() => {
    let alive = true;
    void initAndroidLifecycle(router, queryClient);
    const stopHeartbeat = startDeviceHeartbeat();

    // Render immediately and give auth a short deadline. A slow/offline
    // Supabase request must never leave the WebView blank forever.
    void withTimeout(supabase.auth.getSession(), SESSION_BOOT_TIMEOUT_MS)
      .then((result) => {
        if (!alive) return;
        setHasSession(Boolean(result?.data.session));
      })
      .catch((error) => {
        console.warn("[SEZA Android] session restore failed", error);
        if (alive) setHasSession(false);
      })
      .finally(() => {
        if (alive) setSessionReady(true);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event === "SIGNED_OUT") {
          queryClient.clear();
          setHasSession(false);
          setBooted(false);
          void router.navigate({ to: "/auth", replace: true });
        } else if (event === "SIGNED_IN") {
          setHasSession(true);
          setBooted(false);
        }
      }
    });

    void (async () => {
      try {
        const cap = (window as typeof window & {
          Capacitor?: { Plugins?: { SplashScreen?: { hide?: (options: unknown) => Promise<void> } } };
        }).Capacitor;
        await cap?.Plugins?.SplashScreen?.hide?.({ fadeOutDuration: 300 });
      } catch {
        // The React loading screen is already visible.
      }
      try {
        const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
        await CapacitorUpdater.notifyAppReady();
      } catch {
        // Browser preview or updater unavailable.
      }
    })();

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      stopHeartbeat();
    };
  }, [router, queryClient]);

  if (!sessionReady) return <SplashScreenUi />;

  if (hasSession && !booted) {
    return (
      <BrandedBootScreen
        onReady={() => {
          setBooted(true);
          void router.navigate({ to: "/pos", replace: true });
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

function renderApp() {
  const root = document.getElementById("root");
  if (!root) throw new Error("Android app root element is missing.");

  createRoot(root).render(
    <StrictMode>
      <AppLoadBoundary>
        <ShellApp />
      </AppLoadBoundary>
    </StrictMode>,
  );
}

// Pairing restoration is useful, but it is not allowed to block first paint.
renderApp();
void initializePairing().catch((error) => {
  console.warn("[SEZA Android] pairing restore failed", error);
});
