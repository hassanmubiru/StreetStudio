import { describe, it, expect } from "vitest";
import { InMemorySqlClient } from "./testing.js";
import {
  MIGRATIONS,
  runMigrations,
  buildSchemaStatements,
  renderColumn,
  renderCreateTable,
  renderCreateIndex,
  assertOrderedMigrations,
} from "./migrations.js";
import { SCHEMA, getTable } from "./schema.js";

describe("DDL rendering", () => {
  it("renders NOT NULL columns with defaults and references", () => {
    const table = getTable("membership")!;
    const orgCol = table.columns.find((c) => c.name === "organization_id")!;
    const ddl = renderColumn(orgCol);
    expect(ddl).toBe(
      "organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE",
    );
  });

  it("renders nullable columns", () => {
    const table = getTable("member")!;
    const col = table.columns.find((c) => c.name === "password_hash")!;
    expect(renderColumn(col)).toBe("password_hash text NULL");
  });

  it("renders a create-table statement with a primary key", () => {
    const ddl = renderCreateTable(getTable("organization")!);
    expect(ddl).toContain("CREATE TABLE IF NOT EXISTS organization");
    expect(ddl).toContain("PRIMARY KEY (id)");
  });

  it("renders unique and non-unique indexes", () => {
    const member = getTable("member")!;
    const unique = member.indexes.find((i) => i.unique)!;
    expect(renderCreateIndex(member, unique)).toContain("CREATE UNIQUE INDEX");

    const session = getTable("session")!;
    const idx = session.indexes[0]!;
    expect(renderCreateIndex(session, idx)).toContain("CREATE INDEX");
  });

  it("emits required extensions before any table", () => {
    const statements = buildSchemaStatements();
    expect(statements[0]).toContain('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    const firstTableIndex = statements.findIndex((s) =>
      s.startsWith("CREATE TABLE"),
    );
    const extensionCount = statements
      .slice(0, firstTableIndex)
      .filter((s) => s.startsWith("CREATE EXTENSION")).length;
    expect(extensionCount).toBe(2);
  });

  it("creates a statement for every table and index", () => {
    const statements = buildSchemaStatements();
    const tableStatements = statements.filter((s) => s.startsWith("CREATE TABLE"));
    const indexStatements = statements.filter((s) =>
      /^CREATE (UNIQUE )?INDEX/.test(s),
    );
    expect(tableStatements).toHaveLength(SCHEMA.length);
    const totalIndexes = SCHEMA.reduce((n, t) => n + t.indexes.length, 0);
    expect(indexStatements).toHaveLength(totalIndexes);
  });
});

describe("migration ordering", () => {
  it("accepts the built-in migration set", () => {
    expect(() => assertOrderedMigrations(MIGRATIONS)).not.toThrow();
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      assertOrderedMigrations([
        { id: "0001", name: "a", statements: [] },
        { id: "0001", name: "b", statements: [] },
      ]),
    ).toThrow(/Duplicate/);
  });

  it("rejects out-of-order ids", () => {
    expect(() =>
      assertOrderedMigrations([
        { id: "0002", name: "a", statements: [] },
        { id: "0001", name: "b", statements: [] },
      ]),
    ).toThrow(/strictly increasing/);
  });
});

describe("runMigrations", () => {
  it("applies pending migrations and records them", async () => {
    const client = new InMemorySqlClient();
    const result = await runMigrations(client);
    expect(result.applied).toEqual(["0001"]);
    expect(result.skipped).toEqual([]);
  });

  it("is idempotent across repeated runs", async () => {
    const client = new InMemorySqlClient();
    await runMigrations(client);
    const second = await runMigrations(client);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(["0001"]);
  });
});
