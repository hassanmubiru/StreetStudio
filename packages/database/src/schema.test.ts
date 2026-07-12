import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  SCHEMA,
  ORGANIZATION_ID_COLUMN,
  getTable,
  tenantScopedTables,
  hasOrganizationIdColumn,
  hasOrganizationIdIndex,
  hasUuidPrimaryKey,
} from "./schema.js";

describe("schema metadata", () => {
  it("declares a unique name for every table", () => {
    const names = SCHEMA.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("declares a unique name for every index across the schema", () => {
    const indexNames = SCHEMA.flatMap((t) => t.indexes.map((i) => i.name));
    expect(new Set(indexNames).size).toBe(indexNames.length);
  });

  it("includes all core entities from the design", () => {
    const expected = [
      "member",
      "session",
      "organization",
      "role",
      "membership",
      "team",
      "team_membership",
      "invitation",
      "workspace",
      "project",
      "folder",
      "video",
      "rendition",
      "asset",
      "transcript",
      "summary",
      "comment",
      "reaction",
      "notification",
      "notification_preference",
      "share_link",
      "upload_session",
      "audit_entry",
      "api_key",
      "webhook",
      "pull_request_link",
      "doc_link",
      "view_event",
      "plugin",
    ];
    for (const name of expected) {
      expect(getTable(name), `missing table ${name}`).toBeDefined();
    }
  });

  it("gives every entity table (single-column PK) a UUID primary key", () => {
    // Association tables (composite natural keys) are exempt from the single
    // UUID PK rule; entity tables identified by one column must use a UUID.
    const entityTables = SCHEMA.filter((t) => t.primaryKey.length === 1);
    for (const table of entityTables) {
      expect(hasUuidPrimaryKey(table), `${table.name} PK`).toBe(true);
    }
  });

  it("references organization(id) from every organization_id column", () => {
    for (const table of tenantScopedTables()) {
      const col = table.columns.find((c) => c.name === ORGANIZATION_ID_COLUMN);
      expect(col?.references, `${table.name}.organization_id`).toBe(
        "organization(id)",
      );
    }
  });

  it("does not scope the organization table to itself", () => {
    const org = getTable("organization");
    expect(org?.tenantScoped).toBe(false);
    expect(hasOrganizationIdColumn(org!)).toBe(false);
  });

  // Property: tenant isolation invariant. For every tenant-scoped table, the
  // table carries an organization_id column AND is indexed on it (leading
  // column), which is what enforces per-organization isolation.
  // **Validates: Requirements 2.5**
  it("every tenant-scoped table has an organization_id column and index", () => {
    fc.assert(
      fc.property(fc.constantFrom(...tenantScopedTables()), (table) => {
        return hasOrganizationIdColumn(table) && hasOrganizationIdIndex(table);
      }),
      { numRuns: 100 },
    );
  });

  it("no non-tenant-scoped table declares an organization_id column", () => {
    for (const table of SCHEMA.filter((t) => !t.tenantScoped)) {
      expect(hasOrganizationIdColumn(table), `${table.name}`).toBe(false);
    }
  });
});
