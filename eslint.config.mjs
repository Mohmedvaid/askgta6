import js from "@eslint/js";
import next from "eslint-config-next";
import tseslint from "typescript-eslint";
import theme from "./eslint-local/no-raw-color.mjs";

export default tseslint.config(
  { ignores: [".next/**", "coverage/**", "node_modules/**", "next-env.d.ts", "test-results/**", "playwright-report/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "actions/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    plugins: { theme },
    rules: { "theme/no-raw-color": "error" },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
    },
  },
);
