import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { InMemorySqlClient } from "./testing.js";
import {
  AUDIT_ACTION_CATEGORIES,
  createAuditLog,
} from "./audit-log.js";

/**
 * Property 54: Audit entries record required fields for security actions.
 *
 * Feature: streetstudio, Property 54: Audit entries record required fields for
 * security actions
 *
 * *For any* security-relevant action (authentication events, authorization
 * denials, sharing changes, administrative actions), an audit entry is appended
 * recording the actor identity, action type, target resource identifier, and a
 * UTC timestamp with at least millisecond precision.
 *
 * **Validates: Requirements 17.1, 17.4**
 */

/**
 * Millisecond-precision UTC ISO-8601 timestamp, e.g.
 * `2024-05-06T07:08:09.123Z`. `Date.prototype.toISOString` always renders this
 * exact shape, so recording preserves >= millisecond precision in UTC.
 */
const UTC_MS_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * An append input covering the full security-relevant action space: an arbitrary
 * actor and target UUID, an org UUID, an action drawn from the security action
 * categories (R17.4), and a millisecond-resolution instant to record.
 *
 * Timestamps are drawn from a range spanning the full ISO-8601 four-digit-year
 * window so the recording holds for any valid instant, not just "now".
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
    // Constrain to whole-millisecond instants — the precision the audit log
    // guarantees and the resolution a JS Date can faithfully round-trip.
    .map((d) => new Date(Math.trunc(d.getTime()))),
});

describe("Feature: streetstudio, Property 54: Audit entries record required fields for security actions", () => {
  it("preserves actor, action, target, org, and a UTC ms-precision timestamp for any security action", async () => {
    await fc.assert(
      fc.asyncProperty(appendInputArb, async (input) => {
        const log = createAuditLog(new InMemorySqlClient());

        await log.append({
          actor: input.actor,
          action: input.action,
          targetId: input.targetId,
          orgId: input.orgId,
          at: input.at,
        });

        const entries = await log.query(input.orgId);
        // Exactly one entry was appended for this organization.
        expect(entries).toHaveLength(1);
        const entry = entries[0]!;

        // Every required field is recorded faithfully (R17.1).
        expect(entry.actorId).toBe(input.actor);
        expect(entry.action).toBe(input.action);
        expect(entry.targetId).toBe(input.targetId);
        expect(entry.organizationId).toBe(input.orgId);

        // The action is one of the tracked security-relevant categories (R17.4).
        expect(AUDIT_ACTION_CATEGORIES).toContain(entry.action);

        // The timestamp is a UTC, >= millisecond-precision ISO-8601 instant that
        // reflects the recorded time exactly (R17.1).
        expect(entry.at).toMatch(UTC_MS_TIMESTAMP_RE);
        expect(entry.at.endsWith("Z")).toBe(true);
        expect(Date.parse(entry.at)).toBe(input.at.getTime());
        expect(entry.at).toBe(input.at.toISOString());
      }),
      { numRuns: 100 },
    );
  });
});
