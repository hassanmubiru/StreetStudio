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
import { createRealtimeBus } from "./realtime-bus.js";

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

  // WebSocket realtime transport. Built first so it can serve as both the
  // NotificationService delivery emitter and the processing-status fan-out
  // target; its bearer authenticator is wired from the runtime immediately
  // after buildRuntime.
  const realtime = new RealtimeHub();

  // Cross-process realtime bus (Redis pub/sub) when REDIS_URL is set; otherwise
  // a no-op bus and we broadcast in-process (single-node). This is how
  // processing-status events produced by a SEPARATE media worker (or another
  // API instance) reach the WebSocket clients connected to THIS process.
  const realtimeBus = createRealtimeBus(process.env["REDIS_URL"]);
  realtimeBus.onMessage((organizationId, event) =>
    realtime.broadcastToOrg(organizationId, event),
  );

  // Concrete media pipeline (real ffmpeg via ffmpeg-static + S3/MinIO storage),
  // shared by uploads/playback and the processing pipeline. Processing-status
  // transitions fan out to the owning organization over the realtime channel.
  const ffmpegPath = ffmpegStatic as unknown as string;
  const media = buildMediaRuntime(
    pgClient,
    mediaRuntimeConfigFromEnv(process.env, ffmpegPath),
    {
      emit(event) {
        const payload = {
          type: "processing-status",
          videoId: event.videoId,
          status: event.status,
          at: event.at,
          ...(event.failed ? { failed: true } : {}),
        };
        if (realtimeBus.distributed) {
          // Publish to Redis; every subscribed API instance (including this
          // one) broadcasts to its local sockets — exactly-once per client.
          realtimeBus.publish(event.organizationId, payload);
        } else {
          realtime.broadcastToOrg(event.organizationId, payload);
        }
      },
    },
  );

  // Processing placement: inline (single-node default) unless a distributed
  // worker is running (PROCESSING_INLINE=false → uploads.complete enqueues only).
  const inlineProcessing = process.env["PROCESSING_INLINE"] !== "false";
  const { service, operations, authenticate, uploadPart, resolveObject } =
    buildRuntime(config, pgClient, media, realtime, { inlineProcessing });
  realtime.setAuthenticator(authenticate);

  const server = createHttpServer({
    router: service.router,
    operations,
    pg: pgClient,
    authenticate,
    uploadPart,
    resolveObject,
  });

  // Route HTTP upgrades on /realtime to the WebSocket hub; reject others.
  server.on("upgrade", (req, socket, head) => {
    if (!realtime.handleUpgrade(req, socket, head)) {
      socket.destroy();
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(config.httpPort, () => resolve());
  });
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
    try {
      realtime.close();
    } catch {
      /* best-effort */
    }
    void realtimeBus.close().catch(() => undefined);
    server.close(() => {
      try {
        media.close();
      } catch {
        /* best-effort */
      }
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
