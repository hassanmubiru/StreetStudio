// Slice-1 verification: the API host now runs on the published streetjs PgPool.
// Exercises the paths most sensitive to the string-typed-row behavior:
// jsonb round-trip (role permissions → RBAC), CRUD, tenant isolation, metrics.
const BASE = "http://localhost:8080";
async function j(method, path, { token, org, body } = {}) {
  const headers = {};
  if (token) headers["authorization"] = `Bearer ${token}`;
  if (org) headers["x-organization-id"] = org;
  if (body) headers["content-type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const rand = () => Math.random().toString(36).slice(2, 10);
const R = []; const ck = (n, c, d) => { R.push(!!c); console.log(`${c ? "PASS" : "FAIL"}  ${n}${d !== undefined ? "  (" + d + ")" : ""}`); };

const health = await j("GET", "/health");
ck("health 200 postgres:true", health.status === 200 && health.data?.checks?.postgres === true, JSON.stringify(health.data));

const email = `s1_${rand()}@e.com`;
const reg = await j("POST", "/auth/register", { body: { email, password: "password12345" } });
ck("register 201", reg.status === 201, reg.data?.id);
const login = await j("POST", "/auth/login", { body: { email, password: "password12345" } });
const token = login.data?.accessToken;
ck("login → token", typeof token === "string" && token.length > 20);

// createOrg writes the admin role's permissions as jsonb (["*","org:manage_roles"]).
const org = await j("POST", "/organizations", { token, body: { name: "Org " + rand() } });
ck("organizations.create 201", org.status === 201, org.data?.id);
const orgId = org.data?.id;

// projects.create is RBAC-gated: the evaluator READS that jsonb permissions array
// back through the streetjs pool (string→coerce). This is the exact round-trip
// the raw-pg jsonb double-parse used to break.
const proj = await j("POST", "/projects", { token, org: orgId, body: { name: "Alpha" } });
ck("projects.create 201 (RBAC jsonb round-trip)", proj.status === 201, `status=${proj.status} ${JSON.stringify(proj.data).slice(0,80)}`);
const list = await j("GET", "/projects", { token, org: orgId });
ck("projects.list returns array with the project", Array.isArray(list.data) && list.data.length === 1, `len=${Array.isArray(list.data)?list.data.length:"n/a"}`);
const upd = await j("PATCH", `/projects/${proj.data?.id}`, { token, org: orgId, body: { name: "Beta" } });
ck("projects.update", upd.status === 200 && upd.data?.name === "Beta");
const del = await j("DELETE", `/projects/${proj.data?.id}`, { token, org: orgId });
ck("projects.delete", del.status === 200 || del.status === 204);

// Cross-tenant isolation (deny-by-default).
const emailB = `s1b_${rand()}@e.com`;
await j("POST", "/auth/register", { body: { email: emailB, password: "password12345" } });
const tokB = (await j("POST", "/auth/login", { body: { email: emailB, password: "password12345" } })).data?.accessToken;
const foreign = await j("GET", "/projects", { token: tokB, org: orgId });
ck("cross-tenant projects.list → 403", foreign.status === 403, `status=${foreign.status}`);

// analytics.metrics (RBAC read; numeric coercion through the pool).
const metrics = await j("GET", "/analytics/metrics", { token, org: orgId });
ck("analytics.metrics zeroed", metrics.status === 200 && metrics.data?.totalViews === 0, JSON.stringify(metrics.data));

// /metrics operational endpoint still works.
const ops = await j("GET", "/metrics");
ck("/metrics counters present", ops.status === 200 && typeof ops.data?.counters?.http_requests_total === "number", `reqs=${ops.data?.counters?.http_requests_total}`);

const passed = R.filter(Boolean).length;
console.log(`\n${passed}/${R.length} passed`);
process.exit(passed === R.length ? 0 : 1);
