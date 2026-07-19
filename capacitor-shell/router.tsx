// Client-side TanStack Router for the bundled Capacitor shell.
//
// Mounts the REAL production POS screens (PosPage, RegisterPage,
// RefundsPage, TimeclockPage, ShiftsPage) inside the real PosShell.
// Server-fn dependent components (ManagerOverrideDialog,
// SupportRequestListener) are swapped for shell-safe stubs via aliases
// declared in vite.capacitor.config.ts.
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
import { AuthRoute } from "./screens/AuthRoute";
import { PlaceholderScreen } from "./screens/PlaceholderScreen";
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

const posRoute = shellRoute("/pos", PosPage);
const registerRoute = shellRoute("/register", RegisterPage);
const refundsRoute = shellRoute("/refunds", RefundsPage);
const timeclockRoute = shellRoute("/timeclock", TimeclockPage);
const shiftsRoute = shellRoute("/shifts", ShiftsPage);

// Settings and support are managed via the web dashboard for now; render a
// clear pointer instead of a broken half-page.
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  beforeLoad: requireAuth,
  component: () => (
    <PosShell>
      <PlaceholderScreen
        title="Store settings"
        body="Store, hardware, and billing settings are managed from the web dashboard. Sign in at sezapos.com from any browser."
      />
    </PosShell>
  ),
});

const supportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/support",
  beforeLoad: requireAuth,
  component: () => (
    <PosShell>
      <PlaceholderScreen
        title="Contact support"
        body="Email support@sezapos.com or open a ticket from the web dashboard."
      />
    </PosShell>
  ),
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  beforeLoad: requireAuth,
  component: () => (
    <PosShell>
      <PlaceholderScreen
        title="Finish setting up your store"
        body="Complete initial store setup in the web dashboard, then sign in here."
      />
    </PosShell>
  ),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  authRoute,
  posRoute,
  registerRoute,
  refundsRoute,
  timeclockRoute,
  shiftsRoute,
  settingsRoute,
  supportRoute,
  onboardingRoute,
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
