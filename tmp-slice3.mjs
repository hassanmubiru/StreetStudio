// Slice-3 verification: object storage now runs on the published
// @streetjs/storage/s3 driver (against real MinIO). Exercises write (part
// upload + transcode outputs) and read (playback Range stream) through it.
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
  let data = null; const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) { try { data = await res.json(); } catch {} } else { await res.arrayBuffer(); }
  return { status: res.status, data, cr: res.headers.get("content-range") };
}
const rand = () => Math.random().toString(36).slice(2, 10);
const R = []; const ck = (n, c, d) => { R.push(!!c); console.log(`${c ? "PASS" : "FAIL"}  ${n}${d !== undefined ? "  (" + d + ")" : ""}`); };

const email = `s3_${rand()}@e.com`;
await j("POST", "/auth/register", { body: { email, password: "password12345" } });
const token = (await j("POST", "/auth/login", { body: { email, password: "password12345" } })).data.accessToken;
const orgId = (await j("POST", "/organizations", { token, body: { name: "Org " + rand() } })).data.id;

const bytes = readFileSync("/tmp/s3-sample.mp4");
const half = Math.ceil(bytes.length / 2);
const create = await j("POST", "/uploads", { token, org: orgId, body: { totalParts: 2, contentType: "video/mp4" } });
ck("uploads.create 201", create.status === 201);
// Part writes go through the framework S3 driver.put → MinIO.
const p1 = await j("PUT", `/uploads/${create.data.id}/parts/1`, { token, org: orgId, raw: bytes.subarray(0, half) });
const p2 = await j("PUT", `/uploads/${create.data.id}/parts/2`, { token, org: orgId, raw: bytes.subarray(half) });
ck("part upload 200 (framework driver.put → MinIO)", p1.status === 200 && p2.status === 200);
// complete assembles source + transcodes (driver.get source, driver.put derivatives).
const done = await j("POST", `/uploads/${create.data.id}/complete`, { token, org: orgId });
ck("complete → ready + 3 renditions (transcode via framework driver)", done.status === 201 && done.data?.processing === "ready" && done.data?.renditions === 3, `proc=${done.data?.processing} rends=${done.data?.renditions}`);

const man = await j("GET", `/videos/${done.data.videoId}/playback`, { token, org: orgId });
ck("playback.manifest 3 renditions + 2 assets", man.data?.renditions?.length === 3 && man.data?.assets?.length === 2);

// Range read of a derivative goes through the framework driver.get → MinIO.
for (const r of man.data.renditions) {
  const res = await j("GET", `/objects/${r.objectKey}`, { token, org: orgId, range: "bytes=0-0" });
  const total = res.cr ? Number(res.cr.split("/")[1]) : 0;
  ck(`stream ${r.quality} via framework driver.get (206, non-empty)`, res.status === 206 && total > 0, `status=${res.status} total=${total}`);
}
// Thumbnail (image) read too.
const thumb = man.data.assets.find((a) => a.type === "thumbnail");
const tres = await j("GET", `/objects/${thumb.objectKey}`, { token, org: orgId, range: "bytes=0-0" });
ck("stream thumbnail via framework driver.get", tres.status === 206 && Number((tres.cr||"/0").split("/")[1]) > 0, tres.cr);

const passed = R.filter(Boolean).length;
console.log(`\n${passed}/${R.length} passed`);
process.exit(passed === R.length ? 0 : 1);
