// The hosted web Vite configuration already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Supabase's URL and publishable key are public browser configuration. Prefer
// variables supplied by the build host, but keep a project-specific public
// fallback so Lovable Preview/Publish cannot produce a client bundle with
// missing Supabase configuration after .env files are removed from Git.
const publicSupabaseUrl =
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  "https://xbirnlsbckbcjbxqkmjn.supabase.co";

const publicSupabasePublishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_D06VufRmNrbKI6Fe0OF70Q_Wzr5pkBn";

const publicSupabaseProjectId =
  process.env.VITE_SUPABASE_PROJECT_ID ??
  process.env.SUPABASE_PROJECT_ID ??
  "xbirnlsbckbcjbxqkmjn";

const publicEnv = {
  "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(publicSupabaseUrl),
  "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
    publicSupabasePublishableKey,
  ),
  "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
    publicSupabaseProjectId,
  ),
  // Some generated/shared modules still include process.env fallbacks in code
  // that reaches the browser bundle. Replace those public values as well.
  "process.env.SUPABASE_URL": JSON.stringify(publicSupabaseUrl),
  "process.env.SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
    publicSupabasePublishableKey,
  ),
  "process.env.SUPABASE_PROJECT_ID": JSON.stringify(publicSupabaseProjectId),
};

// The hosted MCP plugin currently fails to normalize TanStack route paths on
// native Windows builds (for example F:\\pos-sezapos versus F:/pos-sezapos).
// It is build tooling only, so keep it enabled on Lovable's Linux builder and
// skip it for local Windows/Android builds.
const enableMcpPlugin = process.platform !== "win32";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: enableMcpPlugin ? [mcpPlugin()] : [],
    define: publicEnv,
  },
});
