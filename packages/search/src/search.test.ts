import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
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
  type IndexedMatch,
  type SearchIndex,
} from "./search.js";
import { VIEW_VIDEO_PERMISSION } from "@streetstudio/media";

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

const ORG_A: Uuid = "11111111-1111-1111-1111-111111111111";
const ORG_B: Uuid = "22222222-2222-2222-2222-222222222222";
const MEMBER: Uuid = "33333333-3333-3333-3333-333333333333";
const CTX: AuthContext = { memberId: MEMBER };

function videoMatch(id: string, org: Uuid, transcriptPosition?: number): IndexedMatch {
  return {
    resource: { organizationId: org, type: "video", id: id as Uuid },
    ...(transcriptPosition !== undefined ? { transcriptPosition } : {}),
  };
}

function assetMatch(id: string, org: Uuid): IndexedMatch {
  return { resource: { organizationId: org, type: "asset", id: id as Uuid } };
}

function indexOf(matches: readonly IndexedMatch[]): SearchIndex {
  return { async query() { return matches; } };
}

/** Grants the correct view permission only for resources in `authorizedOrgs`. */
function accessForOrgs(authorizedOrgs: readonly Uuid[]): AccessControl {
  return {
    async can(_ctx: AuthContext, action: string, resource: ResourceRef) {
      const expected =
        resource.type === "asset" ? VIEW_ASSET_PERMISSION : VIEW_VIDEO_PERMISSION;
      return action === expected && authorizedOrgs.includes(resource.organizationId);
    },
    async assignRole() {
      throw new Error("not used");
    },
  };
}

/* -------------------------------------------------------------------------
 * Tests
 * ---------------------------------------------------------------------- */

describe("SearchService.search", () => {
  it("rejects an empty query with VALIDATION_FAILED before searching (R14.5)", async () => {
    let touched = false;
    const index: SearchIndex = {
      async query() {
        touched = true;
        return [];
      },
    };
    const service = new SearchService({ index, access: accessForOrgs([ORG_A]) });

    await expect(service.search(CTX, "")).rejects.toBeInstanceOf(AppError);
    await expect(service.search(CTX, "")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(touched).toBe(false);
  });

  it("rejects a query longer than 500 characters (R14.5)", async () => {
    const service = new SearchService({
      index: indexOf([]),
      access: accessForOrgs([ORG_A]),
    });
    await expect(service.search(CTX, "x".repeat(501))).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("returns only matching, authorized results and excludes out-of-scope ones (R14.1, R14.4)", async () => {
    const service = new SearchService({
      index: indexOf([
        videoMatch("v-a", ORG_A),
        videoMatch("v-b", ORG_B), // out of scope
        assetMatch("a-a", ORG_A),
        assetMatch("a-b", ORG_B), // out of scope
      ]),
      access: accessForOrgs([ORG_A]),
    });

    const page = await service.search(CTX, "demo");
    expect(page.results.map((h) => h.resource.id)).toEqual(["v-a", "a-a"]);
    expect(page.nextCursor).toBeUndefined();
  });

  it("carries the matching playback position for transcript matches (R14.2)", async () => {
    const service = new SearchService({
      index: indexOf([videoMatch("v-a", ORG_A, 87.5), assetMatch("a-a", ORG_A)]),
      access: accessForOrgs([ORG_A]),
    });

    const page = await service.search(CTX, "hello");
    expect(page.results[0].transcriptPosition).toBe(87.5);
    // Non-transcript match omits the position entirely.
    expect(page.results[1].transcriptPosition).toBeUndefined();
  });

  it("returns an empty result set on no authorized matches (R14.3)", async () => {
    const service = new SearchService({
      index: indexOf([videoMatch("v-b", ORG_B)]),
      access: accessForOrgs([ORG_A]),
    });

    const page = await service.search(CTX, "nothing");
    expect(page.results).toEqual([]);
    expect(page.nextCursor).toBeUndefined();
  });

  it("bounds each page to SEARCH_MAX_PAGE_SIZE and pages via the cursor (R14.6)", async () => {
    const total = SEARCH_MAX_PAGE_SIZE + 30;
    const matches = Array.from({ length: total }, (_, i) => videoMatch(`v-${i}`, ORG_A));
    const service = new SearchService({
      index: indexOf(matches),
      access: accessForOrgs([ORG_A]),
    });

    const first = await service.search(CTX, "page");
    expect(first.results).toHaveLength(SEARCH_MAX_PAGE_SIZE);
    expect(first.results[0].resource.id).toBe("v-0");
    expect(first.nextCursor).toBeDefined();

    const second = await service.search(CTX, "page", first.nextCursor);
    expect(second.results).toHaveLength(30);
    expect(second.results[0].resource.id).toBe(`v-${SEARCH_MAX_PAGE_SIZE}`);
    expect(second.nextCursor).toBeUndefined();
  });

  it("rejects a malformed pagination cursor with VALIDATION_FAILED", async () => {
    const service = new SearchService({
      index: indexOf([videoMatch("v-a", ORG_A)]),
      access: accessForOrgs([ORG_A]),
    });
    await expect(service.search(CTX, "q", "not-a-cursor")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});
