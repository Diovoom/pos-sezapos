import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { hydrateSessionFromCookie } from "@/integrations/supabase/session-bridge";
import { PosShell } from "@/components/pos/PosShell";
import { currentApp, posUrl } from "@/lib/host";


// POS register surface — cashiers, managers, admins, owners.
export const Route = createFileRoute("/_pos")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  beforeLoad: async () => {
    // Wrong subdomain? Bounce to pos.sezapos.com.
    if (typeof window !== "undefined") {
      const app = currentApp();
      if (app === "dashboard") {
        throw redirect({ to: "/dashboard" });
      }
      if (app === "marketing") {
        window.location.replace(posUrl("/pos"));
        throw redirect({ to: "/" });
      }
    }
    // Wait for the shared-cookie session to hydrate into localStorage before
    // asking Supabase who we are — otherwise a signed-in cross-subdomain
    // visitor gets bounced to /auth and reloaded in a loop.
    await hydrateSessionFromCookie();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },

  component: PosLayout,
});

function PosLayout() {
  return (
    <PosShell>
      <Outlet />
    </PosShell>
  );
}
