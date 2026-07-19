import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, NotFoundException } from "@zxing/library";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Camera, X } from "lucide-react";
import { isNativeMode } from "@/lib/native";

// Lazy-load the ML Kit plugin so the web bundle doesn't pull native code.
async function tryNativeScan(): Promise<string | null> {
  if (!isNativeMode()) return null;
  try {
    const mod = await import("@capacitor-mlkit/barcode-scanning");
    const { BarcodeScanner: MlKit } = mod;
    const supported = await MlKit.isSupported();
    if (!supported.supported) return null;
    const perm = await MlKit.checkPermissions();
    if (perm.camera !== "granted") {
      const req = await MlKit.requestPermissions();
      if (req.camera !== "granted") return null;
    }
    const { barcodes } = await MlKit.scan();
    return barcodes?.[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}


type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDetected: (code: string) => void;
  title?: string;
  /** Restrict decoding to a specific set of barcode formats (e.g. [PDF_417]). */
  formats?: BarcodeFormat[];
  /** Extra guidance shown under the video frame. */
  hint?: string;
  /** Persistent inline note shown below the video (e.g. after a non-matching decode). */
  note?: string | null;
};

/**
 * Live camera barcode scanner using @zxing/browser.
 * Auto-closes on the first successful decode. Falls back gracefully
 * when camera permission is denied.
 */
export function BarcodeScanner({ open, onOpenChange, onDetected, title = "Scan barcode", formats, hint, note }: Props) {
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

    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.TRY_HARDER, true);
    if (formats && formats.length > 0) {
      hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
    }
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 200 });

    (async () => {
      // Try the native ML Kit full-screen scanner first on Android.
      const nativeCode = await tryNativeScan();
      if (nativeCode) {
        if (cancelled) return;
        onDetected(nativeCode);
        onOpenChange(false);
        return;
      }
      try {
        setStatus("starting");
        setError(null);
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(list);
        const back = list.find((d) => /back|rear|environment/i.test(d.label));
        const chosen = deviceId ?? back?.deviceId ?? list[0]?.deviceId;
        setDeviceId(chosen);
        if (!videoRef.current) return;

        const constraints: MediaStreamConstraints = {
          video: {
            ...(chosen ? { deviceId: { exact: chosen } } : { facingMode: { ideal: "environment" } }),
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            // best-effort; ignored by browsers that don't support it
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            advanced: [{ focusMode: "continuous" } as any],
          },
          audio: false,
        };

        const controls = await reader.decodeFromConstraints(constraints, videoRef.current, (result, err) => {
          if (result && !cancelled) {
            onDetected(result.getText());
            controls.stop();
            onOpenChange(false);
            return;
          }
          // Silently ignore per-frame "no barcode found" — spams console otherwise.
          if (err && !(err instanceof NotFoundException)) {
            // eslint-disable-next-line no-console
            // console.debug("[scanner]", err);
          }
        });
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
          <DialogTitle className="flex items-center gap-2"><Camera className="size-4" /> {title}</DialogTitle>
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
          ) : <span className="text-xs text-muted-foreground">Point at a barcode</span>}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            <X className="size-3.5 mr-1" /> Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
