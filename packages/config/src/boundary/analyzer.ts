/**
 * Project-level orchestration for the import-boundary analyzer.
 *
 * `analyzeFiles` is a pure function over already-loaded file contents, which
 * makes it straightforward to test. `analyzeProject` is the thin file-system
 * layer that discovers workspace packages, reads their sources, and delegates
 * to `analyzeFiles`.
 */
import fs from "node:fs";
import path from "node:path";
import { extractImports } from "./imports.js";
import { classifyImport, defaultBoundaryConfig } from "./rules.js";
import type {
  AnalysisResult,
  BoundaryConfig,
  BoundaryViolation,
  PackageInfo,
} from "./types.js";

/** A source file paired with its contents. */
export interface SourceFile {
  /** Absolute path to the file. */
  readonly path: string;
  /** File contents. */
  readonly content: string;
}

/** Return the package that owns `filePath`, choosing the most specific match. */
function owningPackage(
  filePath: string,
  packages: readonly PackageInfo[]
): PackageInfo | undefined {
  let best: PackageInfo | undefined;
  for (const pkg of packages) {
    const rel = path.relative(pkg.dir, filePath);
    const inside = !rel.startsWith("..") && !path.isAbsolute(rel);
    if (!inside) continue;
    if (best === undefined || pkg.dir.length > best.dir.length) best = pkg;
  }
  return best;
}

/**
 * Analyze already-loaded source files against the boundary rules. Files that do
 * not belong to any known package are skipped.
 */
export function analyzeFiles(
  files: readonly SourceFile[],
  packages: readonly PackageInfo[],
  config: BoundaryConfig
): AnalysisResult {
  const packagesByName = new Map(packages.map((p) => [p.name, p]));
  const violations: BoundaryViolation[] = [];
  let filesScanned = 0;

  for (const file of files) {
    const importingPackage = owningPackage(file.path, packages);
    if (!importingPackage) continue;
    filesScanned++;

    for (const ref of extractImports(file.content)) {
      const result = classifyImport(ref, {
        importingFile: file.path,
        importingPackage,
        packagesByName,
        config,
      });
      if (result) violations.push(result);
    }
  }

  return { violations, filesScanned };
}

// --- File-system discovery ------------------------------------------------

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const SKIP_DIRECTORIES = new Set(["node_modules", "dist", ".git", ".kiro"]);

function isSourceFile(filePath: string): boolean {
  if (filePath.endsWith(".d.ts")) return false;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath)) return false;
  return SOURCE_EXTENSIONS.has(path.extname(filePath));
}

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
}

/** Expand a workspace glob such as "packages/*" into concrete directories. */
function expandWorkspaceGlob(root: string, pattern: string): string[] {
  const normalized = pattern.replace(/\\/g, "/");
  if (normalized.endsWith("/*")) {
    const base = path.join(root, normalized.slice(0, -2));
    try {
      return fs
        .readdirSync(base, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => path.join(base, e.name));
    } catch {
      return [];
    }
  }
  return [path.join(root, normalized)];
}

interface RawManifest {
  name?: string;
  exports?: unknown;
  streetstudio?: { pluginKind?: string };
}

/** Derive the public entry-point subpaths from a manifest `exports` field. */
function entryPointsFromExports(exportsField: unknown): string[] {
  const entries: string[] = [];
  if (exportsField && typeof exportsField === "object") {
    for (const key of Object.keys(exportsField as Record<string, unknown>)) {
      if (key === ".") continue; // root entry is always implicitly allowed
      const normalized = key.startsWith("./") ? key.slice(2) : key;
      if (normalized) entries.push(normalized);
    }
  }
  return entries;
}

/** Read a package manifest into a {@link PackageInfo}, or `undefined`. */
function readPackageInfo(dir: string): PackageInfo | undefined {
  const manifestPath = path.join(dir, "package.json");
  let manifest: RawManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as RawManifest;
  } catch {
    return undefined;
  }
  if (!manifest.name) return undefined;
  const pluginKind = manifest.streetstudio?.pluginKind;
  const isCore = pluginKind !== "ai" && pluginKind !== "billing";
  return {
    name: manifest.name,
    dir,
    entryPoints: entryPointsFromExports(manifest.exports),
    isCore,
  };
}

/** Discover every workspace package declared in the root manifest. */
export function discoverPackages(workspaceRoot: string): PackageInfo[] {
  const rootManifestPath = path.join(workspaceRoot, "package.json");
  let workspaces: string[] = [];
  try {
    const rootManifest = JSON.parse(
      fs.readFileSync(rootManifestPath, "utf8")
    ) as { workspaces?: string[] | { packages?: string[] } };
    const ws = rootManifest.workspaces;
    workspaces = Array.isArray(ws) ? ws : ws?.packages ?? [];
  } catch {
    workspaces = [];
  }

  const packages: PackageInfo[] = [];
  for (const pattern of workspaces) {
    for (const dir of expandWorkspaceGlob(workspaceRoot, pattern)) {
      const info = readPackageInfo(dir);
      if (info) packages.push(info);
    }
  }
  return packages;
}

/**
 * Discover packages, read their sources, and run the boundary analysis over the
 * entire workspace rooted at `workspaceRoot`.
 */
export function analyzeProject(
  workspaceRoot: string,
  overrides?: Partial<BoundaryConfig>
): AnalysisResult {
  const config: BoundaryConfig = {
    ...defaultBoundaryConfig(workspaceRoot),
    ...overrides,
  };
  const packages = discoverPackages(workspaceRoot);

  const files: SourceFile[] = [];
  for (const pkg of packages) {
    const found: string[] = [];
    walk(pkg.dir, found);
    for (const filePath of found) {
      files.push({ path: filePath, content: fs.readFileSync(filePath, "utf8") });
    }
  }

  return analyzeFiles(files, packages, config);
}
