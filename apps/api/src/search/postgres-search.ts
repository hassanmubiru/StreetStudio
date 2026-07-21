/**
 * Canonical assembly of the API_Service's {@link SearchService} on the **store
 * of record** — the `@streetstudio/database` repository layer over the single
 * canonical schema (ADR-0021, step 3: repoint a domain's production default onto
 * the canonical path).
 *
 * The `SearchService` reaches persistence only through its pluggable
 * {@link SearchIndex} port, so repointing is a wiring change: its production
 * default now uses `repositorySearchIndex` bound to the real `PgPool`-backed
 * repositories (canonical singular, FK-constrained `video`/`transcript` tables).
 * The standalone direct-`PgPool` `postgresSearchIndex` adapter is retained as
 * integration proof / reference DDL.
 */
import { PgPool } from "streetjs";
import type { AccessControl } from "@streetstudio/auth";
import {
  SearchService,
  repositorySearchIndex,
} from "@streetstudio/search";
import { assemblePostgresRepositories } from "../persistence/postgres-database.js";

/**
 * Build the real `SearchService` on the canonical repository layer from a live
 * `PgPool` and the RBAC evaluator. The schema is provisioned once at startup
 * via `ensureCanonicalSchema`; authorized-scope filtering stays in the service
 * layer (R14.4).
 */
export function assemblePostgresSearch(
  pool: PgPool,
  access: AccessControl,
): SearchService {
  const repositories = assemblePostgresRepositories(pool);
  return new SearchService({
    index: repositorySearchIndex(repositories),
    access,
  });
}