// ADR-0022 slice 5 end-to-end: the media queue is @streetjs/queue.
// Modes:
//   inline      — API consumes the queue in-process; uploads.complete returns `ready`.
//   distributed — API enqueues only; a separate worker (this script does not
//                 start it) drains via Redis. Pass mode as argv[2].
import { readFile } from "node:fs/promises";

const BASE = process.env.BASE ?? "http://localhost:8080";
const MODE = process.argv[2] ?? "inline";
const VIDEO_PATH = "/tmp/qv.mp4";

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
  return { status: res.status, json, headers: res.headers };
}

async function main() {
  const bytes = await readFile(VIDEO_PATH);
  ok(`loaded test video (${bytes.length} bytes); mode=${MODE}`);

  const email = `slice5-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple";
  let r = await rpc("POST", "/auth/register", { body: { email, password, displayName: "Slice5" } });
  if (r.status >= 400) fail(`register ${r.status} ${JSON.stringify(r.json)}`);
  ok("registered");

  r = await rpc("POST", "/auth/login", { body: { email, password } });
  const token = r.json.accessToken ?? r.json.token;
  if (!token) fail(`no token ${JSON.stringify(r.json)}`);
  ok("logged in");

  r = await rpc("POST", "/organizations", { token, body: { name: `Slice5 Org ${Date.now()}` } });
  if (r.status >= 400) fail(`org create ${r.status} ${JSON.stringify(r.json)}`);
  const org = r.json.id;
  if (!org) fail(`no org id ${JSON.stringify(r.json)}`);
  ok(`org ${org}`);

  r = await rpc("POST", "/uploads", { token, org, body: { totalParts: 1, contentType: "video/mp4" } });
  if (r.status >= 400) fail(`uploads.create ${r.status} ${JSON.stringify(r.json)}`);
  const uploadId = r.json.id;
  ok(`upload session ${uploadId}`);

  r = await rpc("PUT", `/uploads/${uploadId}/parts/1`, { token, org, raw: bytes });
  if (r.status >= 400) fail(`part upload ${r.status} ${JSON.stringify(r.json)}`);
  ok(`streamed part 1 (${bytes.length} bytes)`);

  r = await rpc("POST", `/uploads/${uploadId}/complete`, { token, org, body: {} });
  if (r.status >= 400) fail(`uploads.complete ${r.status} ${JSON.stringify(r.json)}`);
  const videoId = r.json.videoId;
  ok(`completed upload; video ${videoId}; processing=${r.json.processing} renditions=${r.json.renditions}`);

  if (MODE === "inline") {
    if (r.json.processing !== "ready") fail(`inline expected processing=ready, got ${r.json.processing}`);
    if ((r.json.renditions ?? 0) < 3) fail(`inline expected >=3 renditions, got ${r.json.renditions}`);
    ok("inline queue path drove the video to ready synchronously (>=3 renditions)");
  } else {
    if (r.json.processing !== "queued") fail(`distributed expected processing=queued, got ${r.json.processing}`);
    ok("distributed: video enqueued via Redis queue (processing=queued)");
    // Poll videos.get until a separate worker drains the Redis queue.
    let status = "queued";
    for (let i = 0; i < 90; i++) {
      const g = await rpc("GET", `/videos/${videoId}`, { token, org });
      if (g.status < 400) { status = g.json.status; if (status === "ready" || status === "failed") break; }
      await new Promise((res) => setTimeout(res, 1000));
    }
    if (status !== "ready") fail(`distributed video did not reach ready via worker: ${status}`);
    ok("distributed: a separate worker drained the Redis queue → video ready");
  }

  // Playback manifest + Range on a rendition (both modes, once ready).
  r = await rpc("GET", `/videos/${videoId}/playback`, { token, org });
  if (r.status >= 400) fail(`playback.manifest ${r.status} ${JSON.stringify(r.json)}`);
  const renditions = r.json.renditions ?? r.json.sources ?? [];
  if (renditions.length < 3) fail(`expected >=3 renditions in manifest, got ${JSON.stringify(r.json)}`);
  ok(`playback manifest: ${renditions.length} renditions`);

  const first = renditions[0];
  const url = first.url ?? first.href ?? first.streamUrl;
  if (url) {
    const streamUrl = url.startsWith("http") ? url : `${BASE}${url}`;
    const rr = await fetch(streamUrl, { headers: { range: "bytes=0-1023", authorization: `Bearer ${token}`, "x-organization-id": org } });
    if (rr.status !== 206) fail(`Range expected 206, got ${rr.status}`);
    ok(`rendition streamed with Range 206 (content-range: ${rr.headers.get("content-range")})`);
  }

  console.log(`\nSLICE 5 (${MODE}) END-TO-END: PASS \u2014 media queue is @streetjs/queue`);
}

main().catch((e) => fail(e?.stack ?? String(e)));
