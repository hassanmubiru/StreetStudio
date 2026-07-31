// End-to-end verification of videos.transcript / videos.summary read endpoints.
const BASE = "http://localhost:8080";

async function j(method, path, { token, org, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  if (org) headers["x-organization-id"] = org;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

const rand = () => Math.random().toString(36).slice(2, 10);

async function makeTenant() {
  const email = `t_${rand()}@example.com`;
  const reg = await j("POST", "/auth/register", { body: { email, password: "password12345", displayName: "T" } });
  if (reg.status !== 201) throw new Error("register failed: " + JSON.stringify(reg));
  const login = await j("POST", "/auth/login", { body: { email, password: "password12345" } });
  const token = login.data.token;
  const org = await j("POST", "/organizations", { token, body: { name: "Org " + rand() } });
  if (org.status !== 201) throw new Error("createOrg failed: " + JSON.stringify(org));
  return { token, orgId: org.data.id ?? org.data.organizationId ?? org.data.organization?.id };
}

const results = [];
const check = (name, cond, detail) => { results.push({ name, pass: !!cond, detail }); };

const A = await makeTenant();
const B = await makeTenant();
console.log("Tenant A org:", A.orgId);
console.log("Tenant B org:", B.orgId);

// Emit the orgId + a fresh videoId so the shell can seed rows via psql.
const videoId = crypto.randomUUID();
console.log("SEED_ORG=" + A.orgId);
console.log("SEED_VIDEO=" + videoId);
console.log("A_TOKEN=" + A.token);
console.log("B_TOKEN=" + B.token);
console.log("B_ORG=" + B.orgId);

// Write context for the second phase.
const fs = await import("node:fs");
fs.writeFileSync("/tmp/tt-ctx.json", JSON.stringify({ ...A, videoId, B }, null, 2));
