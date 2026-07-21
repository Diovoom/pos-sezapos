// Client-side TanStack Router for the bundled Capacitor shell.
//
// Mounts real production screens inside the real PosShell. Settings and
// Onboarding are POS-scoped screens native to the shell (they call the
// public HTTPS endpoints directly, so no TanStack Start server-fn hashes
// are needed). HelpPage uses Supabase directly and works in the shell too.
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { PosShell } from "@/components/pos/PosShell";
import { PosPage } from "@/routes/_pos/pos";
import { RegisterPage } from "@/routes/_pos/register";
import { RefundsPage } from "@/routes/_pos/refunds";
import { TimeclockPage } from "@/routes/_pos/timeclock";
import { ShiftsPage } from "@/routes/_dashboard/shifts";
import { SupportScreen } from "./screens/SupportScreen";
import { AuthRoute } from "./screens/AuthRoute";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ScannerSettingsScreen } from "./screens/ScannerSettingsScreen";
import { PendingSyncScreen } from "./screens/PendingSyncScreen";
import { supabase } from "./supabase";

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/pos" : "/auth", replace: true });
  },
  component: () => null,
});

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  component: AuthRoute,
});

const requireAuth = async () => {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw redirect({ to: "/auth", replace: true });
};

const shellRoute = <Path extends string>(path: Path, Component: () => React.JSX.Element) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path,
    beforeLoad: requireAuth,
    component: () => (
      <PosShell>
        <Component />
      </PosShell>
    ),
  });

const routeTree = rootRoute.addChildren([
  indexRoute,
  authRoute,
  shellRoute("/pos", PosPage),
  shellRoute("/register", RegisterPage),
  shellRoute("/refunds", RefundsPage),
  shellRoute("/timeclock", TimeclockPage),
  shellRoute("/shifts", ShiftsPage),
  shellRoute("/support", SupportScreen),
  shellRoute("/help", SupportScreen),
  shellRoute("/settings", SettingsScreen),
  shellRoute("/settings/scanner", ScannerSettingsScreen),
  shellRoute("/onboarding", OnboardingScreen),
  shellRoute("/pending-sync", PendingSyncScreen),
]);

export function createShellRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ["/"] }),
    defaultPreloadStaleTime: 0,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createShellRouter>;
  }
}
