// Client-side TanStack Router for the bundled Capacitor shell.
//
// Uses a memory history (no URL bar in the WebView is relevant), and mounts
// a minimal route tree:
//
//   /            → redirect to /pos when signed in, /auth otherwise.
//   /auth        → the shell's email/password login screen.
//   /pos         → real production PosPage inside real PosShell.
//   /register    → placeholder ("open in web dashboard").
//   /refunds     → placeholder.
//   /timeclock   → placeholder.
//   /shifts      → placeholder.
//   /onboarding  → placeholder.
//
// The `/pos` route mounts the production `PosPage` component from
// `src/routes/_pos/pos.tsx` and wraps it in the real `PosShell`, so the
// product grid, categories, search, cart, quantity edits, cash payment,
// barcode scanner, discounts, custom items, age verification, and receipt
// preview all come from the exact same code the web app uses. Server-fn
// dependent surfaces (manager overrides, platform support listener) are
// substituted at bundle time via aliases in vite.capacitor.config.ts.
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

const posRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pos",
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", replace: true });
  },
  component: () => (
    <PosShell>
      <PosPage />
    </PosShell>
  ),
});

const placeholder = (path: string, title: string, body: string) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path,
    beforeLoad: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw redirect({ to: "/auth", replace: true });
    },
    component: () => (
      <PosShell>
        <PlaceholderScreen title={title} body={body} />
      </PosShell>
    ),
  });

const registerRoute = placeholder(
  "/register",
  "Register",
  "Cash drawer, movements, and shift open/close are being ported. Use the web dashboard for now.",
);
const refundsRoute = placeholder(
  "/refunds",
  "Refunds",
  "Refund lookup and processing are being ported. Use the web dashboard for now.",
);
const timeclockRoute = placeholder(
  "/timeclock",
  "Time clock",
  "Clock-in / clock-out and time entries are being ported. Use the web dashboard for now.",
);
const shiftsRoute = placeholder(
  "/shifts",
  "Shifts",
  "Shift history is being ported. Use the web dashboard for now.",
);
const onboardingRoute = placeholder(
  "/onboarding",
  "Set up your store",
  "Complete initial store setup in the web dashboard, then sign in here.",
);

const routeTree = rootRoute.addChildren([
  indexRoute,
  authRoute,
  posRoute,
  registerRoute,
  refundsRoute,
  timeclockRoute,
  shiftsRoute,
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

// Register router type for the shell's TanStack Router hooks.
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createShellRouter>;
  }
}
