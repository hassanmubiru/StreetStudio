/**
 * Postgres assembly for the Organizations domain (ADR-0021, step 3).
 *
 * The `OrgService` reaches persistence only through its narrow {@link OrgStore}
 * port, so repointing is a wiring change: its production default now uses
 * `repositoryOrgStore` bound to the real `PgPool`-backed repositories
 * (canonical singular, FK-constrained
 * `organization`/`member`/`role`/`membership`/`team`/`invitation` tables).
 * The standalone direct-`PgPool` `postgresOrgStore` from the original de-seam
 * is retained as integration proof / reference schema until convergence completes.
 *
 * This assembly is what each domain repointing follows under ADR-0021: wire the
 * existing service over `assemblePostgresRepositories` instead of the
 * in-memory default, verified by a DB-gated integration test. The canonical schema
 * is provisioned once at startup via `ensureCanonicalSchema`.
 */
import type { PgPool } from "@streetjs/postgres";
import {
  OrgService,
  repositoryOrgStore,
} from "@streetstudio/organizations";
import { assemblePostgresRepositories } from "../persistence/postgres-database.js";

/**
 * Wire the real `OrgService` onto the canonical repository layer.
 * 
 * This replaces the service's previous production default (which was
 * `repositoryOrgStore` over the standalone direct-`PgPool` adapter) with the
 * same `repositoryOrgStore` over the `@streetstudio/database` canonical layer.
 * The service logic is identical; only the persistence target changes.
 */
export function assemblePostgresOrganizations(pool: PgPool): OrgService {
  const repositories = assemblePostgresRepositories(pool);
  return new OrgService({
    store: repositoryOrgStore(repositories),
  });
}