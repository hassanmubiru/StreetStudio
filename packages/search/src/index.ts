/**
 * @streetstudio/search
 *
 * Search and transcript search over media, always filtered to the caller's
 * authorized scope. Uses the media-domain view permissions, so it depends on
 * `@streetstudio/media`.
 */
export const DOMAIN = "Search and transcript search over authorized media." as const;

export {
  SearchService,
  SEARCH_QUERY_MIN_LENGTH,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_MAX_PAGE_SIZE,
  VIEW_ASSET_PERMISSION,
} from "./search.js";
export type {
  SearchServiceDeps,
  SearchIndex,
  IndexedMatch,
  SearchHit,
  SearchPage,
  Cursor,
} from "./search.js";
