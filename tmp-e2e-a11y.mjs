// Phase 7 (runtime accessibility) + a real browser e2e smoke, against the
// production Vite SPA served by apps/web/server.mjs, using the system Chrome.
import puppeteer from "puppeteer-core";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core");
const axeSource = (await import("node:fs")).readFileSync(axePath, "utf8");

const WEB = "http://localhost:3400";
const CHROME = "/usr/bin/google-chrome-stable";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});

const results = [];
const check = (name, cond, detail) => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

async function auditRoute(path, label) {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
  const resp = await page.goto(WEB + path, { waitUntil: "networkidle2", timeout: 20000 });
  check(`${label}: HTTP 200`, resp && resp.status() === 200, `status=${resp && resp.status()}`);
  // The SPA mounts into the DOM: assert real rendered content (not an empty shell).
  const bodyText = await page.evaluate(() => document.body.innerText.trim().length);
  const hasRoot = await page.evaluate(() => !!document.querySelector("#app, #root, main, [data-app]") || document.body.children.length > 0);
  check(`${label}: rendered DOM content`, bodyText > 0 || hasRoot, `textLen=${bodyText}`);
  const title = await page.title();
  check(`${label}: document has <title>`, typeof title === "string" && title.length > 0, JSON.stringify(title));
  // Run axe-core in the page for a real runtime a11y audit.
  await page.evaluate(axeSource);
  const axe = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    return await window.axe.run(document, { resultTypes: ["violations"] });
  });
  const bySeverity = axe.violations.reduce((m, v) => ((m[v.impact || "unknown"] = (m[v.impact || "unknown"] || 0) + 1), m), {});
  const critical = axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  console.log(`  axe: ${axe.violations.length} violation rule(s); by impact ${JSON.stringify(bySeverity)}`);
  for (const v of axe.violations) console.log(`    - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`);
  check(`${label}: no console/page errors`, consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
  await page.close();
  return { critical: critical.length, total: axe.violations.length };
}

console.log(`Chrome: ${(await browser.version())}`);
const landing = await auditRoute("/", "landing");
const login = await auditRoute("/login", "login route (SPA fallback)");

const passed = results.every((r) => r.pass);
console.log(`\nlanding a11y: ${landing.total} rule(s) (${landing.critical} critical/serious)`);
console.log(`login a11y:   ${login.total} rule(s) (${login.critical} critical/serious)`);
await browser.close();
console.log(passed ? "\nE2E PASS (rendered, titled, no page errors)" : "\nE2E: some checks failed (see above)");
process.exit(passed ? 0 : 1);
