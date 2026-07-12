/**
 * Schema migrations for StreetStudio.
 *
 * Migrations are generated deterministically from the structured {@link SCHEMA}
 * so the DDL and the introspectable metadata never drift. The initial migration
 * enables the required extensions and creates every table and index, including
 * the `organization_id` columns and their isolation indexes on tenant-scoped
 * tables.
 *
 * The {@link runMigrations} runner records applied migrations in a
 * `schema_migrations` bookkeeping table and applies only pending ones, in
 * order, so it is safe to run repeatedly (idempotent) and against a partially
 * migrated database.
 */
import type { SqlClient } from "./sql.js";
import { isTransactional } from "./sql.js";
import {
  SCHEMA,
  type ColumnDefinition,
  type IndexDefinition,
  type TableDefinition,
} from "./schema.js";

/** A single migration: an ordered id, a name, and its SQL statements. */
export interface Migration {
  /** Zero-padded, lexicographically sortable id, e.g. `"0001"`. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Ordered SQL statements applied together as one migration. */
  readonly statements: readonly string[];
}

/** Render a column's DDL fragment, e.g. `organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE`. */
export function renderColumn(column: ColumnDefinition): string {
  const parts = [column.name, column.type];
  parts.push(column.nullable ? "NULL" : "NOT NULL");
  if (column.default !== undefined) {
    parts.push(`DEFAULT ${column.default}`);
  }
  if (column.references !== undefined) {
    parts.push(`REFERENCES ${column.references} ON DELETE CASCADE`);
  }
  return parts.join(" ");
}

/** Render the `CREATE TABLE` statement for a table definition. */
export function renderCreateTable(table: TableDefinition): string {
  const lines = table.columns.map((c) => `  ${renderColumn(c)}`);
  lines.push(`  PRIMARY KEY (${table.primaryKey.join(", ")})`);
  return `CREATE TABLE IF NOT EXISTS ${table.name} (\n${lines.join(",\n")}\n)`;
}

/** Render a `CREATE INDEX` (or unique index) statement. */
export function renderCreateIndex(
  table: TableDefinition,
  index: IndexDefinition,
): string {
  const unique = index.unique ? "UNIQUE " : "";
  return `CREATE ${unique}INDEX IF NOT EXISTS ${index.name} ON ${table.name} (${index.columns.join(
    ", ",
  )})`;
}

/** Build the ordered list of DDL statements for the entire schema. */
export function buildSchemaStatements(
  schema: readonly TableDefinition[] = SCHEMA,
): string[] {
  const statements: string[] = [
    // pgcrypto provides gen_random_uuid(); citext enables case-insensitive
    // unique emails (R3.1, R3.8).
    'CREATE EXTENSION IF NOT EXISTS "pgcrypto"',
    'CREATE EXTENSION IF NOT EXISTS "citext"',
  ];
  for (const table of schema) {
    statements.push(renderCreateTable(table));
  }
  for (const table of schema) {
    for (const index of table.indexes) {
      statements.push(renderCreateIndex(table, index));
    }
  }
  return statements;
}

/** The ordered migration set. */
export const MIGRATIONS: readonly Migration[] = [
  {
    id: "0001",
    name: "initial_schema",
    statements: buildSchemaStatements(),
  },
];

/** Bookkeeping table tracking which migrations have been applied. */
const MIGRATIONS_TABLE = "schema_migrations";

const CREATE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
  id text PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

/** Outcome of a migration run. */
export interface MigrationRunResult {
  /** Migration ids that were applied during this run, in order. */
  readonly applied: readonly string[];
  /** Migration ids that were already present and skipped. */
  readonly skipped: readonly string[];
}

/** Read the set of already-applied migration ids. */
async function readApplied(client: SqlClient): Promise<Set<string>> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM ${MIGRATIONS_TABLE}`,
  );
  return new Set(result.rows.map((row) => row.id));
}

/** Apply one migration's statements and record it, atomically when possible. */
async function applyOne(client: SqlClient, migration: Migration): Promise<void> {
  const run = async (tx: SqlClient): Promise<void> => {
    for (const statement of migration.statements) {
      await tx.query(statement);
    }
    await tx.query(
      `INSERT INTO ${MIGRATIONS_TABLE} (id, name) VALUES ($1, $2)`,
      [migration.id, migration.name],
    );
  };

  if (isTransactional(client)) {
    await client.transaction(run);
  } else {
    await run(client);
  }
}

/**
 * Apply all pending migrations in order. Migrations already recorded in the
 * bookkeeping table are skipped, so this is safe to run on every startup.
 * Migrations are validated to be uniquely and monotonically ordered by id.
 */
export async function runMigrations(
  client: SqlClient,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<MigrationRunResult> {
  assertOrderedMigrations(migrations);

  await client.query(CREATE_MIGRATIONS_TABLE);
  const already = await readApplied(client);

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrations) {
    if (already.has(migration.id)) {
      skipped.push(migration.id);
      continue;
    }
    await applyOne(client, migration);
    applied.push(migration.id);
  }

  return { applied, skipped };
}

/** Throw if migration ids are duplicated or not strictly increasing. */
export function assertOrderedMigrations(
  migrations: readonly Migration[],
): void {
  let previous: string | undefined;
  const seen = new Set<string>();
  for (const migration of migrations) {
    if (seen.has(migration.id)) {
      throw new Error(`Duplicate migration id: ${migration.id}`);
    }
    seen.add(migration.id);
    if (previous !== undefined && migration.id <= previous) {
      throw new Error(
        `Migration ids must be strictly increasing: ${migration.id} follows ${previous}`,
      );
    }
    previous = migration.id;
  }
}
