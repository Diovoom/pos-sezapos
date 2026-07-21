// Native Android SEZA Support request listener.
//
// Replaces the temporary shell stub for `@/components/SupportRequestListener`.
// The web merchant dashboard continues to use the TanStack Start server-fn
// implementation in src/components/SupportRequestListener.tsx; this file is
// aliased into the APK bundle only, via vite.capacitor.config.ts.
//
// Responsibilities:
//   - Subscribe once (per signed-in employee) to admin_support_sessions for
//     the caller's store via Supabase realtime.
//   - Show an Accept / Decline prompt when a pending request arrives.
//   - Defer the prompt while a payment or shift-close is in flight
//     (`paymentBusy` from the native activity flags) so a modal cannot
//     interrupt a tender.
//   - Call the public HTTPS endpoints /api/public/pos/support-{respond,end}
//     which re-verify the caller server-side and write audit rows.
//   - Render a persistent "Support View Active" banner while a session is
//     live, with an End Support View action.
//   - Do NOT stream the screen. WebRTC / getDisplayMedia is not supported
//     inside the Capacitor WebView on Android without native capture
//     plugins, and shipping fake video would mislead the admin. The banner
//     clearly labels the session as read-only application-context only.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, API_BASE_URL, getBearer } from "../supabase";
import { useMe } from "@/hooks/useMe";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getActivityState } from "../lifecycle/activityState";

type SupportRequest = {
  id: string;
  store_id: string;
  admin_email: string | null;
  admin_display_name?: string | null;
  reason: string | null;
  status: string;
  requested_at: string;
  expires_at: string;
};

async function postSupport(path: "support-respond" | "support-end", body: unknown): Promise<{ ok: true } | { error: string; status: number }> {
  const token = await getBearer();
  if (!token) return { error: "Your session has expired. Sign in again.", status: 401 };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`${API_BASE_URL}/api/public/pos/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      let msg = "Support request could not be updated.";
      try { const d = await res.json(); if (d?.error) msg = String(d.error); } catch { /* ignore */ }
      if (res.status === 410) msg = "This request has expired.";
      if (res.status === 409) msg = "This request has already been resolved.";
      return { error: msg, status: res.status };
    }
    return { ok: true };
  } catch {
    return { error: "Network error. Retry when the connection is restored.", status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

export function SupportRequestListener() {
  const me = useMe();
  const storeId = me.data?.store?.id as string | undefined;

  const [pending, setPending] = useState<SupportRequest | null>(null);
  const [active, setActive] = useState<SupportRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [nowTick, setNowTick] = useState(0);
  // Hold-off flag when a payment / shift close is in flight — keep the
  // pending request queued but do NOT mount the AlertDialog until safe.
  const [holdOff, setHoldOff] = useState(false);

  const refresh = useCallback(async () => {
    if (!storeId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("admin_support_sessions")
      .select("id, store_id, admin_email, reason, status, requested_at, expires_at")
      .eq("store_id", storeId)
      .in("status", ["pending", "active"])
      .gt("expires_at", new Date().toISOString())
      .order("requested_at", { ascending: false });
    const rows = (data ?? []) as SupportRequest[];
    setPending(rows.find((r) => r.status === "pending") ?? null);
    setActive(rows.find((r) => r.status === "active") ?? null);
  }, [storeId]);

  // Realtime + safety-net poll. Rewired whenever the signed-in employee
  // (and therefore the scoped store) changes so a user-switch cannot leak
  // a previous store's requests.
  useEffect(() => {
    if (!storeId) return;
    void refresh();
    const channel = supabase
      .channel(`native-support-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_support_sessions", filter: `store_id=eq.${storeId}` },
        () => { void refresh(); },
      )
      .subscribe();
    const iv = setInterval(() => { void refresh(); }, 20_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(iv);
    };
  }, [storeId, refresh]);

  // Poll the native activity flags to know when the prompt is safe to show
  // and to re-render the banner countdown roughly once a second.
  useEffect(() => {
    const t = setInterval(() => {
      setHoldOff(!!getActivityState().paymentBusy);
      setNowTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const promptOpen = !!pending && !holdOff;

  async function decide(decision: "accept" | "decline") {
    if (!pending) return;
    setBusy(true);
    const target = pending;
    let clientMetadata: Record<string, unknown> | null = null;
    if (decision === "accept") {
      try {
        const { collectDiagnostics } = await import("./diagnostics");
        // Route/store/employee context is not directly available here; the
        // native app currently only mounts one route, so a minimal snapshot
        // (device + hardware + app info) is enough for support.
        clientMetadata = await collectDiagnostics({
          route: (typeof window !== "undefined" ? window.location.pathname : "/") ?? "/",
          storeId: storeId ?? null,
          employeeId: (me.data?.profile?.employee_id ?? null) as string | null,
        });
      } catch { /* diagnostics best-effort */ }
    }
    const res = await postSupport("support-respond", {
      sessionId: target.id,
      decision,
      clientCapability: decision === "accept" ? "android_diagnostics_only" : undefined,
      clientMetadata: decision === "accept" ? clientMetadata : undefined,
    });
    setBusy(false);
    if ("ok" in res) {
      toast[decision === "accept" ? "success" : "message"](
        decision === "accept" ? "SEZA Support access granted" : "Support request declined",
      );
      setPending(null);
      void refresh();
    } else {
      toast.error(res.error);
      // If the server says the request was already resolved / expired,
      // refresh so the prompt disappears rather than looping.
      if (res.status === 409 || res.status === 410) {
        setPending(null);
        void refresh();
      }
    }
  }

  async function endActive() {
    if (!active) return;
    setBusy(true);
    const res = await postSupport("support-end", { sessionId: active.id });
    setBusy(false);
    if ("ok" in res) {
      toast.message("Support View ended.");
      setActive(null);
      void refresh();
    } else {
      toast.error(res.error);
    }
  }

  if (!storeId) return null;

  const remainingSec = active
    ? Math.max(0, Math.floor((new Date(active.expires_at).getTime() - Date.now()) / 1000))
    : 0;
  // Reference nowTick so React re-renders the countdown label each second.
  void nowTick;
  const mm = Math.floor(remainingSec / 60);
  const ss = String(remainingSec % 60).padStart(2, "0");

  return (
    <>
      {active && (
        <div
          className="bg-amber-500/15 border-b border-amber-500/40 px-3 py-2 flex items-center gap-2 text-xs sm:text-sm"
          role="status"
          aria-live="polite"
        >
          <Eye className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">SEZA Support View is active</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Read-only · ends in {mm}:{ss}
            </div>
          </div>
          <button
            className="text-xs underline underline-offset-2 hover:text-foreground disabled:opacity-50"
            onClick={endActive}
            disabled={busy}
          >
            End
          </button>
        </div>
      )}

      {pending && holdOff && (
        <div
          className="bg-primary/10 border-b border-primary/30 px-3 py-1.5 text-[11px] flex items-center gap-2"
          role="status"
        >
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Support request waiting — will show when checkout finishes.</span>
        </div>
      )}

      <AlertDialog open={promptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              SEZA Support is requesting access
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  A SEZA Support agent
                  {pending?.admin_email ? ` (${pending.admin_email})` : ""} is asking for
                  permission to view your store data for the next 30 minutes.
                </p>
                {pending?.reason && (
                  <div className="rounded-md border bg-muted/40 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Reason</div>
                    <div>{pending.reason}</div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant="outline">Read-only</Badge>
                  <Badge variant="outline">You can end it anytime</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Screen streaming is not available in this app version — the agent
                  will only see your account context and shared diagnostics.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} onClick={() => decide("decline")}>
              Decline
            </AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => decide("accept")}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Accept
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
