#!/usr/bin/env node
/**
 * status.mjs — measure the repository, don't claim.
 *
 * Emits deterministic, measured counts (apps, packages, source files, test
 * files, lines of code) so STATUS.md figures come from reality rather than being
 * hand-edited. Pass/coverage numbers come from actually running the suite
 * (`npm test`, `npm run test:coverage`) — this script covers the static counts.
 *
 * Usage: node scripts/status.mjs   (from anywhere)
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function listDirs(rel) {
  try {
    return readdirSync(join(ROOT, rel)).filter((e) => {
      try {
        return statSync(join(ROOT, rel, e)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function walk(dir, filter, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === "node_modules" || e === "dist" || e === ".git") continue;
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

const isSrc = (f) => /\/src\/.*\.ts$/.test(f) && !/\.(test|spec)\.ts$/.test(f);
const isTest = (f) => /\.test\.ts$/.test(f);
const loc = (files) =>
  files.reduce((n, f) => n + readFileSync(f, "utf8").split("\n").length, 0);

const apps = listDirs("apps");
const packages = listDirs("packages");
const all = walk(join(ROOT, "apps"), () => true).concat(walk(join(ROOT, "packages"), () => true));
const srcFiles = all.filter(isSrc);
const testFiles = all.filter(isTest);
const propFiles = testFiles.filter((f) => /\.property\.test\.ts$/.test(f));

const metrics = {
  apps: apps.length,
  packages: packages.length,
  sourceFiles: srcFiles.length,
  testFiles: testFiles.length,
  propertyTestFiles: propFiles.length,
  sourceLoc: loc(srcFiles),
  testLoc: loc(testFiles),
};

console.log("StreetStudio measured metrics (static):");
for (const [k, v] of Object.entries(metrics)) {
  console.log(`  ${k.padEnd(18)} ${v}`);
}
console.log("\nPass/coverage are measured by running: npm test, npm run test:coverage.");
