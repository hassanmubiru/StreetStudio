/**
 * Canonical assembly of the API_Service's {@link ContentService} on the **store
 * of record** — the `@streetstudio/database` repository layer over the single
 * canonical schema (ADR-0021, step 3: repoint a domain's production default onto
 * the canonical path).
 *
 * The `ContentService` reaches persistence only through its narrow
 * {@link ContentStore} port, so repointing is a wiring change: its production
 * default now uses `repositoryContentStore` bound to the real `PgPool`-backed
 * repositories (canonical singular, FK-constrained
 * `organization`/`project`/`workspace`/`folder`/`video` tables). The standalone
 * direct-`PgPool` `postgresContentStore` adapter is retained as integration proof.
 */
import { PgPool } from "streetjs";
import type { AccessControl } from "@streetstudio/auth";
import {
  ContentService,
  repositoryContentStore,
} from "@streetstudio/projects";
import { assemblePostgresRepositories } from "../persistence/postgres-database.js";

/**
 * Build the real `ContentService` on the canonical repository layer from a live
 * `PgPool` and the RBAC evaluator. The schema is provisioned once at startup
 * via `ensureCanonicalSchema`; access controls are enforced in the service layer
 * based on the FK organization scope.
 */
export function assemblePostgresContent(
  pool: PgPool,
  access: AccessControl,
): ContentService {
  const repositories = assemblePostgresRepositories(pool);
  return new ContentService({
    store: repositoryContentStore(repositories),
    access,
  });
}