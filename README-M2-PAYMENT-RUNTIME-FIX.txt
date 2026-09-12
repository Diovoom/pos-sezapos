SEZA POS - M2 payment runtime fix

What this does:
- Stops checkout from hanging forever at "Creating secure card-present payment".
- Adds a 20-second client-side PaymentIntent timeout with the exact payment stage.
- Adds a 15-second server-side Stripe PaymentIntent timeout.
- Prevents payment_attempts audit logging from blocking the live card flow.
- Sends live payment stages to the native customer display:
  * Preparing card payment
  * Tap, insert, or swipe on the Stripe Reader M2
  * Processing
  * Declined / cancelled / approved

Important:
- The reader connection is already working.
- This patch changes BOTH Android client code and the Cloudflare-hosted backend route.
- Deploy the web/backend after applying the patch, then rebuild the APK.
