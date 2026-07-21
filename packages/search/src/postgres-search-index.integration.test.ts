import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PgPool } from "streetjs";
import type { AccessControl, AuthContext, ResourceRef } from "@streetstudio/auth";
import { SearchService } from "./search.js";
import { ensureSearchSchema, postgresSearchIndex } from "./postgres-search-index.js";

/**
 * De-seam (ADR-0020 pattern): the real {@link SearchService} running on the real
 * PostgreSQL {@link SearchIndex} — videos matched by title and transcripts
 * matched by segment text (carrying the matching playback position) on real
 * infrastructure (sharing the `videos` table with the other domains).
 * Authorized-scope filtering is exercised with an access control that only
 * permits a specific organization. Runs when `STREETSTUDIO_IT_DATABASE_URL` is
 * set; skips otherwise.
 */
const DATABASE_URL = process.env["STREETSTUDIO_IT_DATABASE_URL"];
const suite = DATABASE_URL ? describe : describe.skip;

function poolOptions(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || "5432"),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    maxConnections: 4,
  };
}

/** Allow viewing only resources owned by `allowedOrg`; deny everything else (R14.4). */
function orgScopedAccess(allowedOrg: string): AccessControl {
  return {
    async can(_ctx: AuthContext, _action: string, resource: ResourceRef): Promise<boolean> {
      return resource.organizationId === allowedOrg;
    },
    async assignRole(): Promise<void> {},
  };
}

suite("SearchService on real Postgres index", () => {
  let pool: PgPool;
  const orgA = randomUUID();
  const orgB = randomUUID();
  const titleVideo = randomUUID();
  const transcriptVideo = randomUUID();
  const otherOrgVideo = randomUUID();
  const transcriptId = randomUUID();
  const actor: AuthContext = { memberId: randomUUID() };

  async function seedVideo(id: string, org: string, title: string, createdAt: string): Promise<void> {
    await pool.query(
      `INSERT INTO videos (id, organization_id, folder_id, title, duration_seconds, status, source_object_key, developer_mode, created_at)
       VALUES ($1, $2, NULL, $3, 100, 'ready', NULL, false, $4)`,
      [id, org, title, createdAt],
    );
  }

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureSearchSchema(pool);

    for (const v of [titleVideo, transcriptVideo, otherOrgVideo]) {
      await pool.query(`DELETE FROM transcripts WHERE video_id = $1`, [v]).catch(() => {});
      await pool.query(`DELETE FROM videos WHERE id = $1`, [v]).catch(() => {});
    }

    // Two org-A videos: one matches by title, one only by transcript.
    await seedVideo(titleVideo, orgA, "Kubernetes onboarding walkthrough", "2024-01-01T00:00:00.000Z");
    await seedVideo(transcriptVideo, orgA, "Untitled recording", "2024-01-02T00:00:00.000Z");
    // An org-B video whose title also matches, to prove scope filtering.
    await seedVideo(otherOrgVideo, orgB, "Kubernetes deep dive", "2024-01-03T00:00:00.000Z");

    await pool.query(
      `INSERT INTO transcripts (id, video_id, segments, indexed_at)
       VALUES ($1, $2, $3::jsonb, now())`,
      [
        transcriptId,
        transcriptVideo,
        JSON.stringify([
          { start: 0, end: 5, text: "welcome everyone" },
          { start: 12, end: 20, text: "now we deploy to kubernetes" },
        ]),
      ],
    );
  });

  afterAll(async () => {
    if (pool) {
      for (const v of [titleVideo, transcriptVideo, otherOrgVideo]) {
        await pool.query(`DELETE FROM transcripts WHERE video_id = $1`, [v]).catch(() => {});
        await pool.query(`DELETE FROM videos WHERE id = $1`, [v]).catch(() => {});
      }
      await pool.close();
    }
  });

  it("returns only authorized, matching results and excludes other orgs (R14.1, R14.4)", async () => {
    const svc = new SearchService({ index: postgresSearchIndex(pool), access: orgScopedAccess(orgA) });
    const page = await svc.search(actor, "kubernetes");

    const ids = page.results.map((h) => h.resource.id);
    expect(ids).toContain(titleVideo);
    expect(ids).toContain(transcriptVideo);
    // The org-B video matches by title but is outside the authorized scope.
    expect(ids).not.toContain(otherOrgVideo);
  });

  it("carries the matching transcript playback position (R14.2)", async () => {
    const svc = new SearchService({ index: postgresSearchIndex(pool), access: orgScopedAccess(orgA) });
    const page = await svc.search(actor, "deploy to kubernetes");

    const hit = page.results.find((h) => h.resource.id === transcriptVideo);
    expect(hit).toBeDefined();
    expect(hit?.transcriptPosition).toBe(12);
  });

  it("rejects an out-of-range query before searching (R14.5)", async () => {
    const svc = new SearchService({ index: postgresSearchIndex(pool), access: orgScopedAccess(orgA) });
    await expect(svc.search(actor, "")).rejects.toBeTruthy();
    await expect(svc.search(actor, "x".repeat(501))).rejects.toBeTruthy();
  });

  it("returns an empty result set when nothing matches (R14.3)", async () => {
    const svc = new SearchService({ index: postgresSearchIndex(pool), access: orgScopedAccess(orgA) });
    const page = await svc.search(actor, "nonexistent-term-zzz");
    expect(page.results).toHaveLength(0);
    expect(page.nextCursor).toBeUndefined();
  });
});
