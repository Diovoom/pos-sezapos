// The hosted web Vite configuration already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

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
  },
});
