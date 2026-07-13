import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type { ShareLinkRecord, VideoRecord } from "@streetstudio/database";
import type { AccessControl, AuthContext, Clock } from "@streetstudio/auth";
import { ShareService, SHARE_VIDEO_PERMISSION, type ShareStore } from "./share.js";

/**
 * Property 47: Share link expiry and revocation deny access.
 *
 * Feature: streetstudio, Property 47: Share link expiry and revocation deny access
 *
 * Validates: Requirements 15.2, 15.3
 *
 * For any share link created over a Video, resolving the link through
 * {@link ShareService.resolve}:
 *
 *  - is DENIED with `SHARE_LINK_EXPIRED` and no change to the Video whenever the
 *    (injectable) clock is at or after the link's configured expiry (R15.2);
 *  - is DENIED with `SHARE_LINK_EXPIRED` on every subsequent attempt once the
 *    link has been revoked (R15.3), regardless of expiry;
 *  - is GRANTED (resolves to the bound Video) IF AND ONLY IF the link is neither
 *    revoked nor at/after its expiry.
 *
 * The link is open (no passcode) so the grant/deny decision is driven purely by
 * expiry and revocation. The property snapshots the Video before and after each
 * denied access and asserts it is byte-for-byte unchanged (R15.2, R15.3 "make no
 * change to the Video").
 */

/* -------------------------------------------------------------------------
 * Fixtures & test doubles
 * ---------------------------------------------------------------------- */

const ORG: Uuid = "11111111-1111-1111-1111-111111111111";
const VIDEO: Uuid = "22222222-2222-2222-2222-222222222222";
const MEMBER: Uuid = "33333333-3333-3333-3333-333333333333";

const authCtx: AuthContext = { memberId: MEMBER };

function video(): VideoRecord {
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
  };
}

/** In-memory {@link ShareStore} over a Map, holding a single resolvable Video. */
function memoryStore(vid: VideoRecord): ShareStore {
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
      return vid.id === videoId ? vid : null;
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

/** A clock whose instant can be advanced during a test. */
class MutableClock implements Clock {
  constructor(private t: number) {}
  now(): Date {
    return new Date(this.t);
  }
  set(ms: number): void {
    this.t = ms;
  }
}

function serviceWith(store: ShareStore, clock: Clock): ShareService {
  let n = 0;
  return new ShareService({
    store,
    access: grantingAccess,
    clock,
    newId: () => `00000000-0000-0000-0000-00000000000${n++}` as Uuid,
  });
}

async function expectExpiredDenial(p: Promise<unknown>): Promise<void> {
  await expect(p).rejects.toBeInstanceOf(AppError);
  await expect(p).rejects.toMatchObject({ code: "SHARE_LINK_EXPIRED" });
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

/** The link is created at instant 0; its expiry is this many ms later (>0). */
const expiryMs = fc.integer({ min: 1, max: 10_000_000 });
/** The instant at which access is attempted. */
const accessMs = fc.integer({ min: 0, max: 10_000_000 });

/* -------------------------------------------------------------------------
 * Property 47
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 47: Share link expiry and revocation deny access", () => {
  it("denies access at/after expiry (R15.2) and on every access after revocation (R15.3) with no change to the Video; grants otherwise", async () => {
    await fc.assert(
      fc.asyncProperty(
        expiryMs,
        accessMs,
        fc.boolean(), // whether the link is revoked before access
        async (expiry, access, revoked) => {
          const vid = video();
          const clock = new MutableClock(0);
          const store = memoryStore(vid);
          const svc = serviceWith(store, clock);

          // Snapshot the Video at creation time to detect any later mutation.
          const before = JSON.stringify(vid);

          const dto = await svc.createLink(authCtx, VIDEO, {
            expiresAt: new Date(expiry),
          });

          if (revoked) {
            await svc.revoke(authCtx, dto.id);
          }

          // Position the clock at the access instant.
          clock.set(access);

          // A revoked link is always denied (R15.3). Otherwise the link is
          // denied exactly when the clock is at or after its expiry (R15.2).
          const expired = access >= expiry;
          const expectedGranted = !revoked && !expired;

          if (expectedGranted) {
            await expect(svc.resolve(dto.credential)).resolves.toEqual({
              videoId: VIDEO,
            });
          } else {
            // R15.3: every subsequent access through a revoked (or expired)
            // link is denied — assert repeatedly.
            await expectExpiredDenial(svc.resolve(dto.credential));
            await expectExpiredDenial(svc.resolve(dto.credential));
            // R15.2/R15.3: the Video is unchanged on denial.
            expect(JSON.stringify(vid)).toBe(before);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
