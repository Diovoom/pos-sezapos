import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".lovable/**",
      "android/**",
      "capacitor-shell/**",
      "dist/**",
      "build/**",
      "node_modules/**",
      ".output/**",
      ".vinxi/**",
      "src/integrations/supabase/types.ts",
      "src/routeTree.gen.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js server-only package. Rename the module to *.server.ts or use the TanStack server-only marker.",
            },
          ],
        },
      ],

      // These are maintenance concerns, not release-blocking correctness errors.
      // Formatting is checked separately with npm run format:check.
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
);
