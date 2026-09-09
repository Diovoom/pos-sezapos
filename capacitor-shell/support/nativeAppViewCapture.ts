import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type AppViewFrame = {
  data: string;
  width: number;
  height: number;
  capturedAt: number;
};

interface SezaAppViewCapturePlugin {
  start(opts: { maxWidth?: number; maxFps?: number; jpegQuality?: number }): Promise<void>;
  stop(): Promise<void>;
  addListener(event: "frame", cb: (frame: AppViewFrame) => void): Promise<PluginListenerHandle>;
  addListener(event: "error", cb: (event: { message?: string }) => void): Promise<PluginListenerHandle>;
}

const impl = registerPlugin<SezaAppViewCapturePlugin>("SezaAppViewCapture");

export function isNativeAppViewCaptureAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

export async function stopNativeAppViewCapture(): Promise<void> {
  if (!isNativeAppViewCaptureAvailable()) return;
  try { await impl.stop(); } catch { /* noop */ }
}

export function canPipeAppViewToMediaStream(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas") as HTMLCanvasElement & {
    captureStream?: (fps?: number) => MediaStream;
  };
  return typeof canvas.captureStream === "function";
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) output[index] = binary.charCodeAt(index);
  return output;
}

async function drawJpeg(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  frame: AppViewFrame,
): Promise<void> {
  const bytes = base64ToBytes(frame.data);
  const blob = new Blob([bytes], { type: "image/jpeg" });

  if (typeof createImageBitmap === "function") {
    const image = await createImageBitmap(blob);
    try {
      if (canvas.width !== frame.width || canvas.height !== frame.height) {
        canvas.width = frame.width;
        canvas.height = frame.height;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    } finally {
      image.close();
    }
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try {
        if (canvas.width !== frame.width || canvas.height !== frame.height) {
          canvas.width = frame.width;
          canvas.height = frame.height;
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode SEZA screen frame"));
    };
    image.src = url;
  });
}

/**
 * Capture only the SEZA POS Activity window and expose it as a canvas MediaStream.
 * This avoids MediaProjection and the native H.264/WebCodecs bridge that proved
 * unstable on the dual-display POS hardware.
 */
export function createAppViewCaptureBridge(): {
  stream: MediaStream;
  start: () => Promise<void>;
  close: () => Promise<void>;
  getLastError: () => string | null;
} | null {
  if (!isNativeAppViewCaptureAvailable() || !canPipeAppViewToMediaStream()) return null;

  const canvas = document.createElement("canvas") as HTMLCanvasElement & {
    captureStream: (fps?: number) => MediaStream;
  };
  canvas.width = 720;
  canvas.height = 540;
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true } as any);
  if (!ctx) return null;
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const stream = canvas.captureStream(4);
  const listenerHandles: PluginListenerHandle[] = [];
  let closed = false;
  let decoding = false;
  let firstFrameResolve: (() => void) | null = null;
  let firstFrameReject: ((error: Error) => void) | null = null;
  let lastError: string | null = null;
  let firstFrameSeen = false;

  const firstFrame = new Promise<void>((resolve, reject) => {
    firstFrameResolve = resolve;
    firstFrameReject = reject;
  });

  return {
    stream,
    async start() {
      listenerHandles.push(
        await impl.addListener("frame", (frame) => {
          if (closed || decoding || !frame?.data) return;
          decoding = true;
          void drawJpeg(canvas, ctx, frame)
            .then(() => {
              if (closed) return;
              if (!firstFrameSeen) {
                firstFrameSeen = true;
                firstFrameResolve?.();
                firstFrameResolve = null;
                firstFrameReject = null;
              }
            })
            .catch((error) => {
              lastError = error instanceof Error ? error.message : String(error);
              if (!firstFrameSeen) firstFrameReject?.(new Error(lastError));
            })
            .finally(() => {
              decoding = false;
            });
        }),
      );

      listenerHandles.push(
        await impl.addListener("error", (event) => {
          lastError = String(event?.message || "SEZA app screen capture error");
          console.warn("[seza-app-view]", lastError);
        }),
      );

      await impl.start({ maxWidth: 720, maxFps: 4, jpegQuality: 48 });

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(lastError || "SEZA app screen did not produce a frame")),
          8_000,
        );
      });
      try {
        await Promise.race([firstFrame, timeout]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      try { await impl.stop(); } catch { /* noop */ }
      for (const handle of listenerHandles) {
        try { await handle.remove(); } catch { /* noop */ }
      }
      stream.getTracks().forEach((track) => track.stop());
    },
    getLastError() {
      return lastError;
    },
  };
}
