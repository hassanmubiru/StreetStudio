// @ts-nocheck
/**
 * TEMPORARY end-to-end media-pipeline verification harness.
 *
 * Proves the concrete media pipeline against LIVE infra with REAL ffmpeg, REAL
 * MinIO object storage, and REAL PostgreSQL — no mocks:
 *   1. Generate a real 6s test video (video+audio) with the ffmpeg-static binary.
 *   2. Upload it to MinIO via the real S3 StorageDriver; confirm the object.
 *   3. Insert a real Organization + Video row (canonical schema) pre-processing.
 *   4. Run MediaPipeline.process({videoId, organizationId}).
 *   5. Assert ProcessingResult + query Postgres + list MinIO derivatives.
 *   6. Print every ffmpeg invocation's exit code.
 *
 * Run: node apps/api/scripts/verify-media.mjs   (from repo root)
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import {
  createRepositories,
  streetSqlClient,
  newUuid,
  runMigrations,
} from "@streetstudio/database";
import { PgClient } from "../dist/runtime/pg-client.js";
import {
  buildMediaRuntime,
  mediaRuntimeConfigFromEnv,
} from "../dist/runtime/media/pipeline-runtime.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://streetstudio:streetstudio_dev@localhost:5435/streetstudio";

function log(...args) {
  console.log(...args);
}

function runFfmpegRaw(label, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      log(`  [ffmpeg:${label}] exit code = ${code}`);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg ${label} failed (${code}): ${stderr.slice(-400)}`));
    });
  });
}

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
  log(`  ✓ ${message}`);
}

async function main() {
  log("=== StreetStudio Media Pipeline — REAL end-to-end verification ===\n");
  log(`ffmpeg-static binary: ${ffmpegPath}`);

  const workDir = await mkdtemp(join(tmpdir(), "streetstudio-verify-"));
  const sourcePath = join(workDir, "source.mp4");
  const pg = new PgClient(DATABASE_URL);
  let runtime;

  try {
    // ── 1. Generate a REAL 6s test video (video + audio) ────────────────────
    log("\n[1] Generating real test video with ffmpeg-static ...");
    await runFfmpegRaw("gen-source", [
      "-f", "lavfi", "-i", "testsrc=duration=6:size=320x240:rate=15",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
      "-shortest", "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p",
      "-y", sourcePath,
    ]);
    const sourceBytes = new Uint8Array(await readFile(sourcePath));
    assert(sourceBytes.byteLength > 0, `source.mp4 generated (${sourceBytes.byteLength} bytes)`);

    // ── DB connectivity + canonical schema ──────────────────────────────────
    const reachable = await pg.ping();
    assert(reachable, "PostgreSQL reachable (SELECT 1)");
    await runMigrations(streetSqlClient(pg));
    log("  ✓ canonical schema ensured (runMigrations)");

    const repositories = createRepositories(streetSqlClient(pg));

    // ── Build the concrete media runtime (real ffmpeg + real S3/MinIO) ──────
    const invocations = [];
    const config = mediaRuntimeConfigFromEnv(process.env, ffmpegPath, ffprobeStatic.path);
    log(`ffprobe-static binary: ${ffprobeStatic.path}`);
    runtime = await buildMediaRuntime(pg, {
      ...config,
      onFfmpegInvocation: (inv) => {
        invocations.push(inv);
        log(`  [ffmpeg:${inv.label}] exit code = ${inv.exitCode}`);
      },
    });
    log(`\n[2] Uploading source to MinIO (bucket ${config.s3Bucket}) via real S3 driver ...`);

    const videoId = newUuid();
    const organizationId = newUuid();
    const sourceObjectKey = `sources/${videoId}/source.mp4`;

    await runtime.driver.put(sourceObjectKey, sourceBytes, { contentType: "video/mp4" });
    const exists = await runtime.driver.exists(sourceObjectKey);
    assert(exists, `source object exists in MinIO at ${sourceObjectKey}`);
    const sourceStat = await runtime.driver.stat(sourceObjectKey);
    assert(sourceStat?.size === sourceBytes.byteLength, `MinIO source size matches (${sourceStat?.size} bytes)`);

    // ── 3. Insert a real Organization + Video (pre-processing) ──────────────
    log("\n[3] Inserting real Organization + Video rows (canonical schema) ...");
    const now = new Date().toISOString();
    await repositories.organizations.insert({
      id: organizationId,
      name: `verify-media-${Date.now()}`,
      settings: {},
      createdAt: now,
    });
    log(`  ✓ organization ${organizationId}`);
    await repositories.videos.insert({
      id: videoId,
      organizationId,
      folderId: null,
      title: "verify-media source",
      durationSeconds: 6,
      status: "queued",
      sourceObjectKey,
      developerMode: false,
      createdAt: now,
    });
    log(`  ✓ video ${videoId} (status=queued, durationSeconds=6)`);

    // ── 4. Run the pipeline ─────────────────────────────────────────────────
    log("\n[4] Running MediaPipeline.process({videoId, organizationId}) ...");
    const result = await runtime.process({ videoId, organizationId });

    // ── 5. Assert ProcessingResult ──────────────────────────────────────────
    log("\n[5] ProcessingResult:");
    log(JSON.stringify(result, null, 2));
    assert(result.status === "ready", `ProcessingResult.status === "ready"`);
    assert(result.attempts >= 1, `attempts = ${result.attempts}`);
    assert(!!result.thumbnail?.objectKey, `thumbnail persisted (${result.thumbnail?.objectKey})`);
    assert(!!result.preview?.objectKey, `preview persisted (${result.preview?.objectKey})`);
    assert(result.renditions.length >= 3, `>= 3 renditions persisted (${result.renditions.length})`);

    // ── 5b. Duration probe via @streetjs/media over ffprobe-static ──────────
    log("\n[5b] Probing source duration via @streetjs/media (ffprobe-static) ...");
    const probedSeconds = await runtime.probeDurationSeconds(sourceObjectKey);
    log(`  probed duration = ${probedSeconds}s`);
    assert(probedSeconds === 6, `ffprobe reported the real 6s duration (got ${probedSeconds})`);

    // ── Query Postgres for the persisted rows ───────────────────────────────
    log("\n[5a] PostgreSQL rows:");
    const videoRow = await pg.query("SELECT id, status, source_object_key, duration_seconds FROM video WHERE id = $1", [videoId]);
    log("  video: " + JSON.stringify(videoRow.rows[0]));
    assert(videoRow.rows[0]?.status === "ready", `video.status === "ready" in Postgres`);
    assert(videoRow.rows[0]?.source_object_key === sourceObjectKey, "source_object_key retained in Postgres");

    const assetRows = await pg.query("SELECT id, type, object_key_or_body FROM asset WHERE video_id = $1 ORDER BY type", [videoId]);
    log("  assets:");
    for (const r of assetRows.rows) log("    " + JSON.stringify(r));
    assert(assetRows.rows.some((r) => r.type === "thumbnail"), "thumbnail asset row exists");
    assert(assetRows.rows.some((r) => r.type === "preview"), "preview asset row exists");

    const rendRows = await pg.query("SELECT id, quality, object_key, bitrate FROM rendition WHERE video_id = $1 ORDER BY bitrate DESC", [videoId]);
    log("  renditions:");
    for (const r of rendRows.rows) log("    " + JSON.stringify(r));
    assert(rendRows.rows.length >= 3, `>= 3 rendition rows in Postgres (${rendRows.rows.length})`);

    // ── Print each recorded ffmpeg invocation exit code ─────────────────────
    log("\n[6] ffmpeg invocations (transcode):");
    for (const inv of invocations) {
      log(`  - ${inv.label}: exit=${inv.exitCode}  (${["ffmpeg", ...inv.args].join(" ")})`);
    }
    assert(invocations.length >= 5, `>= 5 ffmpeg transcode invocations (thumbnail+preview+3 renditions) = ${invocations.length}`);
    assert(invocations.every((i) => i.exitCode === 0), "every ffmpeg invocation exited 0");

    // ── MinIO object listing (real derivatives) ─────────────────────────────
    log("\n[7] MinIO objects under streetstudio-media (real derivatives):");
    try {
      const listing = execFileSync(
        "docker",
        ["exec", "streetstudio-minio-1", "mc", "ls", "--recursive", "local/streetstudio-media"],
        { encoding: "utf8" },
      );
      log(listing.split("\n").filter((l) => l.includes(videoId)).join("\n") || listing);
    } catch (e) {
      log("  (could not run docker mc ls: " + e.message + ")");
    }

    log("\n=== VERIFICATION PASSED ===");
  } finally {
    if (runtime) runtime.close();
    await pg.close().catch(() => {});
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("\n=== VERIFICATION FAILED ===");
  console.error(err);
  process.exit(1);
});
