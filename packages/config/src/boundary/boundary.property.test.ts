import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { classifyImport, defaultBoundaryConfig, DEFAULT_VENDOR_MODULES } from "./rules.js";
import { analyzeFiles, type SourceFile } from "./analyzer.js";
import { BoundaryErrorCode, type BoundaryErrorCode as Code, type PackageInfo } from "./types.js";

/**
 * Property 1: Import boundary enforcement.
 *
 * Feature: streetstudio, Property 1: Import boundary enforcement
 *
 * Validates: Requirements 1.1, 1.3, 1.6, 2.4, 2.6, 22.6
 *
 * The import-boundary analyzer must reject every disallowed import with the
 * correct named error code — StreetJS internals / on-disk StreetJS paths
 * (DISALLOWED_STREETJS_IMPORT), cross-package internal-module imports
 * (DISALLOWED_INTERNAL_IMPORT), and AI/billing vendor implementations inside
 * platform core (DISALLOWED_AI_VENDOR) — while permitting valid entry-point
 * imports, same-package relative imports, unrelated third-party dependencies,
 * and vendor imports inside AI/billing plugin packages.
 */

const ROOT = "/repo";

const mkPkg = (
  name: string,
  folder: string,
  entryPoints: readonly string[],
  isCore: boolean
): PackageInfo => ({ name, dir: `${ROOT}/packages/${folder}`, entryPoints, isCore });

// A representative slice of the workspace: several core packages (one with a
// declared non-root entry point) and two AI/billing plugin packages.
const media = mkPkg("@streetstudio/media", "media", [], true);
const auth = mkPkg("@streetstudio/auth", "auth", [], true);
const shared = mkPkg("@streetstudio/shared", "shared", [], true);
const database = mkPkg("@streetstudio/database", "database", [], true);
const ui = mkPkg("@streetstudio/ui", "ui", ["components"], true);
const aiPlugin = mkPkg("@streetstudio/ai-openai", "plugins/ai-openai", [], false);
const billingPlugin = mkPkg("@streetstudio/billing-stripe", "plugins/billing-stripe", [], false);

const corePackages = [media, auth, shared, database, ui];
const emptyEntryCorePackages = [media, auth, shared, database];
const pluginPackages = [aiPlugin, billingPlugin];
const allPackages = [...corePackages, ...pluginPackages];

const packagesByName = new Map(allPackages.map((p) => [p.name, p]));
const config = defaultBoundaryConfig(ROOT);

// --- Generators -----------------------------------------------------------

const identChar = fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split(""));
const ident = fc.array(identChar, { minLength: 1, maxLength: 8 }).map((a) => a.join(""));
const subpath = fc.array(ident, { minLength: 1, maxLength: 3 }).map((a) => a.join("/"));

const folderOf = (pkg: PackageInfo) => pkg.dir.slice(`${ROOT}/packages/`.length);

/** One classifiable scenario: an import written inside a specific package. */
interface Scenario {
  readonly specifier: string;
  readonly importingPackage: PackageInfo;
  /** Expected violation code, or null when the import is permitted. */
  readonly expected: Code | null;
  readonly label: string;
}

// 1. StreetJS internal (deep) import via a bare specifier -> DISALLOWED_STREETJS_IMPORT.
const streetjsInternalScenario: fc.Arbitrary<Scenario> = fc
  .tuple(
    fc.constantFrom("@streetjs/core", "@streetjs/queue", "@streetjs/http", "streetjs"),
    subpath,
    fc.constantFrom(...allPackages)
  )
  .map(([pkg, sub, importingPackage]) => ({
    specifier: `${pkg}/${sub}`,
    importingPackage,
    expected: BoundaryErrorCode.DISALLOWED_STREETJS_IMPORT,
    label: "streetjs-internal",
  }));

// 2. Relative/absolute path resolving into the StreetJS repo -> DISALLOWED_STREETJS_IMPORT.
const streetjsPathScenario: fc.Arbitrary<Scenario> = fc
  .tuple(
    fc.constantFrom("StreetJS", "streetjs", "street-js", "Street-JS"),
    subpath,
    fc.constantFrom(...allPackages)
  )
  .map(([marker, sub, importingPackage]) => ({
    // Enough "../" segments to escape the workspace to the filesystem root,
    // then descend into a StreetJS-named directory.
    specifier: `${"../".repeat(8)}${marker}/${sub}`,
    importingPackage,
    expected: BoundaryErrorCode.DISALLOWED_STREETJS_IMPORT,
    label: "streetjs-path",
  }));

// 3a. Cross-package internal import via a bare specifier -> DISALLOWED_INTERNAL_IMPORT.
const internalBareScenario: fc.Arbitrary<Scenario> = fc
  .constantFrom(...corePackages)
  .chain((importingPackage) =>
    fc
      .tuple(
        fc.constantFrom(
          ...emptyEntryCorePackages.filter((p) => p.name !== importingPackage.name)
        ),
        subpath
      )
      .map(([target, sub]) => ({
        specifier: `${target.name}/${sub}`,
        importingPackage,
        expected: BoundaryErrorCode.DISALLOWED_INTERNAL_IMPORT,
        label: "internal-bare",
      }))
  );

// 3b. Relative path escaping into another package's internals -> DISALLOWED_INTERNAL_IMPORT.
const internalPathScenario: fc.Arbitrary<Scenario> = fc
  .tuple(
    fc.constantFrom(...allPackages.filter((p) => p.name !== media.name)),
    subpath
  )
  .map(([target, sub]) => ({
    // Importing file lives in /repo/packages/media/src; step up to packages/
    // and down into the target package's own source tree.
    specifier: `../../${folderOf(target)}/src/${sub}`,
    importingPackage: media,
    expected: BoundaryErrorCode.DISALLOWED_INTERNAL_IMPORT,
    label: "internal-path",
  }));

// 4. AI/billing vendor implementation inside platform core -> DISALLOWED_AI_VENDOR.
const vendorInCoreScenario: fc.Arbitrary<Scenario> = fc
  .tuple(
    fc.constantFrom(...DEFAULT_VENDOR_MODULES),
    fc.option(subpath, { nil: undefined }),
    fc.constantFrom(...corePackages)
  )
  .map(([vendor, sub, importingPackage]) => ({
    specifier: sub === undefined ? vendor : `${vendor}/${sub}`,
    importingPackage,
    expected: BoundaryErrorCode.DISALLOWED_AI_VENDOR,
    label: "vendor-in-core",
  }));

// --- Allowed (expected: null) scenarios -----------------------------------

// 5a. Bare StreetJS public entry point.
const streetjsEntryScenario: fc.Arbitrary<Scenario> = fc
  .tuple(
    fc.constantFrom("@streetjs/core", "@streetjs/queue", "streetjs"),
    fc.constantFrom(...allPackages)
  )
  .map(([pkg, importingPackage]) => ({
    specifier: pkg,
    importingPackage,
    expected: null,
    label: "streetjs-entry",
  }));

// 5b. Bare workspace package entry point.
const packageEntryScenario: fc.Arbitrary<Scenario> = fc
  .tuple(fc.constantFrom(...allPackages), fc.constantFrom(...allPackages))
  .map(([target, importingPackage]) => ({
    specifier: target.name,
    importingPackage,
    expected: null,
    label: "package-entry",
  }));

// 5c. Declared non-root entry point of a package.
const declaredSubEntryScenario: fc.Arbitrary<Scenario> = fc
  .constantFrom(...allPackages)
  .map((importingPackage) => ({
    specifier: "@streetstudio/ui/components",
    importingPackage,
    expected: null,
    label: "declared-sub-entry",
  }));

// 5d. Relative import staying within the importing package.
const sameePackageRelativeScenario: fc.Arbitrary<Scenario> = fc
  .tuple(fc.constantFrom(...allPackages), subpath)
  .map(([importingPackage, sub]) => ({
    specifier: `./${sub}.js`,
    importingPackage,
    expected: null,
    label: "same-package-relative",
  }));

// 5e. Unrelated third-party dependency in core code.
const thirdPartyScenario: fc.Arbitrary<Scenario> = fc
  .tuple(
    fc.constantFrom("zod", "lodash", "react", "express", "node:path", "node:fs"),
    fc.constantFrom(...corePackages)
  )
  .map(([pkg, importingPackage]) => ({
    specifier: pkg,
    importingPackage,
    expected: null,
    label: "third-party",
  }));

// 5f. Vendor implementation inside an AI/billing plugin package (permitted).
const vendorInPluginScenario: fc.Arbitrary<Scenario> = fc
  .tuple(fc.constantFrom(...DEFAULT_VENDOR_MODULES), fc.constantFrom(...pluginPackages))
  .map(([vendor, importingPackage]) => ({
    specifier: vendor,
    importingPackage,
    expected: null,
    label: "vendor-in-plugin",
  }));

const scenario: fc.Arbitrary<Scenario> = fc.oneof(
  streetjsInternalScenario,
  streetjsPathScenario,
  internalBareScenario,
  internalPathScenario,
  vendorInCoreScenario,
  streetjsEntryScenario,
  packageEntryScenario,
  declaredSubEntryScenario,
  sameePackageRelativeScenario,
  thirdPartyScenario,
  vendorInPluginScenario
);

function fileFor(pkg: PackageInfo, name: string): string {
  return `${pkg.dir}/src/${name}.ts`;
}

describe("Feature: streetstudio, Property 1: Import boundary enforcement", () => {
  it("classifies each import with the correct named error code (or permits it)", () => {
    fc.assert(
      fc.property(scenario, fc.integer({ min: 0, max: 1_000_000 }), (sc, n) => {
        const file = fileFor(sc.importingPackage, `f${n}`);
        const result = classifyImport(
          { specifier: sc.specifier, line: 1, kind: "import" },
          {
            importingFile: file,
            importingPackage: sc.importingPackage,
            packagesByName,
            config,
          }
        );
        if (sc.expected === null) {
          expect(result, `${sc.label}: "${sc.specifier}" should be permitted`).toBeNull();
        } else {
          expect(result, `${sc.label}: "${sc.specifier}" should be rejected`).not.toBeNull();
          expect(result?.code, `${sc.label}: "${sc.specifier}"`).toBe(sc.expected);
        }
      }),
      { numRuns: 300 }
    );
  });

  it("aggregates the exact multiset of violations across a set of files", () => {
    fc.assert(
      fc.property(fc.array(scenario, { minLength: 1, maxLength: 12 }), (scenarios) => {
        const files: SourceFile[] = scenarios.map((sc, i) => ({
          path: fileFor(sc.importingPackage, `agg_${i}`),
          content: `import x from ${JSON.stringify(sc.specifier)};`,
        }));

        const result = analyzeFiles(files, allPackages, config);

        // Every file belongs to a known package, so all are scanned.
        expect(result.filesScanned).toBe(files.length);

        const expectedCodes = scenarios
          .map((sc) => sc.expected)
          .filter((c): c is Code => c !== null)
          .sort();
        const actualCodes = result.violations.map((v) => v.code).sort();
        expect(actualCodes).toEqual(expectedCodes);
      }),
      { numRuns: 300 }
    );
  });
});
