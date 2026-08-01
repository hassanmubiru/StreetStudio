/**
 * A {@link SearchIndex} over the **canonical** singular schema (ADR-0021).
 *
 * The published `postgresSearchIndex` in `@streetstudio/search` targets the
 * legacy plural de-seam tables (`videos`/`transcripts`) — the schema the
 * production composition does NOT use. Production runs on the canonical singular
 * schema provisioned by `runMigrations` (`video`, `transcript`), so this adapter
 * implements the same `SearchIndex` port against those tables via the app's
 * {@link PgClient}. It is the concrete index that makes `search.videos` work in
 * production (previously the operation was unwired because no canonical-schema
 * index existed).
 *
 * Candidate matches are drawn from two canonical tables:
 *  - `video` — matched on `title` (a Video hit, no transcript position).
 *  - `transcript` — matched on any segment text (a Video hit carrying the
 *    matching segment's `start` as the playback position, R14.2).
 *
 * Authorization is NOT this adapter's concern — the {@link SearchService}
 * filters every candidate to the requester's authorized scope (R14.4). Results
 * are ordered by video `created_at` then `id` for stable pagination (R14.6).
 * All queries are parameterized; the `ILIKE` needle escapes LIKE wildcards.
 */
import type { ResourceRef } from "@streetstudio/auth";
import type { TranscriptSegmentDto, Uuid } from "@streetstudio/shared";
import type { IndexedMatch, SearchIndex } from "@streetstudio/search";
import type { PgClient } from "../runtime/pg-client.js";

/** Escape LIKE wildcards (`\`, `%`, `_`) so a query matches literally under `ESCAPE '\'`. */
function escapeLike(needle: string): string {
  return needle.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Parse a JSON(B) `segments` value into typed segments (empty on any problem). */
function parseSegments(raw: unknown): TranscriptSegmentDto[] {
  if (raw === null || raw === undefined) return [];
  try {
    const parsed = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    return Array.isArray(parsed) ? (parsed as TranscriptSegmentDto[]) : [];
  } catch {
    return [];
  }
}

/**
 * Build a {@link SearchIndex} backed by the canonical singular schema over the
 * app's {@link PgClient}.
 */
export function canonicalSearchIndex(pg: PgClient): SearchIndex {
  return {
    async query(query: string): Promise<readonly IndexedMatch[]> {
      const needle = `%${escapeLike(query)}%`;
      const lowered = query.toLowerCase();

      // Title matches: Video hits with no transcript position.
      const titleRes = await pg.query<{
        id: string;
        organization_id: string;
        created_at: string;
      }>(
        `SELECT id, organization_id, created_at
           FROM video
          WHERE title ILIKE $1 ESCAPE '\\'
          ORDER BY created_at ASC, id ASC`,
        [needle],
      );

      // Transcript matches: Video hits carrying the matching segment position.
      const transcriptRes = await pg.query<{
        video_id: string;
        organization_id: string;
        created_at: string;
        segments: string | null;
      }>(
        `SELECT t.video_id, v.organization_id, v.created_at, t.segments::text AS segments
           FROM transcript t
           JOIN video v ON v.id = t.video_id
          WHERE t.segments::text ILIKE $1 ESCAPE '\\'
          ORDER BY v.created_at ASC, v.id ASC`,
        [needle],
      );

      // Merge, de-duplicating by video id and preferring a transcript position.
      const byId = new Map<
        string,
        { organizationId: Uuid; createdAt: string; position?: number }
      >();

      for (const r of titleRes.rows) {
        byId.set(r.id, {
          organizationId: r.organization_id as Uuid,
          createdAt: r.created_at,
        });
      }

      for (const r of transcriptRes.rows) {
        const segments = parseSegments(r.segments);
        const match = segments.find((s) => s.text.toLowerCase().includes(lowered));
        const entry = byId.get(r.video_id) ?? {
          organizationId: r.organization_id as Uuid,
          createdAt: r.created_at,
        };
        if (match) {
          entry.position = match.start;
        }
        byId.set(r.video_id, entry);
      }

      const merged = [...byId.entries()].sort((a, b) => {
        if (a[1].createdAt !== b[1].createdAt) {
          return a[1].createdAt < b[1].createdAt ? -1 : 1;
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
