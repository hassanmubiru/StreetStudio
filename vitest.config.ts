import { defineConfig } from "vitest/config";

// Central test-runner configuration. Property-based tests use fast-check
// with a minimum of 100 iterations, per the StreetStudio design.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "apps/**/*.{test,spec}.ts",
      "packages/**/*.{test,spec}.ts"
    ],
    exclude: ["**/node_modules/**", "**/dist/**"]
  }
});
