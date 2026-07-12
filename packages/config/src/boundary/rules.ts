/**
 * Classification rules for the import-boundary analyzer.
 *
 * `classifyImport` is a pure function: given a specifier and the surrounding
 * context (which package it lives in, the known workspace packages, and the
 * boundary configuration) it returns a {@link BoundaryViolation} or `null`.
 */
import path from "node:path";
import {
  BoundaryErrorCode,
  type BoundaryConfig,
  type BoundaryViolation,
  type ImportRef,
  type PackageInfo,
} from "./types.js";

/** Default set of concrete AI and billing vendor SDKs disallowed in core. */
export const DEFAULT_VENDOR_MODULES: readonly string[] = [
  // AI vendors
  "openai",
  "@anthropic-ai/sdk",
  "@google/generative-ai",
  "@google-cloud/aiplatform",
  "cohere-ai",
  "@mistralai/mistralai",
  "@huggingface/inference",
  "replicate",
  "@aws-sdk/client-bedrock-runtime",
  "@aws-sdk/client-transcribe",
  // Billing vendors
  "stripe",
  "@stripe/stripe-js",
  "braintree",
  "@paddle/paddle-node-sdk",
  "chargebee",
  "razorpay",
  "@lemonsqueezy/lemonsqueezy.js",
];

/** Default StreetJS repo path markers used to detect file-system references. */
export const DEFAULT_STREETJS_REPO_MARKERS: readonly string[] = [
  "streetjs",
  "street-js",
];

/** Default StreetJS public packages permitted at their bare entry point. */
export const DEFAULT_STREETJS_PACKAGES: readonly string[] = ["@streetjs/core"];

/** Build a default boundary configuration rooted at `workspaceRoot`. */
export function defaultBoundaryConfig(workspaceRoot: string): BoundaryConfig {
  return {
    workspaceRoot,
    streetjsPackages: DEFAULT_STREETJS_PACKAGES,
    streetjsRepoMarkers: DEFAULT_STREETJS_REPO_MARKERS,
    vendorModules: DEFAULT_VENDOR_MODULES,
  };
}

/** True if the specifier is a relative or absolute file-system path. */
function isPathSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(specifier) // Windows drive path
  );
}

/** Extract the package name from a bare specifier, handling scoped packages. */
export function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    return parts.slice(0, 2).join("/");
  }
  return parts[0] ?? specifier;
}

/** The subpath beyond the package name, or "" for a bare entry-point import. */
export function subpathOf(specifier: string, pkgName: string): string {
  if (specifier === pkgName) return "";
  return specifier.slice(pkgName.length + 1);
}

/** True if the package name belongs to the StreetJS namespace. */
function isStreetjsPackage(pkgName: string, config: BoundaryConfig): boolean {
  return (
    config.streetjsPackages.includes(pkgName) ||
    pkgName === "streetjs" ||
    pkgName.startsWith("@streetjs/")
  );
}

/** Normalize a path to forward slashes and lower case for segment matching. */
function segments(p: string): string[] {
  return p.split(/[\\/]+/).filter(Boolean).map((s) => s.toLowerCase());
}

/** True if a resolved path lies inside the StreetJS repository. */
function isInsideStreetjsRepo(resolved: string, config: BoundaryConfig): boolean {
  const rel = path.relative(config.workspaceRoot, resolved);
  const outsideWorkspace = rel === "" ? false : rel.startsWith("..") || path.isAbsolute(rel);
  if (!outsideWorkspace) return false;
  const segs = segments(resolved);
  return config.streetjsRepoMarkers.some((marker) =>
    segs.includes(marker.toLowerCase())
  );
}

/** Find the workspace package that owns a resolved absolute path, if any. */
function findOwningPackage(
  resolved: string,
  packages: readonly PackageInfo[]
): PackageInfo | undefined {
  let best: PackageInfo | undefined;
  for (const pkg of packages) {
    const rel = path.relative(pkg.dir, resolved);
    const inside = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    if (!inside) continue;
    if (best === undefined || pkg.dir.length > best.dir.length) {
      best = pkg;
    }
  }
  return best;
}

/** True if `pkgName` (or a scoped prefix) is a disallowed vendor module. */
function isVendorModule(pkgName: string, config: BoundaryConfig): boolean {
  return config.vendorModules.some((vendor) => {
    if (vendor.endsWith("/")) return pkgName.startsWith(vendor);
    return pkgName === vendor;
  });
}

/** True if a subpath import into a workspace package is an allowed entry point. */
function entryPointAllowed(pkg: PackageInfo, subpath: string): boolean {
  // "." is the root entry (only matched when there is no subpath).
  return pkg.entryPoints.some((entry) => {
    const normalized = entry.startsWith("./") ? entry.slice(2) : entry;
    return normalized === subpath;
  });
}

export interface ClassifyContext {
  /** Absolute path of the file containing the import. */
  readonly importingFile: string;
  /** The package the importing file belongs to. */
  readonly importingPackage: PackageInfo;
  /** All known workspace packages, keyed by name. */
  readonly packagesByName: ReadonlyMap<string, PackageInfo>;
  /** Boundary configuration. */
  readonly config: BoundaryConfig;
}

function violation(
  code: BoundaryViolation["code"],
  ref: ImportRef,
  ctx: ClassifyContext,
  message: string
): BoundaryViolation {
  return {
    code,
    file: ctx.importingFile,
    line: ref.line,
    specifier: ref.specifier,
    message,
  };
}

/**
 * Classify a single import reference. Returns a violation if the import
 * crosses a boundary, or `null` if it is permitted.
 */
export function classifyImport(
  ref: ImportRef,
  ctx: ClassifyContext
): BoundaryViolation | null {
  const { config, importingFile, importingPackage } = ctx;
  const spec = ref.specifier;
  const allPackages = [...ctx.packagesByName.values()];

  // --- 1. Relative / absolute path imports ---------------------------------
  if (isPathSpecifier(spec)) {
    const resolved = path.resolve(path.dirname(importingFile), spec);

    if (isInsideStreetjsRepo(resolved, config)) {
      return violation(
        BoundaryErrorCode.DISALLOWED_STREETJS_IMPORT,
        ref,
        ctx,
        `Import "${spec}" resolves to a file-system path inside the StreetJS repository. ` +
          `Consume StreetJS only through its public package entry points.`
      );
    }

    const owner = findOwningPackage(resolved, allPackages);
    if (owner && owner.name !== importingPackage.name) {
      return violation(
        BoundaryErrorCode.DISALLOWED_INTERNAL_IMPORT,
        ref,
        ctx,
        `Import "${spec}" reaches into the internals of package "${owner.name}". ` +
          `Import it through its declared entry point ("${owner.name}") instead.`
      );
    }

    return null;
  }

  // --- 2. Bare specifiers ---------------------------------------------------
  const pkgName = packageNameOf(spec);
  const subpath = subpathOf(spec, pkgName);

  // 2a. StreetJS boundary: only the bare public entry point is permitted.
  if (isStreetjsPackage(pkgName, config)) {
    if (subpath !== "") {
      return violation(
        BoundaryErrorCode.DISALLOWED_STREETJS_IMPORT,
        ref,
        ctx,
        `Import "${spec}" reaches into a StreetJS internal module. ` +
          `Only the public entry point "${pkgName}" may be imported.`
      );
    }
    return null;
  }

  // 2b. Package boundary: cross-package imports must use a declared entry point.
  const targetPkg = ctx.packagesByName.get(pkgName);
  if (targetPkg) {
    if (subpath !== "" && !entryPointAllowed(targetPkg, subpath)) {
      return violation(
        BoundaryErrorCode.DISALLOWED_INTERNAL_IMPORT,
        ref,
        ctx,
        `Import "${spec}" targets an internal module of package "${pkgName}". ` +
          `Only its declared entry point ("${pkgName}") is public.`
      );
    }
    return null;
  }

  // 2c. AI/billing vendor boundary: forbidden in platform core code.
  if (importingPackage.isCore && isVendorModule(pkgName, config)) {
    return violation(
      BoundaryErrorCode.DISALLOWED_AI_VENDOR,
      ref,
      ctx,
      `Platform core code may not reference the AI/billing vendor "${pkgName}". ` +
        `Access this capability through an AI_Provider or billing plugin instead.`
    );
  }

  // Any other third-party dependency is permitted.
  return null;
}
