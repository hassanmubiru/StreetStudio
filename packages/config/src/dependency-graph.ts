/**
 * Package dependency-graph acyclicity checker (Requirement 2.5).
 *
 * StreetStudio requires an acyclic dependency graph among its workspace
 * packages. This module derives the dependency graph from package manifests
 * (the `apps/*` and `packages/*` workspaces), detects cycles, and exposes a
 * checker that CI can run to fail the build on any cycle.
 *
 * The graph algorithms operate on a plain adjacency map so they can be tested
 * in isolation against arbitrary graphs; the manifest/filesystem helpers layer
 * the StreetStudio-specific derivation on top.
 *
 * This file is build tooling and intentionally depends only on Node built-ins
 * so it can run in CI without requiring other workspace packages to be built.
 */
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** The dependency-manifest fields that can create a workspace edge. */
export type DependencyField =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies"
  | "optionalDependencies";

/** The subset of a `package.json` this checker reads. */
export interface PackageManifest {
  readonly name: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
}

/**
 * A directed dependency graph. `edges` maps each node to the list of workspace
 * nodes it directly depends on. Edges pointing outside the workspace (for
 * example to `@streetjs/core`) are excluded because they cannot form a cycle
 * among StreetStudio packages.
 */
export interface DependencyGraph {
  readonly nodes: readonly string[];
  readonly edges: ReadonlyMap<string, readonly string[]>;
}

/** A detected cycle expressed as the node path that closes back on itself. */
export interface Cycle {
  /**
   * The ordered nodes forming the cycle. The first node is repeated as the last
   * element to make the closing edge explicit, e.g. `["a", "b", "a"]`.
   */
  readonly path: readonly string[];
}

/** The outcome of an acyclicity check. */
export interface AcyclicityResult {
  readonly acyclic: boolean;
  readonly cycles: readonly Cycle[];
}

/** Fields considered when deriving workspace edges, in priority order. */
export const DEFAULT_DEPENDENCY_FIELDS: readonly DependencyField[] = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

export interface BuildGraphOptions {
  /**
   * Which manifest dependency fields contribute edges. Defaults to all four.
   * Only edges whose target is another manifest in `manifests` are retained.
   */
  readonly fields?: readonly DependencyField[];
}

/**
 * Build a dependency graph from a set of package manifests. Only edges to other
 * packages present in `manifests` are kept, so external dependencies are
 * ignored. The result is deterministic (nodes and edges sorted by name).
 */
export function buildDependencyGraph(
  manifests: readonly PackageManifest[],
  options: BuildGraphOptions = {},
): DependencyGraph {
  const fields = options.fields ?? DEFAULT_DEPENDENCY_FIELDS;

  const seen = new Set<string>();
  for (const manifest of manifests) {
    if (seen.has(manifest.name)) {
      throw new Error(
        `Duplicate package name in workspace manifests: ${manifest.name}`,
      );
    }
    seen.add(manifest.name);
  }

  const workspaceNames = seen;
  const nodes = [...workspaceNames].sort();

  const edges = new Map<string, readonly string[]>();
  for (const manifest of manifests) {
    const targets = new Set<string>();
    for (const field of fields) {
      const deps = manifest[field];
      if (!deps) continue;
      for (const depName of Object.keys(deps)) {
        // Ignore external deps and self-references.
        if (depName === manifest.name) continue;
        if (workspaceNames.has(depName)) {
          targets.add(depName);
        }
      }
    }
    edges.set(manifest.name, [...targets].sort());
  }

  return { nodes, edges };
}

/**
 * Detect every cycle in a directed graph using depth-first search with node
 * coloring (white/gray/black). Returns one representative path per cycle
 * discovered via a distinct back edge. An empty array means the graph is
 * acyclic.
 *
 * This is intentionally a straightforward, well-understood algorithm so it can
 * serve as its own reference implementation.
 */
export function detectCycles(
  edges: ReadonlyMap<string, readonly string[]>,
): Cycle[] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const color = new Map<string, number>();
  // Ensure every node referenced as a source is known.
  for (const node of edges.keys()) color.set(node, WHITE);

  const cycles: Cycle[] = [];
  const seenCycleKeys = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const recordCycle = (backEdgeTarget: string): void => {
    const startIndex = stack.indexOf(backEdgeTarget);
    if (startIndex === -1) return;
    const cycleNodes = stack.slice(startIndex);
    // Canonicalize (rotate to the lexicographically smallest node) so the same
    // cycle discovered from different entry points is not double-counted.
    const key = canonicalCycleKey(cycleNodes);
    if (seenCycleKeys.has(key)) return;
    seenCycleKeys.add(key);
    cycles.push({ path: [...cycleNodes, backEdgeTarget] });
  };

  const visit = (node: string): void => {
    color.set(node, GRAY);
    stack.push(node);
    onStack.add(node);

    for (const next of edges.get(node) ?? []) {
      const nextColor = color.get(next) ?? WHITE;
      if (nextColor === GRAY && onStack.has(next)) {
        recordCycle(next);
      } else if (nextColor === WHITE) {
        visit(next);
      }
    }

    stack.pop();
    onStack.delete(node);
    color.set(node, BLACK);
  };

  for (const node of [...edges.keys()].sort()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      visit(node);
    }
  }

  return cycles;
}

/** Produce a rotation-invariant key for a cycle's node list. */
function canonicalCycleKey(cycleNodes: readonly string[]): string {
  if (cycleNodes.length === 0) return "";
  let minIndex = 0;
  for (let i = 1; i < cycleNodes.length; i++) {
    if ((cycleNodes[i] as string) < (cycleNodes[minIndex] as string)) {
      minIndex = i;
    }
  }
  const rotated = [
    ...cycleNodes.slice(minIndex),
    ...cycleNodes.slice(0, minIndex),
  ];
  return rotated.join("->");
}

/** True when the graph contains no cycle. */
export function isAcyclic(
  edges: ReadonlyMap<string, readonly string[]>,
): boolean {
  return detectCycles(edges).length === 0;
}

/** Run the acyclicity check against a dependency graph. */
export function checkAcyclicity(graph: DependencyGraph): AcyclicityResult {
  const cycles = detectCycles(graph.edges);
  return { acyclic: cycles.length === 0, cycles };
}

/** Convenience: build the graph from manifests and check it in one call. */
export function checkManifestsAcyclicity(
  manifests: readonly PackageManifest[],
  options: BuildGraphOptions = {},
): AcyclicityResult {
  return checkAcyclicity(buildDependencyGraph(manifests, options));
}

/** The workspace globs StreetStudio uses, relative to the repo root. */
export const WORKSPACE_DIRS: readonly string[] = ["apps", "packages"];

/**
 * Read every workspace package manifest under `apps/*` and `packages/*` from a
 * repository root. Directories without a `package.json` are skipped.
 */
export async function readWorkspaceManifests(
  rootDir: string,
): Promise<PackageManifest[]> {
  const manifests: PackageManifest[] = [];

  for (const workspaceDir of WORKSPACE_DIRS) {
    const absWorkspace = join(rootDir, workspaceDir);
    if (!existsSync(absWorkspace)) continue;

    const entries = await readdir(absWorkspace, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(absWorkspace, entry.name, "package.json");
      if (!existsSync(manifestPath)) continue;

      const raw = await readFile(manifestPath, "utf8");
      const parsed = JSON.parse(raw) as PackageManifest;
      if (typeof parsed.name !== "string" || parsed.name.length === 0) {
        throw new Error(`Manifest at ${manifestPath} is missing a "name".`);
      }
      manifests.push(parsed);
    }
  }

  return manifests;
}

/**
 * Derive the workspace dependency graph from the manifests at `rootDir` and
 * check that it is acyclic. This is the entry point CI uses.
 */
export async function checkWorkspaceAcyclicity(
  rootDir: string,
  options: BuildGraphOptions = {},
): Promise<AcyclicityResult> {
  const manifests = await readWorkspaceManifests(rootDir);
  return checkManifestsAcyclicity(manifests, options);
}

/** Render a human-readable report for CI logs. */
export function formatAcyclicityReport(result: AcyclicityResult): string {
  if (result.acyclic) {
    return "Package dependency graph is acyclic.";
  }
  const lines = ["Package dependency graph contains cycles:"];
  for (const cycle of result.cycles) {
    lines.push(`  - ${cycle.path.join(" -> ")}`);
  }
  return lines.join("\n");
}
