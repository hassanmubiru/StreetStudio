/**
 * API_Service runnable entrypoint (vertical slice).
 *
 * ── Composition-root / driver decision ──────────────────────────────────────
 * The domain packages are complete but have no composition root or HTTP
 * transport, and the intended `@streetjs/*` framework packages
 * (core/postgres/redis/websocket) are not published yet — only `@streetjs/storage`
 * exists, which is why `street.config.ts` is a commented template. Rather than
 * block on the framework, this root adapts the STANDARD `node-postgres` (`pg`)
 * driver through the existing structural persistence seams:
 *
 *   - `StreetPostgresClient` / `TransactionalSqlClient` (`@streetstudio/database`)
 *   - the `PgPool` shape the de-seamed auth/org/rbac PostgreSQL stores accept.
 *
 * See `runtime/pg-client.ts`: a single `pg.Pool`-backed adapter satisfies every
 * seam because they all reduce to `.query(text, params) => { rows, rowCount }`.
 * This decision is deliberate and reversible — when `@streetjs/postgres` ships
 * (or when we adopt `streetjs`'s own `PgPool`), only `pg-client.ts` changes; no
 * domain code moves. It does not violate `npm run streetjs:check`, which forbids
 * only path/vcs/url specifiers and deep imports of unpublished `@streetjs/*`
 * packages — none of which appear here.
 *
 * Startup sequence (via `startApiService`): validate required configuration,
 * then, inside `activate`, connect PostgreSQL and ensure the auth/RBAC/org
 * schemas before the HTTP server begins accepting requests (R30.2, R30.3).
 */
import { runMigrations, streetSqlClient } from "@streetstudio/database";
import { ensureUploadsSchema } from "@streetstudio/uploads";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { startApiService } from "../ops/startup.js";
import { buildRuntime } from "./container.js";
import { envConfigSource } from "./env-config-source.js";
import { createHttpServer } from "./http-server.js";
import { PgClient } from "./pg-client.js";
import {
  buildMediaRuntime,
  mediaRuntimeConfigFromEnv,
} from "./media/pipeline-runtime.js";
import { RealtimeHub } from "./realtime-hub.js";

async function main(): Promise<void> {
  const configSource = envConfigSource();
  let pg: PgClient | undefined;

  const { config } = await startApiService({
    configSource,
    activate: async (validated) => {
      // Connect PostgreSQL and prove reachability before serving.
      pg = new PgClient(validated.databaseUrl);
      const reachable = await pg.ping();
      if (!reachable) {
        throw new Error("PostgreSQL connectivity check (SELECT 1) failed");
      }
      // Apply the ONE canonical migration-managed schema (idempotent; tracks
      // applied migrations). This is the single source of truth every service
      // is wired to via createRepositories (SCHEMA-DUP-01 reconciliation).
      await runMigrations(streetSqlClient(pg));
      // Upload sessions live in their own table (not part of runMigrations).
      await ensureUploadsSchema(pg.asPgPool());
    },
  });

  // `activate` ran to completion, so the client is initialized.
  const pgClient = pg as PgClient;

  // WebSocket realtime transport (published `@streetjs/realtime`, ADR-0022
  // slice 6). Built first so it can serve as both the NotificationService
  // delivery emitter and the processing-status fan-out target; its bearer
  // authenticator is wired from the runtime immediately after buildRuntime.
  // Cross-instance fan-out (a SEPARATE media worker or a second API instance)
  // is handled by the framework's RedisAdapter when REDIS_URL is set; otherwise
  // the framework MemoryAdapter delivers in-process (single-node).
  const realtime = await RealtimeHub.create({
    redisUrl: process.env["REDIS_URL"],
  });

  // Concrete media pipeline (real ffmpeg via ffmpeg-static + S3/MinIO storage),
  // shared by uploads/playback and the processing pipeline. Processing-status
  // transitions fan out to the owning organization over the realtime channel.
  const ffmpegPath = ffmpegStatic as unknown as string;
  const ffprobePath = ffprobeStatic.path;
  const media = await buildMediaRuntime(
    pgClient,
    mediaRuntimeConfigFromEnv(process.env, ffmpegPath, ffprobePath),
    {
      emit(event) {
        // Fan out over the owning org's room. The framework facade delivers to
        // this instance's connected clients and (via the RedisAdapter) to peer
        // instances, so a single call reaches every client exactly once.
        realtime.broadcastToOrg(event.organizationId, {
          type: "processing-status",
          videoId: event.videoId,
          status: event.status,
          at: event.at,
          ...(event.failed ? { failed: true } : {}),
        });
      },
    },
  );

  // Prove the queue backend is reachable before serving (connect + PING for the
  // Redis driver; a no-op for the Memory driver).
  await media.initQueue();

  // Processing placement: inline (single-node default) unless a distributed
  // worker is running (PROCESSING_INLINE=false → uploads.complete enqueues only).
  const inlineProcessing = process.env["PROCESSING_INLINE"] !== "false";
  // In inline mode this API process also consumes the queue, so an in-process
  // worker drives each enqueued video to completion for the synchronous response.
  if (inlineProcessing) {
    media.startWorker({ concurrency: 1 });
  }
  const { service, operations, authenticate, uploadPart, resolveObject } =
    buildRuntime(config, pgClient, media, realtime, { inlineProcessing });
  realtime.setAuthenticator(authenticate);

  // The HTTP host is the published StreetJS app (ADR-0022 slice 2). It exposes
  // its underlying Node `http.Server` as `app.server`, so the realtime hub can
  // attach to the same socket for the `/realtime` WebSocket upgrade.
  const app = createHttpServer({
    router: service.router,
    operations,
    pg: pgClient,
    authenticate,
    uploadPart,
    resolveObject,
  });

  // Attach the framework WebSocket server to the shared HTTP socket. The
  // framework owns the `/realtime` upgrade, the authenticated handshake, and
  // identity binding; the hub joins each connection to its member/org rooms.
  realtime.attach(app.server);

  await app.listen(config.httpPort, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(
    `[api] StreetStudio API listening on http://0.0.0.0:${config.httpPort} ` +
      `(instance ${config.instanceId}); slice operations: ${operations
        .map((op) => op.id)
        .join(", ")}`,
  );

  // Graceful shutdown: stop accepting connections, then close the pool.
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    // eslint-disable-next-line no-console
    console.log(`[api] received ${signal}, shutting down`);
    void realtime.close().catch(() => undefined);
    void app
      .close()
      .catch(() => undefined)
      .finally(() => {
        void media.close().catch(() => undefined);
        void pgClient
          .close()
          .catch(() => undefined)
          .finally(() => process.exit(0));
      });
    // Safety net if connections linger.
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error("[api] fatal startup error:", error);
  process.exit(1);
});
