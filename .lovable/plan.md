## Changes

### 1. `src/components/pos/BarcodeScanner.tsx` — add red targeting line
- Inside the video frame overlay, add an absolutely-positioned red horizontal line (`bg-red-500`, ~2px tall, ~80% width, centered vertically) with a subtle glow (`shadow-[0_0_8px_rgba(239,68,68,0.8)]`) and a slow pulse animation so the cashier can see exactly where to place the barcode.
- Keep the existing white rounded targeting frame; the red line sits on top of it, centered.

### 2. `src/components/pos/AgeVerificationDialog.tsx` — stop silent "unknown" rejects
The reason "it doesn't scan at all" after the first attempt: we restricted the camera to PDF417 only. If the first frame decoded as PDF417 but wasn't AAMVA-shaped, `parseIdBarcode` returned `format: "unknown"` and we kept the scanner open — but from then on the same barcode keeps re-decoding, we keep toasting, and the user thinks nothing happens.

- Broaden `formats` passed to `BarcodeScanner` from `[PDF_417]` to `[PDF_417, QR_CODE, DATA_MATRIX]` so European/Asian IDs (which sometimes use QR/DataMatrix) can be read too.
- Throttle the "not a recognized ID barcode" toast: only fire once per unique decoded string (keep a `Set` in a ref), so repeated decodes of the same non-ID barcode don't spam.
- After a first "unknown" decode, surface a persistent inline note in the scanner dialog via a new optional `note` prop on `BarcodeScanner` ("Barcode read but not a recognized government ID — try the front-side PDF417, or use manual entry"). This tells the user the camera IS working, the ID format just isn't AAMVA.

### 3. Optional polish
- Increase the scan-line's vertical position slightly if we want it to align with the barcode-in-frame convention; keep it dead-center for simplicity.

## Files touched
- `src/components/pos/BarcodeScanner.tsx` — add red line overlay, add optional `note` prop rendered under the video.
- `src/components/pos/AgeVerificationDialog.tsx` — widen `formats`, dedupe toasts, pass `note` when a non-AAMVA barcode was seen.

No DB / business-logic / other-file changes.
