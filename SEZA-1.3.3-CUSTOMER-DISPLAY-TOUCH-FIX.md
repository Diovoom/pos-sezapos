# SEZA POS 1.3.3 — Customer Display, Touchscreen, Cash Keypad, and Receipt Fix

## What changed

- Customer display idle screen now shows only the store name and one large **Welcome** message.
- Subtotal, tax, total, and item prices stay hidden until the cashier adds the first item.
- Completed payments show a large **Thank you!** / **Payment approved** screen.
- The second-display Android `Presentation` is now non-focusable and non-touchable so it cannot steal input from the cashier touchscreen.
- The saved customer display starts automatically when the Android POS opens.
- Initial display data waits for the customer-screen WebView to finish loading, preventing a blank first screen.
- Starting a customer display no longer sends a test order automatically. The separate **Send test order** button still works.
- Cash and split-cash payments now use a compact SEZA keypad inside the app. Android's large system keyboard does not open for cash entry.
- Printed and on-screen receipts no longer print/show the payment `Ref` line.
- Android version updated to `1.3.3` (`versionCode 9`).

## Changed files

- `android/app/src/main/java/com/sezapos/device/SezaCustomerDisplayPlugin.java`
- `android/app/build.gradle`
- `src/components/settings/NativeCustomerDisplayPanel.tsx`
- `src/components/pos/PosShell.tsx`
- `src/routes/customer-display.tsx`
- `src/components/pos/PaymentDialog.tsx`
- `src/components/pos/Receipt.tsx`
- `src/lib/hardware/native-receipt.ts`
- `package.json`
- `package-lock.json`

## Install/build in VS Code

1. Back up your project.
2. Replace the project with the full updated ZIP, or copy the patch ZIP files into the matching folders.
3. Open the project folder in VS Code.
4. Run:

```bash
npm install
npm run android:sync
```

5. Open Android Studio with:

```bash
npx cap open android
```

6. Build and install the new APK.

## Hardware test

1. Open **Settings → Peripheral hardware → Customer display**.
2. Tap **Detect displays**, then **Use this display**.
3. Confirm the customer screen shows the store name and one Welcome message.
4. Return to checkout and touch product buttons on the cashier screen. The cashier touchscreen should remain responsive.
5. Scan/add one product. Item price, subtotal, tax, and total should then appear on the customer display.
6. Select Cash. The SEZA keypad should appear inside the payment dialog without opening Android's system keyboard.
7. Complete payment. The customer display should show Thank you.
8. Print the receipt. There should be no `Ref:` number at the bottom.

## Important

The customer screen is intentionally output-only. It does not need touch support. The change prevents that second screen from taking focus or touch control away from the cashier's primary touchscreen.
