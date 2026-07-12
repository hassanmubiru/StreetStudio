import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildDependencyGraph,
  detectCycles,
  isAcyclic,
  checkAcyclicity,
  checkManifestsAcyclicity,
  checkWorkspaceAcyclicity,
  readWorkspaceManifests,
  formatAcyclicityReport,
  type PackageManifest,
} from "./dependency-graph.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function edgeMap(
  entries: Record<string, string[]>,
): Map<string, string[]> {
  return new Map(Object.entries(entries));
}

describe("buildDependencyGraph", () => {
  it("keeps edges to workspace packages and drops external dependencies", () => {
    const manifests: PackageManifest[] = [
      {
        name: "@ss/a",
        dependencies: { "@ss/b": "*", "external-lib": "^1.0.0" },
        peerDependencies: { "@streetjs/core": "^0.1.0" },
      },
      { name: "@ss/b", dependencies: { "@ss/c": "*" } },
      { name: "@ss/c" },
    ];

    const graph = buildDependencyGraph(manifests);

    expect(graph.nodes).toEqual(["@ss/a", "@ss/b", "@ss/c"]);
    expect(graph.edges.get("@ss/a")).toEqual(["@ss/b"]);
    expect(graph.edges.get("@ss/b")).toEqual(["@ss/c"]);
    expect(graph.edges.get("@ss/c")).toEqual([]);
  });

  it("ignores self-references", () => {
    const graph = buildDependencyGraph([
      { name: "@ss/a", dependencies: { "@ss/a": "*" } },
    ]);
    expect(graph.edges.get("@ss/a")).toEqual([]);
    expect(isAcyclic(graph.edges)).toBe(true);
  });

  it("throws on duplicate package names", () => {
    expect(() =>
      buildDependencyGraph([{ name: "@ss/a" }, { name: "@ss/a" }]),
    ).toThrow(/Duplicate package name/);
  });

  it("respects the configured dependency fields", () => {
    const manifests: PackageManifest[] = [
      { name: "@ss/a", devDependencies: { "@ss/b": "*" } },
      { name: "@ss/b" },
    ];
    expect(
      buildDependencyGraph(manifests, { fields: ["dependencies"] }).edges.get(
        "@ss/a",
      ),
    ).toEqual([]);
    expect(
      buildDependencyGraph(manifests, { fields: ["devDependencies"] }).edges.get(
        "@ss/a",
      ),
    ).toEqual(["@ss/b"]);
  });
});

describe("detectCycles / isAcyclic", () => {
  it("reports no cycles for an acyclic graph", () => {
    const edges = edgeMap({ a: ["b", "c"], b: ["c"], c: [] });
    expect(detectCycles(edges)).toEqual([]);
    expect(isAcyclic(edges)).toBe(true);
  });

  it("detects a self-loop", () => {
    const edges = edgeMap({ a: ["a"] });
    expect(isAcyclic(edges)).toBe(false);
    expect(detectCycles(edges)).toHaveLength(1);
  });

  it("detects a two-node cycle", () => {
    const edges = edgeMap({ a: ["b"], b: ["a"] });
    const cycles = detectCycles(edges);
    expect(cycles).toHaveLength(1);
    // Path closes back on itself.
    const path = cycles[0]!.path;
    expect(path[0]).toBe(path[path.length - 1]);
    expect(new Set(path)).toEqual(new Set(["a", "b"]));
  });

  it("detects a three-node cycle", () => {
    const edges = edgeMap({ a: ["b"], b: ["c"], c: ["a"] });
    expect(isAcyclic(edges)).toBe(false);
    expect(detectCycles(edges)).toHaveLength(1);
  });

  it("does not double-count the same cycle from different entry points", () => {
    // Two roots that both lead into a single shared cycle b -> c -> b.
    const edges = edgeMap({
      a: ["b"],
      d: ["c"],
      b: ["c"],
      c: ["b"],
    });
    expect(detectCycles(edges)).toHaveLength(1);
  });

  it("detects multiple independent cycles", () => {
    const edges = edgeMap({
      a: ["b"],
      b: ["a"],
      x: ["y"],
      y: ["x"],
    });
    expect(detectCycles(edges)).toHaveLength(2);
  });
});

describe("checkAcyclicity / checkManifestsAcyclicity", () => {
  it("flags a cyclic manifest set", () => {
    const result = checkManifestsAcyclicity([
      { name: "@ss/a", dependencies: { "@ss/b": "*" } },
      { name: "@ss/b", dependencies: { "@ss/a": "*" } },
    ]);
    expect(result.acyclic).toBe(false);
    expect(result.cycles).toHaveLength(1);
  });

  it("passes an acyclic manifest set", () => {
    const result = checkManifestsAcyclicity([
      { name: "@ss/a", dependencies: { "@ss/b": "*" } },
      { name: "@ss/b" },
    ]);
    expect(result.acyclic).toBe(true);
    expect(result.cycles).toEqual([]);
    expect(checkAcyclicity(buildDependencyGraph([{ name: "@ss/x" }])).acyclic).toBe(
      true,
    );
  });
});

describe("formatAcyclicityReport", () => {
  it("summarizes an acyclic result", () => {
    expect(formatAcyclicityReport({ acyclic: true, cycles: [] })).toMatch(
      /acyclic/i,
    );
  });

  it("lists cycles for a cyclic result", () => {
    const report = formatAcyclicityReport({
      acyclic: false,
      cycles: [{ path: ["a", "b", "a"] }],
    });
    expect(report).toMatch(/a -> b -> a/);
  });
});

describe("real StreetStudio workspace", () => {
  it("reads every workspace manifest", async () => {
    const manifests = await readWorkspaceManifests(REPO_ROOT);
    const names = manifests.map((m) => m.name);
    // A representative sample of the scaffolded packages/apps.
    expect(names).toContain("@streetstudio/shared");
    expect(names).toContain("@streetstudio/media");
    expect(names).toContain("@streetstudio/api");
    expect(manifests.length).toBeGreaterThanOrEqual(16);
  });

  it("has an acyclic dependency graph", async () => {
    const result = await checkWorkspaceAcyclicity(REPO_ROOT);
    expect(result.cycles).toEqual([]);
    expect(result.acyclic).toBe(true);
  });
});
