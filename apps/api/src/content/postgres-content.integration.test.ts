import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { newUuid } from "@streetstudio/database";
import { PgPool } from "streetjs";
import { AppError } from "@streetstudio/shared";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import {
  assemblePostgresRepositories,
  ensureCanonicalSchema,
} from "../persistence/postgres-database.js";
import { assemblePostgresContent } from "./postgres-content.js";

/**
 * Store-of-record repoint (ADR-0021, step 3): the real `ContentService` running
 * on the **canonical repository layer** (canonical singular, FK-constrained
 * `organization`/`project`/`workspace`/`folder`/`video` tables) rather than the
 * standalone direct-`PgPool` adapter. The content hierarchy (project → workspace
 * → folder → video) enforces organization scope and FK constraints. Runs when
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

suite("ContentService on the canonical repository layer", () => {
  let pool: PgPool;
  const org = newUuid();
  const member = newUuid();
  const actor: AuthContext = { memberId: member };

  const iso = () => new Date().toISOString();

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureCanonicalSchema(pool);

    // Seed the organization and member.
    await pool.query(
      `INSERT INTO organization (id, name, settings, created_at) VALUES ($1, $2, $3::jsonb, $4)`,
      [org, "Acme Inc", JSON.stringify({}), iso()],
    );
    await pool.query(
      `INSERT INTO organization_member (organization_id, member_id, role, joined_at)
       VALUES ($1, $2, $3, $4)`,
      [org, member, "admin", iso()],
    );
  });

  afterAll(async () => {
    if (pool) {
      // Deleting the org cascades everything else.
      await pool.query(`DELETE FROM organization WHERE id = $1`, [org]).catch(() => {});
      await pool.close();
    }
  });

  it("creates a project within the authorized organization", async () => {
    const svc = assemblePostgresContent(pool, allowAll);
    const project = await svc.createProject(actor, {
      organizationId: org,
      name: "Marketing Q1 2024",
      description: "Quarterly marketing campaign videos",
    });

    expect(project.id).toBeDefined();
    expect(project.organizationId).toBe(org);
    expect(project.name).toBe("Marketing Q1 2024");
    expect(project.description).toBe("Quarterly marketing campaign videos");
  });

  it("creates a workspace within a project", async () => {
    const svc = assemblePostgresContent(pool, allowAll);
    
    // First create a project.
    const project = await svc.createProject(actor, {
      organizationId: org,
      name: "Dev Team Onboarding",
      description: "Developer training materials",
    });

    // Then create a workspace in it.
    const workspace = await svc.createWorkspace(actor, {
      projectId: project.id,
      name: "Backend Tutorials",
      description: "Node.js and database training",
    });

    expect(workspace.id).toBeDefined();
    expect(workspace.projectId).toBe(project.id);
    expect(workspace.name).toBe("Backend Tutorials");
    expect(workspace.description).toBe("Node.js and database training");
  });

  it("creates folders within a workspace", async () => {
    const svc = assemblePostgresContent(pool, allowAll);
    
    // Create project and workspace first.
    const project = await svc.createProject(actor, {
      organizationId: org,
      name: "Sales Training",
      description: "Sales team development",
    });
    const workspace = await svc.createWorkspace(actor, {
      projectId: project.id,
      name: "Product Demos",
      description: "Demo recordings and tutorials",
    });

    // Create a folder in the workspace.
    const folder = await svc.createFolder(actor, {
      workspaceId: workspace.id,
      name: "API Integration",
      description: "Customer API integration examples",
    });

    expect(folder.id).toBeDefined();
    expect(folder.workspaceId).toBe(workspace.id);
    expect(folder.name).toBe("API Integration");
    expect(folder.description).toBe("Customer API integration examples");
  });

  it("lists content with proper hierarchy filtering", async () => {
    const svc = assemblePostgresContent(pool, allowAll);
    
    // Create a project with two workspaces.
    const project = await svc.createProject(actor, {
      organizationId: org,
      name: "Content Library",
      description: "Shared content repository",
    });
    const wsA = await svc.createWorkspace(actor, {
      projectId: project.id,
      name: "Public Videos",
      description: "Customer-facing content",
    });
    const wsB = await svc.createWorkspace(actor, {
      projectId: project.id,
      name: "Internal Training",
      description: "Employee-only materials",
    });

    // List workspaces for the project.
    const workspaces = await svc.listWorkspaces(actor, project.id);
    const wsIds = workspaces.map((w) => w.id);
    expect(wsIds).toContain(wsA.id);
    expect(wsIds).toContain(wsB.id);
    expect(workspaces).toHaveLength(2);
  });

  it("enforces organization scope via FK constraints", async () => {
    const svc = assemblePostgresContent(pool, allowAll);
    const fakeOrgId = newUuid();

    // Attempt to create a project in a nonexistent organization should fail.
    await expect(
      svc.createProject(actor, {
        organizationId: fakeOrgId,
        name: "Forbidden Project",
        description: "Should not be created",
      }),
    ).rejects.toThrow();
  });
});