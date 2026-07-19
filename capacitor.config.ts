import type { CapacitorConfig } from "@capacitor/cli";

// SEZA POS — Android wrapper.
//
// The app is a thin WebView over the deployed production site. On launch
// we deep-link into the employee entry (`/auth?native=1`) so Android users
// never see marketing pages. The `native=1` flag is captured client-side
// and persisted so subsequent navigations stay inside the POS surface.
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
    // Immersive: hide the Android status bar chrome while keeping the
    // system navigation bar available (swipe from bottom).
    backgroundColor: "#1e40af",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: "#1e40af",
      showSpinner: false,
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
      fadeInDuration: 200,
      fadeOutDuration: 400,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#1e40af",
      overlaysWebView: false,
    },
  },
};

export default config;
