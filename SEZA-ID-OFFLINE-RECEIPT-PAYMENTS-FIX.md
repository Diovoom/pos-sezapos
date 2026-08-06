# SEZA POS — ID, Offline Receipt, Refund Refresh, and Payment Setup Fix

Version: 1.3.2

## What changed

### PIN screen
- Removed the second large visible PIN input.
- The six dots are the only PIN display.
- Touch keypad and physical numeric keyboard input both remain supported.

### Government ID scanning
- Product barcode lookup pauses while the ID dialog is open.
- The scanner collector waits for the complete PDF417 payload instead of stopping at the first embedded Enter/Tab separator.
- Short numeric 1D scans are recognized as the wrong barcode and are not sent to product search.
- The screen now shows exactly which Florida ID barcode to scan:
  - Do not scan the short number/tracking barcode.
  - Scan the large wide rectangular PDF417 block made of many tiny rows on the back.
- Manual DOB entry remains available when the physical scanner cannot output PDF417.

Important: the application can parse only the data the scanner sends. If the scanner keeps sending a short numeric value, its PDF417 decoding is disabled, unsupported, or the wrong barcode is being aimed at. The APK cannot reconstruct DOB or expiration from the short tracking barcode.

### Offline customer receipts
- Customer receipts no longer print `OFFLINE SALE`, `PENDING SYNCHRONIZATION`, or `Pending final number`.
- A stable numeric local receipt number is generated before printing.
- The same local number remains searchable after the sale synchronizes.
- Synchronization status remains visible only to staff in the dashboard/sync tools.

### Refunds, lookup, and reprint
- Refunds is now also the receipt-history page.
- Every listed sale has a Reprint action.
- Local offline receipts appear immediately.
- When connectivity returns or sync completes, the page invalidates and refreshes automatically.
- A manual Refresh button remains available.
- Once a local sale has synchronized, the server record is resolved and refund controls become available without leaving the page.

### Payment terminal setup
- The Android POS now clearly separates two steps:
  1. Owner Dashboard: processor authorization, business verification, and payout-bank setup.
  2. Physical POS: terminal details, provider location ID, real reader discovery, and pairing.
- Added an Owner Dashboard payment-setup button and copyable phone link.
- Added Stripe Terminal Location ID, register location, serial, and test-mode fields.
- Stripe readers are marked connected only after the native SDK confirms a real connection.
- Unsupported provider connectors are shown honestly and cannot be falsely activated.
- Square/Clover/PAX/Ingenico/Dejavoo details may be prepared, but their physical readers require their certified connector before pairing can work.

## Apply

Copy all files from the patch folder into the project root and replace matching files.

```powershell
cd F:\pos-sezapos
npm ci
npm run lint
npm run typecheck
npm run android:sync

cd android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
.\gradlew clean
.\gradlew assembleDebug
```

## Test order

1. Open the APK and confirm the PIN page has only six dots and the keypad.
2. Add an age-restricted item.
3. Scan the large wide PDF417 block on the back of a Florida ID.
4. Disconnect Ethernet/Wi-Fi, complete a cash sale, and inspect the customer receipt.
5. Open Refunds & receipts and reprint the local receipt.
6. Reconnect, wait for sync, and confirm the page refreshes and enables refund actions.
7. Open Payment terminal, follow the Owner Dashboard link, then return to the POS to prepare/pair the reader.
