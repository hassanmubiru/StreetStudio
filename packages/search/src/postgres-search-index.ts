/**
 * Real PostgreSQL adapter for the {@link SearchIndex} port, composing the
 * StreetJS `PgPool` (de-seam onto real infrastructure). Satisfies the same
 * pluggable port an in-memory index does, so {@link SearchService} runs
 * unchanged on real data.
 *
 * Candidate matches are drawn from two real tables:
 *  - `videos` — matched on `title` (a Video hit, no transcript position).
 *  - `transcripts` — matched on any segment text (a Video hit carrying the
 *    matching segment's `start` as the playback position, R14.2).
 *
 * Authorization is deliberately NOT this adapter's concern — the
 * {@link SearchService} filters every candidate to the requester's authorized
 * scope (R14.4). Results are returned in a stable order (video `created_at`
 * then `id`) so pagination is consistent across calls for the same query
 * (R14.6). All queries are parameterized; the `ILIKE` needle escapes LIKE
 * wildcards. DDL is idempotent and reuses the shared `videos` table.
 */
import { PgPool } from "streetjs";
import type { ResourceRef } from "@streetstudio/auth";
import type { TranscriptSegmentDto, Uuid } from "@streetstudio/shared";
import type { IndexedMatch, SearchIndex } from "./search.js";

type Row = Record<string, string | null>;

/** Escape LIKE wildcards (`\`, `%`, `_`) so a query matches literally under `ESCAPE '\'`. */
function escapeLike(needle: string): string {
  return needle.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const SEARCH_TABLES_DDL = `
CREATE TABLE IF NOT EXISTS videos (
  id                UUID PRIMARY KEY,
  organization_id   UUID        NOT NULL,
  folder_id         UUID,
  title             TEXT        NOT NULL,
  duration_seconds  INTEGER     NOT NULL DEFAULT 0,
  status            TEXT        NOT NULL,
  source_object_key TEXT,
  developer_mode    BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS transcripts (
  id         UUID PRIMARY KEY,
  video_id   UUID        NOT NULL,
  segments   JSONB       NOT NULL,
  indexed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS transcripts_video_idx ON transcripts (video_id);
`;

/** Create the search schema (shared videos + transcripts). */
export async function ensureSearchSchema(pool: PgPool): Promise<void> {
  await pool.query(SEARCH_TABLES_DDL);
}

/** Parse a JSON(B) segments column into typed segments (empty on any problem). */
function parseSegments(raw: string | null): TranscriptSegmentDto[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TranscriptSegmentDto[]) : [];
  } catch {
    return [];
  }
}

/** A {@link SearchIndex} backed by real PostgreSQL. */
export function postgresSearchIndex(pool: PgPool): SearchIndex {
  return {
    async query(query: string): Promise<readonly IndexedMatch[]> {
      const needle = `%${escapeLike(query)}%`;
      const lowered = query.toLowerCase();

      // Title matches: Video hits with no transcript position.
      const titleRes = await pool.query(
        `SELECT id, organization_id, created_at
         FROM videos
         WHERE title ILIKE $1 ESCAPE '\\'
         ORDER BY created_at ASC, id ASC`,
        [needle],
      );

      // Transcript matches: Video hits carrying the matching segment position.
      const transcriptRes = await pool.query(
        `SELECT t.video_id, v.organization_id, v.created_at, t.segments::text AS segments
         FROM transcripts t
         JOIN videos v ON v.id = t.video_id
         WHERE t.segments::text ILIKE $1 ESCAPE '\\'
         ORDER BY v.created_at ASC, v.id ASC`,
        [needle],
      );

      // Merge, de-duplicating by video id and preferring a transcript position.
      const byId = new Map<
        string,
        { organizationId: Uuid; createdAt: string; position?: number }
      >();

      for (const r of titleRes.rows as Row[]) {
        const id = r["id"] as string;
        byId.set(id, {
          organizationId: r["organization_id"] as Uuid,
          createdAt: r["created_at"] as string,
        });
      }

      for (const r of transcriptRes.rows as Row[]) {
        const id = r["video_id"] as string;
        const segments = parseSegments(r["segments"]);
        const match = segments.find((s) => s.text.toLowerCase().includes(lowered));
        const entry = byId.get(id) ?? {
          organizationId: r["organization_id"] as Uuid,
          createdAt: r["created_at"] as string,
        };
        if (match) {
          entry.position = match.start;
        }
        byId.set(id, entry);
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
