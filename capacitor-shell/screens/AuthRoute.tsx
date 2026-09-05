import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getPairing } from "../lib/pairing";
import { AuthScreen } from "./AuthScreen";
import { deleteMeta, readMeta } from "@/lib/offline/db";

export function AuthRoute() {
  const navigate = useNavigate();
  const pairing = getPairing();

  useEffect(() => {
    if (!pairing) {
      navigate({ to: "/pair", replace: true });
      return;
    }

    if (localStorage.getItem("seza.forcePinLogin") === "1") {
      localStorage.removeItem("seza.forcePinLogin");
      return;
    }

    void (async () => {
      const cachedUser = await readMeta<string>("authenticated_me_current_user").catch(() => undefined);
      if (!cachedUser) return;
      const cachedMe = await readMeta<any>(`authenticated_me:${cachedUser}`).catch(() => undefined);
      if (cachedMe?.profile && cachedMe?.store) {
        navigate({ to: "/pos", replace: true });
        return;
      }
      await deleteMeta("authenticated_me_current_user").catch(() => {});
    })();
  }, [navigate, pairing]);

  if (!pairing) return null;
  return <AuthScreen />;
}
