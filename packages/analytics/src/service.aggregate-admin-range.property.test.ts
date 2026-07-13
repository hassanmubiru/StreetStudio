import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type { ViewEventRecord } from "@streetstudio/database";
import {
  AnalyticsService,
  type AnalyticsActor,
  type AnalyticsAuthorizer,
  type Metrics,
  type TimeRange,
  type ViewEventStore,
  type VideoOrganizationResolver,
} from "./service.js";

/**
 * Property 84: Analytics access is Administrator-only with validated ranges.
 *
 * Feature: streetstudio, Property 84: Analytics access is Administrator-only with validated ranges
 *
 * Validates: Requirements 28.4, 28.5
 *
 * For any actor, organization, and time range, `aggregate(actor, orgId, range)`
 * succeeds — returning {@link Metrics} — if and only if BOTH hold:
 *
 *  - the {@link AnalyticsAuthorizer} accepts the actor as an Administrator for
 *    the organization (R28.4); and
 *  - the range is well-formed — two valid dates whose `end` does not precede
 *    its `start` (R28.5).
 *
 * Otherwise the call is rejected and NO metrics are produced:
 *
 *  - a non-Administrator is denied with `AUTHORIZATION_DENIED`, and the denial
 *    is decided before any events are read (so a non-Administrator cannot even
 *    probe range validity); and
 *  - an Administrator supplying a malformed/invalid range is rejected with
 *    `VALIDATION_FAILED`.
 *
 * The test drives arbitrary administrator/non-administrator actors and both
 * valid and invalid ranges over a store seeded with events for the queried
 * organization, then asserts the outcome (success vs the specific error code),
 * that no {@link Metrics} value is returned on rejection, and that no events are
 * read when the actor is not an Administrator.
 */

/* -------------------------------------------------------------------------
 * In-memory doubles (logic-only; no database), mirroring the tenant-scoping
 * semantics of the real repository adapters. Modeled on service.test.ts and
 * service.record-view.property.test.ts.
 * ---------------------------------------------------------------------- */

/**
 * In-memory {@link ViewEventStore}; reads are scoped to a single org. Records
 * how many times {@link ViewEventStore.listByOrganization} is invoked so the
 * property can assert that a denied (non-Administrator) request reads nothing.
 */
function inMemoryStore(
  seed: ViewEventRecord[] = [],
): ViewEventStore & { events: ViewEventRecord[]; reads: number } {
  const events = [...seed];
  const state = {
    events,
    reads: 0,
    async record(event: ViewEventRecord) {
      events.push(event);
    },
    async listByOrganization(organizationId: Uuid) {
      state.reads += 1;
      return events.filter((e) => e.organizationId === organizationId);
    },
  };
  return state;
}

/** recordView-only port; aggregation never resolves a video's organization. */
const unusedResolver = (): VideoOrganizationResolver => ({
  async organizationOf() {
    return null;
  },
});

/** Authorizer whose Administrator verdict is fixed per test case. */
const authorizerReturning = (allow: boolean): AnalyticsAuthorizer => ({
  async isAdministrator() {
    return allow;
  },
});

/** A well-formed UUID arbitrary drawn from a small, distinct pool. */
const uuidArb = (): fc.Arbitrary<Uuid> =>
  fc
    .integer({ min: 0, max: 0xffffffff })
    .map(
      (n) =>
        `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000` as Uuid,
    );

const dateArb = (): fc.Arbitrary<Date> =>
  fc.date({
    min: new Date("2000-01-01T00:00:00.000Z"),
    max: new Date("2100-01-01T00:00:00.000Z"),
  });

/** A well-formed range: two valid dates with `end` not preceding `start`. */
const validRangeArb = (): fc.Arbitrary<TimeRange> =>
  fc
    .tuple(dateArb(), dateArb())
    .map(([a, b]) => (a.getTime() <= b.getTime()
      ? { start: a, end: b }
      : { start: b, end: a }));

/**
 * A malformed/invalid range (R28.5): either `end` strictly precedes `start`, or
 * one of the bounds is an invalid Date.
 */
const invalidRangeArb = (): fc.Arbitrary<TimeRange> =>
  fc.oneof(
    // end strictly before start (both valid dates, distinct)
    fc
      .tuple(dateArb(), dateArb())
      .filter(([a, b]) => a.getTime() !== b.getTime())
      .map(([a, b]) => (a.getTime() > b.getTime()
        ? { start: a, end: b }
        : { start: b, end: a })),
    // invalid start date
    dateArb().map((end) => ({ start: new Date(NaN), end })),
    // invalid end date
    dateArb().map((start) => ({ start, end: new Date(NaN) })),
    // both bounds invalid
    fc.constant({ start: new Date(NaN), end: new Date(NaN) }),
  );

/** A pool of events owned by `orgId` so a successful read has data to compute. */
const seedFor = (orgId: Uuid): ViewEventRecord[] => [
  {
    id: "aaaaaaaa-0000-4000-8000-000000000000" as Uuid,
    organizationId: orgId,
    videoId: "bbbbbbbb-0000-4000-8000-000000000000" as Uuid,
    memberId: "cccccccc-0000-4000-8000-000000000000" as Uuid,
    at: "2050-01-01T00:00:00.000Z" as ViewEventRecord["at"],
  },
];

describe("Feature: streetstudio, Property 84: Analytics access is Administrator-only with validated ranges", () => {
  it("aggregate succeeds only for an Administrator over a valid range; otherwise it is denied/rejected and no metrics are produced (R28.4, R28.5)", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb(), // actor member id
        uuidArb(), // organization under query
        fc.boolean(), // is the actor an Administrator?
        fc.boolean(), // is the supplied range valid?
        validRangeArb(),
        invalidRangeArb(),
        async (memberId, orgId, isAdmin, useValidRange, valid, invalid) => {
          const store = inMemoryStore(seedFor(orgId));
          const service = new AnalyticsService({
            store,
            videos: unusedResolver(),
            authorizer: authorizerReturning(isAdmin),
          });

          const actor: AnalyticsActor = { memberId, organizationId: orgId };
          const range = useValidRange ? valid : invalid;

          let result: Metrics | undefined;
          let error: unknown;
          try {
            result = await service.aggregate(actor, orgId, range);
          } catch (e) {
            error = e;
          }

          if (isAdmin && useValidRange) {
            // Success requires BOTH an Administrator and a valid range.
            expect(error).toBeUndefined();
            expect(result).toBeDefined();
            const metrics = result as Metrics;
            expect(typeof metrics.totalViews).toBe("number");
            expect(typeof metrics.distinctViewers).toBe("number");
            expect(typeof metrics.totalWatchDuration).toBe("number");
          } else {
            // Every other combination rejects and produces NO metrics.
            expect(result).toBeUndefined();
            expect(error).toBeInstanceOf(AppError);

            if (!isAdmin) {
              // R28.4 — non-Administrator denied, decided before any read, so
              // no events are consulted regardless of range validity.
              expect((error as AppError).code).toBe("AUTHORIZATION_DENIED");
              expect(store.reads).toBe(0);
            } else {
              // R28.5 — Administrator with an invalid range is rejected.
              expect((error as AppError).code).toBe("VALIDATION_FAILED");
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
