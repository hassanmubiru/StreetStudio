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
import {
  ContentService,
  CREATE_FOLDER_PERMISSION,
  CREATE_PROJECT_PERMISSION,
  MAX_FOLDER_NESTING_DEPTH,
  type ContentStore,
} from "./content.js";

/**
 * Property 14: Folder nesting is bounded at depth 10.
 *
 * Feature: streetstudio, Property 14: Folder nesting is bounded at depth 10
 *
 * Validates: Requirements 5.3
 *
 * Folders may be nested up to a maximum of 10 Folder levels. Folder depth is
 * 0-based, so the permitted levels occupy depths 0..MAX_FOLDER_NESTING_DEPTH − 1
 * (0..9) and the deepest legal Folder sits at depth 9. For any nesting chain:
 *
 *  - Creating Folders down a chain succeeds for every level whose resulting
 *    depth is strictly less than MAX_FOLDER_NESTING_DEPTH (the 10 levels
 *    0..9), and each created Folder reports the expected depth.
 *  - Creating a Folder that would reach depth MAX_FOLDER_NESTING_DEPTH (an
 *    11th level, depth 10) is rejected with `VALIDATION_FAILED` and no Folder
 *    is persisted for that attempt.
 *
 * This generalizes the fixed-chain sanity check in content.test.ts across
 * chains built to arbitrary depths within and at the boundary.
 */

/* -------------------------------------------------------------------------
 * Test doubles (logic-only; no database).
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

/** An {@link AccessControl} that grants a fixed allowlist of actions. */
function grantingAccess(granted: Set<string>): AccessControl {
  return {
    async can(_ctx, action) {
      return granted.has(action);
    },
    async assignRole() {
      throw new Error("not used");
    },
  };
}

const ACTOR = { memberId: "member-1" as Uuid };

/** Deterministic id generator for stable assertions. */
function sequentialIds(): () => Uuid {
  let n = 0;
  return () => `id-${++n}` as Uuid;
}

describe("Property 14: Folder nesting is bounded at depth 10", () => {
  function fresh(): { store: InMemoryContentStore; svc: ContentService } {
    const store = new InMemoryContentStore();
    const svc = new ContentService({
      store,
      access: grantingAccess(
        new Set([CREATE_PROJECT_PERMISSION, CREATE_FOLDER_PERMISSION]),
      ),
      newId: sequentialIds(),
    });
    return { store, svc };
  }

  it("allows nesting for every level 0..9 and reports the expected depth", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        // levels: how many Folders to create in the chain, 1..10 (depths 0..9).
        fc.integer({ min: 1, max: MAX_FOLDER_NESTING_DEPTH }),
        async (orgId, levels) => {
          const { store, svc } = fresh();
          const project = await svc.createProject(
            ACTOR,
            orgId as Uuid,
            "host-project",
          );

          let parentId: Uuid | undefined;
          for (let expectedDepth = 0; expectedDepth < levels; expectedDepth++) {
            const folder = await svc.createFolder(
              ACTOR,
              {
                organizationId: orgId as Uuid,
                projectId: project.id,
                folderId: parentId,
              },
              `f${expectedDepth}`,
            );
            // Each created Folder sits one level deeper than its parent.
            expect(folder.depth).toBe(expectedDepth);
            if (expectedDepth === 0) {
              expect(folder.parentFolderId).toBeUndefined();
            } else {
              expect(folder.parentFolderId).toBe(parentId);
            }
            parentId = folder.id;
          }

          // The whole chain (all `levels` Folders) was persisted.
          expect(store.folders.size).toBe(levels);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects the 11th level (depth 10) with VALIDATION_FAILED and persists nothing for it", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        // Name of the too-deep folder is irrelevant to the boundary; vary it.
        fc.string({ minLength: 1, maxLength: 20, unit: "grapheme-ascii" }),
        async (orgId, tooDeepName) => {
          const { store, svc } = fresh();
          const project = await svc.createProject(
            ACTOR,
            orgId as Uuid,
            "host-project",
          );

          // Build a full legal chain of 10 Folders (depths 0..9).
          let parentId: Uuid | undefined;
          for (
            let depth = 0;
            depth < MAX_FOLDER_NESTING_DEPTH;
            depth++
          ) {
            const folder = await svc.createFolder(
              ACTOR,
              {
                organizationId: orgId as Uuid,
                projectId: project.id,
                folderId: parentId,
              },
              `f${depth}`,
            );
            parentId = folder.id;
          }
          expect(store.folders.size).toBe(MAX_FOLDER_NESTING_DEPTH);

          // The deepest legal Folder is at depth 9.
          expect(store.folders.get(parentId as Uuid)?.depth).toBe(
            MAX_FOLDER_NESTING_DEPTH - 1,
          );

          // An 11th level (depth 10) is rejected and nothing new is persisted.
          await expect(
            svc.createFolder(
              ACTOR,
              {
                organizationId: orgId as Uuid,
                projectId: project.id,
                folderId: parentId,
              },
              tooDeepName,
            ),
          ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
          await expect(
            svc.createFolder(
              ACTOR,
              {
                organizationId: orgId as Uuid,
                projectId: project.id,
                folderId: parentId,
              },
              tooDeepName,
            ),
          ).rejects.toBeInstanceOf(AppError);

          expect(store.folders.size).toBe(MAX_FOLDER_NESTING_DEPTH);
        },
      ),
      { numRuns: 100 },
    );
  });
});
