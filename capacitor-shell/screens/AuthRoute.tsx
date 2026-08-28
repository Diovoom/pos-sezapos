// Route wrapper around the existing shell AuthScreen so it participates in
// the TanStack Router lifecycle. On successful sign-in the router navigates
// to /pos; the existing supabase.auth.onAuthStateChange listener installed
// in main.tsx invalidates the router so beforeLoad re-runs.
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "../supabase";
import { getPairing } from "../lib/pairing";
import { AuthScreen } from "./AuthScreen";
import { readMeta } from "@/lib/offline/db";

export function AuthRoute() {
  const navigate = useNavigate();
  const pairing = getPairing();

  useEffect(() => {
    // A production register must be paired before an employee can sign in.
    // Do not fall back to the legacy global Employee ID + PIN flow: it is
    // both confusing for cashiers and bypasses the store-scoped PIN design.
    if (!pairing) {
      navigate({ to: "/pair", replace: true });
      return;
    }

    // Switch-user explicitly requests the PIN screen even if an Android ROM
    // briefly exposes the previous Supabase session during teardown.
    const forcePin = localStorage.getItem("seza.forcePinLogin") === "1";
    if (forcePin) {
      localStorage.removeItem("seza.forcePinLogin");
      return;
    }

    // Local register identity wins. A cashier who already verified on this
    // paired device must not be sent through cloud auth again just because a
    // Supabase session is missing/refreshing.
    void (async () => {
      const cachedUser = await readMeta<string>("authenticated_me_current_user").catch(() => undefined);
      if (cachedUser) {
        navigate({ to: "/pos", replace: true });
        return;
      }
      const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } } as any));
      if (data.session) navigate({ to: "/pos", replace: true });
    })();
  }, [navigate, pairing]);

  if (!pairing) return null;
  return <AuthScreen />;
}
