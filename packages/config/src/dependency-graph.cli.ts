/**
 * CLI entry for the package dependency-graph acyclicity checker (Requirement
 * 2.5). Wired into CI via the root `graph:check` script: it derives the graph
 * from the workspace manifests and exits non-zero on any cycle so the build
 * fails.
 *
 * Usage:
 *   node packages/config/dist/dependency-graph.cli.js [repoRoot]
 *
 * `repoRoot` defaults to the current working directory.
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  checkWorkspaceAcyclicity,
  formatAcyclicityReport,
} from "./dependency-graph.js";

export async function runCli(argv: readonly string[]): Promise<number> {
  const rootArg = argv[0];
  const rootDir = resolve(rootArg ?? process.cwd());

  const result = await checkWorkspaceAcyclicity(rootDir);
  const report = formatAcyclicityReport(result);

  if (result.acyclic) {
    console.log(report);
    return 0;
  }

  console.error(report);
  return 1;
}

// Only execute when run directly (not when imported by tests).
const invokedDirectly =
  typeof process.argv[1] === "string" &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exit(code);
    })
    .catch((error: unknown) => {
      console.error("Dependency-graph check failed to run:", error);
      process.exit(2);
    });
}
