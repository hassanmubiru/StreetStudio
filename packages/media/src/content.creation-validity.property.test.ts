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
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  type ContentStore,
} from "./content.js";

/**
 * Property 13: Project and folder creation validity and scoping.
 *
 * Feature: streetstudio, Property 13: Project and folder creation validity and scoping
 *
 * Validates: Requirements 5.1, 5.2, 5.8
 *
 * For any Project or Folder name, creation by a permitted Member succeeds if and
 * only if the name length is within [NAME_MIN_LENGTH, NAME_MAX_LENGTH] (1..255):
 *
 *  - A valid name (R5.1, R5.2) yields a created resource scoped to its parent
 *    Organization (Project) or Project (Folder), and the store holds exactly one
 *    new record carrying that name.
 *  - An invalid name — empty or longer than 255 characters (R5.8) — is rejected
 *    with `VALIDATION_FAILED` and leaves the store untouched (nothing created).
 *
 * This generalizes the fixed-example sanity checks in content.test.ts across
 * arbitrary names, name lengths, and identifiers.
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

/**
 * A name of an arbitrary length within [min, max] built from arbitrary
 * (non-empty) characters. Guarantees the produced string's *length* — the only
 * thing the validity rule inspects — lands exactly in the requested range.
 */
function nameOfLength(min: number, max: number): fc.Arbitrary<string> {
  return fc
    .integer({ min, max })
    .chain((len) =>
      fc.string({ minLength: len, maxLength: len, unit: "grapheme-ascii" }),
    )
    .filter((s) => s.length >= min && s.length <= max);
}

/** A valid name: 1..255 characters. */
const validName = nameOfLength(NAME_MIN_LENGTH, NAME_MAX_LENGTH);

/** An invalid name: empty, or strictly longer than 255 characters. */
const invalidName = fc.oneof(
  fc.constant(""),
  nameOfLength(NAME_MAX_LENGTH + 1, NAME_MAX_LENGTH + 50),
);

describe("Property 13: Project and folder creation validity and scoping", () => {
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

  it("creates a Project with a valid (1..255) name scoped to its Organization", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), validName, async (orgId, name) => {
        const { store, svc } = fresh();
        const project = await svc.createProject(ACTOR, orgId as Uuid, name);

        // Scoped to the organization and carries the submitted name.
        expect(project.organizationId).toBe(orgId);
        expect(project.name).toBe(name);

        // Exactly one Project persisted, and it is the returned one.
        expect(store.projects.size).toBe(1);
        const stored = store.projects.get(project.id);
        expect(stored).toBeDefined();
        expect(stored?.organizationId).toBe(orgId);
        expect(stored?.name).toBe(name);
      }),
      { numRuns: 100 },
    );
  });

  it("rejects a Project with an empty or >255 name and creates nothing", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), invalidName, async (orgId, name) => {
        const { store, svc } = fresh();
        await expect(
          svc.createProject(ACTOR, orgId as Uuid, name),
        ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
        await expect(
          svc.createProject(ACTOR, orgId as Uuid, name),
        ).rejects.toBeInstanceOf(AppError);

        // Nothing was created.
        expect(store.projects.size).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it("creates a Folder with a valid (1..255) name scoped to its Project", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), validName, async (orgId, name) => {
        const { store, svc } = fresh();
        const project = await svc.createProject(
          ACTOR,
          orgId as Uuid,
          "host-project",
        );

        const folder = await svc.createFolder(
          ACTOR,
          { organizationId: orgId as Uuid, projectId: project.id },
          name,
        );

        // Scoped to the parent Project, root-level, carries the name.
        expect(folder.projectId).toBe(project.id);
        expect(folder.name).toBe(name);
        expect(folder.depth).toBe(0);

        // Exactly one Folder persisted, and it is the returned one.
        expect(store.folders.size).toBe(1);
        const stored = store.folders.get(folder.id);
        expect(stored).toBeDefined();
        expect(stored?.projectId).toBe(project.id);
        expect(stored?.name).toBe(name);
      }),
      { numRuns: 100 },
    );
  });

  it("rejects a Folder with an empty or >255 name and creates nothing", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), invalidName, async (orgId, name) => {
        const { store, svc } = fresh();
        const project = await svc.createProject(
          ACTOR,
          orgId as Uuid,
          "host-project",
        );

        await expect(
          svc.createFolder(
            ACTOR,
            { organizationId: orgId as Uuid, projectId: project.id },
            name,
          ),
        ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

        // No Folder was created (the Project remains the only content record).
        expect(store.folders.size).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});
