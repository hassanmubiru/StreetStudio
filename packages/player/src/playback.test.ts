import { describe, it, expect, beforeEach } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type {
  RenditionRecord,
  VideoRecord,
} from "@streetstudio/database";
import type { AccessControl, AuthContext, Clock } from "@streetstudio/auth";
import {
  PlaybackService,
  VIEW_VIDEO_PERMISSION,
  type PlaybackStore,
  type ShareCredentialResolver,
  type ResolvedShare,
} from "./playback.js";

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

const ORG: Uuid = "11111111-1111-1111-1111-111111111111";
const VIDEO: Uuid = "22222222-2222-2222-2222-222222222222";
const MEMBER: Uuid = "33333333-3333-3333-3333-333333333333";

function readyVideo(overrides: Partial<VideoRecord> = {}): VideoRecord {
  return {
    id: VIDEO,
    organizationId: ORG,
    folderId: null,
    title: "demo",
    durationSeconds: 42,
    status: "ready",
    sourceObjectKey: "src/demo.mp4",
    developerMode: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renditions(): RenditionRecord[] {
  return [
    { id: "r1", videoId: VIDEO, quality: "1080p", objectKey: "k1", bitrate: 5_000_000 },
    { id: "r2", videoId: VIDEO, quality: "720p", objectKey: "k2", bitrate: 2_500_000 },
    { id: "r3", videoId: VIDEO, quality: "480p", objectKey: "k3", bitrate: 1_000_000 },
  ];
}

function storeOf(video: VideoRecord | null, rends: RenditionRecord[] = []): PlaybackStore {
  return {
    async findVideo() {
      return video;
    },
    async listRenditions() {
      return rends;
    },
  };
}

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

function resolverFor(mapping: ResolvedShare | null): ShareCredentialResolver {
  return {
    async resolve() {
      return mapping;
    },
  };
}

const fixedClock: Clock = { now: () => new Date("2024-06-01T00:00:00.000Z") };

const authCtx: AuthContext = { memberId: MEMBER };

function service(
  store: PlaybackStore,
  access: AccessControl,
  shareResolver: ShareCredentialResolver,
): PlaybackService {
  return new PlaybackService({ store, access, shareResolver, clock: fixedClock });
}

async function expectAppError(p: Promise<unknown>, code: string): Promise<void> {
  await expect(p).rejects.toMatchObject({ code });
  await expect(p).rejects.toBeInstanceOf(AppError);
}

/* -------------------------------------------------------------------------
 * Tests
 * ---------------------------------------------------------------------- */

describe("PlaybackService.getManifest", () => {
  it("returns a manifest referencing renditions when ready and view-permitted (R10.1)", async () => {
    const svc = service(storeOf(readyVideo(), renditions()), accessGranting(true), resolverFor(null));
    const manifest = await svc.getManifest({ auth: authCtx }, VIDEO);
    expect(manifest.videoId).toBe(VIDEO);
    expect(manifest.renditions).toHaveLength(3);
    expect(manifest.renditions[0]).toEqual({
      id: "r1",
      quality: "1080p",
      bitrate: 5_000_000,
      objectKey: "k1",
    });
  });

  it("denies with an authorization error when the requester lacks view permission (R10.2)", async () => {
    const svc = service(storeOf(readyVideo(), renditions()), accessGranting(false), resolverFor(null));
    await expectAppError(svc.getManifest({ auth: authCtx }, VIDEO), "AUTHORIZATION_DENIED");
  });

  it("denies with an authorization error when neither auth nor credential is presented (R10.2)", async () => {
    const svc = service(storeOf(readyVideo(), renditions()), accessGranting(false), resolverFor(null));
    await expectAppError(svc.getManifest({}, VIDEO), "AUTHORIZATION_DENIED");
  });

  it("reports the video is not available when it is not ready (R10.3)", async () => {
    const svc = service(
      storeOf(readyVideo({ status: "processing" }), renditions()),
      accessGranting(true),
      resolverFor(null),
    );
    await expectAppError(svc.getManifest({ auth: authCtx }, VIDEO), "VIDEO_NOT_READY");
  });

  it("grants playback for a valid share credential bound to the video (R10.4)", async () => {
    const svc = service(
      storeOf(readyVideo(), renditions()),
      accessGranting(false),
      resolverFor({ videoId: VIDEO }),
    );
    const manifest = await svc.getManifest({ shareCredential: "tok" }, VIDEO);
    expect(manifest.videoId).toBe(VIDEO);
  });

  it("denies a share credential that resolves to a different video (R10.5)", async () => {
    const svc = service(
      storeOf(readyVideo(), renditions()),
      accessGranting(false),
      resolverFor({ videoId: "99999999-9999-9999-9999-999999999999" }),
    );
    await expectAppError(svc.getManifest({ shareCredential: "tok" }, VIDEO), "SHARE_LINK_EXPIRED");
  });

  it("denies an invalid/expired/revoked share credential (R10.5)", async () => {
    const svc = service(storeOf(readyVideo(), renditions()), accessGranting(false), resolverFor(null));
    await expectAppError(svc.getManifest({ shareCredential: "bad" }, VIDEO), "SHARE_LINK_EXPIRED");
  });

  it("does not reveal readiness to unauthorized requesters (auth checked before ready)", async () => {
    const svc = service(
      storeOf(readyVideo({ status: "processing" }), renditions()),
      accessGranting(false),
      resolverFor(null),
    );
    await expectAppError(svc.getManifest({ auth: authCtx }, VIDEO), "AUTHORIZATION_DENIED");
  });

  it("returns NOT_FOUND when the video does not exist", async () => {
    const svc = service(storeOf(null), accessGranting(true), resolverFor({ videoId: VIDEO }));
    await expectAppError(svc.getManifest({ auth: authCtx }, VIDEO), "NOT_FOUND");
  });
});
