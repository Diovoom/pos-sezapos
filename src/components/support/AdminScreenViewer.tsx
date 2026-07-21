import { useEffect, useRef, useState } from "react";
import { supabaseAdminAuth } from "@/integrations/supabase/admin-client";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { adminEndSupportSession } from "@/lib/admin/admin.functions";
import { RTC_CONFIG, openSignalingChannel, sampleQuality, type ConnectionQuality, type SignalPayload } from "@/lib/support/webrtc";
import { Button } from "@/components/ui/button";
import { Minimize2, Maximize2, X, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  sessionId: string;
  channelToken: string;
  startedAt: string | null;
  businessName: string | undefined | null;
  storeCode: string | undefined | null;
  employeeName: string | undefined | null;
  capability?: string | null;
  onClosed: () => void;
};

/**
 * Platform-admin side viewer. Consumes the merchant's screen-share stream via
 * WebRTC. This component is strictly VIEW ONLY — the peer connection is
 * receive-only, there is no DataChannel, and no input events are ever sent
 * back to the merchant.
 */
export function AdminScreenViewer({
  sessionId,
  channelToken,
  startedAt,
  businessName,
  storeCode,
  employeeName,
  capability,
  onClosed,
}: Props) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "failed" | "ended">("connecting");
  const [quality, setQuality] = useState<ConnectionQuality>({
    label: "unknown",
    packetsLost: 0,
    packetsReceived: 0,
    bitrateKbps: 0,
  });
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [duration, setDuration] = useState("00:00");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const endServerFn = useServerFn(adminEndSupportSession);
  const qc = useQueryClient();

  useEffect(() => {
    if (!startedAt) return;
    const iv = setInterval(() => {
      const s = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      setDuration(`${mm}:${ss}`);
    }, 1000);
    return () => clearInterval(iv);
  }, [startedAt]);

  useEffect(() => {
    let disposed = false;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    // Force receive-only: we never add tracks, and we advertise recvonly.
    try {
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });
    } catch {
      /* older browsers may throw if called before signaling — merchant's offer will set this up */
    }

    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (stream) setRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      if (disposed) return;
      const st = pc.connectionState;
      if (st === "connected") setStatus("connected");
      else if (st === "failed") {
        setStatus("failed");
        setErrorText("WebRTC connection failed.");
      } else if (st === "disconnected" || st === "closed") {
        setStatus((s) => (s === "connected" ? "ended" : s));
      }
    };

    const signaling = openSignalingChannel(supabaseAdminAuth, channelToken, (msg) => {
      if (disposed) return;
      handleSignal(msg).catch((e) => console.error("[admin-rtc]", e));
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        signaling
          .send({ kind: "ice", from: "admin", candidate: e.candidate.toJSON() })
          .catch(() => {});
      }
    };

    async function handleSignal(msg: SignalPayload) {
      if (msg.from === "admin") return;
      switch (msg.kind) {
        case "hello":
          // Merchant is here; announce back so it sends its offer.
          await signaling.send({ kind: "hello", from: "admin" });
          break;
        case "offer":
          await pc.setRemoteDescription(msg.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await signaling.send({ kind: "answer", from: "admin", sdp: pc.localDescription!.toJSON() });
          break;
        case "ice":
          try {
            await pc.addIceCandidate(msg.candidate);
          } catch (e) {
            console.warn("[admin-rtc] addIceCandidate failed", e);
          }
          break;
        case "bye":
          setStatus("ended");
          setErrorText(msg.reason === "merchant_stopped_sharing"
            ? "Merchant stopped sharing their screen."
            : "Merchant ended the session.");
          break;
      }
    }

    // Say hello so the merchant knows we're subscribed.
    signaling.send({ kind: "hello", from: "admin" }).catch(() => {});

    // Fallback: if nothing is negotiated within 20s, declare failure.
    const failTimer = setTimeout(() => {
      if (disposed) return;
      if (pc.connectionState !== "connected" && !remoteStream) {
        setStatus("failed");
        setErrorText("Timed out waiting for the merchant's stream.");
      }
    }, 20_000);

    return () => {
      disposed = true;
      clearTimeout(failTimer);
      try {
        signaling.send({ kind: "bye", from: "admin", reason: "admin_unmounted" }).catch(() => {});
      } catch {
        /* noop */
      }
      signaling.close();
      try {
        pc.getSenders().forEach((s) => s.track && s.track.stop());
      } catch {
        /* noop */
      }
      try {
        pc.close();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, channelToken]);

  // Attach remote stream to the <video> element once we have one.
  useEffect(() => {
    if (videoRef.current && remoteStream) videoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  // Poll connection quality once we're connected.
  useEffect(() => {
    if (status !== "connected") return;
    const pc = pcRef.current;
    if (!pc) return;
    let prev: { bytes: number; ts: number } | null = null;
    const iv = setInterval(async () => {
      const { q, snapshot } = await sampleQuality(pc, prev);
      prev = snapshot;
      setQuality(q);
    }, 2000);
    return () => clearInterval(iv);
  }, [status]);

  async function closeAndEnd() {
    try {
      await endServerFn({ data: { sessionId } });
      toast.success("Support view ended");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to end session");
    } finally {
      qc.invalidateQueries({ queryKey: ["admin_support_session_active"] });
      onClosed();
    }
  }

  const qualityColor =
    quality.label === "good"
      ? "text-emerald-500"
      : quality.label === "fair"
        ? "text-amber-500"
        : quality.label === "poor"
          ? "text-red-500"
          : "text-muted-foreground";

  return (
    <div
      className={cn(
        "fixed z-40 rounded-lg border bg-background shadow-2xl overflow-hidden flex flex-col",
        expanded
          ? "inset-4"
          : "bottom-4 right-4 w-[520px] max-w-[calc(100vw-2rem)]",
        minimized && !expanded && "w-64",
      )}
    >
      <div className="px-3 py-2 border-b flex items-center gap-2 bg-muted/40">
        <div className="flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              status === "connected" && "bg-emerald-500 animate-pulse",
              status === "connecting" && "bg-blue-500 animate-pulse",
              (status === "failed" || status === "ended") && "bg-red-500",
            )}
            aria-hidden
          />
          <span className="font-medium">
            {status === "connecting" && "Connecting…"}
            {status === "connected" && "Live · read-only"}
            {status === "failed" && "Connection error"}
            {status === "ended" && "Session ended"}
          </span>
          {capability === "android_screen_share" && (
            <span className="ml-1 rounded bg-primary/15 text-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              Android
            </span>
          )}
        </div>
        <div className="ml-2 hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground min-w-0">
          <span className="truncate">
            <span className="uppercase tracking-wide mr-1">Biz</span>
            <span className="text-foreground font-medium">{businessName ?? "—"}</span>
          </span>
          <span className="truncate">
            <span className="uppercase tracking-wide mr-1">Store</span>
            <span className="font-mono text-foreground">{storeCode ?? "—"}</span>
          </span>
          <span className="truncate">
            <span className="uppercase tracking-wide mr-1">Emp</span>
            <span className="text-foreground">{employeeName ?? "—"}</span>
          </span>
          <span className="font-mono text-foreground">{duration}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 text-[11px]", qualityColor)}>
            {quality.label === "poor" ? (
              <WifiOff className="h-3.5 w-3.5" />
            ) : (
              <Wifi className="h-3.5 w-3.5" />
            )}
            {quality.label === "unknown" ? "—" : quality.label}
            {quality.bitrateKbps > 0 && (
              <span className="text-muted-foreground">· {quality.bitrateKbps}kbps</span>
            )}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMinimized((m) => !m)} aria-label="Minimize">
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded((e) => !e)} aria-label="Expand">
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeAndEnd} aria-label="End session">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {!minimized || expanded ? (
        <div className="relative bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            // muted so the browser will autoplay video without a user gesture.
            muted
            className={cn(
              "w-full block bg-black",
              expanded ? "h-[calc(100vh-8rem)] object-contain" : "aspect-video object-contain",
            )}
            // Belt-and-braces: disable any input the browser might route back.
            style={{ pointerEvents: "none" }}
          />
          {status !== "connected" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-sm p-4 text-center">
              {status === "connecting" && (
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                  Waiting for merchant's screen…
                </div>
              )}
              {status === "failed" && (
                <div className="flex flex-col items-center gap-2">
                  <AlertTriangle className="h-6 w-6 text-red-400" />
                  <div className="font-medium">Unable to connect</div>
                  <div className="text-xs text-white/80 max-w-sm">{errorText}</div>
                  <Button size="sm" variant="secondary" onClick={closeAndEnd}>End session</Button>
                </div>
              )}
              {status === "ended" && (
                <div className="flex flex-col items-center gap-2">
                  <div className="font-medium">Session ended</div>
                  {errorText && <div className="text-xs text-white/80 max-w-sm">{errorText}</div>}
                  <Button size="sm" variant="secondary" onClick={closeAndEnd}>Close</Button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
