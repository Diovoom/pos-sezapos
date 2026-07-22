// Standalone Vite build for the bundled Capacitor Android shell.
//
// This intentionally does NOT use @lovable.dev/vite-tanstack-config — the
// Android app is a plain client-side SPA, not a TanStack Start SSR bundle.
// Output goes to android-webdir/ which Capacitor packages into the APK via
// `bunx cap sync android`.
//
// Aliases below let the shell reuse production POS components without
// pulling in SSR / server-fn only code paths:
//   - @/integrations/supabase/client    → the shell's native Supabase client
//                                         (distinct `seza-native-auth` storage)
//   - @/components/pos/ManagerOverrideDialog
//   - @/components/SupportRequestListener → safe shell stubs (no server fns).
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    root: path.resolve(__dirname, "capacitor-shell"),
    publicDir: false,
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(env.VITE_SUPABASE_URL),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        env.VITE_SUPABASE_PUBLISHABLE_KEY,
      ),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(env.VITE_SUPABASE_PROJECT_ID),
    },
    resolve: {
      alias: [
        // Native-only Supabase client (must come BEFORE the generic '@' alias).
        {
          find: /^@\/integrations\/supabase\/client$/,
          replacement: path.resolve(__dirname, "capacitor-shell/supabase.ts"),
        },
        // Server-fn dependent components → safe shell stubs.
        {
          find: /^@\/components\/pos\/ManagerOverrideDialog$/,
          replacement: path.resolve(__dirname, "capacitor-shell/stubs/ManagerOverrideDialog.tsx"),
        },
        {
          find: /^@\/components\/SupportRequestListener$/,
          replacement: path.resolve(__dirname, "capacitor-shell/stubs/SupportRequestListener.tsx"),
        },
        // Camera scanner removed from the APK — physical scanners only.
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
    },
  };
});
