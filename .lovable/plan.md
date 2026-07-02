## Problem

The "Use camera" option in Age Verification opens the webcam but never decodes anything. Console shows continuous zxing decode errors coming from the PDF417 reader. Two root causes:

1. `BarcodeScanner` uses `BrowserMultiFormatReader` with default hints and no video constraints. Driver's-license PDF417 barcodes are dense 2D symbols that require ~1080p video and a tight decode hint to be readable — the default 640×480 stream zxing negotiates cannot resolve the modules, so every frame fails.
2. Every failed frame throws (not just `NotFoundException`), spamming the console and masking the real state. The scanner appears "stuck on starting…" to the user.

Fixes are UI/frontend only — no schema or business-logic changes.

## Changes

### 1. `src/components/pos/BarcodeScanner.tsx` — tune for PDF417 + suppress noise
- Accept a new optional prop `formats?: BarcodeFormat[]` (default: all). When the age dialog opens the scanner it will pass `[PDF_417]` so zxing only runs the PDF417 reader (faster, far fewer false errors).
- Build a `DecodeHintType` map with `TRY_HARDER=true` and `POSSIBLE_FORMATS=formats`, then pass it to `new BrowserMultiFormatReader(hints, 200)` (200 ms between attempts to reduce CPU).
- Replace `decodeFromVideoDevice` with `decodeFromConstraints` so we can request a high-resolution rear camera:
  ```
  { video: { deviceId, facingMode: { ideal: "environment" },
             width: { ideal: 1920 }, height: { ideal: 1080 },
             focusMode: "continuous", advanced: [{ focusMode: "continuous" }] } }
  ```
- In the decode callback, ignore `NotFoundException` errors silently (they fire on every frame with no barcode); only surface real errors. This removes the console spam shown in logs.
- Add an on-screen hint line ("Hold the back of the ID 4–6 inches from the camera, barcode centered in the frame") that appears once `status === "scanning"` and no result within 5 s.
- Keep the existing device picker and cancel button unchanged.

### 2. `src/components/pos/AgeVerificationDialog.tsx` — pass PDF417 hint + friendlier failure
- When opening the camera scanner from the age dialog, pass `formats={[BarcodeFormat.PDF_417]}` and `title="Scan ID barcode (PDF417)"`.
- If `parseIdBarcode` returns `format: "unknown"` from a camera scan (e.g. the user pointed at a QR code), keep the scanner open for another attempt instead of closing and toasting an error.
- Add a small "Camera scan isn't working?" link under the camera card in the choose view that jumps directly to manual entry — makes the fallback obvious.

### 3. No changes elsewhere
- Product-scanning callers of `BarcodeScanner` (if any) keep working because `formats` is optional and defaults to all formats.
- No changes to `age-verification.ts` parser, POS flow, DB, or settings.

## Technical notes

- zxing-js exports: `import { BarcodeFormat, DecodeHintType } from "@zxing/library"` (already a transitive dep of `@zxing/browser`).
- `focusMode: "continuous"` is best-effort; browsers that don't support it ignore the constraint, so no feature-detection is required.
- Even with these tunings, webcam PDF417 decoding is inherently marginal on low-end laptop cameras. The USB HID scanner path (already implemented) remains the recommended production input; this change makes the camera path usable for good phone/tablet cameras and stops the console spam.

## Verification

- Open POS with an age-restricted item, click "Use camera", confirm: no repeated zxing errors in console; scanner shows the higher-resolution feed; scanning a real ID or a printed PDF417 sample decodes and advances to the result view.
- Fallback: with no scan for ~5 s, the on-screen hint appears; "Enter date of birth" still works.
