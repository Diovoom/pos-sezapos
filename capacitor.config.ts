import type { CapacitorConfig } from "@capacitor/cli";

// SEZA POS — Android wrapper.
//
// The app is a thin WebView over the deployed production site. On launch we
// deep-link straight into the employee entry (`/auth?native=1`) so cashiers
// never see marketing pages, homepage, or owner dashboards. A branded
// full-screen loading overlay covers the WebView until React finishes
// hydration; only then does JS call SplashScreen.hide() and fade the
// overlay away.
const config: CapacitorConfig = {
  appId: "com.sezapos.app",
  appName: "SEZA POS",
  webDir: "android-webdir",
  server: {
    url: "https://sezapos.com/auth?native=1",
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#1e40af",
  },
  plugins: {
    SplashScreen: {
      // Never auto-hide — the web app hides the splash from JS once the
      // native loading overlay is mounted, so there's no white flash
      // between the Android splash and the branded loading screen.
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
