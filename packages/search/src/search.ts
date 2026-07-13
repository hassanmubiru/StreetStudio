/**
 * Search & Transcript Search (`packages/media`).
 *
 * Implements the design's "Search" section and Requirement 14: Search and
 * Transcript Search. The {@link SearchService} answers a single question — "for
 * this query, which Videos and Assets within the requesting Member's authorized
 * scope match, and (for transcript matches) at what playback position?" —
 * subject to strict query validation and bounded, cursor-paged output:
 *
 *  - {@link SearchService.search} validates the query length FIRST: a query
 *    shorter than {@link SEARCH_QUERY_MIN_LENGTH} (i.e. empty) or longer than
 *    {@link SEARCH_QUERY_MAX_LENGTH} is rejected with `VALIDATION_FAILED` and no
 *    search is performed (R14.5). Only a query of 1–500 characters proceeds.
 *  - Candidate matches whose indexed text matches the query are obtained through
 *    the narrow, injectable {@link SearchIndex} port, keeping the concrete
 *    index/backend (e.g. a full-text or vector store, or an AI_Provider-backed
 *    semantic index) pluggable and this service unit-testable with in-memory
 *    fakes (R14.1).
 *  - Every candidate is filtered through the {@link AccessControl} seam from
 *    `@streetstudio/auth`, evaluated in the resource's OWNING Organization
 *    scope: only resources the requester is authorized to view are returned, and
 *    out-of-scope resources are excluded (R14.1, R14.4).
 *  - A Video matched via its transcript carries the matching playback position
 *    on its {@link SearchHit.transcriptPosition} (R14.2).
 *  - Results are paged at no more than {@link SEARCH_MAX_PAGE_SIZE} (100) per
 *    response; when more authorized results remain, a {@link Cursor} is returned
 *    on {@link SearchPage.nextCursor} to retrieve the subsequent page (R14.6).
 *  - A query that matches no authorized results yields an empty result set (no
 *    `nextCursor`) (R14.3).
 *
 * Every failure is surfaced through the shared error taxonomy (`AppError`): an
 * out-of-range query, or a malformed pagination cursor, raises
 * `VALIDATION_FAILED`.
 *
 * The 3-second response bound (R14.1, R14.3) is a deployment/latency budget met
 * by the concrete index adapter; the service itself performs O(candidates) work
 * over the index's result set and adds no unbounded loops.
 */
import type { AccessControl, AuthContext, ResourceRef } from "@streetstudio/auth";
import { AppError } from "@streetstudio/shared";

import { VIEW_VIDEO_PERMISSION } from "./permissions.js";

/** Minimum length, in characters, of a search query (R14.5). Empty is rejected. */
export const SEARCH_QUERY_MIN_LENGTH = 1;

/** Maximum length, in characters, of a search query (R14.5). */
export const SEARCH_QUERY_MAX_LENGTH = 500;

/** Maximum number of results returned in a single search response (R14.6). */
export const SEARCH_MAX_PAGE_SIZE = 100;

/**
 * Permission a Role must grant to see an Asset in search results, evaluated by
 * {@link AccessControl.can} in the Asset's owning Organization scope (R14.4).
 * Videos reuse {@link VIEW_VIDEO_PERMISSION}.
 */
export const VIEW_ASSET_PERMISSION = "content:view_asset";

/**
 * An opaque pagination token identifying a position in a query's authorized
 * result stream. Callers MUST treat it as opaque and pass it back unmodified to
 * retrieve the next page; the encoding is an implementation detail (R14.6).
 */
export type Cursor = string;

/** A single search result: the matched resource and, for transcript matches, its position. */
export interface SearchHit {
  /**
   * A reference to the matched Video or Asset, carrying its owning
   * `organizationId` (the authorization scope) and its `type`/`id`.
   */
  readonly resource: ResourceRef;
  /**
   * For a Video matched via its transcript, the playback position (in seconds)
   * of the matching transcript segment (R14.2). Absent for non-transcript
   * matches and for Assets.
   */
  readonly transcriptPosition?: number;
}

/** A bounded, cursor-paged page of search results (R14.6). */
export interface SearchPage {
  /** The matching, authorized results for this page (at most {@link SEARCH_MAX_PAGE_SIZE}). */
  readonly results: readonly SearchHit[];
  /** A cursor to retrieve the next page, present IFF more authorized results remain. */
  readonly nextCursor?: Cursor;
}

/**
 * A candidate match returned by the {@link SearchIndex}: a resource whose
 * indexed text matches the query, before authorization filtering.
 */
export interface IndexedMatch {
  /**
   * The matched resource, including its owning `organizationId` and its
   * `type` ("video" or "asset") and `id`.
   */
  readonly resource: ResourceRef;
  /**
   * For a transcript match, the playback position (in seconds) of the matching
   * segment (R14.2). Omitted for non-transcript matches.
   */
  readonly transcriptPosition?: number;
}

/**
 * Narrow, injectable port over the search index/backend.
 *
 * A production adapter is backed by whatever concrete index the deployment uses
 * (full-text, vector, or AI_Provider-backed semantic search); this seam keeps
 * that backend pluggable and this service decoupled from it. Implementations
 * MUST return candidate matches whose indexed text matches `query`, in a stable
 * relevance/ordering that is consistent across paged calls for the same query.
 * Authorization is NOT the index's concern — the {@link SearchService} filters
 * every candidate to the requester's authorized scope.
 */
export interface SearchIndex {
  /** Return candidate matches for `query`, in stable order. */
  query(query: string): Promise<readonly IndexedMatch[]>;
}

/** Dependencies required to construct a {@link SearchService}. */
export interface SearchServiceDeps {
  /** The pluggable search index/backend port (R14.1). */
  readonly index: SearchIndex;
  /** RBAC evaluator used to filter results to the requester's authorized scope (R14.4). */
  readonly access: AccessControl;
}

/** Whether `query` is within the permitted length bounds (R14.5). */
function isValidQuery(query: string): boolean {
  return (
    query.length >= SEARCH_QUERY_MIN_LENGTH &&
    query.length <= SEARCH_QUERY_MAX_LENGTH
  );
}

/** Encode a non-negative result-stream offset as an opaque {@link Cursor}. */
function encodeCursor(offset: number): Cursor {
  return Buffer.from(`o:${offset}`, "utf8").toString("base64url");
}

/**
 * Decode an opaque {@link Cursor} to its offset. A malformed cursor (bad
 * encoding, wrong shape, or a negative/non-integer offset) raises
 * `VALIDATION_FAILED`.
 */
function decodeCursor(cursor: Cursor): number {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new AppError("VALIDATION_FAILED");
  }
  const match = /^o:(\d+)$/.exec(decoded);
  if (!match) {
    throw new AppError("VALIDATION_FAILED");
  }
  const offset = Number(match[1]);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new AppError("VALIDATION_FAILED");
  }
  return offset;
}

/**
 * The Search & Transcript Search service. See the module doc for the exact
 * semantics of {@link SearchService.search}.
 */
export class SearchService {
  private readonly index: SearchIndex;
  private readonly access: AccessControl;

  constructor(deps: SearchServiceDeps) {
    this.index = deps.index;
    this.access = deps.access;
  }

  /**
   * Search Videos and Assets whose indexed text matches `query`, restricted to
   * the requester's authorized scope.
   *
   * Rejects a query outside 1–500 characters with `VALIDATION_FAILED` before
   * touching the index (R14.5). Otherwise returns matching, authorized results
   * (R14.1) — excluding any resource outside the requester's authorized scope
   * (R14.4) — with transcript matches carrying the matching playback position
   * (R14.2). At most {@link SEARCH_MAX_PAGE_SIZE} results are returned per call;
   * when more remain, {@link SearchPage.nextCursor} is set so the caller can
   * retrieve the next page (R14.6). A query with no authorized matches yields an
   * empty result set (R14.3). A malformed `page` cursor raises
   * `VALIDATION_FAILED`.
   */
  async search(
    ctx: AuthContext,
    query: string,
    page?: Cursor,
  ): Promise<SearchPage> {
    // --- Query validation FIRST, before any search work (R14.5) -------------
    if (!isValidQuery(query)) {
      throw new AppError("VALIDATION_FAILED");
    }

    const offset = page === undefined ? 0 : decodeCursor(page);

    // --- Candidate retrieval from the pluggable index (R14.1) ---------------
    const candidates = await this.index.query(query);

    // --- Authorized-scope filtering (R14.1, R14.4) --------------------------
    // Only resources the requester may view in the resource's OWNING scope are
    // kept; out-of-scope resources are excluded.
    const authorized: SearchHit[] = [];
    for (const candidate of candidates) {
      const permitted = await this.access.can(
        ctx,
        permissionFor(candidate.resource),
        candidate.resource,
      );
      if (!permitted) {
        continue;
      }
      authorized.push(toSearchHit(candidate));
    }

    // --- Bounded, cursor-paged output (R14.3, R14.6) ------------------------
    const pageResults = authorized.slice(offset, offset + SEARCH_MAX_PAGE_SIZE);
    const nextOffset = offset + SEARCH_MAX_PAGE_SIZE;
    const hasMore = authorized.length > nextOffset;

    return {
      results: pageResults,
      ...(hasMore ? { nextCursor: encodeCursor(nextOffset) } : {}),
    };
  }
}

/**
 * The view permission to evaluate for a candidate resource: Assets use
 * {@link VIEW_ASSET_PERMISSION}, everything else (Videos) uses
 * {@link VIEW_VIDEO_PERMISSION}. Both are evaluated in the resource's owning
 * Organization scope (R14.4).
 */
function permissionFor(resource: ResourceRef): string {
  return resource.type === "asset" ? VIEW_ASSET_PERMISSION : VIEW_VIDEO_PERMISSION;
}

/** Map an {@link IndexedMatch} to a {@link SearchHit}, omitting an absent transcript position. */
function toSearchHit(match: IndexedMatch): SearchHit {
  return {
    resource: match.resource,
    ...(match.transcriptPosition !== undefined
      ? { transcriptPosition: match.transcriptPosition }
      : {}),
  };
}
