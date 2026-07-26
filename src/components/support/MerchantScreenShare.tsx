import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RTC_CONFIG, openSignalingChannel, type SignalPayload } from "@/lib/support/webrtc";

/**
 * Merchant-side, view-only WebRTC publisher. It intentionally renders no
 * local preview: the persistent SEZA Support status pill is enough and does
 * not cover the register while the merchant works.
 */
export function MerchantScreenShare({
  channelToken,
  stream,
  onEnded,
}: {
  channelToken: string;
  stream: MediaStream;
  onEnded: (reason: string) => void;
}) {
  const onEndedRef = useRef(onEnded);
  const endedRef = useRef(false);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    let disposed = false;
    let seenAdminHello = false;
    let makingOffer = false;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const signaling = openSignalingChannel(supabase, channelToken, (msg) => {
      if (!disposed)
        void handleSignal(msg).catch((error) => console.error("[merchant-rtc]", error));
    });

    const end = (reason: string, notify = true) => {
      if (endedRef.current) return;
      endedRef.current = true;
      if (notify) signaling.send({ kind: "bye", from: "merchant", reason }).catch(() => {});
      signaling.close();
      try {
        pc.close();
      } catch {
        /* noop */
      }
      if (notify) onEndedRef.current(reason);
    };

    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
      track.addEventListener("ended", () => end("merchant_stopped_sharing"), { once: true });
    }

    async function sendOffer() {
      if (makingOffer || disposed || pc.signalingState === "closed") return;
      makingOffer = true;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await signaling.send({
          kind: "offer",
          from: "merchant",
          sdp: pc.localDescription!.toJSON(),
        });
      } finally {
        makingOffer = false;
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate)
        signaling
          .send({ kind: "ice", from: "merchant", candidate: event.candidate.toJSON() })
          .catch(() => {});
    };
    pc.onnegotiationneeded = () => {
      if (seenAdminHello) void sendOffer();
    };
    pc.onconnectionstatechange = () => {
      // A brief WebRTC "disconnected" state is normal on mobile network
      // changes. Only fail the session when the peer connection says failed.
      if (pc.connectionState === "failed") end("connection_lost");
    };

    async function handleSignal(msg: SignalPayload) {
      if (msg.from === "merchant") return;
      if (msg.kind === "hello") {
        seenAdminHello = true;
        await sendOffer();
      } else if (msg.kind === "answer" && pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(msg.sdp);
      } else if (msg.kind === "ice") {
        try {
          await pc.addIceCandidate(msg.candidate);
        } catch {
          /* candidate can arrive early */
        }
      } else if (msg.kind === "bye") {
        end("admin_ended");
      }
    }

    signaling.send({ kind: "hello", from: "merchant" }).catch(() => {});

    return () => {
      disposed = true;
      // Unmounting a route/view is not the same as the merchant ending the
      // support session. Close only this local peer; the persistent listener
      // can reconnect without falsely ending the server session.
      end("component_unmounted", false);
    };
  }, [channelToken, stream]);

  return null;
}
