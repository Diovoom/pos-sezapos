# SEZA Google sign-in branding

The website now starts Google sign-in directly through Supabase instead of the hosted editor authentication helper.

To make Google's account chooser display **SEZA Technologies Inc.** and the SEZA logo, configure a SEZA-owned Google OAuth app and connect it to Supabase:

1. In Google Cloud Console, open **Google Auth Platform > Branding**.
2. Set the app name to **SEZA Technologies Inc.** and upload `public/seza-google-oauth-logo-120.png`.
3. Add `sezapos.com` as an authorized domain and use SEZA support/privacy links.
4. Create or open the Web OAuth client and copy its Client ID and Client Secret.
5. In Supabase Dashboard, open **Authentication > Providers > Google**, enable Google, and paste the SEZA Client ID and Client Secret.
6. Add the Supabase callback URL shown by Supabase to the Google OAuth client's authorized redirect URIs.
7. Publish the Google app branding/consent screen.

Until these external settings are changed, Google can continue showing the old OAuth app name/logo even though the website code is updated.
