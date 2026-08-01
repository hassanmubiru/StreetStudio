/**
 * PostgreSQL client for the StreetStudio API host — backed by the **published**
 * StreetJS pool (`streetjs/pool` `PgPool`), per ADR-0022.
 *
 * The domain packages persist through two narrow seams:
 *
 *  - the structural {@link StreetPostgresClient} / {@link TransactionalSqlClient}
 *    defined in `@streetstudio/database` (used by the repository layer and the
 *    append-only Audit Log), and
 *  - the concrete {@link PgPool} class published by `streetjs`, which the
 *    upload/playback stores accept directly.
 *
 * This adapter composes the framework's `PgPool` and exposes it through both
 * seams. It replaces the previous hand-rolled `node-postgres` (`pg.Pool`)
 * implementation: the framework already owns connection pooling, the Postgres
 * wire protocol, and transactions, so the product must not reimplement them
 * (production charter; ADR-0022). Because the StreetJS wire client returns every
 * column as a string/null (it does not auto-parse ints/bools/jsonb the way
 * `node-postgres` does), the repository layer's `coerceValue` — which was written
 * for exactly this behavior — now round-trips values correctly, eliminating the
 * jsonb double-parse impedance mismatch that the raw `pg` driver caused.
 */
import type {
  SqlClient,
  SqlQueryResult,
  SqlRow,
  SqlValue,
  StreetPostgresClient,
  TransactionalSqlClient,
} from "@streetstudio/database";
import { PgPool } from "streetjs";

/**
 * Parse a `postgres://user:pass@host:port/database` URL into the discrete
 * connection options the StreetJS pool takes (it does not accept a URL). The
 * password/user are percent-decoded.
 */
function poolOptionsFromUrl(connectionString: string): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
} {
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: url.port ? Number.parseInt(url.port, 10) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
}

/**
 * A {@link PgPool}-backed client implementing the structural
 * {@link StreetPostgresClient} and {@link TransactionalSqlClient} seams.
 */
export class PgClient implements StreetPostgresClient, TransactionalSqlClient {
  private readonly pool: PgPool;

  constructor(connectionString: string, maxConnections = 10) {
    this.pool = new PgPool({ ...poolOptionsFromUrl(connectionString), maxConnections });
  }

  /** Execute a parameterized statement and normalize the result shape. */
  async query<TRow extends SqlRow = SqlRow>(
    text: string,
    params?: readonly SqlValue[],
  ): Promise<SqlQueryResult<TRow>> {
    const result = await this.pool.query(text, params as unknown[] | undefined);
    return {
      rows: result.rows as unknown as readonly TRow[],
      rowCount: result.rowCount,
    };
  }

  /**
   * Run `work` inside a single transaction on one pooled connection, committing
   * on success and rolling back on any rejection (delegated to the framework
   * pool's `transaction`). Satisfies {@link TransactionalSqlClient}.
   */
  async transaction<T>(work: (tx: SqlClient) => Promise<T>): Promise<T> {
    return this.pool.transaction(async (connection) => {
      const tx: SqlClient = {
        async query<TRow extends SqlRow = SqlRow>(
          text: string,
          params?: readonly SqlValue[],
        ): Promise<SqlQueryResult<TRow>> {
          const result = await connection.query(text, params as unknown[] | undefined);
          return {
            rows: result.rows as unknown as readonly TRow[],
            rowCount: result.rowCount,
          };
        },
      };
      return work(tx);
    });
  }

  /**
   * The concrete StreetJS {@link PgPool} for stores that accept it directly
   * (uploads/playback). Returns the real framework pool — no cast — since this
   * adapter now composes it (ADR-0022).
   */
  asPgPool(): PgPool {
    return this.pool;
  }

  /** Liveness probe for the health endpoint: a trivial round-trip to Postgres. */
  async ping(): Promise<boolean> {
    const result = await this.query<{ ok: string | number }>("SELECT 1 AS ok");
    // The StreetJS wire client returns scalars as strings; coerce before compare.
    return Number(result.rows[0]?.ok) === 1;
  }

  /** Close the underlying pool (graceful shutdown). */
  async close(): Promise<void> {
    await this.pool.close();
  }
}
