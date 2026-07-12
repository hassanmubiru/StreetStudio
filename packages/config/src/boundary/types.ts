/**
 * Types and named error codes for the import-boundary analyzer.
 *
 * The analyzer enforces three boundary rules at build/CI time (Requirements
 * 1.3, 1.6, 2.4, 2.6, 22.6):
 *
 *  1. StreetJS boundary  — no import may resolve to a StreetJS internal module
 *     or to a file-system path inside the StreetJS repository. Only StreetJS
 *     public package entry points are permitted.
 *  2. Package boundary    — no cross-package import may resolve to another
 *     package's internal module; only declared entry points are allowed.
 *  3. AI/billing vendor   — platform core code (anything outside an AI or
 *     billing plugin) may not import a specific AI or billing vendor
 *     implementation.
 */

/** Named error codes emitted on a boundary violation. */
export const BoundaryErrorCode = {
  /** Import resolves to a StreetJS internal module or a path inside the StreetJS repo. */
  DISALLOWED_STREETJS_IMPORT: "DISALLOWED_STREETJS_IMPORT",
  /** Import resolves to another package's internal module rather than a declared entry point. */
  DISALLOWED_INTERNAL_IMPORT: "DISALLOWED_INTERNAL_IMPORT",
  /** Platform core code references a specific AI or billing vendor implementation. */
  DISALLOWED_AI_VENDOR: "DISALLOWED_AI_VENDOR",
} as const;

export type BoundaryErrorCode =
  (typeof BoundaryErrorCode)[keyof typeof BoundaryErrorCode];

/** How a specifier was referenced in source. */
export type ImportKind = "import" | "export" | "dynamic-import" | "require";

/** A single import/export/require specifier found in a source file. */
export interface ImportRef {
  /** The raw module specifier as written in source, e.g. "@streetstudio/media". */
  readonly specifier: string;
  /** 1-based line number where the specifier occurs. */
  readonly line: number;
  /** How the specifier was referenced. */
  readonly kind: ImportKind;
}

/** Metadata describing one workspace package (or app). */
export interface PackageInfo {
  /** Package name, e.g. "@streetstudio/media". */
  readonly name: string;
  /** Absolute path to the package directory. */
  readonly dir: string;
  /**
   * Public subpath specifiers exposed by the manifest, relative to the package
   * name. "." is the root entry point. Any bare package import is allowed; a
   * subpath import is allowed only if it appears here.
   */
  readonly entryPoints: readonly string[];
  /**
   * True for platform core code. False only for AI/billing plugin packages,
   * which are permitted to reference a concrete vendor implementation.
   */
  readonly isCore: boolean;
}

/** Configuration controlling how specifiers are classified. */
export interface BoundaryConfig {
  /** Absolute path to the monorepo root. */
  readonly workspaceRoot: string;
  /** StreetJS public packages that may be imported at their bare entry point. */
  readonly streetjsPackages: readonly string[];
  /**
   * Path segments (case-insensitive) that identify the StreetJS repository on
   * disk. A relative/absolute import resolving outside the workspace whose path
   * contains one of these segments is a disallowed file-system reference.
   */
  readonly streetjsRepoMarkers: readonly string[];
  /**
   * Package names (or scoped prefixes ending in "/") of concrete AI or billing
   * vendor SDKs that must not appear in platform core code.
   */
  readonly vendorModules: readonly string[];
}

/** A detected boundary violation. */
export interface BoundaryViolation {
  readonly code: BoundaryErrorCode;
  /** Absolute path to the file containing the offending import. */
  readonly file: string;
  /** 1-based line number of the offending import. */
  readonly line: number;
  /** The offending module specifier. */
  readonly specifier: string;
  /** Human-readable explanation of why the import is disallowed. */
  readonly message: string;
}

/** Result of analyzing a set of files. */
export interface AnalysisResult {
  readonly violations: readonly BoundaryViolation[];
  readonly filesScanned: number;
}
