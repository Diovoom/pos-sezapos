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
import { getPairing } from "./lib/pairing";
import { deleteMeta, readMeta } from "@/lib/offline/db";


async function hasLocalRegisterIdentity(): Promise<boolean> {
  const userId = await readMeta<string>("authenticated_me_current_user").catch(() => undefined);
  if (!userId) return false;
  const me = await readMeta<any>(`authenticated_me:${userId}`).catch(() => undefined);
  if (me?.profile && me?.store) return true;
  await deleteMeta("authenticated_me_current_user").catch(() => {});
  return false;
}

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
const DeviceSetupScreen = lazyNamed<ComponentType>(
  () => import("./screens/DeviceSetupScreen"),
  "DeviceSetupScreen",
);
const SettingsScreen = lazyNamed<ComponentType>(
  () => import("@/components/pos/RegisterAppSettingsPage"),
  "RegisterAppSettingsPage",
);
const ScannerSettingsScreen = lazyNamed<ComponentType>(
  () => import("./screens/ScannerSettingsScreen"),
  "ScannerSettingsScreen",
);
const PendingSyncScreen = lazyNamed<ComponentType>(
  () => import("./screens/PendingSyncScreen"),
  "PendingSyncScreen",
);
const PosManagerToolsPage = lazyNamed<ComponentType>(
  () => import("@/routes/_pos/manager-tools"),
  "PosManagerToolsPage",
);
const PaymentTerminalPage = lazyNamed<ComponentType>(
  () => import("@/components/pos/PaymentTerminalPage"),
  "PaymentTerminalPage",
);

function RouteSkeleton() {
  return (
    <div
      aria-label="Loading screen"
      style={{
        height: "100%",
        minHeight: 0,
        background: "#f8fafc",
        padding: 16,
        display: "grid",
        gridTemplateColumns: "2fr 1fr",
        gap: 12,
      }}
    >
      <div style={{ borderRadius: 10, background: "#eef2f7" }} />
      <div style={{ borderRadius: 10, background: "#e2e8f0" }} />
    </div>
  );
}

function LazyScreen({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>;
}

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    if (!getPairing()) throw redirect({ to: "/pair", replace: true });
    if (typeof window !== "undefined" && localStorage.getItem("seza.employee_select_required") === "1") {
      throw redirect({ to: "/auth", replace: true });
    }
    if (await hasLocalRegisterIdentity()) {
      if (typeof window !== "undefined" && localStorage.getItem("seza.device_setup_completed_v1") !== "1") {
        throw redirect({ to: "/device-setup", replace: true });
      }
      throw redirect({ to: "/pos", replace: true });
    }
    throw redirect({ to: "/auth", replace: true });
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
  if (!getPairing()) throw redirect({ to: "/pair", replace: true });
  if (typeof window !== "undefined" && localStorage.getItem("seza.employee_select_required") === "1") {
    throw redirect({ to: "/auth", replace: true });
  }
  if (await hasLocalRegisterIdentity()) return;
  throw redirect({ to: "/auth", replace: true });
};

const deviceSetupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/device-setup",
  beforeLoad: requireAuth,
  component: () => (
    <LazyScreen>
      <DeviceSetupScreen />
    </LazyScreen>
  ),
});

// Keep one POS shell mounted for the entire signed-in register experience.
// Previously every screen mounted a brand-new PosShell, which made Back feel
// like browser/page navigation and flashed the full-screen loading skeleton.
const posShellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "pos-shell",
  beforeLoad: requireAuth,
  component: () => (
    <LazyScreen>
      <PosShell>
        <Outlet />
      </PosShell>
    </LazyScreen>
  ),
});

const shellRoute = (
  path: string,
  Component: ComponentType,
) =>
  createRoute({
    getParentRoute: () => posShellRoute,
    path,
    component: () => (
      <LazyScreen>
        <Component />
      </LazyScreen>
    ),
  });

const posRoutes = [
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
  shellRoute("/manager-tools", PosManagerToolsPage),
  shellRoute("/payment-terminal", PaymentTerminalPage),
];

const routeTree = rootRoute.addChildren([
  indexRoute,
  authRoute,
  pairRoute,
  deviceSetupRoute,
  posShellRoute.addChildren(posRoutes),
]);

function initialShellEntry(): string {
  if (typeof window === "undefined") return "/";
  try {
    const url = new URL(window.location.href);
    return url.pathname && url.pathname !== "/" ? `${url.pathname}${url.search}` : "/";
  } catch {
    return "/";
  }
}

export function createShellRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialShellEntry()] }),
    defaultPreloadStaleTime: 0,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createShellRouter>;
  }
}
