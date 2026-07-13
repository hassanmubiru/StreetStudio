import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { Uuid, VideoStatus } from "@streetstudio/shared";
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
  type ContentStore,
  type FolderRef,
} from "./content.js";

/**
 * Property 15: Video moves preserve identity and associations within the
 * organization.
 *
 * Feature: streetstudio, Property 15: Video moves preserve identity and associations within the organization
 *
 * Validates: Requirements 5.4, 5.7
 *
 * For any Video (with associated comments, transcripts, and permissions):
 *
 *  - Moving it to another Folder in the *same* Organization preserves its
 *    identity (`id`), its `organizationId`, and every other field, changing
 *    only `folderId` to the destination (R5.4). Because comments, transcripts,
 *    and permissions are keyed by the Video's id, and the id is preserved, all
 *    associations remain resolvable after the move.
 *  - Moving it to a Folder *outside* its Organization is rejected with
 *    `NOT_FOUND`, and the Video's location (`folderId`) is left unchanged
 *    (R5.7).
 *
 * This generalizes the two fixed-example move checks in content.test.ts across
 * arbitrary Videos, field values, source/destination folders, and identifiers.
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

/** Deterministic id generator so created projects/folders get stable ids. */
function sequentialIds(): () => Uuid {
  let n = 0;
  return () => `id-${++n}` as Uuid;
}

const VIDEO_STATUSES: readonly VideoStatus[] = [
  "uploading",
  "queued",
  "processing",
  "ready",
  "failed",
];

/**
 * An arbitrary Video record scoped to `organizationId` with `folderId`. All
 * remaining fields (title, duration, status, source key, developer flag,
 * timestamp) are generated freely so preservation is checked across the whole
 * record, not a single fixed shape.
 */
function videoArb(
  organizationId: Uuid,
  folderId: Uuid | null,
): fc.Arbitrary<VideoRecord> {
  return fc.record({
    id: fc.uuid().map((s) => s as Uuid),
    title: fc.string(),
    durationSeconds: fc.integer({ min: 0, max: 100_000 }),
    status: fc.constantFrom(...VIDEO_STATUSES),
    sourceObjectKey: fc.option(fc.string(), { nil: null }),
    developerMode: fc.boolean(),
    createdAt: fc
      .date({
        min: new Date("2000-01-01T00:00:00.000Z"),
        max: new Date("2100-01-01T00:00:00.000Z"),
      })
      .map((d) => d.toISOString()),
  }).map((partial) => ({
    id: partial.id,
    organizationId,
    folderId,
    title: partial.title,
    durationSeconds: partial.durationSeconds,
    status: partial.status,
    sourceObjectKey: partial.sourceObjectKey,
    developerMode: partial.developerMode,
    createdAt: partial.createdAt,
  }));
}

/** Two distinct organization ids. */
const twoOrgIds: fc.Arbitrary<readonly [Uuid, Uuid]> = fc
  .tuple(fc.uuid(), fc.uuid())
  .filter(([a, b]) => a !== b)
  .map(([a, b]) => [a as Uuid, b as Uuid] as const);

describe("Property 15: Video moves preserve identity and associations within the organization", () => {
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

  // Scenario: an Organization, whether the Video starts in a source Folder,
  // and an arbitrary Video owned by that Organization.
  const sameOrgScenario = fc
    .record({ orgId: fc.uuid(), startInSourceFolder: fc.boolean() })
    .chain(({ orgId, startInSourceFolder }) =>
      videoArb(orgId as Uuid, null).map((video) => ({
        orgId: orgId as Uuid,
        startInSourceFolder,
        video,
      })),
    );

  it("preserves identity, organizationId, and all other fields on a same-organization move (only folderId changes)", async () => {
    await fc.assert(
      fc.asyncProperty(
        sameOrgScenario,
        async ({ orgId, startInSourceFolder, video: videoTemplate }) => {
          const { store, svc } = fresh();

          // A Project and destination Folder in the same Organization.
          const project = await svc.createProject(ACTOR, orgId, "project");
          const dest = await svc.createFolder(
            ACTOR,
            { organizationId: orgId, projectId: project.id },
            "destination",
          );

          // Optionally start the Video in a distinct source Folder.
          let initialFolderId: Uuid | null = null;
          if (startInSourceFolder) {
            const source = await svc.createFolder(
              ACTOR,
              { organizationId: orgId, projectId: project.id },
              "source",
            );
            initialFolderId = source.id;
          }

          const video: VideoRecord = {
            ...videoTemplate,
            folderId: initialFolderId,
          };
          store.videos.set(video.id, video);

          // Associations are keyed by the Video's id (comments, transcripts,
          // permissions). Their preservation follows from id preservation.
          const comments = new Map<Uuid, string[]>([
            [video.id, ["c1", "c2"]],
          ]);
          const transcripts = new Map<Uuid, string>([[video.id, "hello"]]);
          const permissions = new Map<Uuid, Set<string>>([
            [video.id, new Set(["view", "comment"])],
          ]);

          const target: FolderRef = {
            organizationId: orgId,
            projectId: project.id,
            folderId: dest.id,
          };
          const moved = await svc.moveVideo(ACTOR, video.id, target);

          // Identity and ownership preserved; only folderId changed.
          expect(moved.id).toBe(video.id);
          expect(moved.organizationId).toBe(orgId);
          expect(moved.folderId).toBe(dest.id);

          // Every other field is preserved verbatim.
          expect(moved.title).toBe(video.title);
          expect(moved.durationSeconds).toBe(video.durationSeconds);
          expect(moved.status).toBe(video.status);
          expect(moved.developerMode).toBe(video.developerMode);
          expect(moved.createdAt).toBe(video.createdAt);

          // The persisted record matches the original save for folderId.
          const stored = store.videos.get(video.id);
          expect(stored).toBeDefined();
          expect(stored).toEqual({ ...video, folderId: dest.id });

          // Associations keyed by the (unchanged) id remain resolvable.
          expect(comments.get(moved.id)).toEqual(["c1", "c2"]);
          expect(transcripts.get(moved.id)).toBe("hello");
          expect(permissions.get(moved.id)).toEqual(
            new Set(["view", "comment"]),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  // Scenario: two distinct Organizations, whether the Video starts in a source
  // Folder, and an arbitrary Video owned by the first Organization.
  const crossOrgScenario = fc
    .record({ orgs: twoOrgIds, startInSourceFolder: fc.boolean() })
    .chain(({ orgs, startInSourceFolder }) =>
      videoArb(orgs[0], null).map((video) => ({
        orgs,
        startInSourceFolder,
        video,
      })),
    );

  it("rejects a cross-organization move with NOT_FOUND and leaves the video location unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(
        crossOrgScenario,
        async ({ orgs, startInSourceFolder, video: videoTemplate }) => {
          const [videoOrg, otherOrg] = orgs;
          const { store, svc } = fresh();

          // The Video lives in videoOrg, optionally inside a source Folder.
          const homeProject = await svc.createProject(
            ACTOR,
            videoOrg,
            "home",
          );
          let initialFolderId: Uuid | null = null;
          if (startInSourceFolder) {
            const source = await svc.createFolder(
              ACTOR,
              { organizationId: videoOrg, projectId: homeProject.id },
              "source",
            );
            initialFolderId = source.id;
          }
          const video: VideoRecord = {
            ...videoTemplate,
            folderId: initialFolderId,
          };
          store.videos.set(video.id, video);

          // The destination Folder lives in a *different* Organization.
          const otherProject = await svc.createProject(
            ACTOR,
            otherOrg,
            "other",
          );
          const destOther = await svc.createFolder(
            ACTOR,
            { organizationId: otherOrg, projectId: otherProject.id },
            "dest-other",
          );

          const target: FolderRef = {
            organizationId: otherOrg,
            projectId: otherProject.id,
            folderId: destOther.id,
          };

          await expect(
            svc.moveVideo(ACTOR, video.id, target),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
          await expect(
            svc.moveVideo(ACTOR, video.id, target),
          ).rejects.toBeInstanceOf(AppError);

          // Location (and the whole record) is unchanged.
          const stored = store.videos.get(video.id);
          expect(stored).toBeDefined();
          expect(stored?.folderId).toBe(initialFolderId);
          expect(stored).toEqual(video);
        },
      ),
      { numRuns: 100 },
    );
  });
});
