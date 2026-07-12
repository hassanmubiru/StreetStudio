import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import { InMemorySqlClient } from "./testing.js";
import {
  AUDIT_ACTION_CATEGORIES,
  auditImmutableClient,
  createAuditLog,
} from "./audit-log.js";
import type { AuditEntryRecord } from "./records.js";

/**
 * Property 55: Audit entries are immutable.
 *
 * Feature: streetstudio, Property 55: Audit entries are immutable
 *
 * *For any* existing audit entry, every attempt to modify or delete it is
 * rejected, the entry remains unchanged, and an immutability error is returned.
 *
 * This is guaranteed on two fronts (see `audit-log.ts`):
 *  - The {@link AuditLog} service exposes no update/delete path at all — only
 *    `append` and `query`.
 *  - The storage layer wrapped by {@link auditImmutableClient} rejects any
 *    `UPDATE`/`DELETE`/`TRUNCATE` aimed at the audit table with an error,
 *    leaving existing rows unchanged.
 *
 * **Validates: Requirements 17.2, 17.6**
 */

/** The physical table backing the Audit Log; mutations against it must fail. */
const AUDIT_TABLE = "audit_entry";

/** Method names that would constitute a mutation/removal path on the service. */
const FORBIDDEN_METHOD_NAMES = [
  "update",
  "delete",
  "remove",
  "modify",
  "edit",
  "patch",
  "drop",
  "truncate",
  "destroy",
  "set",
] as const;

/**
 * An append input covering the security-relevant action space: arbitrary actor,
 * target, and org UUIDs, an action drawn from the tracked categories, and a
 * whole-millisecond instant a JS Date can faithfully round-trip.
 */
const appendInputArb = fc.record({
  actor: fc.uuid(),
  targetId: fc.uuid(),
  orgId: fc.uuid(),
  action: fc.constantFrom(...AUDIT_ACTION_CATEGORIES),
  at: fc
    .date({
      min: new Date("0001-01-01T00:00:00.000Z"),
      max: new Date("9999-12-31T23:59:59.999Z"),
      noInvalidDate: true,
    })
    .map((d) => new Date(Math.trunc(d.getTime()))),
});

/** One-or-more append inputs, so the log always holds at least one entry. */
const appendInputsArb = fc.array(appendInputArb, { minLength: 1, maxLength: 8 });

/**
 * Randomly upper/lower-cases the alphabetic characters of a keyword so the
 * guard is exercised against arbitrary SQL casing, not just one spelling.
 */
function randomCaseArb(keyword: string): fc.Arbitrary<string> {
  return fc
    .array(fc.boolean(), { minLength: keyword.length, maxLength: keyword.length })
    .map((flags) =>
      keyword
        .split("")
        .map((ch, i) => (flags[i] ? ch.toUpperCase() : ch.toLowerCase()))
        .join(""),
    );
}

/**
 * Arbitrary mutation statements targeting the audit table: `UPDATE`, `DELETE`,
 * and `TRUNCATE` variants, with randomized keyword casing. Each is a statement
 * the storage guard must reject.
 */
const auditMutationSqlArb: fc.Arbitrary<string> = fc.oneof(
  fc
    .tuple(randomCaseArb("update"), fc.uuid())
    .map(([kw]) => `${kw} ${AUDIT_TABLE} SET action = $1 WHERE id = $2`),
  randomCaseArb("delete").map(
    (kw) => `${kw} FROM ${AUDIT_TABLE} WHERE organization_id = $1`,
  ),
  randomCaseArb("delete").map((kw) => `${kw} FROM ${AUDIT_TABLE}`),
  randomCaseArb("truncate").map((kw) => `${kw} TABLE ${AUDIT_TABLE}`),
  randomCaseArb("truncate").map((kw) => `${kw} ${AUDIT_TABLE}`),
);

/** Read every organization's entries into a stable, comparable snapshot. */
async function snapshot(
  client: InMemorySqlClient,
  orgIds: readonly string[],
): Promise<Map<string, AuditEntryRecord[]>> {
  const log = createAuditLog(client);
  const snap = new Map<string, AuditEntryRecord[]>();
  for (const orgId of orgIds) {
    snap.set(orgId, await log.query(orgId));
  }
  return snap;
}

describe("Feature: streetstudio, Property 55: Audit entries are immutable", () => {
  it("exposes no update/delete path on the AuditLog service", () => {
    const log = createAuditLog(new InMemorySqlClient());

    // Collect the service's own keys and every method reachable via its
    // prototype chain (excluding Object.prototype).
    const names = new Set<string>(Object.keys(log));
    let proto: object | null = Object.getPrototypeOf(log);
    while (proto && proto !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(proto)) names.add(key);
      proto = Object.getPrototypeOf(proto);
    }

    // The only callable operations are `append` and `query`.
    const methods = [...names].filter(
      (n) => n !== "constructor" && typeof (log as any)[n] === "function",
    );
    expect(methods.sort()).toEqual(["append", "query"]);

    // Defensively assert no mutation-flavored name is present anywhere.
    for (const forbidden of FORBIDDEN_METHOD_NAMES) {
      expect(names.has(forbidden)).toBe(false);
    }
  });

  it("rejects every UPDATE/DELETE/TRUNCATE on the audit table and leaves entries unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(
        appendInputsArb,
        fc.array(auditMutationSqlArb, { minLength: 1, maxLength: 5 }),
        async (inputs, mutations) => {
          const client = new InMemorySqlClient();
          const log = createAuditLog(client);

          // Seed the log with arbitrary appended entries.
          for (const input of inputs) {
            await log.append(input);
          }

          const orgIds = [...new Set(inputs.map((i) => i.orgId))];
          const before = await snapshot(client, orgIds);

          // Every mutation aimed at the audit table is rejected by the storage
          // guard with an immutability error (R17.2, R17.6).
          const guarded = auditImmutableClient(client);
          for (const sql of mutations) {
            await expect(guarded.query(sql)).rejects.toBeInstanceOf(AppError);
          }

          // Existing entries survive every rejected mutation, unchanged.
          const after = await snapshot(client, orgIds);
          for (const orgId of orgIds) {
            expect(after.get(orgId)).toEqual(before.get(orgId));
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
