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
import { startApiService } from "../ops/startup.js";
import { buildRuntime } from "./container.js";
import { envConfigSource } from "./env-config-source.js";
import { createHttpServer } from "./http-server.js";
import { PgClient } from "./pg-client.js";

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
    },
  });

  // `activate` ran to completion, so the client is initialized.
  const pgClient = pg as PgClient;
  const { service, operations } = buildRuntime(config, pgClient);
  const server = createHttpServer({
    router: service.router,
    operations,
    pg: pgClient,
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
    server.close(() => {
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
