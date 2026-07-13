import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type {
  Repositories,
  RenditionRecord,
  ShareLinkRecord,
  VideoRecord,
} from "@streetstudio/database";
import type { AccessControl, AuthContext, Clock } from "@streetstudio/auth";
import {
  PlaybackService,
  repositoryShareCredentialResolver,
  type PlaybackStore,
} from "./playback.js";

/**
 * Property 31: Share-credential playback is granted only for valid credentials.
 *
 * Feature: streetstudio, Property 31: Share-credential playback is granted only for valid credentials
 *
 * Validates: Requirements 10.4, 10.5
 *
 * For any Video with secure sharing enabled and any presented share credential,
 * playback via {@link PlaybackService.getManifest} is granted IF AND ONLY IF the
 * credential is valid (resolves to an existing share link bound to the Video),
 * unexpired (no expiry, or an expiry strictly after `now`), and not revoked
 * (R10.4). An expired, revoked, unknown, or otherwise invalid credential — or a
 * credential bound to a different Video — is denied with the share-credential
 * error (`SHARE_LINK_EXPIRED`) and yields no manifest (R10.5).
 *
 * The requester in this property presents only a share credential (no `auth`),
 * so the authorization decision is driven entirely by credential validity. The
 * real {@link repositoryShareCredentialResolver} evaluates validity, so the full
 * "evaluate validity, then grant/deny playback" chain is exercised.
 */

/* -------------------------------------------------------------------------
 * Fixtures & test doubles
 * ---------------------------------------------------------------------- */

const ORG: Uuid = "11111111-1111-1111-1111-111111111111";
const TARGET_VIDEO: Uuid = "22222222-2222-2222-2222-222222222222";
const OTHER_VIDEO: Uuid = "99999999-9999-9999-9999-999999999999";

const NOW = new Date("2024-06-01T00:00:00.000Z");
const fixedClock: Clock = { now: () => NOW };

function readyVideo(): VideoRecord {
  return {
    id: TARGET_VIDEO,
    organizationId: ORG,
    folderId: null,
    title: "demo",
    durationSeconds: 42,
    status: "ready",
    sourceObjectKey: "src/demo.mp4",
    developerMode: false,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

function renditions(): RenditionRecord[] {
  return [
    { id: "r1", videoId: TARGET_VIDEO, quality: "1080p", objectKey: "k1", bitrate: 5_000_000 },
    { id: "r2", videoId: TARGET_VIDEO, quality: "720p", objectKey: "k2", bitrate: 2_500_000 },
  ];
}

const readyStore: PlaybackStore = {
  async findVideo() {
    return readyVideo();
  },
  async listRenditions() {
    return renditions();
  },
};

/** An {@link AccessControl} that never grants view permission, so playback can
 * only ever be authorized via a share credential (isolates the property). */
const denyingAccess: AccessControl = {
  async can() {
    return false;
  },
  async assignRole() {
    throw new Error("not used");
  },
};

/** Build the real credential resolver over an in-memory set of share links. */
function resolverOver(links: ShareLinkRecord[]) {
  const repos = {
    shareLinks: {
      async list(): Promise<ShareLinkRecord[]> {
        return links;
      },
    },
  } as unknown as Pick<Repositories, "shareLinks">;
  return repositoryShareCredentialResolver(repos);
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

/** The stored share link's credential (a valid, non-empty token). */
const credential = fc.string({ minLength: 1, maxLength: 40 });

/** How the stored link's expiry relates to `now`. */
type Expiry = "none" | "past" | "future";
const expiryChoice = fc.constantFrom<Expiry>("none", "past", "future");

function expiresAtFor(choice: Expiry): string | null {
  switch (choice) {
    case "none":
      return null;
    case "past":
      return new Date(NOW.getTime() - 60_000).toISOString();
    case "future":
      return new Date(NOW.getTime() + 60_000).toISOString();
  }
}

/* -------------------------------------------------------------------------
 * Property 31
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 31: Share-credential playback is granted only for valid credentials", () => {
  it("grants playback iff the presented credential is valid, unexpired, not revoked, and bound to the Video; otherwise SHARE_LINK_EXPIRED and no manifest", async () => {
    await fc.assert(
      fc.asyncProperty(
        credential,
        fc.boolean(), // presentMatching: present the stored credential vs. an unknown one
        fc.boolean(), // revoked
        expiryChoice,
        fc.boolean(), // boundToTarget: link points at the requested Video vs. another
        async (linkCredential, presentMatching, revoked, expiry, boundToTarget) => {
          const link: ShareLinkRecord = {
            id: "share-1" as Uuid,
            videoId: boundToTarget ? TARGET_VIDEO : OTHER_VIDEO,
            credential: linkCredential,
            expiresAt: expiresAtFor(expiry),
            passcodeHash: null,
            revokedAt: revoked ? new Date(NOW.getTime() - 120_000).toISOString() : null,
            failedAttempts: 0,
            lockedUntil: null,
          };

          // A guaranteed-distinct credential for the "unknown credential" case.
          const presented = presentMatching ? linkCredential : `${linkCredential}#unknown`;

          const svc = new PlaybackService({
            store: readyStore,
            access: denyingAccess,
            shareResolver: resolverOver([link]),
            clock: fixedClock,
          });

          // A credential grants playback exactly when it is presented (matches a
          // stored link), the link is not revoked, is unexpired, and is bound to
          // the requested Video.
          const expectedGranted =
            presentMatching && !revoked && expiry !== "past" && boundToTarget;

          const promise = svc.getManifest({ shareCredential: presented }, TARGET_VIDEO);

          if (expectedGranted) {
            const manifest = await promise;
            expect(manifest.videoId).toBe(TARGET_VIDEO);
            expect(manifest.renditions).toHaveLength(2);
          } else {
            await expect(promise).rejects.toBeInstanceOf(AppError);
            await expect(promise).rejects.toMatchObject({ code: "SHARE_LINK_EXPIRED" });
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
