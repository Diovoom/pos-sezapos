// Shared WebRTC / signaling helpers for the merchant ↔ platform-admin
// support screen-share session. Signaling is done exclusively via a Supabase
// Realtime broadcast channel keyed by the support session id — Realtime is
// NOT used to send any media. Media flows peer-to-peer over WebRTC using a
// public STUN server; TURN can be added later by extending `iceServers`
// without changing anything else.

import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

export const RTC_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  // Add TURN servers here when available:
  // { urls: "turn:turn.example.com:3478", username: "...", credential: "..." },
];

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: RTC_ICE_SERVERS,
  bundlePolicy: "max-bundle",
};

export type SignalRole = "merchant" | "admin";

export type SignalPayload =
  | { kind: "hello"; from: SignalRole }
  | { kind: "bye"; from: SignalRole; reason?: string }
  | { kind: "offer"; from: SignalRole; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; from: SignalRole; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; from: SignalRole; candidate: RTCIceCandidateInit };

// The channel name is derived from an unguessable per-session token
// (admin_support_sessions.channel_token) — NOT the session UUID — so that
// only participants who can read the session row (assigned admin + target
// store's employees, per RLS) can compute the topic and join the signaling
// channel.
export function supportChannelName(channelToken: string): string {
  return `support-rtc-${channelToken}`;
}

/**
 * Create a shared broadcast channel for signaling. Both merchant and admin
 * use the same channel name so their offer/answer/ICE messages meet.
 * `self: false` prevents echoing our own messages back to ourselves.
 */
export function openSignalingChannel(
  client: SupabaseClient,
  channelToken: string,
  onMessage: (msg: SignalPayload) => void,
): { channel: RealtimeChannel; send: (msg: SignalPayload) => Promise<void>; close: () => void } {
  const channel = client.channel(supportChannelName(channelToken), {
    config: { broadcast: { self: false, ack: false } },
  });

  channel.on("broadcast", { event: "signal" }, (payload) => {
    const msg = payload.payload as SignalPayload | undefined;
    if (msg && typeof msg === "object" && "kind" in msg) {
      onMessage(msg);
    }
  });

  const subscribed = new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        reject(new Error(`signaling channel: ${status}`));
      }
    });
  });

  return {
    channel,
    send: async (msg) => {
      try {
        await subscribed;
      } catch {
        // If subscribe failed, we let the send below fail as well.
      }
      await channel.send({ type: "broadcast", event: "signal", payload: msg });
    },
    close: () => {
      try {
        client.removeChannel(channel);
      } catch {
        /* noop */
      }
    },
  };
}

/**
 * Sample connection quality from RTCPeerConnection stats. Returns a coarse
 * bucket (good / fair / poor) plus the numbers so the UI can show detail.
 */
export type ConnectionQuality = {
  label: "good" | "fair" | "poor" | "unknown";
  packetsLost: number;
  packetsReceived: number;
  bitrateKbps: number;
};

export async function sampleQuality(
  pc: RTCPeerConnection,
  prev: { bytes: number; ts: number } | null,
): Promise<{ q: ConnectionQuality; snapshot: { bytes: number; ts: number } | null }> {
  const stats = await pc.getStats();
  let inboundBytes = 0;
  let packetsLost = 0;
  let packetsReceived = 0;
  let ts = Date.now();
  stats.forEach((report) => {
    if (report.type === "inbound-rtp" && (report as any).kind === "video") {
      inboundBytes += Number((report as any).bytesReceived ?? 0);
      packetsLost += Number((report as any).packetsLost ?? 0);
      packetsReceived += Number((report as any).packetsReceived ?? 0);
      ts = Number((report as any).timestamp ?? ts);
    }
  });

  let bitrateKbps = 0;
  if (prev && ts > prev.ts) {
    const deltaBytes = Math.max(0, inboundBytes - prev.bytes);
    const deltaSec = (ts - prev.ts) / 1000;
    if (deltaSec > 0) bitrateKbps = Math.round((deltaBytes * 8) / 1000 / deltaSec);
  }

  const total = packetsLost + packetsReceived;
  const lossPct = total > 0 ? (packetsLost / total) * 100 : 0;
  let label: ConnectionQuality["label"] = "unknown";
  if (packetsReceived > 0) {
    if (lossPct < 2 && bitrateKbps > 200) label = "good";
    else if (lossPct < 8) label = "fair";
    else label = "poor";
  }

  return {
    q: { label, packetsLost, packetsReceived, bitrateKbps },
    snapshot: { bytes: inboundBytes, ts },
  };
}
