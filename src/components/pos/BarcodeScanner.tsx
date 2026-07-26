import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Camera, X } from "lucide-react";
export type BarcodeFormatName =
  | "AZTEC"
  | "CODABAR"
  | "CODE_39"
  | "CODE_93"
  | "CODE_128"
  | "DATA_MATRIX"
  | "EAN_8"
  | "EAN_13"
  | "ITF"
  | "MAXICODE"
  | "PDF_417"
  | "QR_CODE"
  | "RSS_14"
  | "RSS_EXPANDED"
  | "UPC_A"
  | "UPC_E"
  | "UPC_EAN_EXTENSION";

type BrowserReaderConstructor = new (
  hints?: Map<unknown, unknown>,
  options?: { delayBetweenScanAttempts?: number },
) => {
  decodeFromConstraints: (
    constraints: MediaStreamConstraints,
    video: HTMLVideoElement,
    callback: (result: { getText: () => string } | undefined, error: unknown) => void,
  ) => Promise<{ stop: () => void }>;
};

type BrowserReaderRuntime = {
  BrowserMultiFormatReader: BrowserReaderConstructor & {
    listVideoInputDevices: () => Promise<MediaDeviceInfo[]>;
  };
};

type ZXingRuntime = {
  BarcodeFormat: Record<BarcodeFormatName, unknown>;
  DecodeHintType: {
    TRY_HARDER: unknown;
    POSSIBLE_FORMATS: unknown;
  };
  NotFoundException?: new (...args: never[]) => Error;
};

function unwrapModule<T extends object>(module: T | { default?: T }): T {
  const candidate = (module as { default?: T }).default;
  return candidate && typeof candidate === "object" ? candidate : (module as T);
}

function isNotFoundError(error: unknown, constructor?: new (...args: never[]) => Error) {
  if (constructor && error instanceof constructor) return true;
  return (error as { name?: string } | null)?.name === "NotFoundException";
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDetected: (code: string) => void;
  title?: string;
  /** Restrict decoding to a specific set of barcode formats (e.g. [PDF_417]). */
  formats?: BarcodeFormatName[];
  /** Extra guidance shown under the video frame. */
  hint?: string;
  /** Persistent inline note shown below the video (e.g. after a non-matching decode). */
  note?: string | null;
};

/**
 * Live camera barcode scanner using @zxing/browser.
 * The Android register build aliases this component to a physical-scanner
 * stub, keeping the unused ML Kit native dependency out of the APK.
 * Auto-closes on the first successful decode. Falls back gracefully
 * when camera permission is denied.
 */
export function BarcodeScanner({
  open,
  onOpenChange,
  onDetected,
  title = "Scan barcode",
  formats,
  hint,
  note,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setShowTip(false);
    const tipTimer = window.setTimeout(() => setShowTip(true), 5000);

    (async () => {
      try {
        setStatus("starting");
        setError(null);

        // Keep ZXing out of the SSR module graph. TanStack's generated route
        // tree imports every route eagerly, so a top-level ZXing import can
        // crash the marketing site, owner dashboard and admin before a scanner
        // is ever opened. Dynamic imports execute only in this client effect.
        const [browserNamespace, zxingNamespace] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (cancelled) return;

        const { BrowserMultiFormatReader } = unwrapModule(
          browserNamespace as unknown as BrowserReaderRuntime | { default?: BrowserReaderRuntime },
        );
        const { BarcodeFormat, DecodeHintType, NotFoundException } = unwrapModule(
          zxingNamespace as unknown as ZXingRuntime | { default?: ZXingRuntime },
        );

        if (!BrowserMultiFormatReader || !BarcodeFormat || !DecodeHintType) {
          throw new Error("Barcode scanner failed to initialize");
        }

        const hints = new Map<unknown, unknown>();
        hints.set(DecodeHintType.TRY_HARDER, true);
        if (formats && formats.length > 0) {
          const possibleFormats = formats
            .map((format) => BarcodeFormat[format])
            .filter((format) => format !== undefined);
          if (possibleFormats.length > 0) {
            hints.set(DecodeHintType.POSSIBLE_FORMATS, possibleFormats);
          }
        }

        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 200 });
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(list);
        const back = list.find((d) => /back|rear|environment/i.test(d.label));
        const chosen = deviceId ?? back?.deviceId ?? list[0]?.deviceId;
        setDeviceId(chosen);
        if (!videoRef.current) return;

        const constraints: MediaStreamConstraints = {
          video: {
            ...(chosen
              ? { deviceId: { exact: chosen } }
              : { facingMode: { ideal: "environment" } }),
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            // best-effort; ignored by browsers that don't support it
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            advanced: [{ focusMode: "continuous" } as any],
          },
          audio: false,
        };

        const controls = await reader.decodeFromConstraints(
          constraints,
          videoRef.current,
          (result, err) => {
            if (result && !cancelled) {
              onDetected(result.getText());
              controls.stop();
              onOpenChange(false);
              return;
            }
            // Silently ignore per-frame "no barcode found" — spams console otherwise.
            if (err && !isNotFoundError(err, NotFoundException)) {
              // console.debug("[scanner]", err);
            }
          },
        );
        controlsRef.current = controls;
        setStatus("scanning");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : "Camera unavailable");
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(tipTimer);
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deviceId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-4" /> {title}
          </DialogTitle>
        </DialogHeader>
        <div className="relative bg-black aspect-[3/4]">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          <div className="absolute inset-0 pointer-events-none border-2 border-white/40 m-8 rounded-xl" />
          {/* Red targeting line */}
          <div className="absolute inset-x-10 top-1/2 -translate-y-1/2 pointer-events-none">
            <div className="h-[2px] w-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)] animate-pulse" />
          </div>
          {status === "starting" && (
            <div className="absolute inset-0 grid place-items-center text-white text-sm gap-2">
              <Loader2 className="size-6 animate-spin" /> Starting camera…
            </div>
          )}
          {status === "scanning" && showTip && (
            <div className="absolute bottom-2 left-2 right-2 rounded-md bg-black/60 text-white text-xs px-3 py-2 text-center">
              {hint ?? "Center the product barcode inside the frame."}
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-white text-sm">
              <div>
                <p className="font-semibold mb-2">Camera unavailable</p>
                <p className="text-white/70 text-xs">{error}</p>
              </div>
            </div>
          )}
        </div>
        {note && (
          <div className="px-3 py-2 text-xs text-warning bg-warning/10 border-t border-warning/30">
            {note}
          </div>
        )}
        <div className="p-3 flex items-center justify-between gap-2 bg-card border-t">
          {devices.length > 1 ? (
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="text-xs bg-transparent border rounded px-2 py-1 max-w-[200px] truncate"
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-muted-foreground">Point at a barcode</span>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            <X className="size-3.5 mr-1" /> Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
