import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

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
  const supabaseProjectId =
    env.VITE_SUPABASE_PROJECT_ID || env.SUPABASE_PROJECT_ID || FALLBACK_SUPABASE_PROJECT_ID;

  if (supabasePublishableKey.startsWith("sb_secret_")) {
    throw new Error("Refusing to build: a secret Supabase key was supplied as a public key.");
  }

  return {
    plugins: [tanstackStart(), tailwindcss(), tsConfigPaths(), viteReact()],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(supabaseProjectId),
      "process.env.SUPABASE_URL": JSON.stringify(supabaseUrl),
      "process.env.SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
      "process.env.SUPABASE_PROJECT_ID": JSON.stringify(supabaseProjectId),
    },
  };
});
