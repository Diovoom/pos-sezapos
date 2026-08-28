import type { CapacitorConfig } from "@capacitor/cli";

// SEZA POS — Android application.
//
// The Android app is a BUNDLED Capacitor application. All web assets live in
// `android-webdir/` (produced by `vite.capacitor.config.ts` — see
// `npm run android:build`). There is NO `server.url` — the WebView loads
// local files instantly via the `capacitor://` scheme.
//
// Backend access happens over HTTPS:
//   - Supabase auth + RLS-scoped reads/writes go directly to Supabase.
//   - Server functions and public API routes go to https://sezapos.com.
// This split is the foundation for future offline mode: local reads can be
// served from IndexedDB, and writes can be queued against the same base URL
// when the network returns.
const config: CapacitorConfig = {
  appId: "com.sezapos.app",
  appName: "SEZA POS",
  webDir: "android-webdir",
  android: {
    allowMixedContent: false,
    backgroundColor: "#1e40af",
  },
  plugins: {
    // Force window.fetch + XMLHttpRequest through Android native networking.
    // This protects every third-party/library request too, not only SEZA's own wrappers.
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 6000,
      launchAutoHide: false,
      backgroundColor: "#1e40af",
      showSpinner: false,
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
      fadeInDuration: 0,
      fadeOutDuration: 350,
      useDialog: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#1e40af",
      overlaysWebView: false,
    },
  },
};

export default config;
