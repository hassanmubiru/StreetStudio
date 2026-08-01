#!/usr/bin/env node
/**
 * check-infra-ratchet.mjs — anti-reimplementation ratchet (ADR-0022).
 *
 * The production charter forbids reimplementing reusable infrastructure in the
 * product repo: HTTP host, DB pool, websockets, queues, object-storage drivers,
 * and media transcoding are owned by the published StreetJS framework
 * (`streetjs`, `@streetjs/*`). `streetjs:check` only enforces *how* StreetJS is
 * imported, not *whether* the framework was reimplemented with raw drivers — so
 * this gate closes that hole.
 *
 * It counts the `apps/api` source files that import a raw infrastructure driver
 * (`pg`, `ws`, `ioredis`, `ffmpeg-static`, `@aws-sdk/*`) or host an HTTP server
 * (`createServer` from `node:http`/`http`), and fails the build if that count
 * EXCEEDS the recorded baseline in `scripts/infra-ratchet.json`. The number can
 * only be ratcheted DOWN: each strangler-fig slice that replaces a hand-rolled
 * adapter with a `@streetjs/*` package lowers the baseline until it reaches 0.
 *
 * Zero dependencies; Node built-ins only.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOT = join(ROOT, "apps", "api", "src");
const BASELINE_PATH = join(ROOT, "scripts", "infra-ratchet.json");

/** Raw infrastructure driver packages the product must NOT depend on directly. */
const DRIVER_SPECIFIERS = new Set(["pg", "ws", "ioredis", "ffmpeg-static"]);
const DRIVER_PREFIXES = ["@aws-sdk/"];

const IMPORT_RE =
  /(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(full) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(full)) {
      out.push(full);
    }
  }
  return out;
}

function isDriver(spec) {
  return DRIVER_SPECIFIERS.has(spec) || DRIVER_PREFIXES.some((p) => spec.startsWith(p));
}

/** A file offends if it imports a raw driver package or imports `createServer`. */
function fileOffends(text) {
  const reasons = new Set();
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(text)) !== null) {
    const spec = m[1] ?? m[2];
    if (!spec) continue;
    if (isDriver(spec)) reasons.add(spec);
    // Hosting an HTTP server from the node http module.
    if ((spec === "node:http" || spec === "http") && /\bcreateServer\b/.test(text)) {
      reasons.add(`${spec}:createServer`);
    }
  }
  return reasons;
}

const offenders = [];
for (const file of walk(SCAN_ROOT)) {
  const reasons = fileOffends(readFileSync(file, "utf8"));
  if (reasons.size > 0) {
    offenders.push({ file: relative(ROOT, file), reasons: [...reasons] });
  }
}
offenders.sort((a, b) => a.file.localeCompare(b.file));

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
} catch {
  console.error(`infra:ratchet — FAIL: missing/invalid baseline at ${relative(ROOT, BASELINE_PATH)}`);
  process.exit(1);
}
const max = Number(baseline.maxRawInfraFiles);

console.log(`infra:ratchet — ${offenders.length} apps/api file(s) using raw infrastructure (baseline ${max}, target 0):`);
for (const o of offenders) console.log(`  • ${o.file}  [${o.reasons.join(", ")}]`);

if (offenders.length > max) {
  console.error(
    `\ninfra:ratchet — FAIL: raw-infrastructure file count ${offenders.length} exceeds baseline ${max}.\n` +
      "New reusable infrastructure must be consumed from the published StreetJS framework\n" +
      "(streetjs, @streetjs/*), not hand-rolled in the product repo — see ADR-0022.",
  );
  process.exit(1);
}
if (offenders.length < max) {
  console.log(
    `\ninfra:ratchet — a slice removed raw infrastructure. Lower "maxRawInfraFiles" to ${offenders.length} in ` +
      `${relative(ROOT, BASELINE_PATH)} to hold the gain (ADR-0022).`,
  );
}
console.log("infra:ratchet — OK");
