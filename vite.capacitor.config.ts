// Standalone Vite build for the bundled Capacitor Android shell.
//
// This intentionally does not use the hosted TanStack Start configuration.
// The APK is a local client-side SPA, so every asset path must stay relative
// and all public Supabase configuration must have the same safe fallbacks as
// the hosted build. Missing VITE_* values used to produce an invalid client
// before React mounted, which appeared as a permanent white screen.
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const FALLBACK_SUPABASE_URL = "https://takuzwjuhrhppvgksyjp.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_d5DytMMOa6qKUxbJXqhi8g_7YYU7xAk";
const FALLBACK_SUPABASE_PROJECT_ID = "takuzwjuhrhppvgksyjp";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabasePublishableKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    FALLBACK_SUPABASE_PUBLISHABLE_KEY;
  if (supabasePublishableKey.startsWith("sb_secret_")) {
    throw new Error("Refusing to build the APK: a secret Supabase key was supplied.");
  }

  const supabaseProjectId =
    env.VITE_SUPABASE_PROJECT_ID || env.SUPABASE_PROJECT_ID || FALLBACK_SUPABASE_PROJECT_ID;
  const apiBaseUrl = (env.VITE_API_BASE_URL || "https://sezapos.com").replace(/\/$/, "");

  return {
    root: path.resolve(__dirname, "capacitor-shell"),
    publicDir: false,
    // Capacitor loads index.html from a bundled local origin. Relative URLs
    // prevent /assets/* from resolving against the wrong Android WebView root.
    base: "./",
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(supabaseProjectId),
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBaseUrl),
    },
    resolve: {
      alias: [
        {
          find: /^@\/integrations\/supabase\/client$/,
          replacement: path.resolve(__dirname, "capacitor-shell/supabase.ts"),
        },
        {
          find: /^@\/components\/settings\/PaymentTerminalsPanel$/,
          replacement: path.resolve(__dirname, "capacitor-shell/stubs/PaymentTerminalsPanel.tsx"),
        },
        {
          find: /^@\/components\/pos\/ManagerOverrideDialog$/,
          replacement: path.resolve(__dirname, "capacitor-shell/stubs/ManagerOverrideDialog.tsx"),
        },
        {
          find: /^@\/components\/SupportRequestListener$/,
          replacement: path.resolve(__dirname, "capacitor-shell/stubs/SupportRequestListener.tsx"),
        },
        {
          find: /^@\/components\/pos\/BarcodeScanner$/,
          replacement: path.resolve(__dirname, "capacitor-shell/stubs/BarcodeScanner.tsx"),
        },
        { find: "@", replacement: path.resolve(__dirname, "src") },
      ],
    },
    plugins: [react(), tailwindcss()],
    build: {
      outDir: path.resolve(__dirname, "android-webdir"),
      emptyOutDir: true,
      target: "es2020",
      sourcemap: false,
      chunkSizeWarningLimit: 900,
    },
  };
});
