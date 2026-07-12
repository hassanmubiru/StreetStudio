import { describe, it, expect, beforeEach } from "vitest";
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

const ORG_A = "org-a" as Uuid;
const ORG_B = "org-b" as Uuid;
const ACTOR = { memberId: "member-1" as Uuid };

/** Deterministic id generator for stable assertions. */
function sequentialIds(): () => Uuid {
  let n = 0;
  return () => `id-${++n}` as Uuid;
}

describe("ContentService", () => {
  let store: InMemoryContentStore;

  beforeEach(() => {
    store = new InMemoryContentStore();
  });

  function service(actions: string[]): ContentService {
    return new ContentService({
      store,
      access: grantingAccess(new Set(actions)),
      newId: sequentialIds(),
    });
  }

  it("creates a Project scoped to the organization with create permission", async () => {
    const svc = service([CREATE_PROJECT_PERMISSION]);
    const project = await svc.createProject(ACTOR, ORG_A, "Launch");
    expect(project.organizationId).toBe(ORG_A);
    expect(project.name).toBe("Launch");
    expect(store.projects.get(project.id)).toBeDefined();
  });

  it("rejects an empty or over-long name without creating a Project", async () => {
    const svc = service([CREATE_PROJECT_PERMISSION]);
    await expect(svc.createProject(ACTOR, ORG_A, "")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(
      svc.createProject(ACTOR, ORG_A, "x".repeat(256)),
    ).rejects.toBeInstanceOf(AppError);
    expect(store.projects.size).toBe(0);
    // Boundary length 255 is accepted.
    const ok = await svc.createProject(ACTOR, ORG_A, "x".repeat(255));
    expect(ok.name.length).toBe(255);
  });

  it("denies Project creation without create permission and creates nothing", async () => {
    const svc = service([]); // no permissions granted
    await expect(
      svc.createProject(ACTOR, ORG_A, "Launch"),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(store.projects.size).toBe(0);
  });

  it("creates a Folder under a Project and nests folders with increasing depth", async () => {
    const svc = service([CREATE_PROJECT_PERMISSION, CREATE_FOLDER_PERMISSION]);
    const project = await svc.createProject(ACTOR, ORG_A, "P");
    const root = await svc.createFolder(
      ACTOR,
      { organizationId: ORG_A, projectId: project.id },
      "root",
    );
    expect(root.depth).toBe(0);
    const child = await svc.createFolder(
      ACTOR,
      { organizationId: ORG_A, projectId: project.id, folderId: root.id },
      "child",
    );
    expect(child.depth).toBe(1);
    expect(child.parentFolderId).toBe(root.id);
  });

  it("enforces the maximum folder nesting depth of 10 levels", async () => {
    const svc = service([CREATE_PROJECT_PERMISSION, CREATE_FOLDER_PERMISSION]);
    const project = await svc.createProject(ACTOR, ORG_A, "P");
    let parentId: Uuid | undefined;
    // Create depths 0..9 (10 levels) — all valid.
    for (let depth = 0; depth < MAX_FOLDER_NESTING_DEPTH; depth++) {
      const folder = await svc.createFolder(
        ACTOR,
        { organizationId: ORG_A, projectId: project.id, folderId: parentId },
        `f${depth}`,
      );
      expect(folder.depth).toBe(depth);
      parentId = folder.id;
    }
    // An 11th level (depth 10) is rejected.
    await expect(
      svc.createFolder(
        ACTOR,
        { organizationId: ORG_A, projectId: project.id, folderId: parentId },
        "too-deep",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("moves a Video within the same organization, preserving its identity", async () => {
    const svc = service([CREATE_PROJECT_PERMISSION, CREATE_FOLDER_PERMISSION]);
    const project = await svc.createProject(ACTOR, ORG_A, "P");
    const dest = await svc.createFolder(
      ACTOR,
      { organizationId: ORG_A, projectId: project.id },
      "dest",
    );
    const video: VideoRecord = {
      id: "video-1" as Uuid,
      organizationId: ORG_A,
      folderId: null,
      title: "Demo",
      durationSeconds: 12,
      status: "ready",
      sourceObjectKey: "key",
      developerMode: false,
      createdAt: "2024-01-01T00:00:00.000Z" as never,
    };
    store.videos.set(video.id, video);

    const moved = await svc.moveVideo(ACTOR, video.id, {
      organizationId: ORG_A,
      projectId: project.id,
      folderId: dest.id,
    });
    expect(moved.id).toBe("video-1");
    expect(moved.organizationId).toBe(ORG_A);
    expect(moved.folderId).toBe(dest.id);
    // The persisted record keeps its identity and other fields.
    expect(store.videos.get(video.id)?.sourceObjectKey).toBe("key");
  });

  it("rejects a cross-organization move and preserves the video location", async () => {
    const svc = service([CREATE_PROJECT_PERMISSION, CREATE_FOLDER_PERMISSION]);
    // Destination folder lives in ORG_B.
    const projectB = await svc.createProject(ACTOR, ORG_B, "PB");
    const destB = await svc.createFolder(
      ACTOR,
      { organizationId: ORG_B, projectId: projectB.id },
      "destB",
    );
    // Video lives in ORG_A.
    const video: VideoRecord = {
      id: "video-x" as Uuid,
      organizationId: ORG_A,
      folderId: null,
      title: "Demo",
      durationSeconds: 3,
      status: "ready",
      sourceObjectKey: null,
      developerMode: false,
      createdAt: "2024-01-01T00:00:00.000Z" as never,
    };
    store.videos.set(video.id, video);

    await expect(
      svc.moveVideo(ACTOR, video.id, {
        organizationId: ORG_B,
        projectId: projectB.id,
        folderId: destB.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Location unchanged.
    expect(store.videos.get(video.id)?.folderId).toBeNull();
  });

  it("creates a Workspace scoped to the organization", async () => {
    const svc = service([]);
    const ws = await svc.createWorkspace(ACTOR, ORG_A, "Team Space");
    expect(ws.organizationId).toBe(ORG_A);
    expect(ws.name).toBe("Team Space");
    expect(store.workspaces.get(ws.id)).toBeDefined();
  });
});
