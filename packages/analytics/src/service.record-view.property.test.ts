import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { ViewEventRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import {
  AnalyticsService,
  type AnalyticsAuthorizer,
  type ViewEventStore,
  type VideoOrganizationResolver,
} from "./service.js";

/**
 * Property 82: View events are recorded with required fields on playback.
 *
 * Feature: streetstudio, Property 82: View events are recorded with required fields on playback
 *
 * Validates: Requirements 28.1
 *
 * For any known Video and any Member/timestamp, `recordView(memberId, videoId,
 * at)` appends exactly one view event that:
 *
 *  - captures the required fields — the Video identifier, the Member
 *    identifier, and the event timestamp (`at.toISOString()`) (R28.1); and
 *  - is scoped to the Organization that OWNS the Video, resolved from the Video
 *    rather than trusted from the caller, so the event surfaces only in the
 *    owning organization's scope and NEVER in any other organization's scope
 *    (no cross-org attribution).
 *
 * The test drives arbitrary organizations, videos (each owned by one org),
 * members, and valid timestamps, then asserts the recorded event's fields
 * against the owning-org oracle and proves the event is visible only within the
 * owning organization's scope and absent from every other organization.
 */

/* -------------------------------------------------------------------------
 * In-memory doubles (logic-only; no database), mirroring the tenant-scoping
 * semantics of the real repository adapters. Modeled on service.test.ts.
 * ---------------------------------------------------------------------- */

/** In-memory {@link ViewEventStore}; reads are scoped to a single org. */
function inMemoryStore(): ViewEventStore & { events: ViewEventRecord[] } {
  const events: ViewEventRecord[] = [];
  return {
    events,
    async record(event) {
      events.push(event);
    },
    async listByOrganization(organizationId) {
      return events.filter((e) => e.organizationId === organizationId);
    },
  };
}

/** Resolver backed by a video -> owning-organization map. */
const resolverFor = (
  orgByVideo: ReadonlyMap<Uuid, Uuid>,
): VideoOrganizationResolver => ({
  async organizationOf(videoId) {
    return orgByVideo.get(videoId) ?? null;
  },
});

/** recordView never consults authorization; a permissive stub suffices. */
const permissiveAuthorizer = (): AnalyticsAuthorizer => ({
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

describe("Feature: streetstudio, Property 82: View events are recorded with required fields on playback", () => {
  it("recordView appends exactly one event capturing video/member/timestamp, scoped to the video's owning org and never cross-org (R28.1)", async () => {
    await fc.assert(
      fc.asyncProperty(
        // A pool of distinct organizations (>= 2 so cross-org isolation is
        // meaningful) and a set of videos each owned by one of them.
        fc.uniqueArray(uuidArb(), { minLength: 2, maxLength: 6 }),
        fc.uniqueArray(uuidArb(), { minLength: 1, maxLength: 8 }),
        fc.array(fc.nat(), { minLength: 1, maxLength: 8 }),
        uuidArb(), // member performing the view
        // A valid timestamp within a broad, realistic range.
        fc.date({
          min: new Date("2000-01-01T00:00:00.000Z"),
          max: new Date("2100-01-01T00:00:00.000Z"),
        }),
        fc.nat(), // selects which video is viewed
        async (orgs, videos, ownerPicks, memberId, at, viewedPick) => {
          // Assign each video to an owning organization deterministically.
          const orgByVideo = new Map<Uuid, Uuid>();
          videos.forEach((videoId, i) => {
            const owner = orgs[ownerPicks[i % ownerPicks.length] % orgs.length];
            orgByVideo.set(videoId, owner);
          });

          const store = inMemoryStore();
          const service = new AnalyticsService({
            store,
            videos: resolverFor(orgByVideo),
            authorizer: permissiveAuthorizer(),
          });

          const viewedVideo = videos[viewedPick % videos.length];
          const owningOrg = orgByVideo.get(viewedVideo)!;

          await service.recordView(memberId, viewedVideo, at);

          // Exactly one event is appended.
          expect(store.events).toHaveLength(1);
          const recorded = store.events[0];

          // Required fields are captured (R28.1): video id, member id, and the
          // event timestamp, scoped to the video's OWNING organization.
          expect(recorded.videoId).toBe(viewedVideo);
          expect(recorded.memberId).toBe(memberId);
          expect(recorded.at).toBe(at.toISOString());
          expect(recorded.organizationId).toBe(owningOrg);

          // The event is visible within the owning organization's scope...
          const inOwner = await store.listByOrganization(owningOrg);
          expect(inOwner).toContain(recorded);

          // ...and NEVER in any other organization's scope (no cross-org).
          for (const org of orgs) {
            if (org === owningOrg) continue;
            const cross = await store.listByOrganization(org);
            expect(cross).toHaveLength(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
