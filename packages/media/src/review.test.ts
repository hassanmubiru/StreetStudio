import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { CommentDto, Uuid } from "@streetstudio/shared";
import type {
  PullRequestLinkRecord,
  VideoRecord,
} from "@streetstudio/database";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import {
  ReviewService,
  LINK_PULL_REQUEST_PERMISSION,
  type CommentPoster,
  type PrRef,
  type ReviewStore,
  type SourceControlAccess,
} from "./review.js";

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

const ORG: Uuid = "11111111-1111-1111-1111-111111111111";
const VIDEO: Uuid = "22222222-2222-2222-2222-222222222222";
const MEMBER: Uuid = "33333333-3333-3333-3333-333333333333";
const LINK: Uuid = "44444444-4444-4444-4444-444444444444";
const PLUGIN: Uuid = "55555555-5555-5555-5555-555555555555";

const actor: AuthContext = { memberId: MEMBER };
const pr: PrRef = { repositoryId: "repo-1", number: 7 };

function video(overrides: Partial<VideoRecord> = {}): VideoRecord {
  return {
    id: VIDEO,
    organizationId: ORG,
    folderId: null,
    title: "demo",
    durationSeconds: 100,
    status: "ready",
    sourceObjectKey: "src/demo.mp4",
    developerMode: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

interface Fakes {
  store: ReviewStore;
  links: PullRequestLinkRecord[];
}

function makeStore(opts: { video?: VideoRecord | null } = {}): Fakes {
  const links: PullRequestLinkRecord[] = [];
  const vid = opts.video === undefined ? video() : opts.video;
  const store: ReviewStore = {
    async findVideo(videoId) {
      return vid && vid.id === videoId ? vid : null;
    },
    async insertPullRequestLink(record) {
      links.push(record);
      return record;
    },
  };
  return { store, links };
}

const allowAll: AccessControl = {
  can: async () => true,
  assignRole: async () => {},
};
const denyAll: AccessControl = {
  can: async () => false,
  assignRole: async () => {},
};

/** Seam that resolves every PR through a fixed enabled plugin. */
const accessible: SourceControlAccess = {
  resolvePullRequest: async (ref) => ({
    pluginId: PLUGIN,
    prRef: `${ref.repositoryId}#${ref.number}`,
  }),
};
/** Seam that treats every PR as inaccessible (plugin disabled / unknown PR). */
const inaccessible: SourceControlAccess = {
  resolvePullRequest: async () => null,
};

/** Records delegated comment posts and returns a stub DTO. */
function makeCommentPoster(): {
  poster: CommentPoster;
  calls: Array<{ videoId: Uuid; body: string; timestamp?: number }>;
} {
  const calls: Array<{ videoId: Uuid; body: string; timestamp?: number }> = [];
  const poster: CommentPoster = {
    async post(_actor, videoId, body, timestamp) {
      calls.push({ videoId, body, timestamp });
      const dto: CommentDto = {
        id: "66666666-6666-6666-6666-666666666666",
        videoId,
        authorId: MEMBER,
        body,
        createdAt: "2024-01-01T00:00:00.000Z",
        ...(timestamp !== undefined ? { timestampSeconds: timestamp } : {}),
      };
      return dto;
    },
  };
  return { poster, calls };
}

function service(
  store: ReviewStore,
  access: AccessControl,
  sourceControl: SourceControlAccess,
  comments: CommentPoster,
) {
  return new ReviewService({
    store,
    access,
    sourceControl,
    comments,
    clock: { now: () => new Date("2024-01-01T00:00:00.000Z") },
    newId: () => LINK,
  });
}

/* -------------------------------------------------------------------------
 * Sanity checks
 * ---------------------------------------------------------------------- */

describe("ReviewService.linkPullRequest", () => {
  it("stores an association for an accessible PR with link permission (R24.1, R24.2)", async () => {
    const fakes = makeStore();
    const { poster } = makeCommentPoster();
    const dto = await service(fakes.store, allowAll, accessible, poster).linkPullRequest(
      actor,
      VIDEO,
      pr,
    );
    expect(dto).toMatchObject({
      id: LINK,
      videoId: VIDEO,
      pluginId: PLUGIN,
      prRef: "repo-1#7",
    });
    expect(fakes.links).toHaveLength(1);
  });

  it("rejects an inaccessible PR with NOT_FOUND and stores nothing (R24.4)", async () => {
    const fakes = makeStore();
    const { poster } = makeCommentPoster();
    await expect(
      service(fakes.store, allowAll, inaccessible, poster).linkPullRequest(
        actor,
        VIDEO,
        pr,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fakes.links).toHaveLength(0);
  });

  it("denies linking without link permission and stores nothing (R24.6)", async () => {
    const fakes = makeStore();
    const { poster } = makeCommentPoster();
    await expect(
      service(fakes.store, denyAll, accessible, poster).linkPullRequest(
        actor,
        VIDEO,
        pr,
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(fakes.links).toHaveLength(0);
  });

  it("does not probe accessibility when link permission is denied (R24.6)", async () => {
    const fakes = makeStore();
    const { poster } = makeCommentPoster();
    let probed = false;
    const spy: SourceControlAccess = {
      resolvePullRequest: async () => {
        probed = true;
        return { pluginId: PLUGIN, prRef: "x" };
      },
    };
    await expect(
      service(fakes.store, denyAll, spy, poster).linkPullRequest(actor, VIDEO, pr),
    ).rejects.toBeInstanceOf(AppError);
    expect(probed).toBe(false);
  });

  it("raises NOT_FOUND for an unknown Video", async () => {
    const fakes = makeStore({ video: null });
    const { poster } = makeCommentPoster();
    await expect(
      service(fakes.store, allowAll, accessible, poster).linkPullRequest(
        actor,
        VIDEO,
        pr,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fakes.links).toHaveLength(0);
  });

  it("exposes the link-permission token", () => {
    expect(LINK_PULL_REQUEST_PERMISSION).toBe("content:link_pr");
  });
});

describe("ReviewService.postReviewComment", () => {
  it("delegates to the Comment machinery with the referenced timestamp (R24.3)", async () => {
    const fakes = makeStore();
    const { poster, calls } = makeCommentPoster();
    const dto = await service(fakes.store, allowAll, accessible, poster).postReviewComment(
      actor,
      VIDEO,
      "looks good at this frame",
      42,
    );
    expect(calls).toEqual([
      { videoId: VIDEO, body: "looks good at this frame", timestamp: 42 },
    ]);
    expect(dto).toMatchObject({ videoId: VIDEO, timestampSeconds: 42 });
  });

  it("propagates VALIDATION_FAILED from the Comment machinery for a bad body/timestamp (R24.5)", async () => {
    const fakes = makeStore();
    const rejecting: CommentPoster = {
      post: async () => {
        throw new AppError("VALIDATION_FAILED");
      },
    };
    await expect(
      service(fakes.store, allowAll, accessible, rejecting).postReviewComment(
        actor,
        VIDEO,
        "",
        -1,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
