// The hosted web Vite configuration already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Lovable Cloud provides the Supabase connection as server/build environment
// variables. Vite client code can only read VITE_* variables that are embedded
// while the application is built. Bridge the automatic Lovable variables into
// import.meta.env without committing a local .env file or exposing a service key.
const hostedSupabaseUrl = process.env.SUPABASE_URL;
const hostedSupabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const hostedSupabaseProjectId =
  process.env.SUPABASE_PROJECT_ID ??
  hostedSupabaseUrl?.match(/^https:\/\/([^.]+)\.supabase\.co\/?$/i)?.[1];

const hostedPublicEnv =
  hostedSupabaseUrl && hostedSupabasePublishableKey
    ? {
        "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(hostedSupabaseUrl),
        "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
          hostedSupabasePublishableKey,
        ),
        "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
          hostedSupabaseProjectId ?? "",
        ),
      }
    : {};

// The hosted MCP plugin currently fails to normalize TanStack route paths on
// native Windows builds (for example F:\\pos-sezapos versus F:/pos-sezapos).
// The MCP build plugin is only development/build tooling; it is not required
// for the Android APK or the merchant-facing UI. The hosted web builder runs
// on Linux, so keep the plugin enabled there and skip it only on Windows.
const enableMcpPlugin = process.platform !== "win32";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: enableMcpPlugin ? [mcpPlugin()] : [],
    define: hostedPublicEnv,
  },
});
