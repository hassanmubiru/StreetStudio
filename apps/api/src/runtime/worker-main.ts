/**
 * Media-processing worker runnable entrypoint (Docker `worker` target).
 *
 * The previous `worker` image CMD (`node apps/api/dist/index.js`) ran only the
 * scaffold that re-exports domain constants — it never drained the processing
 * backlog. This entrypoint runs the real {@link MediaWorker}: it connects
 * PostgreSQL, ensures the canonical schema is present, builds the concrete media
 * pipeline (real ffmpeg via `ffmpeg-static` + S3/MinIO storage), and loops,
 * claiming `queued` Videos from the canonical `video` table and transcoding them
 * to `ready`/`failed`.
 *
 * It shares the API's composition seams (`pg-client`, `pipeline-runtime`) so the
 * worker and the API run the exact same adapters against the exact same schema
 * and object store. A distributed deployment runs the API with
 * `PROCESSING_INLINE=false` (enqueue-only) plus one or more of these workers.
 *
 * Driver decision is identical to `main.ts`: standard `pg`/`ffmpeg-static`
 * adapted through the existing structural seams until the `@streetjs/*`
 * framework packages ship.
 */
import { runMigrations, streetSqlClient } from "@streetstudio/database";
import ffmpegStatic from "ffmpeg-static";
import { PgClient } from "./pg-client.js";
import {
  buildMediaRuntime,
  mediaRuntimeConfigFromEnv,
} from "./media/pipeline-runtime.js";
import { MediaWorker, loggingStatusEmitter } from "./media/media-worker.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`missing required environment variable: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL");
  const pollIntervalMs = Number.parseInt(
    process.env["WORKER_POLL_INTERVAL_MS"] ?? "1000",
    10,
  );

  const pg = new PgClient(databaseUrl);
  const reachable = await pg.ping();
  if (!reachable) {
    throw new Error("PostgreSQL connectivity check (SELECT 1) failed");
  }
  // Idempotent: the API applies the same migrations; running here lets the
  // worker start independently (and first) in a distributed deployment.
  await runMigrations(streetSqlClient(pg));

  const ffmpegPath = ffmpegStatic as unknown as string;
  const media = buildMediaRuntime(
    pg,
    mediaRuntimeConfigFromEnv(process.env, ffmpegPath),
    // No shared realtime bus across processes: log status transitions; the
    // authoritative status lives in the DB (updated by the pipeline).
    loggingStatusEmitter(),
  );

  const worker = new MediaWorker(pg, media, { pollIntervalMs });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    // eslint-disable-next-line no-console
    console.log(`[worker] received ${signal}, stopping`);
    worker.stop();
    // Give the in-flight job a moment, then release resources and exit.
    setTimeout(() => {
      try {
        media.close();
      } catch {
        /* best-effort */
      }
      void pg
        .close()
        .catch(() => undefined)
        .finally(() => process.exit(0));
    }, 500).unref();
    // Hard safety net.
    setTimeout(() => process.exit(0), 15_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // eslint-disable-next-line no-console
  console.log(
    `[worker] StreetStudio media worker online (poll ${pollIntervalMs}ms); draining 'queued' videos`,
  );
  await worker.start();
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error("[worker] fatal startup error:", error);
  process.exit(1);
});
