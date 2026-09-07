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
//   - On Accept: request MediaProjection consent from Android FIRST, then
//     resolve the session as `android_screen_share` and mount the live
//     screen-share peer (`AndroidScreenShare`).
//   - If MediaProjection consent is denied or live sharing is unsupported,
//     decline the request cleanly. Diagnostics are never substituted for a live screen.
//   - Defer the prompt while a payment or shift-close is in flight
//     (`paymentBusy` from the native activity flags) so a modal cannot
//     interrupt a tender.
//   - Call the public HTTPS endpoints /api/public/pos/support-{respond,end}
//     which re-verify the caller server-side and write audit rows.
import { nativeFetch, userSafeNetworkMessage } from "../lib/nativeHttp";
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
import {
  nativeScreenCapture,
  isNativeScreenCaptureAvailable,
  canPipeToMediaStream,
} from "./nativeScreenCapture";
import { AndroidScreenShare } from "./AndroidScreenShare";

type SupportRequest = {
  id: string;
  store_id: string;
  admin_email: string | null;
  admin_display_name?: string | null;
  reason: string | null;
  status: string;
  requested_at: string;
  expires_at: string;
  channel_token: string | null;
  client_capability: string | null;
};

async function postSupport(
  path: "support-respond" | "support-end",
  body: unknown,
): Promise<{ ok: true } | { error: string; status: number }> {
  const token = await getBearer();
  if (!token) return { error: "Your session has expired. Sign in again.", status: 401 };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await nativeFetch(`${API_BASE_URL}/api/public/pos/${path}`, {
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
      try {
        const d = await res.json();
        if (d?.error) msg = String(d.error);
      } catch { /* ignore */ }
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
  // Set by AndroidScreenShare when it wants to be torn down locally without
  // waiting for a Realtime round-trip.
  const localEndedRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!storeId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("admin_support_sessions")
      .select(
        "id, store_id, admin_email, reason, status, requested_at, expires_at, channel_token, client_capability",
      )
      .eq("store_id", storeId)
      .in("status", ["pending", "active"])
      .gt("expires_at", new Date().toISOString())
      .order("requested_at", { ascending: false });
    const rows = (data ?? []) as SupportRequest[];
    setPending(rows.find((r) => r.status === "pending") ?? null);
    setActive(rows.find((r) => r.status === "active") ?? null);
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    void refresh();
    const channel = supabase
      .channel(`native-support-${storeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "admin_support_sessions",
          filter: `store_id=eq.${storeId}`,
        },
        () => { void refresh(); },
      )
      .subscribe();
    const iv = setInterval(() => { void refresh(); }, 20_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(iv);
    };
  }, [storeId, refresh]);

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

    let clientCapability: "android_screen_share" | undefined;

    if (decision === "accept") {
      if (!isNativeScreenCaptureAvailable() || !canPipeToMediaStream()) {
        const declined = await postSupport("support-respond", {
          sessionId: target.id,
          decision: "decline",
        });
        setBusy(false);
        if ("ok" in declined) {
          setPending(null);
          toast.error("Live screen sharing is not available on this Android system yet.");
          void refresh();
        } else {
          toast.error(declined.error);
        }
        return;
      }

      let granted = false;
      try {
        const permission = await nativeScreenCapture.requestPermission();
        granted = !!permission.granted;
      } catch {
        granted = false;
      }

      if (!granted) {
        const declined = await postSupport("support-respond", {
          sessionId: target.id,
          decision: "decline",
        });
        setBusy(false);
        if ("ok" in declined) {
          setPending(null);
          toast.message("Screen sharing was not started.");
          void refresh();
        } else {
          toast.error(declined.error);
        }
        return;
      }

      clientCapability = "android_screen_share";
    }

    const res = await postSupport("support-respond", {
      sessionId: target.id,
      decision,
      clientCapability: decision === "accept" ? clientCapability : undefined,
    });
    setBusy(false);
    if ("ok" in res) {
      toast[decision === "accept" ? "success" : "message"](
        decision === "accept" ? "Screen sharing approved" : "Screen-share request declined",
      );
      setPending(null);
      void refresh();
    } else {
      // If we asked the OS for consent but couldn't record the accept
      // server-side, make sure we release the encoder before returning.
      if (decision === "accept") { try { await nativeScreenCapture.stop(); } catch { /* noop */ } }
      toast.error(res.error);
      if (res.status === 409 || res.status === 410) {
        setPending(null);
        void refresh();
      }
    }
  }

  async function endActive(reason: string = "merchant_stopped") {
    if (!active) return;
    setBusy(true);
    // Local teardown first — don't wait on network to stop capture.
    try { await nativeScreenCapture.stop(); } catch { /* noop */ }
    localEndedRef.current = reason;
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
  void nowTick;
  const mm = Math.floor(remainingSec / 60);
  const ss = String(remainingSec % 60).padStart(2, "0");

  const isLiveActive =
    !!active && active.status === "active" && active.client_capability === "android_screen_share" && !!active.channel_token;

  return (
    <>
      {isLiveActive && active && active.channel_token && (
        <AndroidScreenShare
          key={active.id}
          sessionId={active.id}
          channelToken={active.channel_token}
          expiresAtIso={active.expires_at}
          onEnded={(reason) => { void endActive(reason); }}
        />
      )}

      {active && !isLiveActive && (
        <div
          className="bg-amber-500/15 border-b border-amber-500/40 px-3 py-2 flex items-center gap-2 text-xs sm:text-sm"
          role="status"
          aria-live="polite"
        >
          <Eye className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">Screen sharing is not active</div>
            <div className="text-[10px] text-muted-foreground">
              End this old support session and request screen sharing again.
            </div>
          </div>
          <button
            className="text-xs underline underline-offset-2 hover:text-foreground disabled:opacity-50"
            onClick={() => void endActive("merchant_stopped")}
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
              SEZA Support is requesting permission to view your screen
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  A SEZA Admin
                  {pending?.admin_email ? ` (${pending.admin_email})` : ""} is asking to watch
                  your Point-of-Sale screen live for up to 30 minutes.
                </p>
                {pending?.reason && (
                  <div className="rounded-md border bg-muted/40 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Reason</div>
                    <div>{pending.reason}</div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant="outline">View-only</Badge>
                  <Badge variant="outline">No touch or typing</Badge>
                  <Badge variant="outline">You can stop it anytime</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  If you tap Allow, Android will show a system prompt to confirm screen capture.
                  A red banner and a system notification stay visible the whole time.
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
              Allow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
