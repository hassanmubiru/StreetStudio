/**
 * PostgreSQL access boundary for `@streetstudio/database`.
 *
 * All persistence flows through StreetJS PostgreSQL access, which is consumed
 * exclusively via the `@streetjs/core` public package entry point by the
 * composition root (`apps/api`). To keep this package free of a hard dependency
 * on the optional `@streetjs/core` peer, every repository and migration is
 * written against a minimal structural {@link SqlClient}. The composition root
 * adapts the concrete StreetJS PostgreSQL client into a {@link SqlClient} with
 * {@link streetSqlClient}.
 *
 * This mirrors the dependency-injection/adapter pattern used by
 * `@streetstudio/config` for the StreetJS configuration interface, and keeps
 * the dependency graph acyclic: `database` depends only on `shared`/`config`.
 */

/** A scalar value that may be bound as a SQL parameter or returned in a row. */
export type SqlValue =
  | string
  | number
  | boolean
  | null
  | Date
  | readonly SqlValue[]
  | { readonly [key: string]: unknown };

/** A single row returned by a query, keyed by column name. */
export type SqlRow = Readonly<Record<string, unknown>>;

/** The result of executing a parameterized query. */
export interface SqlQueryResult<TRow extends SqlRow = SqlRow> {
  /** Rows produced by the statement, in result order. */
  readonly rows: readonly TRow[];
  /** Number of rows affected (for INSERT/UPDATE/DELETE), when reported. */
  readonly rowCount?: number;
}

/**
 * Minimal structural view of a PostgreSQL client. This is the ONLY surface the
 * repositories and migration runner depend on. It intentionally mirrors the
 * shape exposed by StreetJS PostgreSQL access so the concrete client adapts
 * without modification.
 *
 * Parameters use PostgreSQL positional placeholders (`$1`, `$2`, ...).
 */
export interface SqlClient {
  /** Execute a parameterized statement and return its result. */
  query<TRow extends SqlRow = SqlRow>(
    text: string,
    params?: readonly SqlValue[],
  ): Promise<SqlQueryResult<TRow>>;
}

/**
 * A {@link SqlClient} that additionally supports running a set of statements
 * inside a single transaction. Repositories that must persist several rows
 * atomically (e.g. creating an organization together with the creator's
 * administrator membership) require this capability.
 */
export interface TransactionalSqlClient extends SqlClient {
  /**
   * Run `work` within a database transaction. The transaction commits when the
   * callback resolves and rolls back if it rejects.
   */
  transaction<T>(work: (tx: SqlClient) => Promise<T>): Promise<T>;
}

/**
 * The subset of the StreetJS PostgreSQL client this package relies on. The
 * concrete object is obtained by the composition root through the
 * `@streetjs/core` public entry point and adapted with {@link streetSqlClient}.
 */
export interface StreetPostgresClient {
  query(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: readonly SqlRow[]; rowCount?: number }>;
}

/** Adapt a StreetJS PostgreSQL client into a {@link SqlClient}. */
export function streetSqlClient(client: StreetPostgresClient): SqlClient {
  return {
    async query<TRow extends SqlRow = SqlRow>(
      text: string,
      params?: readonly SqlValue[],
    ): Promise<SqlQueryResult<TRow>> {
      const result = await client.query(text, params);
      return {
        rows: result.rows as readonly TRow[],
        ...(result.rowCount !== undefined ? { rowCount: result.rowCount } : {}),
      };
    },
  };
}

/** Type guard: does the given client support transactions? */
export function isTransactional(
  client: SqlClient,
): client is TransactionalSqlClient {
  return (
    typeof (client as Partial<TransactionalSqlClient>).transaction ===
    "function"
  );
}
