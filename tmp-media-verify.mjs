// Independent end-to-end verification of the media pipeline against live infra
// (real ffmpeg via ffmpeg-static, real MinIO, real Postgres). Uses ONLY the
// compiled apps/api runtime + the seeded canonical schema. No fakes.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";
import { PgClient } from "./apps/api/dist/runtime/pg-client.js";
import { buildMediaRuntime } from "./apps/api/dist/runtime/media/pipeline-runtime.js";
import { newUuid } from "./packages/database/dist/index.js";

const DB = "postgres://streetstudio:streetstudio_dev@localhost:5435/streetstudio";

// 1) Generate a REAL 5s test video (color bars + tone) with ffmpeg.
const srcFile = "/tmp/mv-src.mp4";
execFileSync(ffmpegPath, [
  "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=5",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=5",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", srcFile,
], { stdio: "ignore" });
const srcBytes = readFileSync(srcFile);
console.log("1) generated source video:", srcBytes.length, "bytes");

const pg = new PgClient(DB);
const media = buildMediaRuntime(pg, {
  s3Endpoint: "http://localhost:9000", s3Region: "us-east-1",
  s3AccessKeyId: "streetstudio", s3SecretAccessKey: "streetstudio_dev_minio",
  s3Bucket: "streetstudio-media", s3ForcePathStyle: true,
  ffmpegPath,
  onFfmpegInvocation: (inv) => console.log("   ffmpeg:", inv.args.slice(0,6).join(" "), "..."),
});

const orgId = newUuid();
const videoId = newUuid();
const sourceKey = `sources/${videoId}/original.mp4`;

try {
  // 2) seed org + video (canonical schema); upload source bytes to MinIO.
  await pg.query(
    `INSERT INTO organization (id, name, settings, created_at) VALUES ($1,$2,$3::jsonb, now())`,
    [orgId, "Media Verify Org", "{}"],
  );
  await media.driver.put(sourceKey, new Uint8Array(srcBytes), { contentType: "video/mp4" });
  const head = await media.driver.exists(sourceKey);
  console.log("2) source uploaded to MinIO, exists =", head);
  await pg.query(
    `INSERT INTO video (id, organization_id, title, duration_seconds, status, source_object_key, created_at)
     VALUES ($1,$2,$3,$4,'uploaded',$5, now())`,
    [videoId, orgId, "Verify Clip", 5, sourceKey],
  );

  // 3) enqueue + process through the REAL pipeline.
  await media.enqueue(videoId);
  const [result] = await media.drain();
  console.log("3) pipeline result:", JSON.stringify({
    status: result.status, attempts: result.attempts,
    thumbnail: !!result.thumbnail, preview: !!result.preview,
    renditions: result.renditions.length,
  }));

  // 4) verify DB rows.
  const v = await pg.query(`SELECT status FROM video WHERE id=$1`, [videoId]);
  const assets = await pg.query(`SELECT type, object_key_or_body FROM asset WHERE video_id=$1`, [videoId]);
  const rends = await pg.query(`SELECT quality, object_key, bitrate FROM rendition WHERE video_id=$1 ORDER BY bitrate`, [videoId]);
  console.log("4) video.status =", v.rows[0]?.status);
  console.log("   assets:", assets.rows.map(r => r.type).join(", "));
  console.log("   renditions:", rends.rows.map(r => r.quality).join(", "), "(count", rends.rows.length + ")");

  // 5) verify EACH output object actually exists in MinIO and is non-empty.
  let allObjectsOk = true;
  for (const a of assets.rows) {
    const st = await media.driver.stat(a.object_key_or_body);
    const ok = st && st.size > 0;
    allObjectsOk = allObjectsOk && ok;
    console.log(`   MinIO asset ${a.type}: size=${st?.size ?? "MISSING"}`);
  }
  for (const r of rends.rows) {
    const st = await media.driver.stat(r.object_key);
    const ok = st && st.size > 0;
    allObjectsOk = allObjectsOk && ok;
    console.log(`   MinIO rendition ${r.quality}: size=${st?.size ?? "MISSING"}`);
  }

  const pass = result.status === "ready" && v.rows[0]?.status === "ready"
    && result.renditions.length >= 3 && !!result.thumbnail && !!result.preview
    && allObjectsOk;
  console.log("\nRESULT:", pass ? "PASS ✅ (real ffmpeg -> MinIO -> canonical DB)" : "FAIL ❌");
  process.exitCode = pass ? 0 : 1;
} finally {
  // cleanup DB rows (objects left in MinIO bucket are harmless dev data)
  await pg.query(`DELETE FROM organization WHERE id=$1`, [orgId]).catch(()=>{});
  media.close();
  await pg.close();
}
