import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Uuid } from "@streetstudio/shared";
import type {
  AccessControl,
  AuthContext,
  ResourceRef,
} from "@streetstudio/auth";
import {
  SearchService,
  VIEW_ASSET_PERMISSION,
  type IndexedMatch,
  type SearchIndex,
} from "./search.js";
import { VIEW_VIDEO_PERMISSION } from "./permissions.js";

/**
 * Property 43: Transcript matches include playback position.
 *
 * Feature: streetstudio, Property 43: Transcript matches include playback position
 *
 * Validates: Requirements 14.2
 *
 * R14.2: WHERE a Video has a transcript, the API_Service SHALL include Videos
 * whose transcript text matches the query in the search results, AND SHALL
 * identify the matching playback position for each transcript match.
 *
 * We model a search index whose candidate matches carry, for each Video matched
 * via its transcript, the playback position (in seconds) of the matching
 * transcript segment on {@link IndexedMatch.transcriptPosition}. The property
 * then asserts that for every such transcript match that survives authorization
 * filtering, the returned {@link SearchHit} surfaces exactly that playback
 * position — i.e. the position produced by the index is neither dropped nor
 * altered by the service. All Videos are authorized here so every transcript
 * match reaches the results and can be inspected.
 */

/* -------------------------------------------------------------------------
 * Model
 * ---------------------------------------------------------------------- */

/**
 * A modelled Video candidate that matched the query via its transcript, at a
 * known playback position (in seconds).
 */
interface TranscriptCandidate {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly position: number;
}

/**
 * A {@link SearchIndex} that returns the given transcript candidates as Video
 * matches, each carrying its matching transcript playback position. Order is
 * stable (input order). It performs no authorization.
 */
function transcriptIndex(
  candidates: readonly TranscriptCandidate[],
): SearchIndex {
  const matches: readonly IndexedMatch[] = candidates.map((c) => ({
    resource: { organizationId: c.organizationId, type: "video", id: c.id },
    transcriptPosition: c.position,
  }));
  return {
    async query() {
      return matches;
    },
  };
}

/** An {@link AccessControl} that grants view on every Video (authorization is not under test here). */
function allowAllVideos(): AccessControl {
  return {
    async can(_ctx: AuthContext, action: string, resource: ResourceRef) {
      const expected =
        resource.type === "asset"
          ? VIEW_ASSET_PERMISSION
          : VIEW_VIDEO_PERMISSION;
      return action === expected;
    },
    async assignRole() {
      throw new Error("not used");
    },
  };
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

const uuid = fc.uuid() as fc.Arbitrary<Uuid>;

/** A valid search query: 1 to 500 characters (R14.5 bounds). */
const validQuery = fc.string({ minLength: 1, maxLength: 500 });

/**
 * A playback position in seconds: a finite non-negative value, including 0 and
 * fractional seconds, up to a generous 24h to exercise a wide range.
 */
const position = fc.double({
  min: 0,
  max: 86_400,
  noNaN: true,
  noDefaultInfinity: true,
});

/**
 * A set of transcript-matched Video candidates with unique ids, each with an
 * independently drawn owning Organization and matching playback position. Kept
 * to at most 40 so all authorized matches fit within a single 100-result page.
 */
const transcriptCandidates: fc.Arbitrary<TranscriptCandidate[]> = fc
  .uniqueArray(uuid, { maxLength: 40 })
  .chain((ids) =>
    fc.tuple(
      ...ids.map((id) =>
        fc.record({
          id: fc.constant(id),
          organizationId: uuid,
          position,
        }),
      ),
    ),
  )
  .map((rows) => rows as TranscriptCandidate[]);

const memberId = uuid;

/* -------------------------------------------------------------------------
 * Property 43
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 43: Transcript matches include playback position", () => {
  it("surfaces the matching transcript playback position on each returned hit", async () => {
    await fc.assert(
      fc.asyncProperty(
        transcriptCandidates,
        memberId,
        validQuery,
        async (candidates, member, query) => {
          const service = new SearchService({
            index: transcriptIndex(candidates),
            access: allowAllVideos(),
          });
          const ctx: AuthContext = { memberId: member };

          const page = await service.search(ctx, query);

          // Expected: each candidate id maps to its transcript playback position.
          const expectedPosition = new Map<Uuid, number>(
            candidates.map((c) => [c.id, c.position]),
          );

          // Every candidate is authorized here, so all appear in the single page.
          expect(page.results).toHaveLength(candidates.length);
          expect(page.nextCursor).toBeUndefined();

          // R14.2: each transcript match carries its matching playback position,
          // surfaced exactly (neither dropped nor altered) on the hit.
          for (const hit of page.results) {
            expect(expectedPosition.has(hit.resource.id)).toBe(true);
            expect(hit.transcriptPosition).toBe(
              expectedPosition.get(hit.resource.id),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
