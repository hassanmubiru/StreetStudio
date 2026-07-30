/**
 * `node-postgres` (`pg`) adapter for the StreetStudio persistence seams.
 *
 * The domain packages persist through two narrow seams:
 *
 *  - the structural {@link StreetPostgresClient} / {@link TransactionalSqlClient}
 *    defined in `@streetstudio/database` (used by the repository layer and the
 *    append-only Audit Log), and
 *  - the concrete `PgPool` class published by `streetjs`, which the
 *    de-seamed PostgreSQL stores (`postgresAuthStores`, `postgresRbacStore`,
 *    `postgresOrgStore`) accept directly (ADR-0020/0021).
 *
 * Both seams only ever call `.query(text, params) => { rows, rowCount }`, so a
 * single `pg.Pool`-backed adapter satisfies all of them. This is the deliberate,
 * reversible composition-root decision described in `main.ts`: wire the standard
 * `pg` driver behind the existing structural seams now; swap it for the future
 * `@streetjs/postgres` package (or `streetjs`'s own `PgPool`) without touching
 * any domain code.
 *
 * The `streetjs` `PgPool` type has private members, so it is nominal at the type
 * level. {@link PgClient.asPgPool} performs the one documented structural bridge
 * (the adapter exposes the exact `query` surface the stores use at runtime); it
 * is the single place that cast lives.
 */
import { Pool } from "pg";
import type {
  SqlClient,
  SqlQueryResult,
  SqlRow,
  SqlValue,
  StreetPostgresClient,
  TransactionalSqlClient,
} from "@streetstudio/database";
import type { PgPool } from "streetjs";

/** Shape of a `pg` query result we depend on (rows + affected count). */
interface PgQueryResult {
  readonly rows: unknown[];
  readonly rowCount: number | null;
}

/**
 * A `pg.Pool`-backed client implementing the structural
 * {@link StreetPostgresClient} and {@link TransactionalSqlClient} seams.
 */
export class PgClient implements StreetPostgresClient, TransactionalSqlClient {
  private readonly pool: Pool;

  constructor(connectionString: string, maxConnections = 10) {
    this.pool = new Pool({ connectionString, max: maxConnections });
  }

  /** Execute a parameterized statement and normalize the result shape. */
  async query<TRow extends SqlRow = SqlRow>(
    text: string,
    params?: readonly SqlValue[],
  ): Promise<SqlQueryResult<TRow>> {
    const result = (await this.pool.query(
      text,
      params as unknown[] | undefined,
    )) as PgQueryResult;
    return {
      rows: result.rows as readonly TRow[],
      ...(result.rowCount !== null ? { rowCount: result.rowCount } : {}),
    };
  }

  /**
   * Run `work` inside a single transaction on one pooled connection, committing
   * on success and rolling back on any rejection. Satisfies
   * {@link TransactionalSqlClient}.
   */
  async transaction<T>(work: (tx: SqlClient) => Promise<T>): Promise<T> {
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      const tx: SqlClient = {
        async query<TRow extends SqlRow = SqlRow>(
          text: string,
          params?: readonly SqlValue[],
        ): Promise<SqlQueryResult<TRow>> {
          const result = (await connection.query(
            text,
            params as unknown[] | undefined,
          )) as PgQueryResult;
          return {
            rows: result.rows as readonly TRow[],
            ...(result.rowCount !== null ? { rowCount: result.rowCount } : {}),
          };
        },
      };
      const value = await work(tx);
      await connection.query("COMMIT");
      return value;
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Bridge to the `streetjs` `PgPool` type expected by the de-seamed PostgreSQL
   * stores. The stores call only `.query(text, params)`, which this adapter
   * provides with an identical runtime contract; the cast reconciles `PgPool`'s
   * nominal (private-member) type. This is the single, documented seam bridge.
   */
  asPgPool(): PgPool {
    return this as unknown as PgPool;
  }

  /** Liveness probe for the health endpoint: a trivial round-trip to Postgres. */
  async ping(): Promise<boolean> {
    const result = await this.query<{ ok: number }>("SELECT 1 AS ok");
    return result.rows[0]?.ok === 1;
  }

  /** Close the underlying pool (graceful shutdown). */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
