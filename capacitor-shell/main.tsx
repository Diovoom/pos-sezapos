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
      // Paint the register immediately. Hardware lifecycle and cloud session
      // refresh happen in parallel and must never freeze first launch.
      void initAndroidLifecycle(router, queryClient).catch(() => {});
      stopHeartbeat = startDeviceHeartbeat();
      try {
        const sessionResult = await Promise.race([
          supabase.auth.getSession().then(({ data }) => ({ session: data.session, timedOut: false })),
          new Promise<{ session: null; timedOut: true }>((resolve) =>
            window.setTimeout(() => resolve({ session: null, timedOut: true }), 800),
          ),
        ]);
        if (!alive) return;
        if (sessionResult.session) {
          setHasSession(true);
        } else if (sessionResult.timedOut) {
          const cachedUser = await readMeta<string>("authenticated_me_current_user").catch(() => undefined);
          setHasSession(Boolean(cachedUser));
        } else {
          setHasSession(false);
        }
        setSessionReady(true);
      } catch {
        if (!alive) return;
        const cachedUser = await readMeta<string>("authenticated_me_current_user").catch(() => undefined);
        setHasSession(Boolean(cachedUser));
        setSessionReady(true);
      } finally {
        await hideNativeSplash();
      }
    };

    void start();

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;

      // A shared register may switch from owner -> cashier (or the reverse).
      // Never let React Query retain permissions, identity, shift, or POS data
      // from the employee who was previously signed in.
      queryClient.clear();
      void router.invalidate();
      if (event === "SIGNED_OUT") {
        setHasSession(false);
        setBooted(false);
        void router.navigate({ to: "/auth", replace: true });
      } else {
        setHasSession(true);
        setBooted(false);
      }
    });

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
    // Pairing restoration is background work. The app shell must paint even
    // when the network or Android USB stack is slow.
    void initializePairing().catch(() => {});
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
