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
import { GripVertical, Minimize2, Maximize2, X, Wifi, WifiOff, AlertTriangle, MonitorUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useFloatingPosition } from "@/hooks/useFloatingPosition";

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
  const { panelRef, floatingStyle, dragHandleProps, reclamp } = useFloatingPosition(
    "seza-admin-screen-viewer-position",
  );
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [frameInfo, setFrameInfo] = useState<{ width: number; height: number; capturedAt: number } | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "failed" | "ended">(
    "connecting",
  );
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
  const visualReceivedRef = useRef(false);
  const endServerFn = useServerFn(adminEndSupportSession);
  const qc = useQueryClient();

  useEffect(() => {
    streamRef.current = remoteStream;
    const video = videoRef.current;
    if (!video || !remoteStream) return;
    if (video.srcObject !== remoteStream) video.srcObject = remoteStream;
    // Muted inline playback should be autoplay-safe, but explicitly call play()
    // because some admin browsers attach the remote track without starting the
    // element. A connected peer with a paused <video> looks like a black feed.
    void video.play().catch((error) => {
      console.warn("[admin-rtc] video autoplay", error);
    });
  }, [remoteStream]);

  useEffect(() => {
    if (!startedAt) return;
    const update = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
      setDuration(
        `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
      );
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    let disposed = false;
    visualReceivedRef.current = false;
    setFrameSrc(null);
    setFrameInfo(null);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;
    const pendingMerchantIce: RTCIceCandidateInit[] = [];

    async function flushMerchantIce() {
      if (!pc.remoteDescription) return;
      while (pendingMerchantIce.length) {
        const candidate = pendingMerchantIce.shift();
        if (!candidate) continue;
        try { await pc.addIceCandidate(candidate); } catch { /* stale candidate */ }
      }
    }

    try {
      // Screen sharing is intentionally video-only. Keeping an unused audio
      // m-line adds negotiation complexity on older Android Chromium builds.
      pc.addTransceiver("video", { direction: "recvonly" });
    } catch {
      /* older WebRTC engine */
    }

    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      streamRef.current = stream;
      setRemoteStream(stream);

      // Browser/web screen share still uses the regular RTP video track.
      // Android uses the JPEG DataChannel below because this POS WebView can
      // negotiate a video track successfully while sending only black frames.
      if (capability !== "android_screen_share") {
        visualReceivedRef.current = true;
        setStatus("connected");
        setErrorText(null);
        setMinimized(false);
      }
    };

    const frameAssemblies = new Map<string, {
      n: number;
      w: number;
      h: number;
      at: number;
      parts: Array<string | undefined>;
      createdAt: number;
    }>();

    const pruneFrameAssemblies = () => {
      const cutoff = Date.now() - 5_000;
      for (const [id, assembly] of frameAssemblies) {
        if (assembly.createdAt < cutoff) frameAssemblies.delete(id);
      }
    };

    pc.ondatachannel = (event) => {
      if (event.channel.label !== "seza-screen-frames") return;
      const channel = event.channel;

      channel.onmessage = (messageEvent) => {
        if (disposed || typeof messageEvent.data !== "string") return;
        let message: any;
        try {
          message = JSON.parse(messageEvent.data);
        } catch {
          return;
        }

        if (message?.t === "meta" && typeof message.id === "string") {
          const total = Number(message.n);
          if (!Number.isFinite(total) || total < 1 || total > 64) return;
          frameAssemblies.set(message.id, {
            n: total,
            w: Number(message.w) || 0,
            h: Number(message.h) || 0,
            at: Number(message.at) || Date.now(),
            parts: new Array(total),
            createdAt: Date.now(),
          });
          pruneFrameAssemblies();
          return;
        }

        if (
          message?.t !== "chunk" ||
          typeof message.id !== "string" ||
          typeof message.d !== "string"
        ) {
          return;
        }

        let assembly = frameAssemblies.get(message.id);
        if (!assembly) {
          const total = Number(message.n);
          if (!Number.isFinite(total) || total < 1 || total > 128) return;
          assembly = {
            n: total,
            w: Number(message.w) || 0,
            h: Number(message.h) || 0,
            at: Number(message.at) || Date.now(),
            parts: new Array(total),
            createdAt: Date.now(),
          };
          frameAssemblies.set(message.id, assembly);
          pruneFrameAssemblies();
        }
        const index = Number(message.i);
        if (!Number.isInteger(index) || index < 0 || index >= assembly.n) return;
        assembly.parts[index] = message.d;

        if (!assembly.parts.every((part) => typeof part === "string")) return;

        const base64 = assembly.parts.join("");
        frameAssemblies.delete(message.id);
        if (!base64) return;

        const firstVisualFrame = !visualReceivedRef.current;
        visualReceivedRef.current = true;
        setFrameSrc(`data:image/jpeg;base64,${base64}`);
        setFrameInfo({ width: assembly.w, height: assembly.h, capturedAt: assembly.at });
        setStatus("connected");
        setErrorText(null);
        // Auto-open only for the first real frame. Once the admin minimizes the
        // viewer, later frames must not keep forcing the panel back open.
        if (firstVisualFrame) setMinimized(false);
      };
    };

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const signaling = openSignalingChannel(supabaseAdminAuth, channelToken, (message) => {
      if (!disposed)
        void handleSignal(message).catch((error) => console.error("[admin-rtc]", error));
    });

    pc.onconnectionstatechange = () => {
      if (disposed) return;
      if (pc.connectionState === "connected") {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = null;
        if (visualReceivedRef.current) {
          setStatus("connected");
          setErrorText(null);
        } else {
          setStatus("connecting");
          setErrorText("Connected to the POS. Waiting for screen pixels…");
        }
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        // Mobile networks and Android WebViews can momentarily drop the ICE
        // path while the MediaProjection encoder is still healthy. Keep the
        // viewer mounted, request renegotiation and only mark it failed if the
        // connection cannot recover after a short window.
        setStatus("connecting");
        setErrorText("Reconnecting to the merchant screen…");
        try { pc.restartIce(); } catch { /* older engine */ }
        signaling.send({ kind: "hello", from: "admin" }).catch(() => {});
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          if (disposed || pc.connectionState === "connected") return;
          setStatus("failed");
          setErrorText("The live video connection could not recover. The case and chat remain open.");
          setMinimized(true);
        }, 12_000);
      } else if (pc.connectionState === "closed" && explicitEndRef.current) {
        setStatus("ended");
      }
    };


    pc.onicecandidate = (event) => {
      if (event.candidate)
        signaling
          .send({ kind: "ice", from: "admin", candidate: event.candidate.toJSON() })
          .catch(() => {});
    };

    async function handleSignal(message: SignalPayload) {
      if (message.from === "admin") return;
      if (message.kind === "hello") {
        await signaling.send({ kind: "hello", from: "admin" });
      } else if (message.kind === "offer") {
        if (pc.signalingState !== "stable") {
          try {
            await pc.setLocalDescription({ type: "rollback" });
          } catch {
            /* noop */
          }
        }
        await pc.setRemoteDescription(message.sdp);
        await flushMerchantIce();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await signaling.send({ kind: "answer", from: "admin", sdp: pc.localDescription!.toJSON() });
      } else if (message.kind === "ice") {
        if (!pc.remoteDescription) pendingMerchantIce.push(message.candidate);
        else {
          try { await pc.addIceCandidate(message.candidate); } catch { /* stale candidate */ }
        }
      } else if (message.kind === "bye") {
        setStatus("ended");
        setErrorText(
          message.reason === "merchant_stopped_sharing"
            ? "Merchant stopped sharing their screen."
            : "Merchant ended the screen-sharing session.",
        );
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
      if (disposed || visualReceivedRef.current) return;

      if (pc.connectionState === "connected" && capability === "android_screen_share") {
        setStatus("failed");
        setErrorText(
          "Connected to the POS, but no screen pixels arrived. Re-share from the merchant device.",
        );
        // Keep failures compact so a dead screen-share attempt never covers
        // the Admin workspace. The status bubble can be dragged anywhere.
        setMinimized(true);
        return;
      }

      if (pc.connectionState !== "connected" && !streamRef.current) {
        setStatus("failed");
        setErrorText(
          "Waiting for the merchant timed out. Keep the case open and ask them to share again.",
        );
        setMinimized(true);
      }
    }, 25_000);

    return () => {
      disposed = true;
      clearInterval(helloTimer);
      clearTimeout(failTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      // Route navigation must not end the merchant's session. Only the close
      // button calls the server end action and broadcasts an explicit bye.
      signaling.close();
      frameAssemblies.clear();
      try {
        pc.close();
      } catch {
        /* noop */
      }
    };
  }, [sessionId, channelToken, capability]);

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

  const qualityColor =
    quality.label === "good"
      ? "text-emerald-500"
      : quality.label === "fair"
        ? "text-amber-500"
        : quality.label === "poor"
          ? "text-red-500"
          : "text-muted-foreground";

  const compact = minimized && !expanded;

  useEffect(() => {
    if (expanded) return;
    const frame = window.requestAnimationFrame(reclamp);
    return () => window.cancelAnimationFrame(frame);
  }, [compact, expanded, reclamp]);

  return (
    <div
      ref={panelRef}
      style={expanded ? undefined : floatingStyle}
      className={cn(
        "fixed z-50 overflow-hidden rounded-xl border bg-background shadow-2xl",
        expanded
          ? "inset-4"
          : compact
            ? "bottom-4 left-4 w-[310px] max-w-[calc(100vw-2rem)]"
            : "bottom-4 left-4 w-[440px] max-w-[calc(100vw-2rem)]",
      )}
    >
      <div className="flex items-center gap-2 border-b bg-muted/40 px-2 py-2">
        {!expanded && (
          <button
            type="button"
            {...dragHandleProps}
            className="grid h-7 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Move screen viewer"
            title="Drag to move"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            status === "connected" && "animate-pulse bg-emerald-500",
            status === "connecting" && "animate-pulse bg-blue-500",
            (status === "failed" || status === "ended") && "bg-red-500",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-semibold">
            {status === "connecting" && "Waiting for merchant screen…"}
            {status === "connected" && "Live · read-only"}
            {status === "failed" && "Screen connection unavailable"}
            {status === "ended" && "Screen sharing ended"}
            {capability === "android_screen_share" && (
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] uppercase text-primary">
                Android
              </span>
            )}
            {frameInfo?.width && frameInfo?.height ? (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                {frameInfo.width}×{frameInfo.height}
              </span>
            ) : null}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            {businessName ?? "Merchant"} · {employeeName ?? storeCode ?? "Register"} · {duration}
          </div>
        </div>
        {status === "connected" && (
          <span
            className={cn("hidden items-center gap-1 text-[10px] sm:inline-flex", qualityColor)}
          >
            {quality.label === "poor" ? (
              <WifiOff className="h-3 w-3" />
            ) : (
              <Wifi className="h-3 w-3" />
            )}
            {quality.label === "unknown" ? " - " : quality.label}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setMinimized((value) => !value)}
          aria-label={compact ? "Show screen" : "Minimize screen"}
        >
          {compact ? <MonitorUp className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setExpanded((value) => !value)}
          aria-label="Expand screen"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => void closeAndEnd()}
          aria-label="End screen sharing"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {!compact && (
        <div className="relative bg-black">
          {frameSrc ? (
            <img
              src={frameSrc}
              alt="Live merchant SEZA POS screen"
              draggable={false}
              className={cn(
                "block w-full bg-black object-contain select-none",
                expanded ? "h-[calc(100vh-7rem)]" : "aspect-[4/3] max-h-[70vh]",
              )}
              style={{ pointerEvents: "none" }}
            />
          ) : remoteStream && capability !== "android_screen_share" ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedData={(event) => {
                visualReceivedRef.current = true;
                setStatus("connected");
                setErrorText(null);
                setMinimized(false);
                void event.currentTarget.play().catch(() => {});
              }}
              className={cn(
                "block w-full bg-black object-contain",
                expanded ? "h-[calc(100vh-7rem)]" : "aspect-[4/3] max-h-[70vh]",
              )}
              style={{ pointerEvents: "none" }}
            />
          ) : (
            <div
              className={cn(
                "flex items-center justify-center bg-muted/90 p-6 text-center",
                expanded ? "h-[calc(100vh-7rem)]" : "min-h-36",
              )}
            >
              <div className="max-w-sm text-sm">
                {status === "connecting" &&
                  (errorText || "The merchant accepted. Waiting for the first live frame…")}
                {status === "failed" && (
                  <>
                    <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-red-500" />
                    <div className="font-medium">No video received</div>
                    <div className="mt-1 text-xs text-muted-foreground">{errorText}</div>
                  </>
                )}
                {status === "ended" && (
                  <>
                    <div className="font-medium">Session ended</div>
                    <div className="mt-1 text-xs text-muted-foreground">{errorText}</div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {!compact && frameInfo && (
        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
          <span>{frameInfo.width}×{frameInfo.height} · 4 fps</span>
          <span>{Math.max(0, Math.round((Date.now() - frameInfo.capturedAt) / 1000))}s frame age</span>
        </div>
      )}
    </div>
  );
}
