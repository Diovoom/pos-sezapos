import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RTC_CONFIG, openSignalingChannel, type SignalPayload } from "@/lib/support/webrtc";
import { toast } from "sonner";

type Props = {
  sessionId: string;
  stream: MediaStream;
  onEnded: (reason: string) => void;
};

/**
 * Merchant-side WebRTC publisher. Owns the RTCPeerConnection that carries the
 * captured display MediaStream up to the platform-admin viewer. Signaling is
 * carried over the shared Supabase Realtime broadcast channel; media flows
 * peer-to-peer.
 *
 * Read-only by construction: this side never wires any input events from the
 * admin — the admin's peer connection has no DataChannel and receives only
 * media tracks.
 */
export function MerchantScreenShare({ sessionId, stream, onEnded }: Props) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    // Publish every track from the captured display stream.
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
    }

    // If the user hits the browser's native "Stop sharing" affordance, tear down.
    for (const track of stream.getTracks()) {
      track.addEventListener("ended", () => end("merchant_stopped_sharing"));
    }

    const signaling = openSignalingChannel(supabase, sessionId, (msg) => {
      if (disposed) return;
      handleSignal(msg).catch((e) => console.error("[merchant-rtc]", e));
    });

    let makingOffer = false;
    async function sendOffer() {
      if (makingOffer) return;
      makingOffer = true;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await signaling.send({ kind: "offer", from: "merchant", sdp: pc.localDescription!.toJSON() });
      } catch (e) {
        console.error("[merchant-rtc] offer failed", e);
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

    pc.onnegotiationneeded = () => {
      // Wait until admin has said hello — otherwise the offer is broadcast
      // into an empty room and lost.
      if (seenAdminHello) void sendOffer();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        end("connection_lost");
      }
    };

    let seenAdminHello = false;
    async function handleSignal(msg: SignalPayload) {
      if (msg.from === "merchant") return;
      switch (msg.kind) {
        case "hello":
          seenAdminHello = true;
          // Fresh offer for the admin.
          await sendOffer();
          break;
        case "answer":
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(msg.sdp);
          }
          break;
        case "ice":
          try {
            await pc.addIceCandidate(msg.candidate);
          } catch (e) {
            console.warn("[merchant-rtc] addIceCandidate failed", e);
          }
          break;
        case "bye":
          end("admin_ended");
          break;
      }
    }

    // Announce ourselves in case admin is already listening.
    signaling.send({ kind: "hello", from: "merchant" }).catch(() => {});

    function end(reason: string) {
      if (endedRef.current) return;
      endedRef.current = true;
      try {
        signaling.send({ kind: "bye", from: "merchant", reason }).catch(() => {});
      } catch {
        /* noop */
      }
      try {
        for (const t of stream.getTracks()) t.stop();
      } catch {
        /* noop */
      }
      try {
        pc.close();
      } catch {
        /* noop */
      }
      signaling.close();
      onEnded(reason);
    }

    // Expose end() for cleanup below.
    (pc as any).__end = end;

    return () => {
      disposed = true;
      const e = (pc as any).__end as ((r: string) => void) | undefined;
      if (e) e("merchant_unmounted");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Tiny live self-view so the merchant can confirm what's being shared.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  // Surface a soft toast when the browser stops the capture unexpectedly.
  useEffect(() => {
    const t = stream.getVideoTracks()[0];
    if (!t) return;
    const onEnd = () => toast.message("Screen sharing stopped");
    t.addEventListener("ended", onEnd);
    return () => t.removeEventListener("ended", onEnd);
  }, [stream]);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-52 rounded-lg border bg-background/95 shadow-lg backdrop-blur">
      <div className="px-3 py-1.5 text-[11px] font-medium border-b flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" aria-hidden />
          Sharing screen with SEZA Support
        </span>
      </div>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full aspect-video bg-black rounded-b-lg"
      />
    </div>
  );
}
