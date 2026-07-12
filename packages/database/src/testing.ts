/**
 * In-memory {@link SqlClient} for tests.
 *
 * This is a deliberately small interpreter that understands only the narrow set
 * of SQL shapes emitted by this package's repositories and migration runner:
 * `CREATE ...` (no-ops), positional `INSERT` (with optional single
 * `ON CONFLICT ... DO UPDATE`), `SELECT * ... WHERE col = $n [AND ...]`, and
 * `DELETE ... WHERE col = $n [AND ...]`. It is not a general SQL engine — it
 * exists so repository round-trips can be exercised without a live PostgreSQL.
 *
 * Exported from the package (not the public entry point) so tests in dependent
 * packages can reuse it.
 */
import type { SqlClient, SqlQueryResult, SqlRow, SqlValue } from "./sql.js";

type Row = Record<string, unknown>;

interface WhereClause {
  readonly column: string;
  readonly paramIndex: number;
}

function parseWhere(sql: string): WhereClause[] {
  const match = /where\s+(.+?)(?:\s+order\s+by\b.*)?$/is.exec(sql);
  if (!match) return [];
  const conditions = match[1] as string;
  const clauses: WhereClause[] = [];
  for (const part of conditions.split(/\s+and\s+/i)) {
    const cond = /([a-z0-9_]+)\s*=\s*\$(\d+)/i.exec(part);
    if (cond) {
      clauses.push({
        column: cond[1] as string,
        paramIndex: Number.parseInt(cond[2] as string, 10) - 1,
      });
    }
  }
  return clauses;
}

function matches(
  row: Row,
  clauses: readonly WhereClause[],
  params: readonly SqlValue[],
): boolean {
  return clauses.every((c) => row[c.column] === params[c.paramIndex]);
}

/** A minimal in-memory SQL client sufficient for repository/migration tests. */
export class InMemorySqlClient implements SqlClient {
  private readonly tables = new Map<string, Row[]>();
  /** Every executed statement, for assertions on emitted SQL. */
  readonly log: string[] = [];

  private rowsFor(table: string): Row[] {
    let rows = this.tables.get(table);
    if (!rows) {
      rows = [];
      this.tables.set(table, rows);
    }
    return rows;
  }

  async query<TRow extends SqlRow = SqlRow>(
    text: string,
    params: readonly SqlValue[] = [],
  ): Promise<SqlQueryResult<TRow>> {
    this.log.push(text);
    const trimmed = text.trim();

    if (/^create\b/i.test(trimmed)) {
      return { rows: [], rowCount: 0 };
    }
    if (/^insert\b/i.test(trimmed)) {
      return this.insert(trimmed, params) as SqlQueryResult<TRow>;
    }
    if (/^select\b/i.test(trimmed)) {
      return this.select(trimmed, params) as SqlQueryResult<TRow>;
    }
    if (/^delete\b/i.test(trimmed)) {
      return this.delete(trimmed, params) as SqlQueryResult<TRow>;
    }
    throw new Error(`InMemorySqlClient: unsupported statement: ${trimmed}`);
  }

  private insert(sql: string, params: readonly SqlValue[]): SqlQueryResult {
    const head =
      /insert\s+into\s+([a-z0-9_]+)\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/is.exec(
        sql,
      );
    if (!head) throw new Error(`Cannot parse INSERT: ${sql}`);
    const table = head[1] as string;
    const columns = (head[2] as string).split(",").map((c) => c.trim());
    const valueTokens = (head[3] as string).split(",").map((v) => v.trim());

    const row: Row = {};
    columns.forEach((col, i) => {
      const token = valueTokens[i] as string;
      const paramMatch = /^\$(\d+)$/.exec(token);
      row[col] = paramMatch
        ? params[Number.parseInt(paramMatch[1] as string, 10) - 1]
        : token;
    });

    const conflict = /on\s+conflict\s*\(([^)]+)\)\s+do\s+update/is.exec(sql);
    const rows = this.rowsFor(table);
    if (conflict) {
      const keyCols = (conflict[1] as string).split(",").map((c) => c.trim());
      const existing = rows.find((r) =>
        keyCols.every((k) => r[k] === row[k]),
      );
      if (existing) {
        Object.assign(existing, row);
        return { rows: [], rowCount: 1 };
      }
    }
    rows.push(row);
    return { rows: [], rowCount: 1 };
  }

  private select(sql: string, params: readonly SqlValue[]): SqlQueryResult {
    const from = /from\s+([a-z0-9_]+)/i.exec(sql);
    if (!from) throw new Error(`Cannot parse SELECT: ${sql}`);
    const table = from[1] as string;
    const clauses = parseWhere(sql);
    const rows = this.rowsFor(table).filter((r) =>
      matches(r, clauses, params),
    );
    // Return copies so callers cannot mutate stored state.
    return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
  }

  private delete(sql: string, params: readonly SqlValue[]): SqlQueryResult {
    const from = /from\s+([a-z0-9_]+)/i.exec(sql);
    if (!from) throw new Error(`Cannot parse DELETE: ${sql}`);
    const table = from[1] as string;
    const clauses = parseWhere(sql);
    const rows = this.rowsFor(table);
    let removed = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (matches(rows[i] as Row, clauses, params)) {
        rows.splice(i, 1);
        removed++;
      }
    }
    return { rows: [], rowCount: removed };
  }
}
