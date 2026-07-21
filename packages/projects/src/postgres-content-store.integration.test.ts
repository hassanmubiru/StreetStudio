import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PgPool } from "streetjs";
import { AppError } from "@streetstudio/shared";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import { ContentService } from "./content.js";
import { ensureContentSchema, postgresContentStore } from "./postgres-content-store.js";

/**
 * De-seam: the real {@link ContentService} on the real PostgreSQL
 * {@link ContentStore} — projects, folders, and video moves on real
 * infrastructure. RBAC is exercised separately, so this isolates the content
 * store with an allow-all access control. Runs when
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

const allowAll: AccessControl = {
  async can(): Promise<boolean> {
    return true;
  },
  async assignRole(): Promise<void> {},
};

suite("ContentService on real Postgres store", () => {
  let pool: PgPool;
  let svc: ContentService;
  const actor: AuthContext = { memberId: randomUUID() };
  const org = randomUUID();
  const videoId = randomUUID();

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureContentSchema(pool);
    for (const t of ["videos", "folders", "workspaces", "projects"]) {
      await pool.query(`DELETE FROM ${t} WHERE ${t === "folders" ? "project_id IN (SELECT id FROM projects WHERE organization_id = $1)" : "organization_id = $1"}`, [org]).catch(() => {});
    }
    svc = new ContentService({ store: postgresContentStore(pool), access: allowAll });
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DELETE FROM videos WHERE organization_id = $1`, [org]);
      await pool.query(`DELETE FROM folders WHERE project_id IN (SELECT id FROM projects WHERE organization_id = $1)`, [org]);
      await pool.query(`DELETE FROM projects WHERE organization_id = $1`, [org]);
      await pool.close();
    }
  });

  it("creates a project and nested folders with correct depth", async () => {
    const project = await svc.createProject(actor, org, "Onboarding");
    const store = postgresContentStore(pool);
    expect((await store.findProject(org, project.id))?.name).toBe("Onboarding");

    const root = await svc.createFolder(actor, { organizationId: org, projectId: project.id }, "Intro");
    expect(root.depth).toBe(0);
    const nested = await svc.createFolder(
      actor,
      { organizationId: org, projectId: project.id, folderId: root.id },
      "Part 1",
    );
    expect(nested.depth).toBe(1);
    expect((await store.findFolder(nested.id))?.parentFolderId).toBe(root.id);
  });

  it("moves a video into a folder, preserving its identity and fields (R5.4)", async () => {
    const project = await svc.createProject(actor, org, "Library");
    const folder = await svc.createFolder(actor, { organizationId: org, projectId: project.id }, "Clips");

    // Seed a video at the project root (folder_id NULL) directly.
    await pool.query(
      `INSERT INTO videos (id, organization_id, folder_id, title, duration_seconds, status, source_object_key, developer_mode, created_at)
       VALUES ($1, $2, NULL, $3, $4, $5, $6, false, $7)`,
      [videoId, org, "Demo", 42, "ready", "uploads/x.mp4", new Date().toISOString()],
    );

    const moved = await svc.moveVideo(actor, videoId, { organizationId: org, projectId: project.id, folderId: folder.id });
    expect(moved.id).toBe(videoId);
    expect(moved.title).toBe("Demo");
    expect(moved.durationSeconds).toBe(42);

    const store = postgresContentStore(pool);
    const persisted = await store.findVideo(org, videoId);
    expect(persisted?.folderId).toBe(folder.id);
    expect(persisted?.sourceObjectKey).toBe("uploads/x.mp4"); // other fields preserved
  });

  it("rejects moving a video that does not exist in the org (R5.7)", async () => {
    const project = await svc.createProject(actor, org, "Other");
    const folder = await svc.createFolder(actor, { organizationId: org, projectId: project.id }, "F");
    await expect(
      svc.moveVideo(actor, randomUUID(), { organizationId: org, projectId: project.id, folderId: folder.id }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
