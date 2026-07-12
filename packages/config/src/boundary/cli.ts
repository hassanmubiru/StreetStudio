/**
 * Command-line entry point for the import-boundary analyzer.
 *
 * Wired into the root `boundary:check` script. Scans the workspace, prints any
 * violations grouped by their named error code, and exits non-zero so the build
 * fails on any boundary violation (Requirements 1.6, 2.6, 22.6).
 */
import path from "node:path";
import process from "node:process";
import { analyzeProject } from "./analyzer.js";
import type { BoundaryViolation } from "./types.js";

function formatViolation(v: BoundaryViolation, workspaceRoot: string): string {
  const rel = path.relative(workspaceRoot, v.file) || v.file;
  return `  ${v.code}\n    at ${rel}:${v.line}\n    ${v.message}`;
}

export function runCli(argv: readonly string[] = process.argv.slice(2)): number {
  const workspaceRoot = path.resolve(argv[0] ?? process.cwd());
  const { violations, filesScanned } = analyzeProject(workspaceRoot);

  if (violations.length === 0) {
    console.log(
      `boundary:check — OK (${filesScanned} source file${
        filesScanned === 1 ? "" : "s"
      } scanned, no violations).`
    );
    return 0;
  }

  console.error(
    `boundary:check — FAILED with ${violations.length} violation${
      violations.length === 1 ? "" : "s"
    } (${filesScanned} files scanned):\n`
  );
  for (const v of violations) {
    console.error(formatViolation(v, workspaceRoot));
    console.error("");
  }
  return 1;
}
