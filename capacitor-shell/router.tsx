// Client-side TanStack Router for the bundled Capacitor shell.
// Heavy POS screens are loaded only when their route is opened so the login
// and loading UI can paint before checkout/report/PDF code is downloaded.
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { SplashScreen } from "./screens/SplashScreen";

function lazyNamed<T extends ComponentType<any>>(
  importer: () => Promise<Record<string, unknown>>,
  exportName: string,
) {
  return lazy(async () => {
    const module = await importer();
    const component = module[exportName];
    if (!component) throw new Error(`Missing lazy export: ${exportName}`);
    return { default: component as T };
  });
}

const PosShell = lazyNamed<
  ComponentType<{ children: ReactNode }>
>(() => import("@/components/pos/PosShell"), "PosShell");
const PosPage = lazyNamed<ComponentType>(() => import("@/routes/_pos/pos"), "PosPage");
const RegisterPage = lazyNamed<ComponentType>(
  () => import("@/routes/_pos/register"),
  "RegisterPage",
);
const RefundsPage = lazyNamed<ComponentType>(
  () => import("@/routes/_pos/refunds"),
  "RefundsPage",
);
const TimeclockPage = lazyNamed<ComponentType>(
  () => import("@/routes/_pos/timeclock"),
  "TimeclockPage",
);
const ShiftsPage = lazyNamed<ComponentType>(
  () => import("@/routes/_dashboard/shifts"),
  "ShiftsPage",
);
const SupportScreen = lazyNamed<ComponentType>(
  () => import("./screens/SupportScreen"),
  "SupportScreen",
);
const AuthRoute = lazyNamed<ComponentType>(
  () => import("./screens/AuthRoute"),
  "AuthRoute",
);
const PairDeviceScreen = lazyNamed<ComponentType>(
  () => import("./screens/PairDeviceScreen"),
  "PairDeviceScreen",
);
const OnboardingScreen = lazyNamed<ComponentType>(
  () => import("./screens/OnboardingScreen"),
  "OnboardingScreen",
);
const SettingsScreen = lazyNamed<ComponentType>(
  () => import("./screens/SettingsScreen"),
  "SettingsScreen",
);
const ScannerSettingsScreen = lazyNamed<ComponentType>(
  () => import("./screens/ScannerSettingsScreen"),
  "ScannerSettingsScreen",
);
const PendingSyncScreen = lazyNamed<ComponentType>(
  () => import("./screens/PendingSyncScreen"),
  "PendingSyncScreen",
);

function LazyScreen({ children }: { children: ReactNode }) {
  return <Suspense fallback={<SplashScreen />}>{children}</Suspense>;
}

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
  component: () => (
    <LazyScreen>
      <AuthRoute />
    </LazyScreen>
  ),
});

const pairRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pair",
  component: () => (
    <LazyScreen>
      <PairDeviceScreen />
    </LazyScreen>
  ),
});

const requireAuth = async () => {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw redirect({ to: "/auth", replace: true });
};

const shellRoute = (
  path: string,
  Component: ComponentType,
) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path,
    beforeLoad: requireAuth,
    component: () => (
      <LazyScreen>
        <PosShell>
          <Component />
        </PosShell>
      </LazyScreen>
    ),
  });

const routeTree = rootRoute.addChildren([
  indexRoute,
  authRoute,
  pairRoute,
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
