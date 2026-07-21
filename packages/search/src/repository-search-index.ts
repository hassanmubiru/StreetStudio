/**
 * Repository-based {@link SearchIndex} adapter (ADR-0021, step 3). Implements
 * the same pluggable port as {@link postgresSearchIndex} but uses the
 * `@streetstudio/database` repository layer instead of direct `PgPool` queries.
 *
 * This adapter runs on the canonical schema (singular, FK-constrained
 * `video`/`transcript` tables) via the unified repository interfaces, ensuring
 * consistency with other domain repoints while preserving all search behavior:
 * title matches (Video hits), transcript segment matches (Video hits with
 * playback position), and stable ordering for pagination.
 */
import type { ResourceRef } from "@streetstudio/auth";
import type { Uuid } from "@streetstudio/shared";
import type { Repositories } from "@streetstudio/database";
import type { IndexedMatch, SearchIndex } from "./search.js";

/** Escape LIKE wildcards (`\`, `%`, `_`) so a query matches literally under `ESCAPE '\'`. */
function escapeLike(needle: string): string {
  return needle.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Build a {@link SearchIndex} backed by the canonical repository layer. Uses
 * the video and transcript repositories to match on title and segment text,
 * with the same stable ordering and transcript position carrythrough as the
 * direct-PgPool adapter.
 */
export function repositorySearchIndex(repositories: Repositories): SearchIndex {
  return {
    async query(query: string): Promise<readonly IndexedMatch[]> {
      const needle = `%${escapeLike(query)}%`;
      const lowered = query.toLowerCase();

      // Title matches: find videos whose title matches the query.
      const titleMatches = await repositories.video.searchByTitle(needle);

      // Transcript matches: find transcripts with matching segment text.
      const transcriptMatches = await repositories.transcript.searchBySegments(needle);

      // Merge results, de-duplicating by video ID and preferring transcript position.
      const byId = new Map<
        string,
        { organizationId: Uuid; createdAt: Date; position?: number }
      >();

      // Add title matches (no transcript position).
      for (const video of titleMatches) {
        byId.set(video.id, {
          organizationId: video.organizationId,
          createdAt: video.createdAt,
        });
      }

      // Add/update transcript matches (with position from matching segment).
      for (const transcriptMatch of transcriptMatches) {
        const video = transcriptMatch.video;
        const segments = transcriptMatch.segments;
        const matchingSegment = segments.find((s) =>
          s.text.toLowerCase().includes(lowered),
        );

        const entry = byId.get(video.id) ?? {
          organizationId: video.organizationId,
          createdAt: video.createdAt,
        };

        if (matchingSegment) {
          entry.position = matchingSegment.start;
        }

        byId.set(video.id, entry);
      }

      // Sort by created_at then id for stable pagination order.
      const merged = [...byId.entries()].sort((a, b) => {
        const timeA = a[1].createdAt.getTime();
        const timeB = b[1].createdAt.getTime();
        if (timeA !== timeB) {
          return timeA - timeB;
        }
        return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
      });

      return merged.map(([id, v]) => {
        const resource: ResourceRef = {
          organizationId: v.organizationId,
          type: "video",
          id: id as Uuid,
        };
        return v.position !== undefined
          ? { resource, transcriptPosition: v.position }
          : { resource };
      });
    },
  };
}