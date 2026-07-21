// Android shell stub — the camera barcode scanner is removed from the APK.
//
// The website keeps its camera scanner unchanged; this stub is aliased in
// only for the Capacitor build (see `vite.capacitor.config.ts`) so the
// zxing/browser and ML Kit camera modules never ship in the APK bundle
// and no Android camera permission prompts are triggered from the POS.
//
// The APK relies on physical scanners only (USB / Bluetooth keyboard-wedge
// or supported built-in hardware scanners), which feed the search input
// directly and do not need this component.
export function BarcodeScanner(_props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDetected: (code: string) => void;
  title?: string;
  formats?: unknown;
  hint?: string;
  note?: string | null;
}): null {
  return null;
}
