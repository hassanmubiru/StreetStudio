import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type {
  AccessControl,
  AuthContext,
  ResourceRef,
} from "@streetstudio/auth";
import {
  SearchService,
  SEARCH_QUERY_MIN_LENGTH,
  SEARCH_QUERY_MAX_LENGTH,
  type IndexedMatch,
  type SearchIndex,
} from "./search.js";

/**
 * Property 44: Search query length is validated.
 *
 * Feature: streetstudio, Property 44: Search query length is validated
 *
 * Validates: Requirements 14.5
 *
 * A search query of 1 to {@link SEARCH_QUERY_MAX_LENGTH} (500) characters is
 * accepted and the search is performed (R14.1). A query that is empty or that
 * exceeds 500 characters is rejected with a `VALIDATION_FAILED` error and NO
 * search is performed (R14.5) — the query must be validated BEFORE the index is
 * ever consulted.
 *
 * "No search is performed" is observed through an instrumented
 * {@link SearchIndex} double that records whether its `query` method was ever
 * invoked. A rejected request must leave that spy untouched; an accepted request
 * must consult it exactly once.
 */

/* -------------------------------------------------------------------------
 * Doubles
 * ---------------------------------------------------------------------- */

/** A {@link SearchIndex} that records whether — and how often — it was queried. */
interface SpyIndex extends SearchIndex {
  /** Number of times {@link SearchIndex.query} was invoked. */
  readonly calls: () => number;
}

/** Build a {@link SpyIndex} returning `matches` (empty by default) and counting calls. */
function spyIndex(matches: readonly IndexedMatch[] = []): SpyIndex {
  let count = 0;
  return {
    async query() {
      count += 1;
      return matches;
    },
    calls: () => count,
  };
}

/**
 * An {@link AccessControl} that authorizes everything, so that acceptance of a
 * valid query is never masked by an authorization denial — this property is
 * solely about query-length validation, not scope filtering.
 */
const allowAll: AccessControl = {
  async can(_ctx: AuthContext, _action: string, _resource: ResourceRef) {
    return true;
  },
  async assignRole() {
    throw new Error("not used");
  },
};

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

const uuid = fc.uuid() as fc.Arbitrary<Uuid>;
const ctxArb: fc.Arbitrary<AuthContext> = uuid.map((memberId) => ({ memberId }));

/** A valid query: 1 to 500 characters (R14.5 bounds). */
const validQuery = fc.string({
  minLength: SEARCH_QUERY_MIN_LENGTH,
  maxLength: SEARCH_QUERY_MAX_LENGTH,
});

/**
 * An invalid query: either empty (length 0) or longer than 500 characters.
 * The over-length branch is capped at 600 to keep generation bounded while
 * still exceeding the limit.
 */
const invalidQuery = fc.oneof(
  fc.constant(""),
  fc.string({ minLength: SEARCH_QUERY_MAX_LENGTH + 1, maxLength: 600 }),
);

/* -------------------------------------------------------------------------
 * Property 44
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 44: Search query length is validated", () => {
  it("accepts a 1..500 character query and performs the search", async () => {
    await fc.assert(
      fc.asyncProperty(ctxArb, validQuery, async (ctx, query) => {
        expect(query.length).toBeGreaterThanOrEqual(SEARCH_QUERY_MIN_LENGTH);
        expect(query.length).toBeLessThanOrEqual(SEARCH_QUERY_MAX_LENGTH);

        const index = spyIndex();
        const service = new SearchService({ index, access: allowAll });

        // R14.1: an in-range query is accepted and returns a page.
        const page = await service.search(ctx, query);
        expect(page.results).toEqual([]);

        // The search WAS performed: the index was consulted exactly once.
        expect(index.calls()).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  it("rejects an empty or over-500 character query with VALIDATION_FAILED and performs no search", async () => {
    await fc.assert(
      fc.asyncProperty(ctxArb, invalidQuery, async (ctx, query) => {
        expect(
          query.length < SEARCH_QUERY_MIN_LENGTH ||
            query.length > SEARCH_QUERY_MAX_LENGTH,
        ).toBe(true);

        const index = spyIndex();
        const service = new SearchService({ index, access: allowAll });

        // R14.5: an out-of-range query is rejected with a validation error.
        const promise = service.search(ctx, query);
        await expect(promise).rejects.toBeInstanceOf(AppError);
        await expect(service.search(ctx, query)).rejects.toMatchObject({
          code: "VALIDATION_FAILED",
        });

        // R14.5: NO search was performed — the index was never consulted,
        // across both rejected attempts above.
        expect(index.calls()).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});
