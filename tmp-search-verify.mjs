// ADR-0021 search wiring verification: search.videos over the canonical schema.
import { readFile } from "node:fs/promises";
const BASE = "http://localhost:8080";
let n = 0;
const ok = (m) => console.log(`  \u2713 [${++n}] ${m}`);
const fail = (m) => { console.error(`  \u2717 FAIL: ${m}`); process.exit(1); };

async function rpc(method, path, { token, org, body, raw } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (org) headers["x-organization-id"] = org;
  let payload;
  if (raw) { headers["content-type"] = "application/octet-stream"; payload = raw; }
  else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE}${path}`, { method, headers, ...(payload !== undefined ? { body: payload } : {}) });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json };
}

async function member(tag) {
  const email = `search-${tag}-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple";
  await rpc("POST", "/auth/register", { body: { email, password, displayName: tag } });
  const login = await rpc("POST", "/auth/login", { body: { email, password } });
  const token = login.json.accessToken;
  const orgRes = await rpc("POST", "/organizations", { token, body: { name: `Org-${tag}-${Date.now()}` } });
  return { token, org: orgRes.json.id };
}

async function main() {
  const bytes = await readFile("/tmp/sv.mp4");
  const a = await member("A");
  ok(`member A + org ${a.org}`);

  // Upload a video, then rename to a unique searchable title.
  const up = await rpc("POST", "/uploads", { token: a.token, org: a.org, body: { totalParts: 1, contentType: "video/mp4" } });
  await rpc("PUT", `/uploads/${up.json.id}/parts/1`, { token: a.token, org: a.org, raw: bytes });
  const done = await rpc("POST", `/uploads/${up.json.id}/complete`, { token: a.token, org: a.org, body: {} });
  const videoId = done.json.videoId;
  const term = `Zephyr${Date.now()}`;
  const upd = await rpc("PATCH", `/videos/${videoId}`, { token: a.token, org: a.org, body: { title: `${term} demo` } });
  if (upd.status >= 400) fail(`rename ${upd.status} ${JSON.stringify(upd.json)}`);
  ok(`uploaded + renamed video ${videoId} to "${term} demo"`);

  // Search by the unique title term → expect the video.
  let r = await rpc("GET", `/search/videos?q=${encodeURIComponent(term)}`, { token: a.token, org: a.org });
  if (r.status >= 400) fail(`search ${r.status} ${JSON.stringify(r.json)}`);
  if (!Array.isArray(r.json)) fail(`search did not return a bare array: ${JSON.stringify(r.json)}`);
  if (!r.json.some((v) => v.id === videoId)) fail(`search did not find the video: ${JSON.stringify(r.json)}`);
  ok(`search q="${term}" returned the video (${r.json.length} result(s), bare array)`);

  // No-match query → empty array.
  r = await rpc("GET", `/search/videos?q=NoSuchTerm${Date.now()}`, { token: a.token, org: a.org });
  if (r.status >= 400) fail(`no-match search errored ${r.status}`);
  if (!Array.isArray(r.json) || r.json.length !== 0) fail(`no-match should be empty array, got ${JSON.stringify(r.json)}`);
  ok("no-match query → empty array");

  // Empty query → 400 VALIDATION_FAILED (R14.5).
  r = await rpc("GET", `/search/videos?q=`, { token: a.token, org: a.org });
  if (r.status !== 400) fail(`empty query expected 400, got ${r.status} ${JSON.stringify(r.json)}`);
  ok("empty query → 400 (query validation)");

  // Cross-tenant isolation: member B (different org) must NOT see A's video.
  const b = await member("B");
  r = await rpc("GET", `/search/videos?q=${encodeURIComponent(term)}`, { token: b.token, org: b.org });
  if (r.status >= 400) fail(`B search errored ${r.status} ${JSON.stringify(r.json)}`);
  if (!Array.isArray(r.json) || r.json.some((v) => v.id === videoId)) {
    fail(`cross-tenant leak: B saw A's video: ${JSON.stringify(r.json)}`);
  }
  ok("cross-tenant isolation: member B does NOT see A's video");

  console.log("\nSEARCH WIRING END-TO-END: PASS — search.videos served over the canonical schema");
}
main().catch((e) => fail(e?.stack ?? String(e)));
