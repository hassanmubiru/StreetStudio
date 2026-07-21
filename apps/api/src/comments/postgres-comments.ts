/**
 * Canonical assembly of the API_Service's {@link CommentService} on the **store
 * of record** — the `@streetstudio/database` repository layer over the single
 * canonical schema (ADR-0021, step 3: repoint a domain's production default onto
 * the canonical path).
 *
 * The `CommentService` reaches persistence only through its narrow
 * {@link CommentStore} port, so repointing is a wiring change: its production
 * default now uses `repositoryCommentStore` bound to the real `PgPool`-backed
 * repositories (canonical singular, FK-constrained `comment`/`reaction`/`video`
 * tables), instead of the standalone direct-`PgPool` `postgresCommentStore`
 * adapter. That adapter is retained as integration proof / reference DDL.
 */
import { PgPool } from "streetjs";
import type { AccessControl } from "@streetstudio/auth";
import {
  CommentService,
  repositoryCommentStore,
  type MentionNotifier,
} from "@streetstudio/comments";
import { assemblePostgresRepositories } from "../persistence/postgres-database.js";

/**
 * Build the real `CommentService` on the canonical repository layer from a live
 * `PgPool`, the RBAC evaluator, and the mention-notification seam. The schema is
 * provisioned once at startup via `ensureCanonicalSchema`.
 */
export function assemblePostgresComments(
  pool: PgPool,
  access: AccessControl,
  notifier: MentionNotifier,
): CommentService {
  const repositories = assemblePostgresRepositories(pool);
  return new CommentService({
    store: repositoryCommentStore(repositories),
    access,
    notifier,
  });
}
