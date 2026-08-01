// ADR-0022 slice 6 end-to-end: the realtime channel is @streetjs/realtime.
// Connects an authenticated WS client to /realtime?organizationId=..., uploads
// a video, and asserts it receives processing-status frames in the framework
// envelope {type, payload, ts}. Mode (argv[2]): inline | distributed.
import { readFile } from "node:fs/promises";
import WebSocket from "ws";

const BASE = process.env.BASE ?? "http://localhost:8080";
const WS_BASE = BASE.replace(/^http/, "ws");
const MODE = process.argv[2] ?? "inline";
const VIDEO_PATH = "/tmp/rt.mp4";

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

async function main() {
  const bytes = await readFile(VIDEO_PATH);
  ok(`loaded test video (${bytes.length} bytes); mode=${MODE}`);

  const email = `slice6-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple";
  let r = await rpc("POST", "/auth/register", { body: { email, password, displayName: "Slice6" } });
  if (r.status >= 400) fail(`register ${r.status} ${JSON.stringify(r.json)}`);
  r = await rpc("POST", "/auth/login", { body: { email, password } });
  const token = r.json.accessToken ?? r.json.token;
  if (!token) fail(`no token`);
  ok("registered + logged in");

  r = await rpc("POST", "/organizations", { token, body: { name: `Slice6 ${Date.now()}` } });
  const org = r.json.id;
  if (!org) fail(`no org id ${JSON.stringify(r.json)}`);
  ok(`org ${org}`);

  // Open the authenticated realtime channel scoped to the org.
  const events = [];
  let connectedSeen = false;
  const ws = new WebSocket(`${WS_BASE}/realtime?organizationId=${org}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const wsReady = new Promise((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", (e) => reject(e));
  });
  ws.on("message", (data) => {
    let frame; try { frame = JSON.parse(data.toString()); } catch { return; }
    if (frame.type === "connected") connectedSeen = true;
    events.push(frame);
  });
  await wsReady;
  ok("WS upgrade authenticated + open");
  // Give the connected confirmation a moment.
  await new Promise((res) => setTimeout(res, 300));
  if (!connectedSeen) fail("did not receive the 'connected' confirmation frame");
  ok("received 'connected' confirmation frame");

  // Upload a video → triggers queued/processing/ready processing-status events.
  r = await rpc("POST", "/uploads", { token, org, body: { totalParts: 1, contentType: "video/mp4" } });
  const uploadId = r.json.id;
  await rpc("PUT", `/uploads/${uploadId}/parts/1`, { token, org, raw: bytes });
  r = await rpc("POST", `/uploads/${uploadId}/complete`, { token, org, body: {} });
  if (r.status >= 400) fail(`complete ${r.status} ${JSON.stringify(r.json)}`);
  const videoId = r.json.videoId;
  ok(`uploaded; video ${videoId}; processing=${r.json.processing}`);

  // Collect realtime frames for a window (distributed needs the worker to run).
  const deadline = Date.now() + 30_000;
  const statusFrames = () =>
    events.filter((e) => e.type === "processing-status" && (e.payload?.videoId === videoId));
  while (Date.now() < deadline) {
    const ready = statusFrames().some((e) => e.payload?.status === "ready");
    if (ready) break;
    await new Promise((res) => setTimeout(res, 500));
  }

  const mine = statusFrames();
  if (mine.length === 0) fail("received no processing-status frames for the video");
  ok(`received ${mine.length} processing-status frame(s) for the video`);

  // Assert the framework envelope shape {type, payload, ts}.
  const sample = mine[0];
  if (typeof sample.ts !== "number") fail(`frame missing numeric 'ts' (envelope): ${JSON.stringify(sample)}`);
  if (!sample.payload || typeof sample.payload.status !== "string") {
    fail(`frame payload missing 'status' (envelope): ${JSON.stringify(sample)}`);
  }
  ok(`frames use the framework envelope {type, payload, ts} (e.g. status=${sample.payload.status})`);

  const statuses = new Set(mine.map((e) => e.payload.status));
  if (!statuses.has("ready")) fail(`never observed status=ready; saw ${[...statuses].join(",")}`);
  ok(`observed terminal status=ready over the realtime channel (${[...statuses].join(" → ")})`);

  ws.close();
  console.log(`\nSLICE 6 (${MODE}) END-TO-END: PASS \u2014 realtime is @streetjs/realtime`);
  process.exit(0);
}

main().catch((e) => fail(e?.stack ?? String(e)));
