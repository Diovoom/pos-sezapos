// Android merchant-side live screen share.
//
// Bridges the native MediaProjection encoder (SezaScreenCapturePlugin) to a
// WebRTC RTCPeerConnection that publishes the merchant's screen to the
// platform-admin viewer over the existing signaling channel.
//
// Media flow:
//   Native encoder → base64 H.264 NALs → JS bridge → WebCodecs VideoDecoder
//   → MediaStreamTrackGenerator → RTCPeerConnection sender → admin.
//
// View-only invariants:
//   - Peer connection creates ONLY a sendonly video transceiver; no data
//     channel, no audio, no receive side.
//   - Merchant sees a persistent banner and a native foreground notification
//     while sharing; either surface stops the session.
//   - The encoder pauses when the app is not resumed (Android lifecycle).
//
// The component takes ownership of the session's lifetime after the merchant
// accepts. It calls `/api/public/pos/support-end` on any terminal event so
// the DB row is closed and audit rows are written.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, API_BASE_URL, getBearer } from "../supabase";
import {
  nativeScreenCapture,
  createDecodedStream,
  canPipeToMediaStream,
  isNativeScreenCaptureAvailable,
  type EncoderState,
  type CodecInfo,
  type FramePacket,
} from "./nativeScreenCapture";
import {
  RTC_CONFIG,
  openSignalingChannel,
  type SignalPayload,
} from "@/lib/support/webrtc";
import { getActivityState } from "../lifecycle/activityState";
import { toast } from "sonner";
import { Eye } from "lucide-react";

type Props = {
  sessionId: string;
  channelToken: string;
  expiresAtIso: string;
  onEnded: (reason: string) => void;
};

async function postEnd(sessionId: string): Promise<void> {
  try {
    const token = await getBearer();
    if (!token) return;
    await fetch(`${API_BASE_URL}/api/public/pos/support-end`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionId }),
      keepalive: true,
    });
  } catch { /* best-effort */ }
}

export function AndroidScreenShare({ sessionId, channelToken, expiresAtIso, onEnded }: Props) {
  const [encoderState, setEncoderState] = useState<EncoderState>("starting");
  const [durationLabel, setDurationLabel] = useState("00:00");
  const [tick, setTick] = useState(0);
  const startedAtRef = useRef<number>(Date.now());
  const endedRef = useRef(false);

  const end = useCallback(
    (reason: string) => {
      if (endedRef.current) return;
      endedRef.current = true;
      void postEnd(sessionId);
      onEnded(reason);
    },
    [onEnded, sessionId],
  );

  // Duration ticker.
  useEffect(() => {
    const iv = setInterval(() => {
      const s = Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000));
      setDurationLabel(
        `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`,
      );
      setTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // Auto-expire when the session's server-side TTL elapses.
  useEffect(() => {
    void tick;
    const remainingMs = new Date(expiresAtIso).getTime() - Date.now();
    if (remainingMs <= 0) {
      end("session_expired");
    }
  }, [expiresAtIso, end, tick]);

  // Core WebRTC + native encoder pipeline.
  useEffect(() => {
    let disposed = false;

    if (!isNativeScreenCaptureAvailable()) {
      end("unsupported_platform");
      return;
    }
    if (!canPipeToMediaStream()) {
      toast.error("This device's WebView is too old for live screen sharing.");
      end("webcodecs_unavailable");
      return;
    }

    const decoded = createDecodedStream();
    if (!decoded) {
      end("webcodecs_unavailable");
      return;
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    // Single sendonly transceiver — no receive side, no data channel.
    const videoTrack = decoded.stream.getVideoTracks()[0]!;
    pc.addTransceiver(videoTrack, { direction: "sendonly", streams: [decoded.stream] });

    const signaling = openSignalingChannel(supabase, channelToken, (msg) => {
      if (disposed) return;
      handleSignal(msg).catch((e) => console.warn("[android-rtc] signal", e));
    });

    let seenAdminHello = false;
    let makingOffer = false;
    let firstConnectedLogged = false;

    async function sendOffer() {
      if (disposed || makingOffer) return;
      makingOffer = true;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await signaling.send({
          kind: "offer",
          from: "merchant",
          sdp: pc.localDescription!.toJSON(),
        });
      } catch (e) {
        console.warn("[android-rtc] offer failed", e);
      } finally {
        makingOffer = false;
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        signaling
          .send({ kind: "ice", from: "merchant", candidate: e.candidate.toJSON() })
          .catch(() => {});
      }
    };

    pc.onnegotiationneeded = () => { if (seenAdminHello) void sendOffer(); };

    pc.onconnectionstatechange = () => {
      if (disposed) return;
      const st = pc.connectionState;
      if (st === "connected" && !firstConnectedLogged) {
        firstConnectedLogged = true;
      }
      if (st === "failed") end("connection_lost");
      if (st === "disconnected") {
        // Give ICE a chance to restore itself before giving up.
        setTimeout(() => {
          if (!disposed && pc.connectionState === "disconnected") end("network_timeout");
        }, 15_000);
      }
    };

    async function handleSignal(msg: SignalPayload) {
      if (msg.from === "merchant") return;
      switch (msg.kind) {
        case "hello":
          seenAdminHello = true;
          await sendOffer();
          break;
        case "answer":
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(msg.sdp);
          }
          break;
        case "ice":
          try { await pc.addIceCandidate(msg.candidate); }
          catch (e) { console.warn("[android-rtc] addIce", e); }
          break;
        case "bye":
          end("admin_ended");
          break;
      }
    }

    // Native encoder wiring.
    const listenerHandles: Array<{ remove: () => Promise<void> }> = [];
    let stateWatchInterval: ReturnType<typeof setInterval> | null = null;
    let backgrounded = false;

    (async () => {
      try {
        listenerHandles.push(
          await nativeScreenCapture.onState((s) => {
            setEncoderState(s);
            if (s === "permission_revoked") end("merchant_stopped_sharing");
            if (s === "stopped" && !endedRef.current) end("merchant_stopped_sharing");
          }),
        );
        listenerHandles.push(
          await nativeScreenCapture.onCodec((c: CodecInfo) => decoded.configure(c)),
        );
        listenerHandles.push(
          await nativeScreenCapture.onFrame((f: FramePacket) => decoded.push(f)),
        );
        listenerHandles.push(
          await nativeScreenCapture.onError((m) => {
            console.warn("[android-rtc] encoder error", m);
          }),
        );

        // Announce presence before starting — an admin already waiting will
        // reply "hello" and trigger the initial offer.
        await signaling.send({ kind: "hello", from: "merchant" });
        await nativeScreenCapture.start({ maxWidth: 720, maxFps: 24, bitrateKbps: 500 });
      } catch (e) {
        console.error("[android-rtc] start failed", e);
        toast.error("Could not start screen sharing.");
        end("start_failed");
      }
    })();

    // Poll app state so we auto-stop when the merchant backgrounds the app.
    // The foreground service keeps encoding, but privacy-wise we prefer to
    // pause when the POS is not on-screen.
    stateWatchInterval = setInterval(() => {
      const bg = !!getActivityState().backgroundedAt;
      if (bg && !backgrounded) {
        backgrounded = true;
        // Best-effort: end the whole session on background so support cannot
        // watch a user's home screen or another app. Cheaper than a pause
        // channel and matches the plan's "never allow background viewing".
        end("app_backgrounded");
      }
    }, 1500);

    return () => {
      disposed = true;
      if (stateWatchInterval) clearInterval(stateWatchInterval);
      for (const h of listenerHandles) { void h.remove().catch(() => {}); }
      try {
        signaling.send({ kind: "bye", from: "merchant", reason: "merchant_unmounted" }).catch(() => {});
      } catch { /* noop */ }
      signaling.close();
      try { decoded.close(); } catch { /* noop */ }
      try { pc.close(); } catch { /* noop */ }
      void nativeScreenCapture.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelToken, sessionId]);

  const stateLabel =
    encoderState === "active"
      ? "Sharing"
      : encoderState === "starting"
        ? "Starting…"
        : encoderState === "paused"
          ? "Paused"
          : encoderState === "permission_revoked"
            ? "Permission ended"
            : "Stopping";

  return (
    <div
      className="bg-red-600 text-white px-2 h-6 flex items-center gap-1.5 text-[11px] leading-none"
      role="status"
      aria-live="polite"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse shrink-0" aria-hidden />
      <span className="font-semibold shrink-0">Screen sharing active</span>
      <span className="font-mono tabular-nums ml-auto shrink-0">{durationLabel}</span>
      <button
        type="button"
        onClick={() => end("merchant_stopped")}
        className="ml-1 rounded bg-white/20 hover:bg-white/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0"
      >
        Stop
      </button>
    </div>
  );
}
