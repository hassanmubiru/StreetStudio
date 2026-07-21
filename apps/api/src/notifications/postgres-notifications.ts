/**
 * Canonical assembly of the API_Service's {@link NotificationService} on the
 * **store of record** — the `@streetstudio/database` repository layer over the
 * single canonical schema (ADR-0021, step 3: repoint a domain's production
 * default onto the canonical path).
 *
 * The `NotificationService` already reaches persistence only through its narrow
 * ports, so repointing is purely a wiring change: its production default now
 * uses `repositoryNotificationStore`/`repositoryNotificationPreferenceStore`
 * bound to the real `PgPool`-backed repositories (canonical singular,
 * FK-constrained `notification`/`notification_preference` tables), instead of the
 * standalone direct-`PgPool` `postgresNotificationStore` adapter. That adapter is
 * retained as integration proof / reference DDL and is not removed.
 */
import { PgPool } from "streetjs";
import {
  NotificationService,
  repositoryNotificationStore,
  repositoryNotificationPreferenceStore,
  type NotificationEmitter,
} from "@streetstudio/notifications";
import { assemblePostgresRepositories } from "../persistence/postgres-database.js";

/**
 * Build the real `NotificationService` on the canonical repository layer from a
 * live `PgPool` and the realtime delivery seam. The schema is provisioned once
 * at startup via `ensureCanonicalSchema` (see `persistence/postgres-database`).
 */
export function assemblePostgresNotifications(
  pool: PgPool,
  emitter: NotificationEmitter,
): NotificationService {
  const repositories = assemblePostgresRepositories(pool);
  return new NotificationService({
    notifications: repositoryNotificationStore(repositories),
    preferences: repositoryNotificationPreferenceStore(repositories),
    emitter,
  });
}
