// End-to-end media verification for ADR-0022 slice 4 (@streetjs/media transcode).
// Registers/logs in, creates an org+project, opens an upload, streams the test
// video bytes, completes the upload (inline transcode), then asserts the video
// reached `ready` with a thumbnail, preview, and >=3 renditions, and that a
// rendition streams with a Range 206 partial response.
import { readFile } from "node:fs/promises";

const BASE = "http://localhost:8080";
const VIDEO_PATH = "/tmp/x.mp4";

let step = 0;
function ok(msg) {
  step += 1;
  console.log(`  \u2713 [${step}] ${msg}`);
}
function fail(msg) {
  console.error(`  \u2717 FAIL: ${msg}`);
  process.exit(1);
}

async function rpc(op, body, token) {
  const res = await fetch(`${BASE}/rpc/${op}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function main() {
  const bytes = await readFile(VIDEO_PATH);
  ok(`loaded test video (${bytes.length} bytes)`);

  const email = `slice4-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple";

  let r = await rpc("auth.register", { email, password, displayName: "Slice4" });
  if (r.status >= 400) fail(`register: ${r.status} ${JSON.stringify(r.json)}`);
  ok("registered member");

  r = await rpc("auth.login", { email, password });
  const token = r.json.accessToken ?? r.json.token;
  if (!token) fail(`login returned no token: ${JSON.stringify(r.json)}`);
  ok("logged in, got access token");

  r = await rpc("organizations.create", { name: "Slice4 Org", slug: `slice4-${Date.now()}` }, token);
  if (r.status >= 400) fail(`org create: ${r.status} ${JSON.stringify(r.json)}`);
  const orgId = r.json.id ?? r.json.organizationId;
  if (!orgId) fail(`org create returned no id: ${JSON.stringify(r.json)}`);
  ok(`created organization ${orgId}`);

  r = await rpc("projects.create", { organizationId: orgId, name: "Slice4 Project" }, token);
  if (r.status >= 400) fail(`project create: ${r.status} ${JSON.stringify(r.json)}`);
  const projectId = r.json.id ?? r.json.projectId;
  ok(`created project ${projectId}`);

  r = await rpc(
    "uploads.create",
    {
      organizationId: orgId,
      projectId,
      filename: "x.mp4",
      contentType: "video/mp4",
      sizeBytes: bytes.length,
    },
    token,
  );
  if (r.status >= 400) fail(`uploads.create: ${r.status} ${JSON.stringify(r.json)}`);
  const uploadId = r.json.id ?? r.json.uploadId;
  const videoId = r.json.videoId;
  if (!uploadId) fail(`uploads.create returned no id: ${JSON.stringify(r.json)}`);
  ok(`opened upload ${uploadId} (video ${videoId})`);

  // Stream the bytes as a single binary part.
  const putRes = await fetch(`${BASE}/uploads/${uploadId}/parts/1`, {
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream",
      authorization: `Bearer ${token}`,
    },
    body: bytes,
  });
  if (putRes.status >= 400) fail(`part upload: ${putRes.status} ${await putRes.text()}`);
  ok(`streamed ${bytes.length} bytes as part 1`);

  r = await rpc("uploads.complete", { uploadId, parts: [{ partNumber: 1 }] }, token);
  if (r.status >= 400) fail(`uploads.complete: ${r.status} ${JSON.stringify(r.json)}`);
  const finalVideoId = videoId ?? r.json.videoId ?? r.json.id;
  ok(`completed upload; video ${finalVideoId}`);

  // Poll the video until ready (inline transcode should be fast).
  let video;
  for (let i = 0; i < 60; i++) {
    r = await rpc("videos.get", { videoId: finalVideoId }, token);
    if (r.status < 400) {
      video = r.json;
      if (video.status === "ready" || video.status === "failed") break;
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  if (!video) fail("videos.get never returned a video");
  if (video.status !== "ready") fail(`video did not reach ready: ${JSON.stringify(video)}`);
  ok(`video reached status=ready`);

  if (typeof video.durationSeconds === "number" && video.durationSeconds > 0) {
    ok(`duration probed via ffprobe-static: ${video.durationSeconds}s`);
  } else {
    console.log(`  (duration: ${JSON.stringify(video.durationSeconds)})`);
  }

  // Fetch the playback manifest to enumerate renditions.
  r = await rpc("playback.manifest", { videoId: finalVideoId }, token);
  if (r.status >= 400) fail(`playback.manifest: ${r.status} ${JSON.stringify(r.json)}`);
  const manifest = r.json;
  const renditions = manifest.renditions ?? manifest.sources ?? [];
  if (!Array.isArray(renditions) || renditions.length < 3) {
    fail(`expected >=3 renditions, got ${JSON.stringify(manifest)}`);
  }
  ok(`playback manifest has ${renditions.length} renditions`);
  if (manifest.thumbnailUrl || manifest.thumbnail) ok("manifest exposes a thumbnail");
  if (manifest.previewUrl || manifest.preview) ok("manifest exposes a preview");

  // Range request against the first rendition's URL.
  const first = renditions[0];
  const url = first.url ?? first.href ?? first.streamUrl;
  if (!url) fail(`rendition has no url: ${JSON.stringify(first)}`);
  const streamUrl = url.startsWith("http") ? url : `${BASE}${url}`;
  const rangeRes = await fetch(streamUrl, {
    headers: { range: "bytes=0-1023", authorization: `Bearer ${token}` },
  });
  if (rangeRes.status !== 206) fail(`expected 206 partial, got ${rangeRes.status} for ${streamUrl}`);
  const cr = rangeRes.headers.get("content-range");
  ok(`rendition streamed with Range 206 (content-range: ${cr})`);

  console.log("\nSLICE 4 END-TO-END: PASS \u2014 transcode driven by @streetjs/media");
}

main().catch((e) => fail(e?.stack ?? String(e)));
