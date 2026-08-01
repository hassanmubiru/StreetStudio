// Upload a real video in enqueue-only mode; print videoId + orgId (left `queued`).
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
const email = `rc_${rand()}@example.com`;
await j("POST", "/auth/register", { body: { email, password: "password12345" } });
const login = await j("POST", "/auth/login", { body: { email, password: "password12345" } });
const token = login.data.accessToken;
const org = await j("POST", "/organizations", { token, body: { name: "Org " + rand() } });
const orgId = org.data.id;
const bytes = readFileSync("/tmp/rc-sample.mp4");
const half = Math.ceil(bytes.length / 2);
const create = await j("POST", "/uploads", { token, org: orgId, body: { totalParts: 2, contentType: "video/mp4" } });
await j("PUT", `/uploads/${create.data.id}/parts/1`, { token, org: orgId, raw: bytes.subarray(0, half) });
await j("PUT", `/uploads/${create.data.id}/parts/2`, { token, org: orgId, raw: bytes.subarray(half) });
const done = await j("POST", `/uploads/${create.data.id}/complete`, { token, org: orgId });
console.log(`VIDEO=${done.data.videoId} ORG=${orgId} PROCESSING=${done.data.processing}`);
