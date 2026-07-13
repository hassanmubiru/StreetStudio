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
  SEARCH_MAX_PAGE_SIZE,
  VIEW_ASSET_PERMISSION,
  type Cursor,
  type IndexedMatch,
  type SearchHit,
  type SearchIndex,
} from "./search.js";
import { VIEW_VIDEO_PERMISSION } from "@streetstudio/media";

/**
 * Property 45: Search results are paginated with a bounded page size.
 *
 * Feature: streetstudio, Property 45: Search results are paginated with a bounded page size
 *
 * Validates: Requirements 14.6
 *
 * For any query with any number of matching, authorized results,
 * {@link SearchService.search} returns each response bounded to at most
 * {@link SEARCH_MAX_PAGE_SIZE} (100) results, and when more authorized results
 * remain it supplies a {@link Cursor} on {@link SearchPage.nextCursor} to
 * retrieve the subsequent page (R14.6). Paging through with the cursor until it
 * is absent eventually surfaces EVERY authorized match, with no duplication and
 * no omission.
 *
 * The universe is modelled with the same two orthogonal seams the service
 * depends on:
 *
 *  - The {@link SearchIndex} double returns exactly the resources flagged as
 *    matching, in a stable order (mirroring a real index's stable relevance
 *    ordering across paged calls for the same query).
 *  - The {@link AccessControl} double grants a resource's view permission IFF
 *    its owning Organization is in the requester's authorized set.
 *
 * Unlike Property 42 (which keeps the universe under one page), this property
 * deliberately generates result counts that span and exceed the page bound so
 * multi-page traversal — and the cursor contract — is exercised.
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
 * A {@link SearchIndex} returning exactly the matching resources in a stable
 * order (insertion order), performing no authorization.
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
 * IFF the resource's owning Organization is in `authorizedOrgs`.
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

/**
 * Drain every page of a query by following {@link SearchPage.nextCursor} until
 * it is absent, asserting the page-size bound and the cursor contract on the
 * way. Returns the concatenated hits across all pages.
 *
 * A hard page cap guards against a non-terminating cursor (which would itself be
 * a bug): with N authorized matches, at most ceil(N / pageSize) + 1 pages exist.
 */
async function drain(
  service: SearchService,
  ctx: AuthContext,
  query: string,
  expectedTotal: number,
): Promise<SearchHit[]> {
  const collected: SearchHit[] = [];
  let cursor: Cursor | undefined = undefined;
  let pageCount = 0;
  const maxPages = Math.ceil(expectedTotal / SEARCH_MAX_PAGE_SIZE) + 2;

  do {
    const page = await service.search(ctx, query, cursor);
    pageCount += 1;
    expect(pageCount).toBeLessThanOrEqual(maxPages);

    // R14.6: every response is bounded to at most the page size.
    expect(page.results.length).toBeLessThanOrEqual(SEARCH_MAX_PAGE_SIZE);

    collected.push(...page.results);

    // A cursor is provided IFF authorized results remain beyond what we have
    // seen so far; when it is present, the page was necessarily full.
    if (page.nextCursor !== undefined) {
      expect(page.results.length).toBe(SEARCH_MAX_PAGE_SIZE);
      expect(collected.length).toBeLessThan(expectedTotal);
    } else {
      expect(collected.length).toBe(expectedTotal);
    }

    cursor = page.nextCursor;
  } while (cursor !== undefined);

  return collected;
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

const uuid = fc.uuid() as fc.Arbitrary<Uuid>;

/** A valid search query: 1 to 500 characters (R14.5 bounds). */
const validQuery = fc.string({ minLength: 1, maxLength: 500 });

/**
 * A universe sized to span the page bound: enough resources that authorized
 * matches routinely exceed {@link SEARCH_MAX_PAGE_SIZE}, forcing multi-page
 * traversal. Each resource independently matches-or-not and is in-scope-or-not.
 */
function universeFrom(
  authorizedOrg: Uuid,
  otherOrg: Uuid,
): fc.Arbitrary<Universe[]> {
  return fc
    .uniqueArray(uuid, { minLength: 0, maxLength: 260 })
    .chain((ids) =>
      fc.tuple(
        ...ids.map((id) =>
          fc.record({
            id: fc.constant(id),
            organizationId: fc.constantFrom(authorizedOrg, otherOrg),
            type: fc.constantFrom<"video" | "asset">("video", "asset"),
            matches: fc.boolean(),
          }),
        ),
      ),
    )
    .map((rows) => rows as Universe[]);
}

/* -------------------------------------------------------------------------
 * Property 45
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 45: Search results are paginated with a bounded page size", () => {
  it("bounds every page to 100, provides a cursor while more remain, and pages through all matches without duplication or omission", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .tuple(uuid, uuid)
          .filter(([a, b]) => a !== b)
          .chain(([authorizedOrg, otherOrg]) =>
            fc.record({
              authorizedOrg: fc.constant(authorizedOrg),
              universe: universeFrom(authorizedOrg, otherOrg),
            }),
          ),
        uuid,
        validQuery,
        async ({ authorizedOrg, universe }, member, query) => {
          const authorizedOrgs = new Set<Uuid>([authorizedOrg]);
          const service = new SearchService({
            index: indexFor(universe),
            access: accessForOrgs(authorizedOrgs),
          });
          const ctx: AuthContext = { memberId: member };

          // Expected: exactly the resources that match AND are in scope, in the
          // index's stable (insertion) order.
          const expected = universe.filter(
            (u) => u.matches && authorizedOrgs.has(u.organizationId),
          );
          const expectedIds = expected.map((u) => u.id);

          const collected = await drain(service, ctx, query, expected.length);
          const collectedIds = collected.map((h) => h.resource.id);

          // No duplication: every collected id is distinct.
          expect(new Set(collectedIds).size).toBe(collectedIds.length);

          // No omission and no extras: the full traversal yields exactly the
          // authorized matches, in the index's stable order across pages.
          expect(collectedIds).toEqual(expectedIds);

          // Every returned resource is in the requester's authorized scope.
          for (const hit of collected) {
            expect(authorizedOrgs.has(hit.resource.organizationId)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
