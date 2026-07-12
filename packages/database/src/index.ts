/**
 * @streetstudio/database
 *
 * Public entry point for schema, migrations, repositories, and the append-only
 * audit log. PostgreSQL access is delegated to StreetJS public entry points.
 */
import type { Uuid, IsoTimestamp } from "@streetstudio/shared";

export const DOMAIN =
  "PostgreSQL schema, migrations, repositories, and the append-only audit log." as const;

/** Placeholder repository handle wired via StreetJS DI in later tasks. */
export interface RepositoryContext {
  readonly organizationId: Uuid;
  readonly at: IsoTimestamp;
}
