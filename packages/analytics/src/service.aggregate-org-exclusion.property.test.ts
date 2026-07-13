import { describe, it, expect } from "vitest";
import fc from "fast-check";
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
 * Property 83: Analytics aggregates match a reference computation and exclude
 * other organizations.
 *
 * Feature: streetstudio, Property 83: Analytics aggregates match a reference computation and exclude other organizations
 *
 * Validates: Requirements 28.2, 28.3
 *
 * For any set of view events spread across multiple organizations and any valid
 * time range, the metrics `aggregate(actor, orgId, range)` returns to an
 * Administrator — total view count, distinct viewer count, and total watch
 * duration — equal an independent reference computation performed over ONLY the
 * queried organization's events whose timestamp falls within the inclusive
 * range (R28.2). Events owned by any OTHER organization, and events outside the
 * range, are never included (R28.3).
 *
 * The test seeds a store with events across many organizations, computes the
 * expected metrics with an oracle that filters strictly to the queried org and
 * range, and asserts the service's result matches — proving both that the
 * aggregation is correct and that no other organization's data can leak in.
 */

/* -------------------------------------------------------------------------
 * In-memory doubles (logic-only; no database), mirroring the tenant-scoping
 * semantics of the real repository adapters. Modeled on service.test.ts and
 * the sibling analytics property tests.
 * ---------------------------------------------------------------------- */

/**
 * An event with an optional per-view watch duration. The production
 * `ViewEventRecord` does not yet carry a duration, but the service reads a
 * `watchDuration` field per event when present, so we exercise total watch
 * duration by seeding it. Structurally a superset of `ViewEventRecord`.
 */
type SeedEvent = ViewEventRecord & { watchDuration?: number };

/**
 * In-memory {@link ViewEventStore}; reads are scoped to a single org, mirroring
 * the tenant-scoped repository so cross-org events can never be returned.
 */
function inMemoryStore(seed: readonly SeedEvent[]): ViewEventStore {
  const events = [...seed];
  return {
    async record(event) {
      events.push(event as SeedEvent);
    },
    async listByOrganization(organizationId: Uuid) {
      return events.filter((e) => e.organizationId === organizationId);
    },
  };
}

/** Aggregation never resolves a video's organization. */
const unusedResolver = (): VideoOrganizationResolver => ({
  async organizationOf() {
    return null;
  },
});

/** Administrator gate is always satisfied for this property. */
const adminAuthorizer = (): AnalyticsAuthorizer => ({
  async isAdministrator() {
    return true;
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
 * Independent oracle: the metrics computed over ONLY `orgId`'s events whose
 * timestamp lies within the inclusive range. This deliberately re-derives the
 * expected result rather than reusing the service, and enforces org exclusion
 * by construction (R28.2, R28.3).
 */
function referenceMetrics(
  events: readonly SeedEvent[],
  orgId: Uuid,
  range: TimeRange,
): Metrics {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  let totalViews = 0;
  let totalWatchDuration = 0;
  const viewers = new Set<Uuid>();
  for (const event of events) {
    if (event.organizationId !== orgId) continue; // exclude other orgs (R28.3)
    const at = Date.parse(event.at);
    if (Number.isNaN(at) || at < startMs || at > endMs) continue;
    totalViews += 1;
    viewers.add(event.memberId);
    const wd = event.watchDuration;
    if (typeof wd === "number" && Number.isFinite(wd)) {
      totalWatchDuration += wd;
    }
  }
  return {
    totalViews,
    distinctViewers: viewers.size,
    totalWatchDuration,
  };
}

/** A single seeded event over the given org/member/video pools. */
const eventArb = (
  orgs: readonly Uuid[],
): fc.Arbitrary<SeedEvent> =>
  fc.record({
    id: uuidArb(),
    organizationId: fc.constantFrom(...orgs),
    videoId: uuidArb(),
    memberId: uuidArb(),
    at: dateArb().map((d) => d.toISOString() as ViewEventRecord["at"]),
    watchDuration: fc.oneof(
      fc.constant(undefined),
      fc.integer({ min: 0, max: 7200 }),
    ),
  });

/**
 * A single scenario: a pool of distinct organizations (>= 2 so exclusion is
 * meaningful), a batch of events spread across those orgs, a valid range, and a
 * selector for which org is queried. Events are chained off the org pool so
 * every event is owned by one of the known organizations.
 */
const scenarioArb = (): fc.Arbitrary<{
  orgs: readonly Uuid[];
  events: readonly SeedEvent[];
  range: TimeRange;
  orgPick: number;
}> =>
  fc
    .uniqueArray(uuidArb(), { minLength: 2, maxLength: 5 })
    .chain((orgs) =>
      fc.record({
        orgs: fc.constant(orgs),
        events: fc.array(eventArb(orgs), { minLength: 0, maxLength: 40 }),
        range: validRangeArb(),
        orgPick: fc.nat(),
      }),
    );

describe("Feature: streetstudio, Property 83: Analytics aggregates match a reference computation and exclude other organizations", () => {
  it("aggregate metrics equal a reference over only the queried org's in-range events, never other orgs' data (R28.2, R28.3)", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb(), async ({ orgs, events, range, orgPick }) => {
        const orgId = orgs[orgPick % orgs.length];

        const service = new AnalyticsService({
          store: inMemoryStore(events),
          videos: unusedResolver(),
          authorizer: adminAuthorizer(),
        });

        const actor: AnalyticsActor = { memberId: orgId, organizationId: orgId };
        const actual = await service.aggregate(actor, orgId, range);
        const expected = referenceMetrics(events, orgId, range);

        // Metrics equal the independent oracle over ONLY this org's in-range
        // events (R28.2).
        expect(actual).toEqual(expected);

        // Cross-org exclusion (R28.3): querying the SAME range for any OTHER
        // organization must draw exclusively on that org's events and never
        // reuse this org's data. Total views summed across all orgs for the
        // range must equal the count of all in-range events — no double
        // counting, no leakage.
        const inRange = (e: SeedEvent): boolean => {
          const at = Date.parse(e.at);
          return (
            !Number.isNaN(at) &&
            at >= range.start.getTime() &&
            at <= range.end.getTime()
          );
        };
        let sumAcrossOrgs = 0;
        for (const org of orgs) {
          const m = await service.aggregate(
            { memberId: org, organizationId: org },
            org,
            range,
          );
          sumAcrossOrgs += m.totalViews;
        }
        const totalInRange = events.filter(inRange).length;
        expect(sumAcrossOrgs).toBe(totalInRange);
      }),
      { numRuns: 200 },
    );
  });
});
