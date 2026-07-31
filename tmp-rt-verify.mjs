// Verify cross-process realtime: a WS client connected to the API receives
// processing-status events produced by a SEPARATE worker process, via Redis.
//
// Phase 1 (this script): register tenant, open an authenticated /realtime WS
// scoped to the org, upload a real video (enqueue-only → `queued`), then
// collect WS events for a window while the worker (started separately) drains.
import { readFileSync, writeFileSync } from "node:fs";
import { WebSocket } from "ws";

const BASE = "http://localhost:8080";
const WS_BASE = "ws://localhost:8080";

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

const email = `rt_${rand()}@example.com`;
await j("POST", "/auth/register", { body: { email, password: "password12345", displayName: "RT" } });
const login = await j("POST", "/auth/login", { body: { email, password: "password12345" } });
const token = login.data.accessToken;
const org = await j("POST", "/organizations", { token, body: { name: "Org " + rand() } });
const orgId = org.data.id;

// Open the authenticated realtime channel scoped to this org.
const events = [];
const ws = new WebSocket(`${WS_BASE}/realtime?organizationId=${orgId}&token=${encodeURIComponent(token)}`);
await new Promise((resolve, reject) => {
  ws.on("open", resolve);
  ws.on("error", reject);
  setTimeout(() => reject(new Error("ws open timeout")), 5000);
});
ws.on("message", (buf) => {
  try {
    const msg = JSON.parse(buf.toString());
    events.push(msg);
    console.log("WS <-", JSON.stringify(msg));
  } catch {}
});

// Upload a real video in enqueue-only mode (worker will process it).
const bytes = readFileSync("/tmp/rt-sample.mp4");
const half = Math.ceil(bytes.length / 2);
const create = await j("POST", "/uploads", { token, org: orgId, body: { totalParts: 2, contentType: "video/mp4" } });
await j("PUT", `/uploads/${create.data.id}/parts/1`, { token, org: orgId, raw: bytes.subarray(0, half) });
await j("PUT", `/uploads/${create.data.id}/parts/2`, { token, org: orgId, raw: bytes.subarray(half) });
const done = await j("POST", `/uploads/${create.data.id}/complete`, { token, org: orgId });
console.log("upload complete:", done.data.processing, "videoId:", done.data.videoId);
const videoId = done.data.videoId;

// Collect events for a window (the worker is started separately during this).
await new Promise((r) => setTimeout(r, 22000));

const statuses = events.filter((e) => e.type === "processing-status" && e.videoId === videoId).map((e) => e.status);
const got = { connected: events.some((e) => e.type === "connected"), statuses };
writeFileSync("/tmp/rt-result.json", JSON.stringify(got, null, 2));

const hasProcessing = statuses.includes("processing");
const hasReady = statuses.includes("ready");
console.log("\ncollected statuses:", JSON.stringify(statuses));
if (got.connected && hasProcessing && hasReady) {
  console.log("PASS: WS client received worker-produced processing-status (processing + ready) via Redis");
  process.exit(0);
} else {
  console.log("FAIL: expected connected + processing + ready; got", JSON.stringify(got));
  process.exit(1);
}
