// TypeScript bridge to the native SezaScreenCapture Capacitor plugin.
//
// Wraps `registerPlugin` so callers can request MediaProjection consent,
// start / stop the encoder, and consume H.264 NAL frames as async events.
//
// This bridge is imported ONLY from Android-only code paths — the module
// throws immediately on web hosts so mis-use fails loudly.

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type EncoderState = "starting" | "active" | "paused" | "stopped" | "permission_revoked";

export type CodecInfo = {
  mime: string;
  width: number;
  height: number;
  /** base64-encoded SPS NAL (with start code) */
  sps?: string;
  /** base64-encoded PPS NAL (with start code) */
  pps?: string;
};

export type FramePacket = {
  /** base64-encoded H.264 NAL unit(s) (Annex-B start codes included) */
  data: string;
  keyframe: boolean;
  ptsUs: number;
};

interface SezaScreenCapturePlugin {
  requestPermission(): Promise<{ granted: boolean }>;
  start(opts: { maxWidth?: number; maxFps?: number; bitrateKbps?: number }): Promise<void>;
  stop(): Promise<void>;
  addListener(event: "state", cb: (e: { state: EncoderState }) => void): Promise<PluginListenerHandle>;
  addListener(event: "codec", cb: (e: CodecInfo) => void): Promise<PluginListenerHandle>;
  addListener(event: "frame", cb: (e: FramePacket) => void): Promise<PluginListenerHandle>;
  addListener(event: "error", cb: (e: { message: string }) => void): Promise<PluginListenerHandle>;
}

const impl = registerPlugin<SezaScreenCapturePlugin>("SezaScreenCapture");

export function isNativeScreenCaptureAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

export const nativeScreenCapture = {
  async requestPermission() {
    if (!isNativeScreenCaptureAvailable()) return { granted: false };
    return impl.requestPermission();
  },
  async start(opts: { maxWidth?: number; maxFps?: number; bitrateKbps?: number } = {}) {
    if (!isNativeScreenCaptureAvailable()) throw new Error("Not on Android");
    await impl.start({
      maxWidth: opts.maxWidth ?? 720,
      maxFps: opts.maxFps ?? 24,
      bitrateKbps: opts.bitrateKbps ?? 500,
    });
  },
  async stop() {
    if (!isNativeScreenCaptureAvailable()) return;
    try { await impl.stop(); } catch { /* noop */ }
  },
  onState(cb: (s: EncoderState) => void) {
    return impl.addListener("state", (e) => cb(e.state));
  },
  onCodec(cb: (c: CodecInfo) => void) {
    return impl.addListener("codec", cb);
  },
  onFrame(cb: (f: FramePacket) => void) {
    return impl.addListener("frame", cb);
  },
  onError(cb: (m: string) => void) {
    return impl.addListener("error", (e) => cb(e.message));
  },
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Feature-detect whether the WebView can:
 *   - decode H.264 with WebCodecs
 *   - and generate a MediaStreamTrack from produced frames
 *
 * Both are required to publish the native-encoded stream over WebRTC without
 * shipping a decoder in native.
 */
export function canPipeToMediaStream(): boolean {
  return (
    typeof (globalThis as unknown as { VideoDecoder?: unknown }).VideoDecoder !== "undefined" &&
    typeof (globalThis as unknown as { MediaStreamTrackGenerator?: unknown }).MediaStreamTrackGenerator !==
      "undefined"
  );
}

/**
 * Build a decoded MediaStream from native H.264 frames. Uses WebCodecs
 * `VideoDecoder` → `VideoFrame` and pipes into a `MediaStreamTrackGenerator`.
 *
 * The caller feeds encoded packets via `push()` and codec init via `configure()`.
 * Stop with `close()`.
 */
export function createDecodedStream(): {
  stream: MediaStream;
  configure: (codec: CodecInfo) => void;
  push: (pkt: FramePacket) => void;
  close: () => void;
} | null {
  if (!canPipeToMediaStream()) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TrackGen = (globalThis as any).MediaStreamTrackGenerator;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Decoder = (globalThis as any).VideoDecoder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const EVC = (globalThis as any).EncodedVideoChunk;

  const generator = new TrackGen({ kind: "video" });
  const writer = generator.writable.getWriter();
  const stream = new MediaStream([generator]);
  let closed = false;
  let configured = false;

  const decoder = new Decoder({
    output: (frame: VideoFrame) => {
      if (closed) { frame.close(); return; }
      // Drop frames if the writer isn't ready — better than falling behind.
      writer.write(frame).catch(() => { frame.close(); });
    },
    error: (e: unknown) => {
      console.warn("[nativeScreenCapture] decoder error", e);
    },
  });

  function toAvcCodecString(spsB64: string): string {
    try {
      const sps = base64ToBytes(spsB64);
      // Skip Annex-B start code if present.
      let off = 0;
      if (sps[0] === 0 && sps[1] === 0 && sps[2] === 1) off = 3;
      else if (sps[0] === 0 && sps[1] === 0 && sps[2] === 0 && sps[3] === 1) off = 4;
      // Skip NAL header byte.
      off += 1;
      const profile = sps[off] ?? 0x42;
      const constraints = sps[off + 1] ?? 0;
      const level = sps[off + 2] ?? 0x1f;
      const hex = (n: number) => n.toString(16).padStart(2, "0");
      return `avc1.${hex(profile)}${hex(constraints)}${hex(level)}`;
    } catch {
      return "avc1.42e01f";
    }
  }

  return {
    stream,
    configure(codec) {
      if (closed) return;
      const codecString = codec.sps ? toAvcCodecString(codec.sps) : "avc1.42e01f";
      try {
        decoder.configure({
          codec: codecString,
          codedWidth: codec.width,
          codedHeight: codec.height,
          optimizeForLatency: true,
          hardwareAcceleration: "prefer-hardware",
        });
        configured = true;
      } catch (e) {
        console.warn("[nativeScreenCapture] configure failed", e);
      }
    },
    push(pkt) {
      if (closed || !configured) return;
      try {
        const bytes = base64ToBytes(pkt.data);
        const chunk = new EVC({
          type: pkt.keyframe ? "key" : "delta",
          timestamp: pkt.ptsUs,
          data: bytes,
        });
        decoder.decode(chunk);
      } catch (e) {
        // A stray delta before the first keyframe is expected — swallow.
        if (import.meta.env.DEV) console.debug("[nativeScreenCapture] decode skip", e);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      try { decoder.close(); } catch { /* noop */ }
      try { writer.close(); } catch { /* noop */ }
      try { generator.stop?.(); } catch { /* noop */ }
    },
  };
}
