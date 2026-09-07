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
 * Feature-detect the Android WebView path used for live support sharing.
 * We intentionally use canvas.captureStream instead of MediaStreamTrackGenerator
 * because captureStream is available on many WebViews where TrackGenerator is not.
 */
export function canPipeToMediaStream(): boolean {
  if (typeof document === "undefined") return false;
  const g = globalThis as unknown as {
    VideoDecoder?: unknown;
    EncodedVideoChunk?: unknown;
  };
  const canvas = document.createElement("canvas") as HTMLCanvasElement & {
    captureStream?: (fps?: number) => MediaStream;
  };
  return (
    typeof g.VideoDecoder !== "undefined" &&
    typeof g.EncodedVideoChunk !== "undefined" &&
    typeof canvas.captureStream === "function"
  );
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/**
 * Decode the native H.264 MediaProjection stream into an off-screen canvas,
 * then publish that canvas as a normal MediaStream for WebRTC. No merchant
 * preview is rendered and no input/control channel is created.
 */
export function createDecodedStream(): {
  stream: MediaStream;
  configure: (codec: CodecInfo) => void;
  push: (pkt: FramePacket) => void;
  close: () => void;
} | null {
  if (!canPipeToMediaStream()) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Decoder = (globalThis as any).VideoDecoder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const EVC = (globalThis as any).EncodedVideoChunk;

  const canvas = document.createElement("canvas") as HTMLCanvasElement & {
    captureStream: (fps?: number) => MediaStream;
  };
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true } as any);
  if (!ctx) return null;
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const stream = canvas.captureStream(15);
  let closed = false;
  let configured = false;
  let configPrefix = new Uint8Array();

  const decoder = new Decoder({
    output: (frame: VideoFrame) => {
      if (closed) {
        frame.close();
        return;
      }
      try {
        const width = Number(frame.displayWidth || frame.codedWidth || canvas.width);
        const height = Number(frame.displayHeight || frame.codedHeight || canvas.height);
        if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
          canvas.width = width;
          canvas.height = height;
        }
        ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
      } finally {
        frame.close();
      }
    },
    error: (error: unknown) => {
      if (import.meta.env.DEV) console.debug("[nativeScreenCapture] decoder unavailable", error);
    },
  });

  function toAvcCodecString(spsB64: string): string {
    try {
      const sps = base64ToBytes(spsB64);
      let off = 0;
      if (sps[0] === 0 && sps[1] === 0 && sps[2] === 1) off = 3;
      else if (sps[0] === 0 && sps[1] === 0 && sps[2] === 0 && sps[3] === 1) off = 4;
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
      const sps = codec.sps ? base64ToBytes(codec.sps) : new Uint8Array();
      const pps = codec.pps ? base64ToBytes(codec.pps) : new Uint8Array();
      configPrefix = concatBytes(sps, pps);
      const codecString = codec.sps ? toAvcCodecString(codec.sps) : "avc1.42e01f";
      try {
        if (codec.width > 0 && codec.height > 0) {
          canvas.width = codec.width;
          canvas.height = codec.height;
        }
        decoder.configure({
          codec: codecString,
          codedWidth: codec.width,
          codedHeight: codec.height,
          optimizeForLatency: true,
          hardwareAcceleration: "prefer-hardware",
          avc: { format: "annexb" },
        } as any);
        configured = true;
      } catch (error) {
        configured = false;
        if (import.meta.env.DEV) console.debug("[nativeScreenCapture] configure unavailable", error);
      }
    },
    push(pkt) {
      if (closed || !configured) return;
      try {
        let bytes = base64ToBytes(pkt.data);
        if (pkt.keyframe && configPrefix.byteLength > 0) {
          bytes = concatBytes(configPrefix, bytes);
        }
        decoder.decode(
          new EVC({
            type: pkt.keyframe ? "key" : "delta",
            timestamp: pkt.ptsUs,
            data: bytes,
          }),
        );
      } catch (error) {
        if (import.meta.env.DEV) console.debug("[nativeScreenCapture] frame skipped", error);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      try { decoder.close(); } catch { /* noop */ }
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}
