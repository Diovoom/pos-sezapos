// Route wrapper around the existing shell AuthScreen so it participates in
// the TanStack Router lifecycle. On successful sign-in the router navigates
// to /pos; the existing supabase.auth.onAuthStateChange listener installed
// in main.tsx invalidates the router so beforeLoad re-runs.
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "../supabase";
import { getPairing } from "../lib/pairing";
import { AuthScreen } from "./AuthScreen";

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

    // If a session already exists (e.g. hot reload) bounce straight to POS.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/pos", replace: true });
    });
  }, [navigate, pairing]);

  if (!pairing) return null;
  return <AuthScreen />;
}
