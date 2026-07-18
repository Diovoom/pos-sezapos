import type { CapacitorConfig } from "@capacitor/cli";

// SEZA POS — Android wrapper.
//
// This project runs SSR on Cloudflare Workers (createServerFn RPCs, server
// routes under /api/*, /mcp, Stripe/Supabase auth). Capacitor cannot host
// that server, so the Android app is a thin WebView that loads the
// deployed production site. All auth, data, and payments continue to work
// against the live backend over HTTPS.
//
// If you later want an installable-shell build (SPA) instead of a remote
// URL, remove `server.url` and point `webDir` at your SPA output.
const config: CapacitorConfig = {
  appId: "com.sezapos.app",
  appName: "SEZA POS",
  // `webDir` is required by Capacitor even when loading a remote URL. The
  // folder just needs to exist; contents are ignored when `server.url` is set.
  webDir: "android-webdir",
  server: {
    url: "https://sezapos.com",
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#1e40af",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#1e40af",
    },
  },
};

export default config;
