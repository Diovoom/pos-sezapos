# SEZA POS Major Update 1.2.0

This package is a merge update for the existing `F:\pos-sezapos` project. It does not include or overwrite `.env` files.

## Main changes

- Unified plans everywhere: Starter $29, Pro $59, Business $89.
- Official transparent SEZA OAuth mark across web, PWA, Android icon, splash, favicon, Google assets, and social metadata.
- Reliable page scroll reset and the header S-to-SEZA POS motion.
- Customer CRM with profiles, loyalty points, consent, notes, visits, and lifetime spending.
- Split tender: choose the cash portion, then charge the exact card balance.
- Split-payment ledger migration for accurate reporting and cash reconciliation.
- Twilio, Vonage, MessageBird, and Plivo receipt-provider implementations.
- Stripe Terminal and Android Tap to Pay integration layer with reader location configuration.
- Android Bluetooth, NFC, and location permissions plus minimum SDK 26.
- Offline cash sales and cash movements remain queued locally and automatically synchronize on reconnection.
- Public application health endpoint and live status page.
- App version/update workflow: version 1.2.0, Android build 3.
- Database setup for customer CRM, restaurant order fields, modifiers, integration settings, API keys, and payment allocations.
- Hardware shop remains marked Coming Soon; hardware setup screens remain available.

## Install

1. Back up `F:\pos-sezapos`.
2. Copy the `pos-sezapos` folder from this package directly into `F:\`.
3. Choose **Replace the files in the destination**. Windows merges the folders; it does not delete your existing `.env` files.
4. Open `F:\pos-sezapos` and double-click `INSTALL-SEZA-1.2.0.bat`, or run:

```powershell
npm install --legacy-peer-deps
npm run build
git add .
git commit -m "SEZA POS major update 1.2.0"
git push
```

5. Push the GitHub commit and apply the included database migration to Supabase.
6. Preview before publishing.

## External setup required

Source code cannot create third-party merchant accounts or approve physical payment hardware. Before taking live card payments, enter a real Stripe Terminal Location ID, activate a supported terminal, turn off Stripe test mode, and complete a real-device test. SMS providers require your provider credentials. Android hardware features require `npx cap sync android` after npm installation.

SEZA now uses direct Supabase, email, SMS, and Stripe integrations; no hosted builder-specific runtime dependency is required.
