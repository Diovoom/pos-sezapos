import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { SplashScreen as SplashScreenUi } from "./screens/SplashScreen";
import { BootFailureScreen } from "./screens/BootFailureScreen";
import { createShellRouter } from "./router";
import { assertNativeSupabaseConfiguration, supabase } from "./supabase";
import { ExitConfirmToast, initAndroidLifecycle } from "./lifecycle";
import "@/i18n";
import "@/styles.css";
import { startDeviceHeartbeat } from "./lib/deviceHeartbeat";
import { SupportRequestListener } from "./support/SupportRequestListener";
import { initializePairing } from "./lib/pairing";
import { readMeta } from "@/lib/offline/db";

const STARTUP_TIMEOUT_MS = 8_000;

async function hasCachedRegisterIdentity(): Promise<boolean> {
  const userId = await readMeta<string>("authenticated_me_current_user").catch(() => undefined);
  if (!userId) return false;
  const me = await readMeta<any>(`authenticated_me:${userId}`).catch(() => undefined);
  return !!(me?.profile && me?.store);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function hideNativeSplash(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const capacitor = (window as any).Capacitor;
    if (capacitor?.Plugins?.SplashScreen?.hide) {
      await capacitor.Plugins.SplashScreen.hide({ fadeOutDuration: 300 });
    }
  } catch {}
}

function ShellApp() {
  const [ready, setReady] = useState(false);

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: { networkMode: "always", retry: 0 },
          queries: {
            networkMode: "offlineFirst",
            staleTime: 5 * 60_000,
            gcTime: 24 * 60 * 60_000,
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
    let stopHeartbeat = () => {};

    void (async () => {
      try {
        await initAndroidLifecycle(router, queryClient);
        stopHeartbeat = startDeviceHeartbeat();
      } catch (error) {
        console.warn("[SEZA POS] Android lifecycle startup deferred", error);
      } finally {
        if (alive) setReady(true);
        await hideNativeSplash();
      }
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;

      void router.invalidate();

      if (event === "SIGNED_OUT") {
        void hasCachedRegisterIdentity().then((hasLocalIdentity) => {
          if (hasLocalIdentity) return;
          queryClient.clear();
          void router.navigate({ to: "/auth", replace: true });
        });
        return;
      }

      if (event === "SIGNED_IN") {
        void import("@/lib/offline/sync").then(({ syncNow }) =>
          syncNow().catch(() => undefined),
        );
      }
    });

    const onBootstrapUpdated = () => {
      void queryClient.invalidateQueries();
      void router.invalidate();
    };
    const onDeviceRevoked = () => {
      queryClient.clear();
      void import("./lib/pairing").then(({ clearPairing }) => clearPairing());
      void router.navigate({ to: "/pair", replace: true });
    };
    window.addEventListener("seza:bootstrap-updated", onBootstrapUpdated);
    window.addEventListener("seza:device-revoked", onDeviceRevoked);

    void (async () => {
      try {
        const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
        await CapacitorUpdater.notifyAppReady();
      } catch {}
    })();

    return () => {
      alive = false;
      subscription.subscription.unsubscribe();
      stopHeartbeat();
      window.removeEventListener("seza:bootstrap-updated", onBootstrapUpdated);
      window.removeEventListener("seza:device-revoked", onDeviceRevoked);
    };
  }, [router, queryClient]);

  if (!ready) return <SplashScreenUi />;

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
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("Android shell root element is missing.");

  try {
    assertNativeSupabaseConfiguration();
    try {
      await withTimeout(initializePairing(), STARTUP_TIMEOUT_MS, "Device pairing initialization");
    } catch (error) {
      console.warn("[SEZA POS] pairing storage initialization deferred", error);
    }
    createRoot(rootElement).render(
      <StrictMode>
        <ShellApp />
      </StrictMode>,
    );
  } catch (error) {
    await hideNativeSplash();
    createRoot(rootElement).render(<BootFailureScreen error={error} />);
  }
}

void bootstrap();
