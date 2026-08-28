import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { SplashScreen as SplashScreenUi } from "./screens/SplashScreen";
import { BrandedBootScreen } from "./screens/BrandedBootScreen";
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
  } catch {
    // The HTML fallback remains visible if the native plugin is unavailable.
  }
}

function ShellApp() {
  const [sessionReady, setSessionReady] = useState(false);
  const [booted, setBooted] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [runtimeError, setRuntimeError] = useState<unknown>(null);

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

  const finishBoot = useCallback(() => {
    setBooted(true);
    void router.navigate({ to: "/pos", replace: true });
  }, [router]);

  useEffect(() => {
    let alive = true;
    let stopHeartbeat = () => {};

    const start = async () => {
      try {
        await initAndroidLifecycle(router, queryClient);
        stopHeartbeat = startDeviceHeartbeat();

        const { data } = await withTimeout(
          supabase.auth.getSession(),
          STARTUP_TIMEOUT_MS,
          "Session verification",
        );
        if (!alive) return;
        setHasSession(Boolean(data.session));
        setSessionReady(true);
      } catch (error) {
        if (!alive) return;
        // Cloud/session verification is never a boot-critical dependency for a
        // provisioned register. Continue into the local router and let cached
        // device/employee state decide whether /pos or /auth should open.
        console.warn("[SEZA POS] cloud session unavailable during boot; continuing local-first", error);
        setHasSession(false);
        setSessionReady(true);
      } finally {
        await hideNativeSplash();
      }
    };

    void start();

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;

      // A register is shared by multiple employees. Never preserve React Query
      // data from the previous auth identity across PIN switches. That was the
      // reason a cashier could still see the owner's role/store/cart state.
      queryClient.clear();
      void router.invalidate();

      if (event === "SIGNED_OUT") {
        setHasSession(false);
        // Cloud Auth is secondary on a paired register. If a device-local PIN
        // identity still exists, a token refresh/sign-out event must not kick
        // the cashier back to the PIN screen. Explicit Switch/Sign out clears
        // this local identity BEFORE calling Supabase signOut.
        void readMeta<string>("authenticated_me_current_user").then((cachedUser) => {
          if (cachedUser) {
            setBooted(true);
            void router.invalidate();
            return;
          }
          setBooted(false);
          void router.navigate({ to: "/auth", replace: true });
        });
      } else if (event === "SIGNED_IN") {
        setHasSession(true);
        void readMeta<string>("authenticated_me_current_user").then((cachedUser) => {
          // Background cloud-session establishment after a local PIN login
          // should be invisible to the cashier, not replay the boot screen.
          setBooted(Boolean(cachedUser));
        });
        void import("@/lib/offline/sync").then(({ syncNow }) =>
          syncNow().catch((error) => console.warn("[SEZA POS] signed-in sync deferred", error)),
        );
      } else {
        // Password/PIN/profile updates must also refresh the active identity.
        void router.invalidate();
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
      } catch {
        // Not running natively, or updater is unavailable. Startup continues.
      }
    })();

    return () => {
      alive = false;
      subscription.subscription.unsubscribe();
      stopHeartbeat();
      window.removeEventListener("seza:bootstrap-updated", onBootstrapUpdated);
      window.removeEventListener("seza:device-revoked", onDeviceRevoked);
    };
  }, [router, queryClient]);

  if (runtimeError) return <BootFailureScreen error={runtimeError} />;
  if (!sessionReady) return <SplashScreenUi />;

  if (hasSession && !booted) {
    return <BrandedBootScreen onReady={finishBoot} />;
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
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("Android shell root element is missing.");

  try {
    assertNativeSupabaseConfiguration();
    try {
      await withTimeout(initializePairing(), STARTUP_TIMEOUT_MS, "Device pairing initialization");
    } catch (error) {
      // Secure-storage recovery should never turn the entire register into a
      // fatal boot screen. Continue to the router; an uninitialized device can
      // re-enter pairing while the local store recovers.
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
