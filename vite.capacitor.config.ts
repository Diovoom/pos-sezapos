// Standalone Vite build for the bundled Capacitor Android shell.
//
// This intentionally does NOT use @lovable.dev/vite-tanstack-config — the
// Android app is a plain client-side SPA, not a TanStack Start SSR bundle.
// Output goes to android-webdir/ which Capacitor packages into the APK via
// `bunx cap sync android`.
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
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
      alias: { "@": path.resolve(__dirname, "src") },
    },
    plugins: [react()],
    build: {
      outDir: path.resolve(__dirname, "android-webdir"),
      emptyOutDir: true,
      target: "es2020",
      sourcemap: false,
    },
  };
});
