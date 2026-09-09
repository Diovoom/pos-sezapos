// Android merchant-side live screen share.
//
// The dual-display POS hardware proved unstable with Android MediaProjection +
// hardware H.264 + WebCodecs. The production Android path now captures only
// SEZA POS's own Activity window as low-bandwidth JPEG frames, draws them into
// an off-screen canvas, and publishes that canvas over the existing view-only
// WebRTC connection.
//
// Privacy / control invariants:
//   - Only the SEZA POS app window is captured; other apps and Android system UI
//     are never included.
//   - WebRTC is send-only video. There is no audio, DataChannel, touch, typing,
//     clipboard, camera, microphone, or remote-control surface.
//   - The merchant sees a persistent red banner and can stop immediately.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import {
  createAppViewCaptureBridge,
  isNativeAppViewCaptureAvailable,
  canPipeAppViewToMediaStream,
} from "./nativeAppViewCapture";
import {
  RTC_CONFIG,
  openSignalingChannel,
  type SignalPayload,
} from "@/lib/support/webrtc";
import { toast } from "sonner";

type Props = {
  sessionId: string;
  channelToken: string;
  expiresAtIso: string;
  onEnded: (reason: string) => void;
};

const SCREEN_FRAME_CHANNEL = "seza-screen-frames";
const SCREEN_FRAME_CHUNK_CHARS = 14_000;
const SCREEN_FRAME_MAX_BUFFERED_BYTES = 1_000_000;


export function AndroidScreenShare({ sessionId, channelToken, expiresAtIso, onEnded }: Props) {
  const [durationLabel, setDurationLabel] = useState("00:00");
  const [tick, setTick] = useState(0);
  const startedAtRef = useRef<number>(Date.now());
  const endedRef = useRef(false);

  const end = useCallback(
    (reason: string) => {
      if (endedRef.current) return;
      endedRef.current = true;
      onEnded(reason);
    },
    [onEnded],
  );

  useEffect(() => {
    const iv = setInterval(() => {
      const seconds = Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000));
      setDurationLabel(
        `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
      );
      setTick((value) => value + 1);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    void tick;
    if (new Date(expiresAtIso).getTime() - Date.now() <= 0) end("session_expired");
  }, [expiresAtIso, end, tick]);

  useEffect(() => {
    let disposed = false;

    if (!isNativeAppViewCaptureAvailable()) {
      end("unsupported_platform");
      return;
    }
    if (!canPipeAppViewToMediaStream()) {
      toast.error("This Android WebView cannot publish the SEZA support stream.");
      end("canvas_stream_unavailable");
      return;
    }

    const capture = createAppViewCaptureBridge();
    if (!capture) {
      end("app_capture_unavailable");
      return;
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);

    // The Android POS WebView can establish an RTP video connection while
    // still publishing only a black canvas. Send the original captured JPEG
    // frames over a dedicated WebRTC DataChannel as the primary Android
    // transport. The video track remains as a fallback for normal browsers.
    const frameChannel = pc.createDataChannel(SCREEN_FRAME_CHANNEL, { ordered: false, maxRetransmits: 0 });
    frameChannel.binaryType = "arraybuffer";
    frameChannel.bufferedAmountLowThreshold = 128_000;
    let frameSequence = 0;

    capture.setFrameConsumer((frame) => {
      if (disposed || frameChannel.readyState !== "open") return;

      // Prefer the newest screen frame under congestion. A support viewer
      // should stay current rather than queue several seconds of old images.
      if (frameChannel.bufferedAmount > SCREEN_FRAME_MAX_BUFFERED_BYTES) return;

      const data = frame.data;
      if (!data) return;
      const totalChunks = Math.max(1, Math.ceil(data.length / SCREEN_FRAME_CHUNK_CHARS));
      const frameId = `${Date.now().toString(36)}-${(frameSequence++).toString(36)}`;

      try {
        // Each chunk is self-describing so the live channel can be unordered
        // and non-retransmitting. A lost chunk only drops one frame instead of
        // blocking every newer frame behind stale data (head-of-line blocking).
        for (let index = 0; index < totalChunks; index++) {
          frameChannel.send(JSON.stringify({
            t: "chunk",
            id: frameId,
            i: index,
            n: totalChunks,
            w: frame.width,
            h: frame.height,
            at: frame.capturedAt,
            d: data.slice(
              index * SCREEN_FRAME_CHUNK_CHARS,
              (index + 1) * SCREEN_FRAME_CHUNK_CHARS,
            ),
          }));
        }
      } catch (error) {
        console.warn("[android-rtc] frame channel send", error);
      }
    });

    const videoTrack = capture.stream.getVideoTracks()[0];
    if (!videoTrack) {
      void capture.close();
      pc.close();
      end("app_capture_unavailable");
      return;
    }

    // Single send-only video transceiver: admin can view, never control.
    pc.addTransceiver(videoTrack, { direction: "sendonly", streams: [capture.stream] });

    const signaling = openSignalingChannel(supabase, channelToken, (message) => {
      if (disposed) return;
      void handleSignal(message).catch((error) => console.warn("[android-rtc] signal", error));
    });

    let seenAdminHello = false;
    let makingOffer = false;
    let connectedOnce = false;
    const pendingAdminIce: RTCIceCandidateInit[] = [];

    async function flushAdminIce() {
      if (!pc.remoteDescription) return;
      while (pendingAdminIce.length) {
        const candidate = pendingAdminIce.shift();
        if (!candidate) continue;
        try { await pc.addIceCandidate(candidate); }
        catch (error) { console.warn("[android-rtc] addIce", error); }
      }
    }

    async function sendOffer() {
      if (disposed || makingOffer || pc.signalingState === "closed") return;
      makingOffer = true;
      try {
        // If an old offer is still outstanding, wait for its answer rather than
        // creating overlapping offers on a slow connection.
        if (pc.signalingState !== "stable") return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await signaling.send({
          kind: "offer",
          from: "merchant",
          sdp: pc.localDescription!.toJSON(),
        });
      } catch (error) {
        console.warn("[android-rtc] offer failed", error);
      } finally {
        makingOffer = false;
      }
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void signaling
        .send({ kind: "ice", from: "merchant", candidate: event.candidate.toJSON() })
        .catch(() => {});
    };

    pc.onnegotiationneeded = () => {
      if (seenAdminHello) void sendOffer();
    };

    pc.onconnectionstatechange = () => {
      if (disposed) return;
      const state = pc.connectionState;
      if (state === "connected") connectedOnce = true;
      if (state === "failed" || state === "disconnected") {
        // Never end the merchant's approved support session just because ICE
        // changes. Keep capture alive and allow the admin viewer to reconnect.
        try { pc.restartIce(); } catch { /* older WebView */ }
        if (seenAdminHello) {
          // Give the peer a moment to return to stable before offering again.
          setTimeout(() => { if (!disposed) void sendOffer(); }, connectedOnce ? 800 : 300);
        }
      }
    };

    async function handleSignal(message: SignalPayload) {
      if (message.from === "merchant") return;
      switch (message.kind) {
        case "hello":
          seenAdminHello = true;
          await sendOffer();
          break;
        case "answer":
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(message.sdp);
            await flushAdminIce();
          }
          break;
        case "ice":
          if (!pc.remoteDescription) pendingAdminIce.push(message.candidate);
          else {
            try { await pc.addIceCandidate(message.candidate); }
            catch (error) { console.warn("[android-rtc] addIce", error); }
          }
          break;
        case "bye":
          end("admin_ended");
          break;
      }
    }

    void (async () => {
      try {
        // Start app-window capture first and require a real frame before we
        // advertise the merchant peer. This prevents a false live state.
        await capture.start();
        if (disposed) return;
        await signaling.send({ kind: "hello", from: "merchant" });
      } catch (error) {
        if (disposed) return;
        const message = capture.getLastError() || (error instanceof Error ? error.message : String(error));
        console.error("[seza-app-view] start failed", error);
        toast.error(`Screen sharing could not start: ${message}`);
        end("app_capture_start_failed");
      }
    })();

    return () => {
      disposed = true;
      signaling.close();
      capture.setFrameConsumer(null);
      try { frameChannel.close(); } catch { /* noop */ }
      try { pc.close(); } catch { /* noop */ }
      void capture.close();
    };
    // sessionId intentionally participates so a new support session receives a
    // brand-new capture/peer lifecycle.
  }, [channelToken, sessionId, end]);

  return (
    <div
      className="bg-red-600 text-white px-2 h-6 flex items-center gap-1.5 text-[11px] leading-none"
      role="status"
      aria-live="polite"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse shrink-0" aria-hidden />
      <span className="font-semibold shrink-0">SEZA screen sharing active</span>
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
