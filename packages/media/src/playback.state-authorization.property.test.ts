import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { Uuid, VideoStatus } from "@streetstudio/shared";
import type { RenditionRecord, VideoRecord } from "@streetstudio/database";
import type { AccessControl, AuthContext, Clock } from "@streetstudio/auth";
import {
  PlaybackService,
  VIEW_VIDEO_PERMISSION,
  type PlaybackStore,
  type ShareCredentialResolver,
} from "./playback.js";

/**
 * Property 30: Playback requires ready state and authorization.
 *
 * Feature: streetstudio, Property 30: Playback requires ready state and authorization
 *
 * Validates: Requirements 10.1, 10.2, 10.3
 *
 * For an arbitrary playback request by an authenticated Member,
 * {@link PlaybackService.getManifest} returns a streaming manifest referencing
 * the Video's adaptive-bitrate renditions IF AND ONLY IF the Video is in the
 * `ready` state AND the requester holds view permission (R10.1). Otherwise no
 * manifest is produced and an appropriate {@link AppError} is raised:
 *
 *  - A requester lacking view permission is denied with `AUTHORIZATION_DENIED`
 *    and receives no manifest, regardless of the Video's status. Because
 *    authorization is evaluated before readiness, an unauthorized requester
 *    never learns the Video's processing state (R10.2).
 *  - A view-permitted requester asking for a Video in any non-`ready` status
 *    receives `VIDEO_NOT_READY` and no manifest (R10.3).
 *
 * Share credentials are out of scope here (they are exercised by Property 31),
 * so requests carry only `auth` and never a share credential.
 */

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

/**
 * A {@link PlaybackStore} serving a single, fixed Video and its renditions.
 * The store never consults tenancy or readiness — that logic lives in the
 * service under test — so it faithfully isolates the property.
 */
function storeOf(
  video: VideoRecord,
  rends: readonly RenditionRecord[],
): PlaybackStore {
  return {
    async findVideo() {
      return video;
    },
    async listRenditions() {
      return [...rends];
    },
  };
}

/**
 * An {@link AccessControl} that grants exactly the view permission when
 * `granted` is true, and denies everything otherwise. Assigning roles is never
 * exercised by playback.
 */
function accessGranting(granted: boolean): AccessControl {
  return {
    async can(_ctx: AuthContext, action: string) {
      return granted && action === VIEW_VIDEO_PERMISSION;
    },
    async assignRole() {
      throw new Error("not used");
    },
  };
}

/**
 * A resolver that is never expected to be consulted in this property (requests
 * carry no share credential); it throws if it ever is, guarding the isolation.
 */
const unusedResolver: ShareCredentialResolver = {
  async resolve() {
    throw new Error("share resolver must not be consulted for Property 30");
  },
};

const fixedClock: Clock = { now: () => new Date("2024-06-01T00:00:00.000Z") };

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

const uuid = fc.uuid() as fc.Arbitrary<Uuid>;

const ALL_STATUSES: readonly VideoStatus[] = [
  "uploading",
  "queued",
  "processing",
  "ready",
  "failed",
];

const status: fc.Arbitrary<VideoStatus> = fc.constantFrom(...ALL_STATUSES);

/** A Video record with the given id, org, and status. */
function videoOf(id: Uuid, organizationId: Uuid, s: VideoStatus): VideoRecord {
  return {
    id,
    organizationId,
    folderId: null,
    title: "demo",
    durationSeconds: 42,
    status: s,
    sourceObjectKey: "src/demo.mp4",
    developerMode: false,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

/** An arbitrary, possibly-empty list of renditions bound to `videoId`. */
function renditionsFor(videoId: Uuid): fc.Arbitrary<RenditionRecord[]> {
  return fc
    .array(
      fc.record({
        id: uuid,
        quality: fc.constantFrom("2160p", "1080p", "720p", "480p", "360p"),
        bitrate: fc.integer({ min: 100_000, max: 20_000_000 }),
        objectKey: fc.string({ minLength: 1, maxLength: 40 }),
      }),
      { maxLength: 5 },
    )
    .map((rows) =>
      rows.map(
        (r): RenditionRecord => ({
          id: r.id,
          videoId,
          quality: r.quality,
          bitrate: r.bitrate,
          objectKey: r.objectKey,
        }),
      ),
    );
}

/* -------------------------------------------------------------------------
 * Property 30
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 30: Playback requires ready state and authorization", () => {
  it("returns a manifest iff the Video is ready and the requester holds view permission; otherwise no manifest and an appropriate error", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuid, // organizationId
        uuid, // videoId
        uuid, // memberId
        status, // Video status (ready or otherwise)
        fc.boolean(), // whether view permission is granted
        fc
          .uuid()
          .chain((vid) =>
            fc.tuple(fc.constant(vid as Uuid), renditionsFor(vid as Uuid)),
          ),
        async (orgId, _seedVideoId, memberId, s, permitted, [videoId, rends]) => {
          const video = videoOf(videoId, orgId, s);
          const svc = new PlaybackService({
            store: storeOf(video, rends),
            access: accessGranting(permitted),
            shareResolver: unusedResolver,
            clock: fixedClock,
          });
          const ctx = { auth: { memberId } as AuthContext };

          const result = svc.getManifest(ctx, videoId);

          if (s === "ready" && permitted) {
            // Manifest is provided, referencing exactly the Video's renditions.
            const manifest = await result;
            expect(manifest.videoId).toBe(videoId);
            expect(manifest.renditions).toHaveLength(rends.length);
            expect(manifest.renditions).toEqual(
              rends.map((r) => ({
                id: r.id,
                quality: r.quality,
                bitrate: r.bitrate,
                objectKey: r.objectKey,
              })),
            );
          } else if (!permitted) {
            // No view permission → authorization error, no manifest, and the
            // Video's readiness is never revealed (auth checked before ready).
            await expect(result).rejects.toBeInstanceOf(AppError);
            await expect(result).rejects.toMatchObject({
              code: "AUTHORIZATION_DENIED",
            });
          } else {
            // Permitted but not ready → not-available error and no manifest.
            await expect(result).rejects.toBeInstanceOf(AppError);
            await expect(result).rejects.toMatchObject({
              code: "VIDEO_NOT_READY",
            });
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
