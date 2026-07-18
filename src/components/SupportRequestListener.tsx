import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useMe } from "@/hooks/useMe";
import { merchantRespondSupportSession, merchantEndSupportSession } from "@/lib/admin/admin.functions";
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

type SupportRequest = {
  id: string;
  store_id: string;
  admin_email: string | null;
  reason: string;
  status: string;
  requested_at: string;
  expires_at: string;
};

/**
 * Listens for pending SEZA support view requests targeted at the current merchant's store,
 * and shows an Accept / Decline dialog. On Accept, prompts the browser's native screen-share
 * picker in the same user gesture and mounts <MerchantScreenShare/> to stream to the
 * platform admin via WebRTC. Accept / decline / end are audited server-side.
 */
export function SupportRequestListener() {
  const me = useMe();
  const storeId = me.data?.store?.id as string | undefined;

  const respond = useServerFn(merchantRespondSupportSession);
  const endFn = useServerFn(merchantEndSupportSession);

  const [pending, setPending] = useState<SupportRequest | null>(null);
  const [active, setActive] = useState<SupportRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null);
  // Keep the stream mount tied to the accepted session — clear it if a new
  // session arrives, if the current one ends, or on unmount.
  const streamSessionIdRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!storeId) return;
    refresh();
    const channel = supabase
      .channel(`support-req-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_support_sessions", filter: `store_id=eq.${storeId}` },
        () => refresh(),
      )
      .subscribe();
    const iv = setInterval(refresh, 15_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(iv);
    };
  }, [storeId, refresh]);

  // Tear down any stream if the active session goes away or changes.
  useEffect(() => {
    if (!active || active.id !== streamSessionIdRef.current) {
      if (captureStream) {
        try {
          captureStream.getTracks().forEach((t) => t.stop());
        } catch {
          /* noop */
        }
        setCaptureStream(null);
        streamSessionIdRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  async function decide(decision: "accept" | "decline") {
    if (!pending) return;
    setBusy(true);
    const target = pending;

    if (decision === "decline") {
      try {
        await respond({ data: { sessionId: target.id, decision: "decline" } });
        toast.message("Support request declined");
        setPending(null);
        refresh();
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to respond");
      } finally {
        setBusy(false);
      }
      return;
    }

    // Accept path: prompt the browser's screen picker WITHIN this user gesture.
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== "function") {
      toast.error("Your browser doesn't support screen sharing.");
      try {
        await respond({
          data: { sessionId: target.id, decision: "decline", note: "screen_share_unsupported" },
        });
      } catch {
        /* noop */
      }
      setPending(null);
      refresh();
      setBusy(false);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      });
    } catch (e: any) {
      toast.error("Screen sharing was cancelled or blocked");
      try {
        await respond({
          data: { sessionId: target.id, decision: "decline", note: "screen_share_denied" },
        });
      } catch {
        /* noop */
      }
      setPending(null);
      refresh();
      setBusy(false);
      return;
    }

    try {
      await respond({ data: { sessionId: target.id, decision: "accept" } });
    } catch (e: any) {
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* noop */
      }
      toast.error(e?.message ?? "Failed to accept");
      setBusy(false);
      return;
    }

    streamSessionIdRef.current = target.id;
    setCaptureStream(stream);
    toast.success("SEZA Support can now view your screen");
    setPending(null);
    refresh();
    setBusy(false);
  }

  async function endActive() {
    if (!active) return;
    try {
      await endFn({ data: { sessionId: active.id } });
      if (captureStream) {
        try {
          captureStream.getTracks().forEach((t) => t.stop());
        } catch {
          /* noop */
        }
        setCaptureStream(null);
        streamSessionIdRef.current = null;
      }
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to end session");
    }
  }

  if (!storeId) return null;

  return (
    <>
      {active && (
        <div className="bg-amber-500/15 border-b border-amber-500/40 px-4 py-2 flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4 text-amber-700 dark:text-amber-300" />
          <span className="font-medium">SEZA Support is viewing your screen</span>
          <span className="text-muted-foreground">
            — expires {new Date(active.expires_at).toLocaleTimeString()}
          </span>
          <button
            className="ml-auto text-xs underline underline-offset-2 hover:text-foreground"
            onClick={endActive}
          >
            End session
          </button>
        </div>
      )}

      {active && captureStream && streamSessionIdRef.current === active.id && (
        <MerchantScreenShare
          sessionId={active.id}
          stream={captureStream}
          onEnded={async (reason) => {
            setCaptureStream(null);
            streamSessionIdRef.current = null;
            // If the stream died on its own (user hit "Stop sharing", or
            // the connection dropped), close the session too so both sides
            // get audited and the admin banner clears.
            if (active) {
              try {
                await endFn({ data: { sessionId: active.id, note: reason } });
              } catch {
                /* noop — server may have already ended it */
              }
              refresh();
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
                  A SEZA Support agent{pending?.admin_email ? ` (${pending.admin_email})` : ""} is asking for
                  permission to view your store data for the next 30 minutes.
                </p>
                {pending?.reason && (
                  <div className="rounded-md border bg-muted/40 p-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Reason</div>
                    <div>{pending.reason}</div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  After you tap Accept, your browser will ask which screen, window, or tab to share.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Badge variant="outline">Read-only</Badge>
                  <Badge variant="outline">You can end it anytime</Badge>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} onClick={() => decide("decline")}>
              Decline
            </AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => decide("accept")}>
              Accept & Share Screen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
