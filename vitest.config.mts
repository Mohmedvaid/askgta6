import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd()),
      // "server-only" throws on import outside a Next server build. Tests that
      // exercise server modules need it to be a no-op.
      "server-only": path.resolve(process.cwd(), "tests/unit/server-only-stub.ts"),
    },
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./tests/unit/setup.ts"],
          include: ["tests/unit/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: ["tests/db/**/*.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["lib/**/*.{ts,tsx}", "actions/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
      exclude: ["lib/theme/fonts.ts", "lib/supabase/**", "**/*.d.ts"],
      thresholds: { lines: 80, branches: 80 },
    },
  },
});
