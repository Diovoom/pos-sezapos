# SEZA POS — Finix payment-terminal integration

This patch adds the first production-oriented Finix card-present path to SEZA POS.

## What is wired

- Finix appears as an integrated payment provider in Payment Terminal settings.
- Supported setup choices include PAX A35, A800, A920 Pro, or another Finix-certified terminal.
- SEZA stores only Finix Merchant/Device resource IDs in the terminal config. Finix API credentials are server-only.
- The POS sends a card-present sale to the SEZA backend, which calls Finix `POST /transfers` with `operation_key: CARD_PRESENT_SALE`.
- Every card attempt uses a stable `idempotency_id` to reduce duplicate-charge risk.
- Before charging, SEZA checks the Finix Device with `include_connection=true` and blocks the sale if Finix reports it offline.
- Cancel Payment sends Finix Device action `CANCEL`.
- Payment state maps to approved / declined / cancelled / processing / error and the Finix Transfer ID becomes the SEZA payment reference.
- Finix credentials are never bundled in Android.

## Required server environment variables

Sandbox:

```text
FINIX_SANDBOX_USERNAME=...
FINIX_SANDBOX_PASSWORD=...
```

Live (only after Finix approves SEZA for live processing):

```text
FINIX_LIVE_USERNAME=...
FINIX_LIVE_PASSWORD=...
```

Do not put any of these values in `VITE_*`, Capacitor configuration, Android resources, or client-side source.

## Merchant / terminal setup

1. Complete the merchant onboarding process in Finix.
2. Obtain the approved Finix Merchant ID.
3. Create/activate the merchant's Finix Device and obtain its Device ID.
4. In SEZA Owner Dashboard / POS Settings > Payment Terminal, choose Finix.
5. Enter the Device ID, Merchant ID, and Sandbox/Live environment.
6. Press **Connect Finix**. SEZA verifies the terminal through the server before marking it active.
7. Card checkout now routes to Finix; cash remains handled by SEZA locally.

## Important

The Finix onboarding-form creation and automatic merchant provisioning UI is intentionally not faked in this patch. Those flows require SEZA's Finix platform account/application details and the exact processor configuration assigned by Finix. This patch provides the secure terminal/payment foundation and is ready for those account-specific values once Finix supplies them.
