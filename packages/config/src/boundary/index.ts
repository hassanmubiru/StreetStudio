/**
 * Import-boundary analyzer — public surface.
 *
 * Enforces the StreetJS boundary, the package boundary, and the AI/billing
 * vendor boundary at build/CI time (Requirements 1.3, 1.6, 2.4, 2.6, 22.6).
 */
export {
  BoundaryErrorCode,
  type BoundaryConfig,
  type BoundaryViolation,
  type AnalysisResult,
  type ImportRef,
  type ImportKind,
  type PackageInfo,
} from "./types.js";

export { extractImports } from "./imports.js";

export {
  classifyImport,
  defaultBoundaryConfig,
  packageNameOf,
  subpathOf,
  DEFAULT_VENDOR_MODULES,
  DEFAULT_STREETJS_PACKAGES,
  DEFAULT_STREETJS_REPO_MARKERS,
  type ClassifyContext,
} from "./rules.js";

export {
  analyzeFiles,
  analyzeProject,
  discoverPackages,
  type SourceFile,
} from "./analyzer.js";

export { runCli } from "./cli.js";
