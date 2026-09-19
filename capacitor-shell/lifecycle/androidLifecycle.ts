// Android app-lifecycle: back-button, background/resume, network listener.
//
// Registers Capacitor listeners exactly ONCE per WebView process. Re-calling
// `initAndroidLifecycle()` from React StrictMode / hot reload is safe.
import type { QueryClient } from "@tanstack/react-query";
import { runBackHandlers } from "./backButtonCoordinator";
import { getActivityState, markBackPress, setBackgroundedAt, wireNativeActivityListener } from "./activityState";
import { showExitToast } from "./ExitConfirmToast";
import { supabase } from "../supabase";
import type { createShellRouter } from "../router";
import { readMeta } from "@/lib/offline/db";

type ShellRouter = ReturnType<typeof createShellRouter>;

// Routes at which a single accidental back should NOT exit the app.
// Only /pos (main register) requires double-press; /auth exits normally.
const REGISTER_ROUTE = "/pos";
const PIN_ROUTE = "/auth";

// After this long in the background, force a session recheck on resume.
// Kept conservative — the managed Supabase client refreshes tokens on
// its own; we only need to catch expiry / revocation.
const LONG_BACKGROUND_MS = 5 * 60 * 1000;

let started = false;

async function isNative(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch { return false; }
}

async function handleFallbackBack(router: ShellRouter) {
  const state = getActivityState();

  // Never exit or navigate while a payment is processing.
  if (state.paymentBusy) {
    showExitToast(2500);
    return;
  }

  const path = router.state.location.pathname;

  // PIN screen: allow normal Android exit.
  if (path === PIN_ROUTE) {
    await exitApp();
    return;
  }

  // Main register screen: require double-press to exit.
  if (path === REGISTER_ROUTE) {
    const now = Date.now();
    const state2 = getActivityState();
    const recent = state2.lastBackAt && now - state2.lastBackAt < 2000;
    if (recent) { await exitApp(); return; }
    markBackPress(now);
    showExitToast(2000);
    return;
  }

  // Nested authenticated route: use the in-app history stack first. This
  // returns Settings → Hardware → Settings, or Manager tool → Dashboard,
  // instead of rebuilding the register route for every Back press.
  if (path !== PIN_ROUTE) {
    try {
      if (sessionStorage.getItem("seza.posToolOrigin") === "manager-dashboard") {
        sessionStorage.removeItem("seza.posToolOrigin");
        sessionStorage.setItem("seza.openManagerDashboard", "1");
      }
    } catch {
      // sessionStorage is best-effort navigation state only.
    }

    const historyIndex = Number((router.history.location.state as any)?.__TSR_index ?? 0);
    if (historyIndex > 0) {
      router.history.back();
      return;
    }

    router.navigate({ to: REGISTER_ROUTE, replace: true });
  }
}

async function exitApp() {
  try {
    const { App } = await import("@capacitor/app");
    await App.exitApp();
  } catch { /* not on native */ }
}

async function onResume(router: ShellRouter, queryClient: QueryClient) {
  const bgAt = getActivityState().backgroundedAt;
  setBackgroundedAt(null);
  const wasLong = bgAt != null && Date.now() - bgAt > LONG_BACKGROUND_MS;

  // Always verify the session is still valid on resume; short waits get a
  // fast path (no revalidation to avoid unnecessary traffic).
  if (!wasLong) return;

  try {
    const cachedUser = await readMeta<string>("authenticated_me_current_user").catch(() => undefined);
    const cachedMe = cachedUser
      ? await readMeta<any>(`authenticated_me:${cachedUser}`).catch(() => undefined)
      : undefined;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      if (cachedMe?.profile && cachedMe?.store) {
        queryClient.invalidateQueries();
        return;
      }
      queryClient.clear();
      router.navigate({ to: PIN_ROUTE, replace: true });
      return;
    }
    queryClient.invalidateQueries();
    // Drain any offline queue that piled up while backgrounded.
    try {
      const { syncNow } = await import("@/lib/offline/sync");
      void syncNow();
    } catch { /* offline module unavailable */ }
  } catch {
    // Network failure — leave user on current screen; UI will surface
    // errors via existing error boundaries and the offline indicator.
  }
}

export async function initAndroidLifecycle(
  router: ShellRouter,
  queryClient: QueryClient,
): Promise<void> {
  if (started) return;
  started = true;
  wireNativeActivityListener();
  if (!(await isNative())) return;

  try {
    const { App } = await import("@capacitor/app");

    await App.addListener("backButton", async () => {
      const handled = await runBackHandlers();
      if (!handled) await handleFallbackBack(router);
    });

    await App.addListener("appStateChange", async ({ isActive }) => {
      if (isActive) {
        await onResume(router, queryClient);
      } else {
        setBackgroundedAt(Date.now());
      }
    });

    await App.addListener("pause", () => setBackgroundedAt(Date.now()));
    await App.addListener("resume", () => { void onResume(router, queryClient); });
  } catch (err) {
    console.warn("[lifecycle] @capacitor/app unavailable", err);
  }

  // Bridge Capacitor Network → useOnline authoritative override. Android
  // WebView's navigator.onLine is unreliable on `capacitor://` origins.
  try {
    const { Network } = await import("@capacitor/network");
    const { setNativeOnline } = await import("@/lib/offline/useOnline");
    try {
      const initial = await Network.getStatus();
      setNativeOnline(!!initial.connected);
    } catch { /* ignore */ }
    await Network.addListener("networkStatusChange", (status) => {
      setNativeOnline(!!status.connected);
    });
  } catch { /* optional */ }
}
