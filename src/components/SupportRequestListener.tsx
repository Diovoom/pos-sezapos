import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useMe } from "@/hooks/useMe";
import {
  merchantRespondSupportSession,
  merchantEndSupportSession,
} from "@/lib/admin/admin.functions";
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
import { ShieldCheck, Eye } from "lucide-react";
import { toast } from "sonner";
import { MerchantScreenShare } from "@/components/support/MerchantScreenShare";
import { isNativeMode } from "@/lib/native";
import { startNativeScreenShare } from "@/lib/support/native-screen-share";

type SupportRequest = {
  id: string;
  store_id: string;
  admin_email: string | null;
  reason: string;
  status: string;
  requested_at: string;
  expires_at: string;
  channel_token: string;
};

export function SupportRequestListener() {
  const me = useMe();
  const storeId = me.data?.store?.id as string | undefined;
  const respond = useServerFn(merchantRespondSupportSession);
  const endFn = useServerFn(merchantEndSupportSession);

  const [pending, setPending] = useState<SupportRequest | null>(null);
  const [active, setActive] = useState<SupportRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef<SupportRequest | null>(null);
  const streamSessionIdRef = useRef<string | null>(null);
  const nativeStopRef = useRef<(() => Promise<void>) | null>(null);
  const acceptedAtRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const stopCapture = useCallback(async () => {
    const nativeStop = nativeStopRef.current;
    nativeStopRef.current = null;
    if (nativeStop) await nativeStop().catch(() => {});

    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      try {
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        /* noop */
      }
    }
    if (mountedRef.current) setCaptureStream(null);
    streamSessionIdRef.current = null;
  }, []);

  const refresh = useCallback(async () => {
    if (!storeId) return;
    const { data, error } = await (supabase as any)
      .from("admin_support_sessions")
      .select("id, store_id, admin_email, reason, status, requested_at, expires_at, channel_token")
      .eq("store_id", storeId)
      .in("status", ["pending", "active"])
      .gt("expires_at", new Date().toISOString())
      .order("requested_at", { ascending: false });
    if (error || !mountedRef.current) return;
    const rows = (data ?? []) as SupportRequest[];
    setPending(rows.find((row) => row.status === "pending") ?? null);
    const serverActive = rows.find((row) => row.status === "active") ?? null;
    setActive((current) => {
      if (serverActive) return serverActive;
      // Realtime and the accept request can cross. Keep the capture alive
      // briefly instead of tearing it down during a normal route transition.
      if (current && Date.now() - acceptedAtRef.current < 15_000) return current;
      return null;
    });
  }, [storeId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!storeId) return;
    void refresh();
    const channel = supabase
      .channel(`support-req-${storeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "admin_support_sessions",
          filter: `store_id=eq.${storeId}`,
        },
        () => void refresh(),
      )
      .subscribe();
    const interval = setInterval(() => void refresh(), 10_000);
    return () => {
      void supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [storeId, refresh]);

  useEffect(() => {
    if (!active && streamSessionIdRef.current && Date.now() - acceptedAtRef.current >= 15_000) {
      void stopCapture();
    }
  }, [active, stopCapture]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      void stopCapture();
    };
  }, [stopCapture]);

  async function decide(decision: "accept" | "decline") {
    if (!pending || busy) return;
    setBusy(true);
    const target = pending;

    if (decision === "decline") {
      try {
        await respond({ data: { sessionId: target.id, decision: "decline" } });
        toast.message("Support request declined");
        setPending(null);
        void refresh();
      } catch (error: any) {
        toast.error(error?.message ?? "Failed to respond");
      } finally {
        setBusy(false);
      }
      return;
    }

    let stream: MediaStream | null = null;
    let capability: "android_screen_share" | "web_screen_share" = "web_screen_share";
    try {
      if (isNativeMode()) {
        const native = await startNativeScreenShare();
        stream = native.stream;
        nativeStopRef.current = native.stop;
        capability = "android_screen_share";
      } else {
        if (
          !navigator.mediaDevices ||
          typeof navigator.mediaDevices.getDisplayMedia !== "function"
        ) {
          throw new Error("This browser does not support screen sharing");
        }
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 15 },
          audio: false,
        });
      }

      await respond({
        data: {
          sessionId: target.id,
          decision: "accept",
          clientCapability: capability,
          clientMetadata: {
            app: {
              platform: capability === "android_screen_share" ? "android" : "web",
              userAgent: navigator.userAgent,
              language: navigator.language,
              online: navigator.onLine,
            },
            device: {
              screen: {
                width: window.screen?.width ?? window.innerWidth,
                height: window.screen?.height ?? window.innerHeight,
                dpr: window.devicePixelRatio ?? 1,
              },
            },
            context: { route: window.location.pathname, capturedAt: new Date().toISOString() },
          },
        },
      });

      acceptedAtRef.current = Date.now();
      streamSessionIdRef.current = target.id;
      streamRef.current = stream;
      setCaptureStream(stream);
      const accepted = { ...target, status: "active" };
      activeRef.current = accepted;
      setActive(accepted);
      setPending(null);
      toast.success("SEZA Support can now view your screen");
      setTimeout(() => void refresh(), 1200);
    } catch (error: any) {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      await nativeStopRef.current?.().catch(() => {});
      nativeStopRef.current = null;
      toast.error(error?.message ?? "Screen sharing was cancelled or blocked");
      try {
        await respond({
          data: { sessionId: target.id, decision: "decline", note: "screen_share_failed" },
        });
      } catch {
        /* noop */
      }
      setPending(null);
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  async function endActive() {
    const current = activeRef.current;
    if (!current) return;
    try {
      await endFn({ data: { sessionId: current.id } });
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to end session");
    } finally {
      await stopCapture();
      activeRef.current = null;
      setActive(null);
      void refresh();
    }
  }

  if (!storeId) return null;

  return (
    <>
      {active && (
        <div className="fixed left-1/2 top-[max(.5rem,env(safe-area-inset-top))] z-[70] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-amber-500/40 bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
          <Eye className="h-4 w-4 text-amber-600" />
          <span className="font-medium">SEZA Support view active</span>
          <button
            className="ml-1 font-semibold text-destructive hover:underline"
            onClick={() => void endActive()}
          >
            Stop
          </button>
        </div>
      )}

      {active && captureStream && streamSessionIdRef.current === active.id && (
        <MerchantScreenShare
          channelToken={active.channel_token}
          stream={captureStream}
          onEnded={async (reason) => {
            const current = activeRef.current;
            await stopCapture();
            if (current) {
              try {
                await endFn({ data: { sessionId: current.id, note: reason } });
              } catch {
                /* already ended */
              }
              activeRef.current = null;
              setActive(null);
              void refresh();
            }
          }}
        />
      )}

      <AlertDialog open={!!pending}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              SEZA Support is requesting to view your screen
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  A SEZA Support agent{pending?.admin_email ? ` (${pending.admin_email})` : ""} is
                  requesting temporary, read-only screen access.
                </p>
                {pending?.reason && (
                  <div className="rounded-md border bg-muted/40 p-2">
                    <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                      Reason
                    </div>
                    <div>{pending.reason}</div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  You remain in control. SEZA cannot tap, type, open files, use the camera, or
                  control your register.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Badge variant="outline">Read-only</Badge>
                  <Badge variant="outline">Stop anytime</Badge>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} onClick={() => void decide("decline")}>
              Decline
            </AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void decide("accept")}>
              {busy ? "Starting…" : "Accept & share"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
