import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { InMemorySqlClient } from "./testing.js";
import { createAuditLog } from "./audit-log.js";

/**
 * Property 56: Audit queries are organization-scoped and ordered.
 *
 * Feature: streetstudio, Property 56: Audit queries are organization-scoped and ordered
 *
 * Validates: Requirements 17.3, 17.5
 *
 * For any set of audit entries appended across multiple organizations,
 * `AuditLog.query(orgId)` returns ONLY the entries belonging to that
 * organization — never disclosing another tenant's entries (the data-layer
 * guarantee behind R17.3's exclusion clause and R17.5's non-disclosure
 * requirement) — ordered by timestamp in descending order (newest first).
 *
 * Role-based authorization (denying non-Administrators) is enforced by the
 * calling layer; this package guarantees that a query can never leak another
 * Organization's entries and always returns them newest-first.
 */

// Upper bound ~ year 2100, keeps generated instants valid and UTC.
const MAX_EPOCH_MS = 4_102_444_800_000;

/** A batch of audit entries spanning a fixed set of distinct organizations. */
const scenario = fc
  .uniqueArray(fc.uuid(), { minLength: 2, maxLength: 4 })
  .chain((orgIds) =>
    fc
      .array(
        fc.record({
          orgId: fc.constantFrom(...orgIds),
          actor: fc.uuid(),
          action: fc.string(),
          targetId: fc.uuid(),
          atMs: fc.integer({ min: 0, max: MAX_EPOCH_MS }),
        }),
        { minLength: 0, maxLength: 40 },
      )
      .map((entries) => ({ orgIds, entries })),
  );

describe("Feature: streetstudio, Property 56: Audit queries are organization-scoped and ordered", () => {
  it("returns only the requesting organization's entries, newest-first", async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async ({ orgIds, entries }) => {
        const log = createAuditLog(new InMemorySqlClient());

        for (const e of entries) {
          await log.append({
            actor: e.actor,
            action: e.action,
            targetId: e.targetId,
            orgId: e.orgId,
            at: new Date(e.atMs),
          });
        }

        for (const orgId of orgIds) {
          const result = await log.query(orgId);

          // Scoping: every returned entry belongs to the queried org, and the
          // count matches exactly the number appended for that org — no other
          // tenant's entries leak in, and none of this org's entries are lost.
          expect(result.every((r) => r.organizationId === orgId)).toBe(true);
          const expectedCount = entries.filter((e) => e.orgId === orgId).length;
          expect(result).toHaveLength(expectedCount);

          // Ordering: timestamps are non-increasing (descending, newest-first).
          // ISO-8601 UTC timestamps sort lexicographically in chronological
          // order, so a string comparison is the correct ordering check.
          for (let i = 1; i < result.length; i++) {
            expect(
              (result[i - 1]?.at ?? "") >= (result[i]?.at ?? ""),
            ).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
