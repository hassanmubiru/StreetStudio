// Verify the three deferred items end-to-end against the running server:
// (1) video duration extraction (timestamped comment within duration),
// (2) folders.move (reparent + cycle rejection),
// (3) processing-status realtime fan-out over the WebSocket channel.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import WebSocket from "ws";
const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static");

const B = "http://localhost:8080";
const email = `def-${Date.now()}@example.com`;
const password = "CorrectHorse9pass";
let TOKEN, OID;

const H = () => ({ "content-type": "application/json", authorization: `Bearer ${TOKEN}`, "x-organization-id": OID });
async function j(method, path, body, headers) {
  const res = await fetch(B + path, { method, headers: headers ?? H(), ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

// --- auth + org
await fetch(B + "/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
const login = await (await fetch(B + "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
TOKEN = login.accessToken;
const org = await (await fetch(B + "/organizations", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ name: "Deferred Org" }) })).json();
OID = org.id;

// --- open realtime WS BEFORE processing, scoped to the org, to capture processing-status events
const events = [];
const ws = new WebSocket(`ws://localhost:8080/realtime?token=${encodeURIComponent(TOKEN)}&organizationId=${OID}`);
await new Promise((r, rej) => { ws.on("open", r); ws.on("error", rej); });
ws.on("message", (d) => { try { events.push(JSON.parse(d.toString())); } catch {} });

// --- upload a real 5s video
execFileSync(ffmpegPath, ["-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=24:duration=5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "/tmp/def.mp4"], { stdio: "ignore" });
const bytes = readFileSync("/tmp/def.mp4");
const create = await j("POST", "/uploads", { totalParts: 1, contentType: "video/mp4" });
const usid = create.data.id;
await fetch(`${B}/uploads/${usid}/parts/1`, { method: "PUT", headers: { authorization: `Bearer ${TOKEN}`, "x-organization-id": OID }, body: bytes });
const complete = await j("POST", `/uploads/${usid}/complete`);
const VID = complete.data.videoId;
console.log("1) upload complete:", JSON.stringify({ videoId: VID, durationSeconds: complete.data.durationSeconds, processing: complete.data.processing }));

// give WS a moment to receive events
await new Promise((r) => setTimeout(r, 400));
const procEvents = events.filter((e) => e.type === "processing-status");
console.log("3) realtime processing-status events:", JSON.stringify(procEvents.map((e) => e.status)));

// --- (1) timestamped comment within the extracted duration should succeed
const c1 = await j("POST", `/videos/${VID}/comments`, { body: "At 2s", timestamp: 2 });
console.log("1) comment @ t=2 (within duration) =>", c1.status);
const c2 = await j("POST", `/videos/${VID}/comments`, { body: "Beyond", timestamp: 9999 });
console.log("1) comment @ t=9999 (beyond duration, expect 400) =>", c2.status);

// --- (2) folders.move: project + a>b>c chain, move a under c (cycle -> expect 400/validation), then move c to root
const proj = await j("POST", "/projects", { name: "P" });
const PID = proj.data.id;
const fa = await j("POST", "/folders", { projectId: PID, name: "a" });
const fb = await j("POST", "/folders", { projectId: PID, name: "b", folderId: fa.data.id });
const fc = await j("POST", "/folders", { projectId: PID, name: "c", folderId: fb.data.id });
console.log("2) created chain depths:", fa.data.depth, fb.data.depth, fc.data.depth);
const cyc = await j("PATCH", `/folders/${fa.data.id}`, { parentFolderId: fc.data.id });
console.log("2) move a under its descendant c (cycle, expect 400) =>", cyc.status);
const mv = await j("PATCH", `/folders/${fb.data.id}`, { parentFolderId: null });
console.log("2) move b to root =>", mv.status, "new depth:", mv.data.depth);
const listAfter = await j("GET", `/folders?projectId=${PID}`);
const depths = Object.fromEntries(listAfter.data.folders.map((f) => [f.name, f.depth]));
console.log("2) depths after moving b to root (b=0, c should be b+1=1):", JSON.stringify(depths));

ws.close();

const pass =
  complete.data.durationSeconds === 5 &&
  c1.status === 201 && c2.status === 400 &&
  cyc.status === 400 && mv.status === 200 && mv.data.depth === 0 &&
  depths.b === 0 && depths.c === 1 &&
  procEvents.some((e) => e.status === "ready");
console.log("\nRESULT:", pass ? "PASS ✅" : "FAIL ❌");
process.exit(pass ? 0 : 1);
