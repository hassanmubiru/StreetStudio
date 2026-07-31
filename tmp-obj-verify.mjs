// Verify the /objects byte route now serves pipeline-produced derivatives
// (renditions + thumbnail/preview) for the owning org, and returns 404 for a
// foreign org (isolation), while still serving the source object.
import { readFileSync } from "node:fs";
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
  return res;
}
async function json(res) { try { return await res.json(); } catch { return null; } }
const rand = () => Math.random().toString(36).slice(2, 10);

async function tenant() {
  const email = `o_${rand()}@example.com`;
  await j("POST", "/auth/register", { body: { email, password: "password12345", displayName: "O" } });
  const login = await json(await j("POST", "/auth/login", { body: { email, password: "password12345" } }));
  const org = await json(await j("POST", "/organizations", { token: login.accessToken, body: { name: "Org " + rand() } }));
  return { token: login.accessToken, orgId: org.id };
}

const results = [];
const check = (name, cond, detail) => { results.push({ name, pass: !!cond, detail }); };

const A = await tenant();
const B = await tenant();

const bytes = readFileSync("/tmp/obj-sample.mp4");
const half = Math.ceil(bytes.length / 2);
const create = await json(await j("POST", "/uploads", { token: A.token, org: A.orgId, body: { totalParts: 2, contentType: "video/mp4" } }));
await j("PUT", `/uploads/${create.id}/parts/1`, { token: A.token, org: A.orgId, raw: bytes.subarray(0, half) });
await j("PUT", `/uploads/${create.id}/parts/2`, { token: A.token, org: A.orgId, raw: bytes.subarray(half) });
const done = await json(await j("POST", `/uploads/${create.id}/complete`, { token: A.token, org: A.orgId }));
console.log("complete:", done.processing, "renditions:", done.renditions, "videoId:", done.videoId);
check("inline processed ready", done.processing === "ready");

const man = await json(await j("GET", `/videos/${done.videoId}/playback`, { token: A.token, org: A.orgId }));
const keys = [...man.renditions.map(r => ({ label: r.quality, key: r.objectKey })), ...man.assets.map(a => ({ label: a.type, key: a.objectKey }))];
check("manifest lists 3 renditions", man.renditions.length === 3, man.renditions.length);
check("manifest lists 2 assets", man.assets.length === 2, man.assets.length);

// Owner (A) can stream every derivative via Range.
for (const { label, key } of keys) {
  const res = await j("GET", `/objects/${key}`, { token: A.token, org: A.orgId, range: "bytes=0-0" });
  const cr = res.headers.get("content-range");
  const total = cr ? Number(cr.split("/")[1]) : 0;
  check(`A streams ${label}`, (res.status === 206 || res.status === 200) && total > 0, `status=${res.status} total=${total}`);
}
// Foreign org (B) cannot — 404, no disclosure.
for (const { label, key } of keys) {
  const res = await j("GET", `/objects/${key}`, { token: B.token, org: B.orgId, range: "bytes=0-0" });
  check(`B blocked from ${label}`, res.status === 404, `status=${res.status}`);
}
// Source object still served for A.
const src = await j("GET", `/objects/${done.objectKey}`, { token: A.token, org: A.orgId, range: "bytes=0-99" });
check("A streams source", src.status === 206, `status=${src.status}`);

let all = true;
for (const r of results) { if (!r.pass) all = false; console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail !== undefined ? "  (" + r.detail + ")" : ""}`); }
console.log(all ? "\nALL PASS" : "\nSOME FAILED");
process.exit(all ? 0 : 1);
