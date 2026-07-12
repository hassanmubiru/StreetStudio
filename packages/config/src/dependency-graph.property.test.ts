import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildDependencyGraph,
  detectCycles,
  isAcyclic,
  checkManifestsAcyclicity,
  checkWorkspaceAcyclicity,
  type DependencyField,
  type PackageManifest,
} from "./dependency-graph.js";

/**
 * Property 2: Package dependency graph is acyclic.
 *
 * Feature: streetstudio, Property 2: Package dependency graph is acyclic
 *
 * *For any* dependency graph derived from package manifests, the acyclicity
 * detector agrees with a reference cycle-detection algorithm, and the graph
 * built from the real manifests contains no cycle.
 *
 * **Validates: Requirements 2.5**
 */

const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

// ---------------------------------------------------------------------------
// Reference implementation: independent cycle detection via Kahn's algorithm
// (repeated removal of in-degree-zero nodes). A graph is acyclic iff every
// node can be removed this way. This is algorithmically distinct from the
// DFS node-coloring detector under test, so agreement is meaningful.
// ---------------------------------------------------------------------------
function isAcyclicReference(
  edges: ReadonlyMap<string, readonly string[]>,
): boolean {
  const inDegree = new Map<string, number>();
  for (const node of edges.keys()) inDegree.set(node, 0);
  for (const [, targets] of edges) {
    for (const target of targets) {
      inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) queue.push(node);
  }

  let removed = 0;
  while (queue.length > 0) {
    const node = queue.shift() as string;
    removed++;
    for (const target of edges.get(node) ?? []) {
      const next = (inDegree.get(target) ?? 0) - 1;
      inDegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }

  return removed === inDegree.size;
}

/** A cycle path is genuine when consecutive nodes are connected and it closes. */
function isGenuineCycle(
  edges: ReadonlyMap<string, readonly string[]>,
  path: readonly string[],
): boolean {
  if (path.length < 2) return false;
  if (path[0] !== path[path.length - 1]) return false;
  for (let i = 0; i < path.length - 1; i++) {
    const targets = edges.get(path[i] as string) ?? [];
    if (!targets.includes(path[i + 1] as string)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** An arbitrary directed graph over `n0..n{k-1}` (self-loops allowed). */
const arbGraph = fc
  .integer({ min: 1, max: 8 })
  .chain((n) => {
    const nodes = Array.from({ length: n }, (_, i) => `n${i}`);
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        pairs.push([i, j]); // include i === j so self-loops are exercised
      }
    }
    return fc
      .array(fc.boolean(), {
        minLength: pairs.length,
        maxLength: pairs.length,
      })
      .map((present) => {
        const edges = new Map<string, string[]>();
        for (const node of nodes) edges.set(node, []);
        pairs.forEach(([i, j], idx) => {
          if (present[idx]) {
            (edges.get(nodes[i] as string) as string[]).push(
              nodes[j] as string,
            );
          }
        });
        return { nodes, edges };
      });
  });

const DEP_FIELDS: readonly DependencyField[] = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

/**
 * An arbitrary set of package manifests. Each node becomes a workspace package
 * `@ss/n{i}`; edges are distributed across the four manifest dependency fields
 * so the manifest-derivation path is exercised too. Self-references are dropped
 * (buildDependencyGraph ignores them) so they never affect manifest cycles.
 */
const arbManifests = fc
  .integer({ min: 1, max: 7 })
  .chain((n) => {
    const names = Array.from({ length: n }, (_, i) => `@ss/n${i}`);
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) pairs.push([i, j]);
      }
    }
    return fc
      .array(fc.integer({ min: 0, max: DEP_FIELDS.length }), {
        minLength: pairs.length,
        maxLength: pairs.length,
      })
      .map((fieldChoices) => {
        // field index === DEP_FIELDS.length means "no edge".
        const buckets = names.map(() => ({
          dependencies: {} as Record<string, string>,
          devDependencies: {} as Record<string, string>,
          peerDependencies: {} as Record<string, string>,
          optionalDependencies: {} as Record<string, string>,
        }));
        pairs.forEach(([i, j], idx) => {
          const choice = fieldChoices[idx] as number;
          if (choice < DEP_FIELDS.length) {
            const field = DEP_FIELDS[choice] as DependencyField;
            buckets[i]![field][names[j] as string] = "*";
          }
        });
        const manifests: PackageManifest[] = names.map((name, i) => ({
          name,
          dependencies: buckets[i]!.dependencies,
          devDependencies: buckets[i]!.devDependencies,
          peerDependencies: buckets[i]!.peerDependencies,
          optionalDependencies: buckets[i]!.optionalDependencies,
        }));
        return manifests;
      });
  });

// ---------------------------------------------------------------------------
// Property 2
// ---------------------------------------------------------------------------
describe("Property 2: Package dependency graph is acyclic", () => {
  it("detector agrees with the reference algorithm on arbitrary graphs", () => {
    fc.assert(
      fc.property(arbGraph, ({ edges }) => {
        const detectorAcyclic = isAcyclic(edges);
        const referenceAcyclic = isAcyclicReference(edges);
        expect(detectorAcyclic).toBe(referenceAcyclic);
      }),
    );
  });

  it("reports a genuine cycle exactly when the graph is cyclic", () => {
    fc.assert(
      fc.property(arbGraph, ({ edges }) => {
        const cycles = detectCycles(edges);
        const cyclic = !isAcyclicReference(edges);
        // Detector reports at least one cycle iff the graph is cyclic.
        expect(cycles.length > 0).toBe(cyclic);
        // Every reported cycle is a real path in the graph that closes on itself.
        for (const cycle of cycles) {
          expect(isGenuineCycle(edges, cycle.path)).toBe(true);
        }
      }),
    );
  });

  it("agrees with the reference on graphs derived from package manifests", () => {
    fc.assert(
      fc.property(arbManifests, (manifests) => {
        const graph = buildDependencyGraph(manifests);
        const result = checkManifestsAcyclicity(manifests);
        expect(result.acyclic).toBe(isAcyclicReference(graph.edges));
        // The result is internally consistent: acyclic iff no cycles reported.
        expect(result.acyclic).toBe(result.cycles.length === 0);
      }),
    );
  });

  it("accepts any guaranteed-acyclic graph (edges only point forward)", () => {
    // Nodes ordered n0..n{k-1}; edges only go from lower to higher index, so
    // the graph is a DAG by construction and must be accepted.
    const arbDag = fc.integer({ min: 1, max: 8 }).chain((n) => {
      const nodes = Array.from({ length: n }, (_, i) => `n${i}`);
      const pairs: Array<[number, number]> = [];
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) pairs.push([i, j]);
      }
      return fc
        .array(fc.boolean(), {
          minLength: pairs.length,
          maxLength: pairs.length,
        })
        .map((present) => {
          const edges = new Map<string, string[]>();
          for (const node of nodes) edges.set(node, []);
          pairs.forEach(([i, j], idx) => {
            if (present[idx]) {
              (edges.get(nodes[i] as string) as string[]).push(
                nodes[j] as string,
              );
            }
          });
          return edges;
        });
    });

    fc.assert(
      fc.property(arbDag, (edges) => {
        expect(isAcyclic(edges)).toBe(true);
        expect(detectCycles(edges)).toEqual([]);
      }),
    );
  });

  it("detects a cycle after a back edge is added to a chain", () => {
    // A chain n0 -> n1 -> ... -> n{k-1} is acyclic; adding any back edge from a
    // later node to an earlier one must introduce a detectable cycle.
    const arbChainWithBackEdge = fc
      .integer({ min: 2, max: 8 })
      .chain((n) =>
        fc
          .tuple(
            fc.integer({ min: 0, max: n - 1 }),
            fc.integer({ min: 0, max: n - 1 }),
          )
          .map(([a, b]) => {
            const from = Math.max(a, b);
            const to = Math.min(a, b);
            return { n, from, to };
          }),
      );

    fc.assert(
      fc.property(arbChainWithBackEdge, ({ n, from, to }) => {
        const nodes = Array.from({ length: n }, (_, i) => `n${i}`);
        const edges = new Map<string, string[]>();
        for (let i = 0; i < n; i++) {
          edges.set(nodes[i] as string, i + 1 < n ? [nodes[i + 1] as string] : []);
        }
        // Add a back edge n{from} -> n{to} with from >= to.
        (edges.get(nodes[from] as string) as string[]).push(nodes[to] as string);

        // from === to is a self-loop; from > to closes the chain. Both cyclic.
        expect(isAcyclic(edges)).toBe(false);
        const cycles = detectCycles(edges);
        expect(cycles.length).toBeGreaterThan(0);
        for (const cycle of cycles) {
          expect(isGenuineCycle(edges, cycle.path)).toBe(true);
        }
      }),
    );
  });

  it("the real StreetStudio workspace graph contains no cycle", async () => {
    const result = await checkWorkspaceAcyclicity(REPO_ROOT);
    expect(result.cycles).toEqual([]);
    expect(result.acyclic).toBe(true);
  });
});
