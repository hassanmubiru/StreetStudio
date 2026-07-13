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
import { VIEW_VIDEO_PERMISSION } from "@streetstudio/media";

/**
 * Property 42: Search returns only matching, authorized results.
 *
 * Feature: streetstudio, Property 42: Search returns only matching, authorized results
 *
 * Validates: Requirements 14.1, 14.4
 *
 * For any search query of 1 to 500 characters, {@link SearchService.search}
 * returns exactly the Videos and Assets whose indexed text matches the query
 * AND that fall within the requesting Member's authorized scope (R14.1). It
 * never returns a resource outside the requester's authorized scope (R14.4),
 * and never returns a resource that did not match the query.
 *
 * The universe of resources is modelled with two independent, injected seams:
 *
 *  - The {@link SearchIndex} double owns "matches the query": it returns exactly
 *    the resources flagged as matching, mirroring a real index that only
 *    surfaces text hits. Anything not flagged matching is never handed to the
 *    service, so a non-matching resource can only appear in results through a
 *    service bug.
 *  - The {@link AccessControl} double owns "authorized scope": it grants the
 *    resource's view permission IFF the resource's owning Organization is in the
 *    requester's authorized set, mirroring owning-scope RBAC.
 *
 * The property then asserts the returned set equals precisely the intersection
 * {matching} ∩ {authorized}, and separately that no out-of-scope and no
 * non-matching resource ever leaks through.
 */

/* -------------------------------------------------------------------------
 * Model
 * ---------------------------------------------------------------------- */

/** A resource in the modelled universe, with the two orthogonal facts we vary. */
interface Universe {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly type: "video" | "asset";
  /** Whether this resource's indexed text matches the query. */
  readonly matches: boolean;
}

function refOf(u: Universe): ResourceRef {
  return { organizationId: u.organizationId, type: u.type, id: u.id };
}

/**
 * A {@link SearchIndex} that returns exactly the resources whose indexed text
 * matches the query (i.e. `matches === true`), in a stable order. It performs
 * no authorization — that is the service's job under test.
 */
function indexFor(universe: readonly Universe[]): SearchIndex {
  const matches: readonly IndexedMatch[] = universe
    .filter((u) => u.matches)
    .map((u) => ({ resource: refOf(u) }));
  return {
    async query() {
      return matches;
    },
  };
}

/**
 * An {@link AccessControl} granting the correct view permission for a resource
 * IFF the resource's owning Organization is in `authorizedOrgs`. Assets require
 * {@link VIEW_ASSET_PERMISSION}; Videos require {@link VIEW_VIDEO_PERMISSION}.
 */
function accessForOrgs(authorizedOrgs: ReadonlySet<Uuid>): AccessControl {
  return {
    async can(_ctx: AuthContext, action: string, resource: ResourceRef) {
      const expected =
        resource.type === "asset" ? VIEW_ASSET_PERMISSION : VIEW_VIDEO_PERMISSION;
      return action === expected && authorizedOrgs.has(resource.organizationId);
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

/** A small pool of distinct Organization ids to draw owning scopes from. */
const orgPool: fc.Arbitrary<Uuid[]> = fc.uniqueArray(uuid, {
  minLength: 1,
  maxLength: 4,
});

/** A valid search query: 1 to 500 characters (R14.5 bounds). */
const validQuery = fc.string({ minLength: 1, maxLength: 500 });

/**
 * A universe of resources drawn from `orgs`, each with a unique id and an
 * independent match/scope status. Kept to at most 40 resources so all
 * authorized matches fit within a single 100-result page, letting the property
 * assert exact set equality without paging.
 */
function universeFrom(orgs: readonly Uuid[]): fc.Arbitrary<Universe[]> {
  return fc
    .uniqueArray(uuid, { maxLength: 40 })
    .chain((ids) =>
      fc.tuple(
        ...ids.map((id) =>
          fc.record({
            id: fc.constant(id),
            organizationId: fc.constantFrom(...orgs),
            type: fc.constantFrom<"video" | "asset">("video", "asset"),
            matches: fc.boolean(),
          }),
        ),
      ),
    )
    .map((rows) => rows as Universe[]);
}

const memberId = uuid;

/* -------------------------------------------------------------------------
 * Property 42
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 42: Search returns only matching, authorized results", () => {
  it("returns exactly the matching, authorized resources and never leaks out-of-scope or non-matching ones", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgPool
          .chain((orgs) =>
            fc.record({
              orgs: fc.constant(orgs),
              universe: universeFrom(orgs),
              // The requester's authorized scope: any subset of the org pool.
              authorized: fc.subarray(orgs),
            }),
          ),
        memberId,
        validQuery,
        async ({ universe, authorized }, member, query) => {
          const authorizedOrgs = new Set<Uuid>(authorized);
          const service = new SearchService({
            index: indexFor(universe),
            access: accessForOrgs(authorizedOrgs),
          });
          const ctx: AuthContext = { memberId: member };

          const page = await service.search(ctx, query);
          const returnedIds = new Set(page.results.map((h) => h.resource.id));

          // Expected: exactly the resources that BOTH match the query AND are
          // within the requester's authorized scope.
          const expected = universe.filter(
            (u) => u.matches && authorizedOrgs.has(u.organizationId),
          );
          const expectedIds = new Set(expected.map((u) => u.id));

          // R14.1: returns precisely the matching, authorized resources.
          expect(returnedIds).toEqual(expectedIds);

          // R14.4: no result lies outside the requester's authorized scope.
          for (const hit of page.results) {
            expect(authorizedOrgs.has(hit.resource.organizationId)).toBe(true);
          }

          // No non-matching resource ever appears in results.
          const matchingIds = new Set(
            universe.filter((u) => u.matches).map((u) => u.id),
          );
          for (const hit of page.results) {
            expect(matchingIds.has(hit.resource.id)).toBe(true);
          }

          // Single page holds every authorized match (universe ≤ 40 < 100).
          expect(page.nextCursor).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});
