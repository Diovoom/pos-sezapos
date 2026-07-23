import { useEffect, useRef, useState } from "react";
import { supabaseAdminAuth } from "@/integrations/supabase/admin-client";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { adminEndSupportSession } from "@/lib/admin/admin.functions";
import {
  RTC_CONFIG,
  openSignalingChannel,
  sampleQuality,
  type ConnectionQuality,
  type SignalPayload,
} from "@/lib/support/webrtc";
import { Button } from "@/components/ui/button";
import { Minimize2, Maximize2, X, Wifi, WifiOff, AlertTriangle, MonitorUp } from "lucide-react";
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

/** Read-only admin viewer. It starts as a compact status bubble and expands
 * only after a real video track arrives, so a failed connection never covers
 * half of the Admin workspace with a black rectangle. */
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
  const [minimized, setMinimized] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [duration, setDuration] = useState("00:00");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const explicitEndRef = useRef(false);
  const endServerFn = useServerFn(adminEndSupportSession);
  const qc = useQueryClient();

  useEffect(() => {
    streamRef.current = remoteStream;
    if (videoRef.current && remoteStream) videoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (!startedAt) return;
    const update = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
      setDuration(`${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    let disposed = false;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    try {
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });
    } catch {
      /* older WebRTC engine */
    }

    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      streamRef.current = stream;
      setRemoteStream(stream);
      setStatus("connected");
      setErrorText(null);
      setMinimized(false);
    };

    pc.onconnectionstatechange = () => {
      if (disposed) return;
      if (pc.connectionState === "connected") setStatus("connected");
      else if (pc.connectionState === "failed") {
        setStatus("failed");
        setErrorText("The live video connection failed. The case and chat remain open.");
        setMinimized(true);
      } else if (pc.connectionState === "closed" && explicitEndRef.current) {
        setStatus("ended");
      }
    };

    const signaling = openSignalingChannel(supabaseAdminAuth, channelToken, (message) => {
      if (!disposed) void handleSignal(message).catch((error) => console.error("[admin-rtc]", error));
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) signaling.send({ kind: "ice", from: "admin", candidate: event.candidate.toJSON() }).catch(() => {});
    };

    async function handleSignal(message: SignalPayload) {
      if (message.from === "admin") return;
      if (message.kind === "hello") {
        await signaling.send({ kind: "hello", from: "admin" });
      } else if (message.kind === "offer") {
        if (pc.signalingState !== "stable") {
          try { await pc.setLocalDescription({ type: "rollback" }); } catch { /* noop */ }
        }
        await pc.setRemoteDescription(message.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await signaling.send({ kind: "answer", from: "admin", sdp: pc.localDescription!.toJSON() });
      } else if (message.kind === "ice") {
        try { await pc.addIceCandidate(message.candidate); } catch { /* candidate can arrive before SDP */ }
      } else if (message.kind === "bye") {
        setStatus("ended");
        setErrorText(message.reason === "merchant_stopped_sharing"
          ? "Merchant stopped sharing their screen."
          : "Merchant ended the screen-sharing session.");
        setMinimized(true);
      }
    }

    signaling.send({ kind: "hello", from: "admin" }).catch(() => {});
    // Repeat hello because mobile clients can subscribe a fraction later.
    const helloTimer = setInterval(() => {
      if (!disposed && pc.connectionState !== "connected") {
        signaling.send({ kind: "hello", from: "admin" }).catch(() => {});
      }
    }, 2500);

    const failTimer = setTimeout(() => {
      if (!disposed && pc.connectionState !== "connected" && !streamRef.current) {
        setStatus("failed");
        setErrorText("Waiting for the merchant timed out. Keep the case open and ask them to share again.");
        setMinimized(true);
      }
    }, 25_000);

    return () => {
      disposed = true;
      clearInterval(helloTimer);
      clearTimeout(failTimer);
      // Route navigation must not end the merchant's session. Only the close
      // button calls the server end action and broadcasts an explicit bye.
      signaling.close();
      try { pc.close(); } catch { /* noop */ }
    };
  }, [sessionId, channelToken]);

  useEffect(() => {
    if (status !== "connected") return;
    const pc = pcRef.current;
    if (!pc) return;
    let previous: { bytes: number; ts: number } | null = null;
    const timer = setInterval(async () => {
      const result = await sampleQuality(pc, previous);
      previous = result.snapshot;
      setQuality(result.q);
    }, 2000);
    return () => clearInterval(timer);
  }, [status]);

  async function closeAndEnd() {
    explicitEndRef.current = true;
    try {
      await endServerFn({ data: { sessionId } });
      toast.success("Support view ended");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to end session");
    } finally {
      qc.invalidateQueries({ queryKey: ["admin_support_session_active"] });
      onClosed();
    }
  }

  const qualityColor = quality.label === "good"
    ? "text-emerald-500"
    : quality.label === "fair"
      ? "text-amber-500"
      : quality.label === "poor"
        ? "text-red-500"
        : "text-muted-foreground";

  const compact = minimized && !expanded;

  return (
    <div
      className={cn(
        "fixed z-50 overflow-hidden rounded-xl border bg-background shadow-2xl",
        expanded ? "inset-4" : compact ? "bottom-4 right-4 w-[310px] max-w-[calc(100vw-2rem)]" : "bottom-4 right-4 w-[440px] max-w-[calc(100vw-2rem)]",
      )}
    >
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <span className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          status === "connected" && "animate-pulse bg-emerald-500",
          status === "connecting" && "animate-pulse bg-blue-500",
          (status === "failed" || status === "ended") && "bg-red-500",
        )} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-semibold">
            {status === "connecting" && "Waiting for merchant screen…"}
            {status === "connected" && "Live · read-only"}
            {status === "failed" && "Screen connection unavailable"}
            {status === "ended" && "Screen sharing ended"}
            {capability === "android_screen_share" && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] uppercase text-primary">Android</span>}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            {businessName ?? "Merchant"} · {employeeName ?? storeCode ?? "Register"} · {duration}
          </div>
        </div>
        {status === "connected" && (
          <span className={cn("hidden items-center gap-1 text-[10px] sm:inline-flex", qualityColor)}>
            {quality.label === "poor" ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
            {quality.label === "unknown" ? "—" : quality.label}
          </span>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMinimized((value) => !value)} aria-label={compact ? "Show screen" : "Minimize screen"}>
          {compact ? <MonitorUp className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded((value) => !value)} aria-label="Expand screen">
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void closeAndEnd()} aria-label="End screen sharing">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {!compact && (
        <div className="relative bg-black">
          {remoteStream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn("block w-full bg-black object-contain", expanded ? "h-[calc(100vh-7rem)]" : "aspect-video")}
              style={{ pointerEvents: "none" }}
            />
          ) : (
            <div className={cn("flex items-center justify-center bg-muted/90 p-6 text-center", expanded ? "h-[calc(100vh-7rem)]" : "min-h-36")}>
              <div className="max-w-sm text-sm">
                {status === "connecting" && "The merchant accepted. Waiting for the first live frame…"}
                {status === "failed" && <><AlertTriangle className="mx-auto mb-2 h-6 w-6 text-red-500" /><div className="font-medium">No video received</div><div className="mt-1 text-xs text-muted-foreground">{errorText}</div></>}
                {status === "ended" && <><div className="font-medium">Session ended</div><div className="mt-1 text-xs text-muted-foreground">{errorText}</div></>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
