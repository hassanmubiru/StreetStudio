// Verify the uploads/playback path (which consumes asPgPool → the real streetjs
// PgPool now) still works end-to-end on the framework pool.
import { readFileSync } from "node:fs";
const BASE = "http://localhost:8080";
async function j(method, path, { token, org, body, raw } = {}) {
  const headers = {};
  if (token) headers["authorization"] = `Bearer ${token}`;
  if (org) headers["x-organization-id"] = org;
  let payload;
  if (raw) { headers["content-type"] = "application/octet-stream"; payload = raw; }
  else if (body) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const rand = () => Math.random().toString(36).slice(2, 10);
const R = []; const ck = (n, c, d) => { R.push(!!c); console.log(`${c ? "PASS" : "FAIL"}  ${n}${d !== undefined ? "  (" + d + ")" : ""}`); };

const email = `s1m_${rand()}@e.com`;
await j("POST", "/auth/register", { body: { email, password: "password12345" } });
const token = (await j("POST", "/auth/login", { body: { email, password: "password12345" } })).data.accessToken;
const orgId = (await j("POST", "/organizations", { token, body: { name: "Org " + rand() } })).data.id;

const bytes = readFileSync("/tmp/s1-sample.mp4");
const half = Math.ceil(bytes.length / 2);
const create = await j("POST", "/uploads", { token, org: orgId, body: { totalParts: 2, contentType: "video/mp4" } });
ck("uploads.create 201 (UploadSessionRepository on streetjs pool)", create.status === 201, create.data?.id);
await j("PUT", `/uploads/${create.data.id}/parts/1`, { token, org: orgId, raw: bytes.subarray(0, half) });
await j("PUT", `/uploads/${create.data.id}/parts/2`, { token, org: orgId, raw: bytes.subarray(half) });
const done = await j("POST", `/uploads/${create.data.id}/complete`, { token, org: orgId });
ck("uploads.complete → ready, 3 renditions (inline)", done.status === 201 && done.data?.processing === "ready" && done.data?.renditions === 3, `processing=${done.data?.processing} rends=${done.data?.renditions}`);
const man = await j("GET", `/videos/${done.data.videoId}/playback`, { token, org: orgId });
ck("playback.manifest 200, 3 renditions", man.status === 200 && man.data?.renditions?.length === 3, `rends=${man.data?.renditions?.length}`);
ck("manifest bitrate is a number (coerced)", man.data?.renditions?.every((r) => typeof r.bitrate === "number"), JSON.stringify(man.data?.renditions?.map((r) => r.bitrate)));

const passed = R.filter(Boolean).length;
console.log(`\n${passed}/${R.length} passed`);
process.exit(passed === R.length ? 0 : 1);
