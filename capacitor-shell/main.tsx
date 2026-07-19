import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { SplashScreen as SplashScreenUi } from "./screens/SplashScreen";
import { createShellRouter } from "./router";
import { supabase } from "./supabase";
import "@/i18n";
import "@/styles.css";

function ShellApp() {
  const [ready, setReady] = useState(false);
  const queryClient = useMemo(() => new QueryClient(), []);
  const router = useMemo(() => createShellRouter(queryClient), [queryClient]);

  useEffect(() => {
    let alive = true;
    // Warm the session cache so beforeLoad guards are decisive on first render.
    supabase.auth.getSession().finally(() => {
      if (alive) setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event === "SIGNED_OUT") {
          queryClient.clear();
          router.navigate({ to: "/auth", replace: true });
        } else if (event === "SIGNED_IN") {
          router.navigate({ to: "/pos", replace: true });
        }
      }
    });

    // Hide the Android native splash once React has taken over.
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cap = (window as any).Capacitor;
        if (cap?.Plugins?.SplashScreen?.hide) {
          await cap.Plugins.SplashScreen.hide({ fadeOutDuration: 300 });
        }
      } catch {
        /* noop */
      }
    })();

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [router, queryClient]);

  if (!ready) return <SplashScreenUi />;

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  );
}

const root = document.getElementById("root")!;
createRoot(root).render(
  <StrictMode>
    <ShellApp />
  </StrictMode>,
);
