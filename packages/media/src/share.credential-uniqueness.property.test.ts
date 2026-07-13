import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Uuid } from "@streetstudio/shared";
import type { ShareLinkRecord, VideoRecord } from "@streetstudio/database";
import type { AccessControl, AuthContext, Clock } from "@streetstudio/auth";
import { ShareService, SHARE_VIDEO_PERMISSION, type ShareStore } from "./share.js";

/**
 * Property 46: Share credentials are globally unique.
 *
 * Feature: streetstudio, Property 46: Share credentials are globally unique
 *
 * Validates: Requirements 15.1
 *
 * When a Member with share permission creates a share link for a Video, the
 * minted share credential is unique across all active share links (R15.1).
 * This property drives {@link ShareService.createLink} many times over an
 * arbitrary sequence of Videos and share options (some expiring, some
 * passcode-protected, some open) against a single shared {@link ShareStore},
 * then asserts:
 *
 *  - every credential returned is distinct from every other — no two active
 *    share links share the same credential (globally unique across all links,
 *    not merely per-Video);
 *  - each credential resolves through the store back to exactly the link it was
 *    minted for (so the credential is a genuine, collision-free key).
 */

/* -------------------------------------------------------------------------
 * Fixtures & test doubles
 * ---------------------------------------------------------------------- */

const ORG: Uuid = "11111111-1111-1111-1111-111111111111";
const MEMBER: Uuid = "33333333-3333-3333-3333-333333333333";

const authCtx: AuthContext = { memberId: MEMBER };

/** A fixed pool of Videos share links may be created against. */
const VIDEO_IDS: readonly Uuid[] = [
  "22222222-2222-2222-2222-222222222201",
  "22222222-2222-2222-2222-222222222202",
  "22222222-2222-2222-2222-222222222203",
  "22222222-2222-2222-2222-222222222204",
] as const;

function video(id: Uuid): VideoRecord {
  return {
    id,
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

/**
 * In-memory {@link ShareStore} over a Map holding many resolvable Videos. Its
 * {@link ShareStore.findByCredential} spans every stored link, so the service's
 * global-uniqueness check sees all previously minted credentials.
 */
function memoryStore(videos: Map<Uuid, VideoRecord>): ShareStore {
  const links = new Map<Uuid, ShareLinkRecord>();
  return {
    async insert(record) {
      links.set(record.id, { ...record });
      return record;
    },
    async findByCredential(credential) {
      for (const l of links.values()) {
        if (l.credential === credential) return { ...l };
      }
      return null;
    },
    async findById(id) {
      const l = links.get(id);
      return l ? { ...l } : null;
    },
    async findVideo(videoId) {
      return videos.get(videoId) ?? null;
    },
    async update(record) {
      links.set(record.id, { ...record });
      return record;
    },
  };
}

/** An {@link AccessControl} that grants only the share-video permission. */
const grantingAccess: AccessControl = {
  async can(_ctx: AuthContext, action: string) {
    return action === SHARE_VIDEO_PERMISSION;
  },
  async assignRole() {
    throw new Error("not used");
  },
};

/** A fixed clock; expiry values in this property are never in the past. */
const fixedClock: Clock = {
  now: () => new Date(0),
};

function serviceWith(store: ShareStore): ShareService {
  let n = 0;
  return new ShareService({
    store,
    access: grantingAccess,
    clock: fixedClock,
    // Deterministic, distinct ids so each created link is uniquely keyed.
    newId: () =>
      `00000000-0000-0000-0000-${String(n++).padStart(12, "0")}` as Uuid,
  });
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

/**
 * One share-link creation request: a target Video (by index into the pool) and
 * optional expiry / passcode. Covers open links, expiring links, and
 * passcode-protected links so credential generation is exercised across the
 * full option space (R15.1).
 */
const createRequest = fc.record({
  videoIndex: fc.integer({ min: 0, max: VIDEO_IDS.length - 1 }),
  expiresInMs: fc.option(fc.integer({ min: 1, max: 10_000_000 }), {
    nil: undefined,
  }),
  passcode: fc.option(fc.string({ minLength: 1, maxLength: 12 }), {
    nil: undefined,
  }),
});

/** A batch of many creation requests over the shared store. */
const createRequests = fc.array(createRequest, { minLength: 1, maxLength: 40 });

/* -------------------------------------------------------------------------
 * Property 46
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 46: Share credentials are globally unique", () => {
  it("mints credentials that are all distinct across arbitrary Videos and options, each resolving to its own link (R15.1)", async () => {
    await fc.assert(
      fc.asyncProperty(createRequests, async (requests) => {
        const videos = new Map<Uuid, VideoRecord>(
          VIDEO_IDS.map((id) => [id, video(id)] as const),
        );
        const store = memoryStore(videos);
        const svc = serviceWith(store);

        const credentials: string[] = [];
        const credentialToLinkId = new Map<string, Uuid>();

        for (const req of requests) {
          const videoId = VIDEO_IDS[req.videoIndex]!;
          const dto = await svc.createLink(authCtx, videoId, {
            ...(req.expiresInMs !== undefined
              ? { expiresAt: new Date(req.expiresInMs) }
              : {}),
            ...(req.passcode !== undefined ? { passcode: req.passcode } : {}),
          });
          credentials.push(dto.credential);
          credentialToLinkId.set(dto.credential, dto.id);
        }

        // Globally unique: no credential is repeated across all active links.
        const distinct = new Set(credentials);
        expect(distinct.size).toBe(credentials.length);

        // Each credential is a genuine key: it resolves through the store to
        // exactly the link it was minted for.
        for (const [credential, linkId] of credentialToLinkId) {
          const found = await store.findByCredential(credential);
          expect(found).not.toBeNull();
          expect(found!.id).toBe(linkId);
        }
      }),
      { numRuns: 100 },
    );
  });
});
