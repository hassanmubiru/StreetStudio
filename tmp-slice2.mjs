// Slice-2 verification: the API now runs on the published streetApp host.
// Exercises every transport-sensitive path the bridge touches.
import { readFileSync } from "node:fs";
import { WebSocket } from "ws";
const BASE = "http://localhost:8080";
async function j(method, path, { token, org, body, raw, range } = {}) {
  const headers = {};
  if (token) headers["authorization"] = `Bearer ${token}`;
  if (org) headers["x-organization-id"] = org;
  if (range) headers["range"] = range;
  let payload;
  if (raw) { headers["content-type"] = "application/octet-stream"; payload = raw; }
  else if (body) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  let data = null; const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) { try { data = await res.json(); } catch {} } else { await res.arrayBuffer(); }
  return { status: res.status, data, cr: res.headers.get("content-range") };
}
const rand = () => Math.random().toString(36).slice(2, 10);
const R = []; const ck = (n, c, d) => { R.push(!!c); console.log(`${c ? "PASS" : "FAIL"}  ${n}${d !== undefined ? "  (" + d + ")" : ""}`); };

ck("GET /health (framework host)", (await j("GET", "/health")).status === 200);
const m0 = await j("GET", "/metrics"); ck("GET /metrics 200 + snapshot shape", m0.status === 200 && typeof m0.data?.counters === "object" && typeof m0.data?.gauges === "object");

// JSON dispatch via ctx.body (the path that changed: framework pre-parses body).
const email = `s2_${rand()}@e.com`;
const reg = await j("POST", "/auth/register", { body: { email, password: "password12345" } });
ck("auth.register 201 (JSON body via ctx.body)", reg.status === 201, reg.data?.id);
const token = (await j("POST", "/auth/login", { body: { email, password: "password12345" } })).data.accessToken;
ck("auth.login → token", typeof token === "string");
const orgId = (await j("POST", "/organizations", { token, body: { name: "Org " + rand() } })).data.id;
const proj = await j("POST", "/projects", { token, org: orgId, body: { name: "Alpha" } });
ck("projects.create 201 (RBAC)", proj.status === 201);
const list = await j("GET", "/projects", { token, org: orgId });
ck("projects.list array", Array.isArray(list.data) && list.data.length === 1);

// Binary part upload (application/octet-stream → stream left unconsumed by host).
const bytes = readFileSync("/tmp/s2-sample.mp4");
const half = Math.ceil(bytes.length / 2);
const create = await j("POST", "/uploads", { token, org: orgId, body: { totalParts: 2, contentType: "video/mp4" } });
ck("uploads.create 201", create.status === 201);
const p1 = await j("PUT", `/uploads/${create.data.id}/parts/1`, { token, org: orgId, raw: bytes.subarray(0, half) });
const p2 = await j("PUT", `/uploads/${create.data.id}/parts/2`, { token, org: orgId, raw: bytes.subarray(half) });
ck("part upload 200 (binary stream intact)", p1.status === 200 && p2.status === 200, `p1=${p1.status} p2=${p2.status}`);
const done = await j("POST", `/uploads/${create.data.id}/complete`, { token, org: orgId });
ck("uploads.complete → ready/3 (inline transcode within timeout)", done.status === 201 && done.data?.processing === "ready" && done.data?.renditions === 3, `proc=${done.data?.processing}`);

// Object streaming with Range (raw res.writeHead 206 + Content-Range).
const man = await j("GET", `/videos/${done.data.videoId}/playback`, { token, org: orgId });
const key = man.data.renditions[0].objectKey;
const rangeRes = await j("GET", `/objects/${key}`, { token, org: orgId, range: "bytes=0-99" });
ck("GET /objects Range → 206 + Content-Range", rangeRes.status === 206 && /^bytes 0-99\/\d+$/.test(rangeRes.cr || ""), rangeRes.cr);

// Cross-tenant 403.
const eb = `s2b_${rand()}@e.com`;
await j("POST", "/auth/register", { body: { email: eb, password: "password12345" } });
const tb = (await j("POST", "/auth/login", { body: { email: eb, password: "password12345" } })).data.accessToken;
ck("cross-tenant projects.list → 403", (await j("GET", "/projects", { token: tb, org: orgId })).status === 403);

// WebSocket /realtime upgrade on app.server.
const wsEvents = [];
const ws = new WebSocket(`ws://localhost:8080/realtime?organizationId=${orgId}&token=${encodeURIComponent(token)}`);
const wsOk = await new Promise((resolve) => {
  ws.on("message", (b) => { try { wsEvents.push(JSON.parse(b.toString())); } catch {} });
  ws.on("open", () => setTimeout(() => resolve(wsEvents.some((e) => e.type === "connected")), 800));
  ws.on("error", () => resolve(false));
  setTimeout(() => resolve(false), 5000);
});
ck("WebSocket /realtime upgrade + connected frame", wsOk);
ws.close();

// Empty-body authed POST (logout) — no content-type; ctx.body undefined. Done
// last so it doesn't invalidate the token the upload steps above rely on.
const lo = await j("POST", "/auth/logout", { token });
ck("auth.logout 200 (empty body)", lo.status === 200, `status=${lo.status} data=${JSON.stringify(lo.data)}`);

// /metrics after real API traffic — counters now present.
const m1 = await j("GET", "/metrics");
ck("/metrics counts requests+errors", typeof m1.data?.counters?.http_requests_total === "number" && m1.data.counters.http_requests_total > 0, `reqs=${m1.data?.counters?.http_requests_total}`);

const passed = R.filter(Boolean).length;
console.log(`\n${passed}/${R.length} passed`);
process.exit(passed === R.length ? 0 : 1);
