import { defineWorkspace } from "vitest/config";

// -----------------------------------------------------------------------------
// Test category projects (Requirement 32.1)
//
// StreetStudio's suite is split into the seven categories mandated by R32.1:
// unit, integration, contract, end-to-end, performance benchmark, load, and
// media pipeline. Each category is a Vitest "project" selected by file-name
// convention so CI can run — and report — them independently:
//
//   unit         *.test.ts / *.spec.ts   (excluding the category suffixes below)
//   integration  *.integration.test.ts
//   contract     *.contract.test.ts
//   e2e          *.e2e.test.ts
//   perf         *.perf.test.ts
//   load         *.load.test.ts
//   media        *.media.test.ts
//
// Run a single category with:  vitest run --project <name>
// Coverage/reporter settings are global and live in vitest.config.ts.
//
// `passWithNoTests` keeps a category green while its tests are still being
// authored (task 41.2) — the category is wired and executable, so it never
// blocks CI merely for being empty, but it fails loudly when a test fails.
// -----------------------------------------------------------------------------

const shared = {
  globals: true,
  environment: "node" as const,
  setupFiles: ["./vitest.setup.ts"],
  passWithNoTests: true,
  exclude: ["**/node_modules/**", "**/dist/**"],
};

// Suffixes that identify a non-unit category. The unit project excludes these
// so a `*.integration.test.ts` file is never double-counted as a unit test.
const categorySuffixes = [
  "integration",
  "contract",
  "e2e",
  "perf",
  "load",
  "media",
] as const;

const categorySuffixExcludes = categorySuffixes.map(
  (suffix) => `**/*.${suffix}.test.ts`,
);

function categoryProject(name: (typeof categorySuffixes)[number]) {
  return {
    test: {
      ...shared,
      name,
      include: [
        `apps/**/*.${name}.test.ts`,
        `packages/**/*.${name}.test.ts`,
      ],
    },
  };
}

export default defineWorkspace([
  {
    test: {
      ...shared,
      name: "unit",
      // Everything matching the standard test/spec convention (including the
      // *.property.test.ts property-based tests) EXCEPT the dedicated category
      // suffixes, which are covered by their own projects.
      include: [
        "apps/**/*.{test,spec}.ts",
        "packages/**/*.{test,spec}.ts",
      ],
      exclude: [...shared.exclude, ...categorySuffixExcludes],
    },
  },
  categoryProject("integration"),
  categoryProject("contract"),
  categoryProject("e2e"),
  categoryProject("perf"),
  categoryProject("load"),
  categoryProject("media"),
]);
