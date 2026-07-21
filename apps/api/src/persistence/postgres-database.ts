/**
 * Canonical persistence assembly for the API_Service (store-of-record
 * convergence, ADR-0021).
 *
 * ADR-0021 chose the `@streetstudio/database` `SqlClient` repository layer —
 * driven by the single canonical schema in `packages/database` (`SCHEMA` +
 * `runMigrations`) — as StreetStudio's single store of record, superseding the
 * per-domain direct-`PgPool` adapters (which are retained as integration proof
 * and reference DDL). This module is step 2 of that plan: it wires a **real**
 * StreetJS Postgres client into the repository layer at the API composition
 * root, so domain services can be repointed at the canonical path one at a time.
 *
 * Nothing here removes the existing seams; it adds the real wiring beside them.
 */
import { PgPool } from "streetjs";
import {
  createRepositories,
  runMigrations,
  streetSqlClient,
  type MigrationRunResult,
  type Repositories,
  type SqlClient,
} from "@streetstudio/database";

/**
 * Adapt a live StreetJS {@link PgPool} into the structural {@link SqlClient} the
 * `@streetstudio/database` repositories and migration runner depend on. Keeps
 * the database package free of a hard `streetjs` dependency (it consumes only
 * the minimal `SqlClient` surface); the composition root supplies the concrete
 * client here.
 */
export function streetPgPoolClient(pool: PgPool): SqlClient {
  return streetSqlClient({
    query: (text, params) =>
      pool.query(text, params ? [...params] : []) as ReturnType<
        Parameters<typeof streetSqlClient>[0]["query"]
      >,
  });
}

/**
 * Apply the canonical schema to a real Postgres via `runMigrations`. Idempotent
 * — records applied migrations in `schema_migrations` and skips ones already
 * present — so it is safe to run on every startup and in tests.
 */
export async function ensureCanonicalSchema(
  pool: PgPool,
): Promise<MigrationRunResult> {
  return runMigrations(streetPgPoolClient(pool));
}

/**
 * Build the full set of canonical repositories bound to a real `PgPool`. This
 * is the real store-of-record wiring the composition root passes to domain
 * services as their production persistence path (replacing the direct-`PgPool`
 * adapters as each domain is migrated under ADR-0021).
 */
export function assemblePostgresRepositories(pool: PgPool): Repositories {
  return createRepositories(streetPgPoolClient(pool));
}
