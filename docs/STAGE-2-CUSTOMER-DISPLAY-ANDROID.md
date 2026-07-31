# SEZA POS Stage 2 — Customer Display + Android Polish

## Included

- Live customer-display states for active sale, payment processing, approved payment, declined payment, and cancelled payment.
- Store name and logo remain sourced from the active store record.
- Cart lines, quantities, subtotal, discount, tax, and total continue to publish through local storage, BroadcastChannel, and signed Supabase Realtime updates.
- Android-only offline banner explains that cash sales remain available and includes a retry action.
- Android window preferences are re-applied every time the activity resumes, improving immersive and keep-awake recovery after backgrounding.

## Apply

Copy the included files into the same paths in the project, replacing existing files where applicable.

Then run:

```powershell
cd F:\pos-sezapos
npm install
npm run lint
npm run typecheck
npm run build
npm run android:sync
cd android
.\gradlew assembleDebug
```

## Manual verification

1. Open `/customer-display?store=<STORE_ID>` on the second screen.
2. Add, change, and remove cart items.
3. Confirm quantities and totals update.
4. Open payment and confirm the display shows “Processing payment” after checkout begins.
5. Complete a payment and confirm the thank-you screen appears and resets.
6. Cancel payment and confirm the cancelled state appears briefly.
7. Force a payment failure and confirm the declined state appears briefly.
8. Disconnect Android from the network and confirm the offline banner appears.
9. Reconnect and confirm background sync resumes.
10. Background and resume the APK and confirm immersive mode and keep-awake are restored.

## Verification note

The source changes were inspected and packaged, but dependency installation could not complete in the build environment because its internal npm registry did not contain `zod-to-json-schema@3.25.2`. Run the commands above locally and rely on GitHub Actions before treating this package as release-ready.
