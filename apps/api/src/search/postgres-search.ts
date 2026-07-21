/**
 * Canonical assembly of the API_Service's {@link SearchService} on the **store
 * of record** — the `@streetstudio/database` repository layer over the single
 * canonical schema (ADR-0021, step 3: repoint a domain's production default onto
 * the canonical path).
 *
 * The `SearchService` reaches persistence only through its pluggable
 * {@link SearchIndex} port, so repointing is a wiring change: its production
 * default now uses `postgresSearchIndex` bound to the real `PgPool` but
 * operating against the canonical schema (singular, FK-constrained
 * `video`/`transcript` tables) instead of the standalone schema. The search
 * queries run directly against the canonical tables provisioned by
 * `ensureCanonicalSchema`.
 */
import { PgPool } from "streetjs";
import type { AccessControl } from "@streetstudio/auth";
import {
  SearchService,
  postgresSearchIndex,
} from "@streetstudio/search";

/**
 * Build the real `SearchService` on the canonical schema from a live `PgPool`
 * and the RBAC evaluator. The schema is provisioned once at startup via
 * `ensureCanonicalSchema`; authorized-scope filtering stays in the service
 * layer (R14.4). The search adapter queries the canonical video/transcript
 * tables directly for efficient text search.
 */
export function assemblePostgresSearch(
  pool: PgPool,
  access: AccessControl,
): SearchService {
  return new SearchService({
    index: postgresSearchIndex(pool),
    access,
  });
}