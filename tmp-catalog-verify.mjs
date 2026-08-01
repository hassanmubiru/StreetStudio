// Verify the newly-wired read ops (API-CATALOG-COVERAGE-01 slice A).
const BASE = "http://localhost:8080";
let n = 0;
const ok = (m) => console.log(`  \u2713 [${++n}] ${m}`);
const fail = (m) => { console.error(`  \u2717 FAIL: ${m}`); process.exit(1); };
async function rpc(method, path, { token, org, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (org) headers["x-organization-id"] = org;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const t = await res.text(); let j; try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t }; }
  return { status: res.status, json: j };
}
async function main() {
  const email = `cat-${Date.now()}@example.com`, password = "correct-horse-battery-staple";
  await rpc("POST", "/auth/register", { body: { email, password, displayName: "Cat" } });
  const token = (await rpc("POST", "/auth/login", { body: { email, password } })).json.accessToken;
  const org = (await rpc("POST", "/organizations", { token, body: { name: `Cat Org ${Date.now()}` } })).json.id;
  ok(`registered + org ${org}`);

  let r = await rpc("GET", `/organizations/${org}`, { token, org });
  if (r.status !== 200 || r.json.id !== org) fail(`organizations.get: ${r.status} ${JSON.stringify(r.json)}`);
  ok(`organizations.get → 200 (name="${r.json.name}")`);

  r = await rpc("GET", `/organizations/${org}/members`, { token, org });
  if (r.status !== 200 || !Array.isArray(r.json) || r.json.length < 1) fail(`listMembers: ${r.status} ${JSON.stringify(r.json)}`);
  ok(`organizations.listMembers → 200 (${r.json.length} membership; roleId ${r.json[0].roleId ? "present" : "MISSING"})`);

  r = await rpc("GET", `/organizations/${org}/roles`, { token, org });
  if (r.status !== 200 || !Array.isArray(r.json) || !r.json.some((role) => Array.isArray(role.permissions))) fail(`listRoles: ${r.status} ${JSON.stringify(r.json)}`);
  const admin = r.json.find((role) => role.permissions.includes("*"));
  ok(`organizations.listRoles → 200 (${r.json.length} role(s); wildcard-admin ${admin ? "present" : "absent"})`);

  r = await rpc("GET", `/notifications/preferences`, { token });
  if (r.status !== 200 || !Array.isArray(r.json)) fail(`listPreferences: ${r.status} ${JSON.stringify(r.json)}`);
  ok(`notifications.listPreferences → 200 (${r.json.length} pref(s), array)`);

  // Cross-org isolation: a second member must NOT read org A (RBAC org:read).
  const email2 = `cat2-${Date.now()}@example.com`;
  await rpc("POST", "/auth/register", { body: { email: email2, password, displayName: "Cat2" } });
  const token2 = (await rpc("POST", "/auth/login", { body: { email: email2, password } })).json.accessToken;
  r = await rpc("GET", `/organizations/${org}`, { token: token2, org });
  if (r.status !== 403) fail(`cross-org organizations.get expected 403, got ${r.status}`);
  ok("cross-org organizations.get → 403 (RBAC deny-by-default)");

  console.log("\nCATALOG SLICE A (reads) END-TO-END: PASS");
}
main().catch((e) => fail(e?.stack ?? String(e)));
