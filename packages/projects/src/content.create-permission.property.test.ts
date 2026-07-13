import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type {
  FolderRecord,
  ProjectRecord,
  VideoRecord,
  WorkspaceRecord,
} from "@streetstudio/database";
import type { AccessControl } from "@streetstudio/auth";
import type { AuthContext } from "@streetstudio/auth";
import {
  ContentService,
  CREATE_FOLDER_PERMISSION,
  CREATE_PROJECT_PERMISSION,
  type ContentStore,
} from "./content.js";

/**
 * Property 16: Create permission is required for projects and folders.
 *
 * Feature: streetstudio, Property 16: Create permission is required for projects and folders
 *
 * Validates: Requirements 5.6
 *
 * For arbitrary actors, organizations, and valid names,
 * {@link ContentService.createProject} and {@link ContentService.createFolder}
 * succeed only when the injected {@link AccessControl} evaluator grants the
 * corresponding create permission in the owning Organization's scope. When the
 * evaluator denies the create permission, the request is rejected with
 * `AUTHORIZATION_DENIED` and no resource is created (R5.6).
 */

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

/** An in-memory {@link ContentStore} used to exercise the service logic. */
class InMemoryContentStore implements ContentStore {
  readonly projects = new Map<Uuid, ProjectRecord>();
  readonly workspaces = new Map<Uuid, WorkspaceRecord>();
  readonly folders = new Map<Uuid, FolderRecord>();
  readonly videos = new Map<Uuid, VideoRecord>();

  async insertProject(record: ProjectRecord): Promise<ProjectRecord> {
    this.projects.set(record.id, record);
    return record;
  }
  async insertWorkspace(record: WorkspaceRecord): Promise<WorkspaceRecord> {
    this.workspaces.set(record.id, record);
    return record;
  }
  async insertFolder(record: FolderRecord): Promise<FolderRecord> {
    this.folders.set(record.id, record);
    return record;
  }
  async findProject(
    organizationId: Uuid,
    projectId: Uuid,
  ): Promise<ProjectRecord | null> {
    const p = this.projects.get(projectId);
    return p && p.organizationId === organizationId ? p : null;
  }
  async findFolder(folderId: Uuid): Promise<FolderRecord | null> {
    return this.folders.get(folderId) ?? null;
  }
  async findVideo(
    organizationId: Uuid,
    videoId: Uuid,
  ): Promise<VideoRecord | null> {
    const v = this.videos.get(videoId);
    return v && v.organizationId === organizationId ? v : null;
  }
  async updateVideoFolder(
    video: VideoRecord,
    folderId: Uuid | null,
  ): Promise<VideoRecord> {
    const updated: VideoRecord = { ...video, folderId };
    this.videos.set(updated.id, updated);
    return updated;
  }
}

/**
 * An {@link AccessControl} that grants a fixed allowlist of actions and records
 * the (permission, organizationId) pairs it was consulted with, so the test can
 * confirm the gate is driven by the requested create permission and the owning
 * Organization's scope.
 */
function decisionAccess(granted: ReadonlySet<string>): {
  access: AccessControl;
  calls: Array<{ action: string; organizationId: Uuid | undefined }>;
} {
  const calls: Array<{ action: string; organizationId: Uuid | undefined }> = [];
  const access: AccessControl = {
    async can(_ctx, action, scope) {
      calls.push({
        action,
        organizationId: (scope as { organizationId?: Uuid } | undefined)
          ?.organizationId,
      });
      return granted.has(action);
    },
    async assignRole() {
      throw new Error("not used");
    },
  };
  return { access, calls };
}

/** A snapshot of the store's project and folder maps, to assert no change. */
function snapshot(store: InMemoryContentStore): {
  projects: number;
  folders: number;
} {
  return { projects: store.projects.size, folders: store.folders.size };
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

const uuid = fc.uuid() as fc.Arbitrary<Uuid>;
// A valid Project/Folder name is 1..255 characters (R5.1, R5.2, R5.8), so name
// validity never masks the permission gate under test.
const validName = fc.string({ minLength: 1, maxLength: 255 });

/* -------------------------------------------------------------------------
 * Property 16
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 16: Create permission is required for projects and folders", () => {
  it("createProject succeeds iff the evaluator grants create permission, else AUTHORIZATION_DENIED with no resource created", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuid,
        uuid,
        validName,
        fc.boolean(),
        async (orgId, memberId, name, allowed) => {
          const store = new InMemoryContentStore();
          const grant = allowed
            ? new Set([CREATE_PROJECT_PERMISSION])
            : new Set<string>();
          const { access, calls } = decisionAccess(grant);
          let counter = 0;
          const svc = new ContentService({
            store,
            access,
            newId: (): Uuid => `id-${++counter}` as Uuid,
          });
          const actor: AuthContext = { memberId };

          const before = snapshot(store);
          if (allowed) {
            const project = await svc.createProject(actor, orgId, name);
            expect(project.organizationId).toBe(orgId);
            expect(project.name).toBe(name);
            expect(store.projects.get(project.id)).toBeDefined();
            expect(store.projects.size).toBe(1);
          } else {
            await expect(
              svc.createProject(actor, orgId, name),
            ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
            // Denial creates nothing.
            expect(store.projects.size).toBe(before.projects);
            expect(store.projects.size).toBe(0);
          }
          // The gate was consulted for the create-project permission in the
          // owning Organization's scope.
          expect(calls).toContainEqual({
            action: CREATE_PROJECT_PERMISSION,
            organizationId: orgId,
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it("createFolder succeeds iff the evaluator grants create permission, else AUTHORIZATION_DENIED with no resource created", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuid,
        uuid,
        validName,
        fc.boolean(),
        async (orgId, memberId, name, allowed) => {
          const store = new InMemoryContentStore();
          // The Project must exist so that a NOT_FOUND path never masks the
          // permission gate on the allowed branch. Seed it directly.
          const project: ProjectRecord = {
            id: "project-1" as Uuid,
            organizationId: orgId,
            name: "seed",
            createdAt: "2024-01-01T00:00:00.000Z",
          };
          store.projects.set(project.id, project);

          const grant = allowed
            ? new Set([CREATE_FOLDER_PERMISSION])
            : new Set<string>();
          const { access, calls } = decisionAccess(grant);
          let counter = 0;
          const svc = new ContentService({
            store,
            access,
            newId: (): Uuid => `folder-${++counter}` as Uuid,
          });
          const actor: AuthContext = { memberId };
          const parent = { organizationId: orgId, projectId: project.id };

          const before = snapshot(store);
          if (allowed) {
            const folder = await svc.createFolder(actor, parent, name);
            expect(folder.projectId).toBe(project.id);
            expect(folder.name).toBe(name);
            expect(store.folders.get(folder.id)).toBeDefined();
            expect(store.folders.size).toBe(1);
          } else {
            await expect(
              svc.createFolder(actor, parent, name),
            ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
            // Denial creates nothing.
            expect(store.folders.size).toBe(before.folders);
            expect(store.folders.size).toBe(0);
          }
          // The gate was consulted for the create-folder permission in the
          // owning Organization's scope.
          expect(calls).toContainEqual({
            action: CREATE_FOLDER_PERMISSION,
            organizationId: orgId,
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});
