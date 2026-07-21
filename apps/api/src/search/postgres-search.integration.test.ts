import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { newUuid } from "@streetstudio/database";
import { PgPool } from "streetjs";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import {
  assemblePostgresRepositories,
  ensureCanonicalSchema,
} from "../persistence/postgres-database.js";
import { assemblePostgresSearch } from "./postgres-search.js";

/**
 * Store-of-record repoint (ADR-0021, step 3): the real `SearchService` running
 * on the **canonical repository layer** (canonical singular, FK-constrained
 * `video`/`transcript` tables) rather than the standalone direct-`PgPool`
 * adapter. Matches videos by title and transcripts by segment text, with
 * authorized-scope filtering enforced in the service layer. Runs when
 * `STREETSTUDIO_IT_DATABASE_URL` is set; skips otherwise.
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

function orgScopedAccess(allowedOrg: string): AccessControl {
  return {
    async can(_ctx: AuthContext, _action: string, resource: { organizationId?: string }) {
      return resource.organizationId === allowedOrg;
    },
    async assignRole(): Promise<void> {},
  };
}

suite("SearchService on the canonical repository layer", () => {
  let pool: PgPool;
  const orgA = newUuid();
  const orgB = newUuid();
  const titleVideo = newUuid();
  const transcriptVideo = newUuid();
  const otherOrgVideo = newUuid();
  const transcriptId = newUuid();
  const actor: AuthContext = { memberId: newUuid() };

  const iso = () => new Date().toISOString();

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureCanonicalSchema(pool);

    // Seed orgs and videos.
    for (const org of [orgA, orgB]) {
      await pool.query(
        `INSERT INTO organization (id, name, settings, created_at) VALUES ($1, $2, $3::jsonb, $4)`,
        [org, "Acme", JSON.stringify({}), iso()],
      );
    }
    await pool.query(
      `INSERT INTO video (id, organization_id, folder_id, title, duration_seconds, status, source_object_key, developer_mode, created_at)
       VALUES ($1, $2, NULL, $3, 100, 'ready', NULL, false, $4)`,
      [titleVideo, orgA, "Kubernetes onboarding walkthrough", "2024-01-01T00:00:00.000Z"],
    );
    await pool.query(
      `INSERT INTO video (id, organization_id, folder_id, title, duration_seconds, status, source_object_key, developer_mode, created_at)
       VALUES ($1, $2, NULL, $3, 100, 'ready', NULL, false, $4)`,
      [transcriptVideo, orgA, "Untitled recording", "2024-01-02T00:00:00.000Z"],
    );
    await pool.query(
      `INSERT INTO video (id, organization_id, folder_id, title, duration_seconds, status, source_object_key, developer_mode, created_at)
       VALUES ($1, $2, NULL, $3, 100, 'ready', NULL, false, $4)`,
      [otherOrgVideo, orgB, "Kubernetes deep dive", "2024-01-03T00:00:00.000Z"],
    );
    // A transcript for the second video, with a matching segment.
    await pool.query(
      `INSERT INTO transcript (id, video_id, segments, indexed_at) VALUES ($1, $2, $3::jsonb, now())`,
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
      // Deleting the orgs cascades the videos and transcripts.
      for (const org of [orgA, orgB]) {
        await pool.query(`DELETE FROM organization WHERE id = $1`, [org]).catch(() => {});
      }
      await pool.close();
    }
  });

  it("returns only authorized, matching results and excludes other orgs (R14.1, R14.4)", async () => {
    const svc = assemblePostgresSearch(pool, orgScopedAccess(orgA));
    const page = await svc.search(actor, "kubernetes");

    const ids = page.results.map((h) => h.resource.id);
    expect(ids).toContain(titleVideo);
    expect(ids).toContain(transcriptVideo);
    // The org-B video matches by title but is outside the authorized scope.
    expect(ids).not.toContain(otherOrgVideo);
  });

  it("carries the matching transcript playback position (R14.2)", async () => {
    const svc = assemblePostgresSearch(pool, orgScopedAccess(orgA));
    const page = await svc.search(actor, "deploy to kubernetes");

    const hit = page.results.find((h) => h.resource.id === transcriptVideo);
    expect(hit).toBeDefined();
    expect(hit?.transcriptPosition).toBe(12);
  });

  it("validates the query length (R14.5)", async () => {
    const svc = assemblePostgresSearch(pool, orgScopedAccess(orgA));
    await expect(svc.search(actor, "")).rejects.toBeTruthy();
    await expect(svc.search(actor, "x".repeat(501))).rejects.toBeTruthy();
  });

  it("returns an empty result set when nothing matches (R14.3)", async () => {
    const svc = assemblePostgresSearch(pool, orgScopedAccess(orgA));
    const page = await svc.search(actor, "nonexistent-term-zzz");
    expect(page.results).toHaveLength(0);
    expect(page.nextCursor).toBeUndefined();
  });
});