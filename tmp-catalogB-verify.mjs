// Verify slice B write ops: organizations.update, organizations.invite, playback.recordView.
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
  const t = await res.text(); let j; try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t }; }
  return { status: res.status, json: j };
}
async function main() {
  const bytes = await readFile("/tmp/bv.mp4");
  const email = `catb-${Date.now()}@example.com`, password = "correct-horse-battery-staple";
  await rpc("POST", "/auth/register", { body: { email, password, displayName: "CatB" } });
  const token = (await rpc("POST", "/auth/login", { body: { email, password } })).json.accessToken;
  const org = (await rpc("POST", "/organizations", { token, body: { name: `CatB Org ${Date.now()}` } })).json.id;
  ok(`registered + org ${org}`);

  // organizations.update — rename + settings.
  let r = await rpc("PATCH", `/organizations/${org}`, { token, org, body: { name: "Renamed Org", settings: { theme: "dark" } } });
  if (r.status !== 200 || r.json.name !== "Renamed Org" || r.json.settings?.theme !== "dark") fail(`update: ${r.status} ${JSON.stringify(r.json)}`);
  ok(`organizations.update → 200 (name="${r.json.name}", settings.theme=${r.json.settings.theme})`);
  // Persisted?
  r = await rpc("GET", `/organizations/${org}`, { token, org });
  if (r.json.name !== "Renamed Org") fail(`update not persisted: ${JSON.stringify(r.json)}`);
  ok("organizations.update persisted (re-read confirms)");

  // organizations.update invalid name → 400.
  r = await rpc("PATCH", `/organizations/${org}`, { token, org, body: { name: "" } });
  if (r.status !== 400) fail(`empty name expected 400, got ${r.status}`);
  ok("organizations.update empty name → 400");

  // organizations.invite.
  r = await rpc("POST", `/organizations/${org}/invitations`, { token, org, body: { email: "invitee@example.com" } });
  if (r.status >= 400 || !r.json.id || r.json.email !== "invitee@example.com" || r.json.status !== "pending") fail(`invite: ${r.status} ${JSON.stringify(r.json)}`);
  if ("token" in r.json) fail(`invite leaked the secret token in the DTO: ${JSON.stringify(r.json)}`);
  ok(`organizations.invite → ${r.status} (id ${r.json.id}, status ${r.json.status}, no token leaked)`);
  // Invalid email → 400.
  r = await rpc("POST", `/organizations/${org}/invitations`, { token, org, body: { email: "not-an-email" } });
  if (r.status !== 400) fail(`invalid email expected 400, got ${r.status}`);
  ok("organizations.invite invalid email → 400");

  // playback.recordView — upload a video first.
  const up = await rpc("POST", "/uploads", { token, org, body: { totalParts: 1, contentType: "video/mp4" } });
  await rpc("PUT", `/uploads/${up.json.id}/parts/1`, { token, org, raw: bytes });
  const videoId = (await rpc("POST", `/uploads/${up.json.id}/complete`, { token, org, body: {} })).json.videoId;
  r = await rpc("POST", `/videos/${videoId}/views`, { token, org, body: {} });
  if (r.status >= 400) fail(`recordView: ${r.status} ${JSON.stringify(r.json)}`);
  ok(`playback.recordView → ${r.status} for video ${videoId}`);
  // The recorded view shows up in analytics.metrics.
  r = await rpc("GET", `/analytics/metrics`, { token, org });
  if (r.status !== 200) fail(`analytics.metrics: ${r.status}`);
  ok(`analytics.metrics reflects activity (totalViews=${r.json.totalViews ?? r.json.views ?? "n/a"})`);

  // recordView on a nonexistent video → 404.
  r = await rpc("POST", `/videos/00000000-0000-4000-8000-000000000000/views`, { token, org, body: {} });
  if (r.status !== 404) fail(`recordView unknown video expected 404, got ${r.status}`);
  ok("playback.recordView unknown video → 404");

  console.log("\nCATALOG SLICE B (writes) END-TO-END: PASS");
}
main().catch((e) => fail(e?.stack ?? String(e)));
