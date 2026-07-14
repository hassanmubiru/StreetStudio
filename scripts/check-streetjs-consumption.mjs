#!/usr/bin/env node
/**
 * check-streetjs-consumption.mjs
 *
 * Enforces the StreetStudio ↔ StreetJS consumption contract (ADR-0011):
 * StreetStudio consumes StreetJS ONLY as published, versioned npm packages.
 * It fails the build if it finds any of:
 *
 *  1. A `streetjs` / `@streetjs/*` dependency whose version specifier is not a
 *     plain registry range — i.e. any `file:`, `link:`, `portal:`, `workspace:`,
 *     `git`/`git+`, `http(s):`, or relative/absolute path specifier.
 *  2. A source import that reaches StreetJS by a relative/absolute path, a
 *     GitHub/URL specifier, or a deep path into a `@streetjs/*` package instead
 *     of its public entry point.
 *
 * Zero dependencies; uses only Node built-ins. Run from anywhere.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const violations = [];

/** Recursively collect files under `dir`, skipping node_modules and dist. */
function walk(dir, filter, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

const isStreetjsPkg = (name) => name === "streetjs" || name.startsWith("@streetjs/");

// A specifier is a plain registry range unless it uses a local/vcs/url protocol.
const BAD_SPECIFIER = /^(file:|link:|portal:|workspace:|git\+|git:|https?:|\.\.?\/|\/)/;

// --- 1. Manifest specifiers --------------------------------------------------
for (const pkgPath of walk(ROOT, (f) => f.endsWith("package.json"))) {
  let json;
  try {
    json = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    continue;
  }
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const deps = json[field];
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (isStreetjsPkg(name) && typeof spec === "string" && BAD_SPECIFIER.test(spec)) {
        violations.push(
          `${relative(ROOT, pkgPath)}: "${name}": "${spec}" — StreetJS must be a published registry version, not a local/vcs/url reference.`,
        );
      }
    }
  }
}

// --- 2. Source imports -------------------------------------------------------
// Reject relative/URL imports that mention streetjs, and deep @streetjs/* paths.
const IMPORT_RE = /(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
// Test/spec files legitimately contain fixture strings of disallowed imports
// (they exercise the boundary analyzer), so — like the boundary analyzer — the
// source-import scan skips them. The manifest scan above still covers all files.
const codeFiles = walk(
  ROOT,
  (f) => /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(f) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(f),
);
for (const file of codeFiles) {
  const text = readFileSync(file, "utf8");
  let m;
  while ((m = IMPORT_RE.exec(text)) !== null) {
    const spec = m[1] ?? m[2];
    if (!spec) continue;
    const mentionsStreetjs = /streetjs/i.test(spec);
    if (!mentionsStreetjs) continue;
    const isRelativeOrUrl = /^(\.\.?\/|\/)/.test(spec) || /^https?:/.test(spec);
    // Deep import into a @streetjs/* package (past the entry point), e.g.
    // "@streetjs/core/src/internal" or "@streetjs/core/dist/...".
    const deepScoped = /^@streetjs\/[^/]+\/.+/.test(spec);
    if (isRelativeOrUrl || deepScoped) {
      violations.push(
        `${relative(ROOT, file)}: import "${spec}" — import StreetJS only via its public package entry point (e.g. "@streetjs/core").`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error("streetjs:check — FAIL: StreetJS consumption contract violated (ADR-0011):\n");
  for (const v of violations) console.error("  • " + v);
  console.error(
    "\nStreetStudio must consume StreetJS only as published, versioned npm packages —\n" +
      "no path/link/workspace/git/url references and no framework-internal imports.",
  );
  process.exit(1);
}

console.log("streetjs:check — OK (StreetJS consumed only as published, versioned packages).");
