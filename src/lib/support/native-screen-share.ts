import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

type CapturePlugin = {
  requestPermission(): Promise<{ granted: boolean }>;
  start(options: { maxWidth: number; maxFps: number; bitrateKbps: number }): Promise<void>;
  stop(): Promise<void>;
  addListener(event: "state" | "codec" | "frame" | "error", listener: (payload: any) => void): Promise<PluginListenerHandle>;
};

const NativeCapture = registerPlugin<CapturePlugin>("SezaScreenCapture");

function decodeBase64(value?: string): Uint8Array {
  if (!value) return new Uint8Array();
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) output[index] = binary.charCodeAt(index);
  return output;
}

function joinBytes(...parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

/**
 * Turn the Android MediaProjection/H.264 stream into a normal MediaStream.
 * That lets the existing view-only WebRTC publisher carry the native screen
 * without using getDisplayMedia inside a WebView (which stopped whenever the
 * Activity lost focus).
 */
export async function startNativeScreenShare(): Promise<{
  stream: MediaStream;
  stop: () => Promise<void>;
}> {
  const Decoder = (window as any).VideoDecoder;
  const Chunk = (window as any).EncodedVideoChunk;
  if (!Decoder || !Chunk) throw new Error("This Android WebView needs an update before screen sharing can start");

  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true } as any) as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Screen renderer is unavailable");
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const stream = canvas.captureStream(15);
  const listeners: PluginListenerHandle[] = [];
  let stopped = false;
  let configured = false;
  let configPrefix = new Uint8Array();
  let firstFrameResolve: (() => void) | null = null;
  let firstFrameReject: ((error: Error) => void) | null = null;
  const firstFrame = new Promise<void>((resolve, reject) => {
    firstFrameResolve = resolve;
    firstFrameReject = reject;
  });

  const decoder = new Decoder({
    output: (frame: any) => {
      if (stopped) { frame.close(); return; }
      try {
        if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
          canvas.width = frame.displayWidth;
          canvas.height = frame.displayHeight;
        }
        ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
        firstFrameResolve?.();
        firstFrameResolve = null;
      } finally {
        frame.close();
      }
    },
    error: (error: Error) => firstFrameReject?.(error),
  });

  listeners.push(await NativeCapture.addListener("codec", (payload) => {
    if (stopped) return;
    canvas.width = Number(payload.width || 720);
    canvas.height = Number(payload.height || 1280);
    const sps = decodeBase64(payload.sps);
    const pps = decodeBase64(payload.pps);
    configPrefix = joinBytes(sps, pps);
    try {
      decoder.configure({
        codec: "avc1.42E01F",
        codedWidth: canvas.width,
        codedHeight: canvas.height,
        optimizeForLatency: true,
        hardwareAcceleration: "prefer-hardware",
        avc: { format: "annexb" },
      } as any);
      configured = true;
    } catch (error) {
      firstFrameReject?.(error instanceof Error ? error : new Error(String(error)));
    }
  }));

  listeners.push(await NativeCapture.addListener("frame", (payload) => {
    if (stopped || !configured || decoder.state !== "configured") return;
    try {
      let bytes = decodeBase64(payload.data);
      if (payload.keyframe && configPrefix.byteLength) bytes = joinBytes(configPrefix, bytes);
      decoder.decode(new Chunk({
        type: payload.keyframe ? "key" : "delta",
        timestamp: Number(payload.ptsUs || performance.now() * 1000),
        data: bytes,
      }));
    } catch (error) {
      console.warn("[seza-native-screen] frame decode failed", error);
    }
  }));

  listeners.push(await NativeCapture.addListener("error", (payload) => {
    firstFrameReject?.(new Error(String(payload?.message || "Native screen capture failed")));
  }));

  const permission = await NativeCapture.requestPermission();
  if (!permission.granted) {
    for (const listener of listeners) await listener.remove();
    throw new Error("Screen sharing permission was not granted");
  }
  await NativeCapture.start({ maxWidth: 720, maxFps: 15, bitrateKbps: 900 });

  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("The Android screen did not produce a video frame")), 12_000));
  await Promise.race([firstFrame, timeout]);

  return {
    stream,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      try { await NativeCapture.stop(); } catch { /* noop */ }
      for (const listener of listeners) {
        try { await listener.remove(); } catch { /* noop */ }
      }
      try { decoder.close(); } catch { /* noop */ }
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}
