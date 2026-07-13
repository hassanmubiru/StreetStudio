import { defineConfig } from "vitest/config";

// Central test-runner configuration. Property-based tests use fast-check
// with a minimum of 100 iterations, per the StreetStudio design.
//
// Test categories (unit/integration/contract/e2e/perf/load/media) are defined
// as projects in `vitest.workspace.ts` (Requirement 32.1). The settings here
// apply globally — most importantly the coverage gate below.
//
// Coverage gate (Requirement 32.5): CI runs `vitest run --coverage` and the
// build fails when line coverage drops below 80%. The `thresholds.lines`
// value makes Vitest exit non-zero on its own when the bar is missed.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // A category may have no tests yet while task 41.2 authors its suite; an
    // empty-but-wired category must not fail CI (R32.1). A category that DOES
    // have tests still fails loudly when one of them fails.
    passWithNoTests: true,
    include: [
      "apps/**/*.{test,spec}.ts",
      "packages/**/*.{test,spec}.ts"
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      all: true,
      include: [
        "apps/**/src/**/*.ts",
        "packages/**/src/**/*.ts"
      ],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/index.ts",
        "**/*.cli.ts",
        "**/*.d.ts"
      ],
      // R32.5: fail the build below 80% line coverage.
      thresholds: {
        lines: 80
      }
    }
  }
});
