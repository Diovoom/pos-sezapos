import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { AuthScreen } from "./screens/AuthScreen";
import { PosPlaceholder } from "./screens/PosPlaceholder";
import { SplashScreen as SplashScreenUi } from "./screens/SplashScreen";

export function App() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;

    // Load whatever session is cached in localStorage; this resolves in a
    // couple of ms and there is no network round-trip needed to render.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
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
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!ready) return <SplashScreenUi />;
  if (!session) return <AuthScreen />;
  return <PosPlaceholder session={session} />;
}
