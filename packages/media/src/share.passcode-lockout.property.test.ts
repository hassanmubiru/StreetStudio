import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type { ShareLinkRecord, VideoRecord } from "@streetstudio/database";
import type { AccessControl, AuthContext, Clock } from "@streetstudio/auth";
import {
  ShareService,
  MAX_PASSCODE_ATTEMPTS,
  SHARE_LOCK_DURATION_MS,
  type ShareStore,
} from "./share.js";

/**
 * Property 49: Passcode-protected share access and lockout.
 *
 * Feature: streetstudio, Property 49: Passcode-protected share access and lockout
 *
 * Validates: Requirements 15.5, 15.6, 15.7
 *
 * For a passcode-protected share link and any sequence of resolve attempts
 * (each supplying either the matching or a non-matching passcode, interleaved
 * with arbitrary advances of an injectable clock):
 *
 *  - A matching passcode grants access to the bound Video whenever the link is
 *    not currently locked (R15.5).
 *  - A non-matching passcode is denied with the uniform non-disclosing error
 *    `SHARE_LINK_EXPIRED` and never grants access (R15.6).
 *  - After {@link MAX_PASSCODE_ATTEMPTS} (5) consecutive incorrect attempts the
 *    link is locked for at least {@link SHARE_LOCK_DURATION_MS} (15 minutes);
 *    every access attempt during the lock — including one presenting the correct
 *    passcode — is denied with `SHARE_LINK_LOCKED`. A correct passcode resets the
 *    consecutive-failure count, and counting restarts once a lock elapses
 *    (R15.7).
 *
 * The property drives the real {@link ShareService} against an in-memory store
 * and a mutable clock, replaying each attempt against an independent reference
 * model of the failure counter and lock window, and asserting the observed
 * outcome matches the model on every step.
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

/** In-memory {@link ShareStore} over a Map, with a resolvable Video. */
function memoryStore(): ShareStore {
  const links = new Map<Uuid, ShareLinkRecord>();
  const vid = video();
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

/** Grants only the share permission, isolating passcode/lockout behavior. */
const grantingAccess: AccessControl = {
  async can() {
    return true;
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
  advance(ms: number): void {
    this.t += ms;
  }
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

/** One resolve attempt: present the correct passcode or a wrong one, after
 * advancing the clock by some amount (bounded so both "still locked" and
 * "lock elapsed" transitions are exercised). */
interface Step {
  readonly correct: boolean;
  readonly advanceMs: number;
}

const step: fc.Arbitrary<Step> = fc.record({
  correct: fc.boolean(),
  // Up to ~20 minutes so advances can fall both inside and beyond a 15-min lock.
  advanceMs: fc.integer({ min: 0, max: 20 * 60 * 1000 }),
});

const passcode = fc.string({ minLength: 1, maxLength: 24 });

/* -------------------------------------------------------------------------
 * Property 49
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 49: Passcode-protected share access and lockout", () => {
  it("grants only on a matching passcode, denies non-matching, and locks for >=15 min after 5 consecutive failures", async () => {
    await fc.assert(
      fc.asyncProperty(
        passcode,
        fc.array(step, { minLength: 1, maxLength: 25 }),
        async (secret, steps) => {
          // A wrong passcode guaranteed distinct from the secret.
          const wrong = `${secret}#wrong`;

          const clock = new MutableClock(0);
          const svc = new ShareService({
            store: memoryStore(),
            access: grantingAccess,
            clock,
            newId: () => "00000000-0000-0000-0000-000000000001" as Uuid,
          });

          const dto = await svc.createLink(authCtx, VIDEO, { passcode: secret });

          // Reference model of the link's failure counter and lock window.
          let consecutiveFailures = 0;
          let lockedUntil: number | null = null;

          for (const s of steps) {
            clock.advance(s.advanceMs);
            const now = clock.now().getTime();

            const active = lockedUntil !== null && lockedUntil > now;

            const promise = svc.resolve(dto.credential, s.correct ? secret : wrong);

            if (active) {
              // R15.7: while locked, every attempt — even a correct one — is
              // blocked with the lock error, and nothing changes.
              await expect(promise).rejects.toBeInstanceOf(AppError);
              await expect(promise).rejects.toMatchObject({ code: "SHARE_LINK_LOCKED" });
              continue;
            }

            // An elapsed lock is cleared and consecutive counting restarts.
            if (lockedUntil !== null) {
              consecutiveFailures = 0;
              lockedUntil = null;
            }

            if (s.correct) {
              // R15.5: a matching passcode on an unlocked link grants access and
              // resets the consecutive-failure count.
              const access = await promise;
              expect(access.videoId).toBe(VIDEO);
              consecutiveFailures = 0;
              lockedUntil = null;
            } else {
              consecutiveFailures += 1;
              if (consecutiveFailures >= MAX_PASSCODE_ATTEMPTS) {
                // R15.7: the 5th consecutive incorrect attempt locks the link
                // for at least 15 minutes.
                await expect(promise).rejects.toBeInstanceOf(AppError);
                await expect(promise).rejects.toMatchObject({ code: "SHARE_LINK_LOCKED" });
                lockedUntil = now + SHARE_LOCK_DURATION_MS;
              } else {
                // R15.6: a non-matching passcode is denied without disclosure.
                await expect(promise).rejects.toBeInstanceOf(AppError);
                await expect(promise).rejects.toMatchObject({ code: "SHARE_LINK_EXPIRED" });
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("keeps a triggered lock blocking all access for the full 15-minute window (R15.7)", async () => {
    await fc.assert(
      fc.asyncProperty(
        passcode,
        // Any instant strictly inside the 15-minute lock window.
        fc.integer({ min: 0, max: SHARE_LOCK_DURATION_MS - 1 }),
        async (secret, withinLockMs) => {
          const wrong = `${secret}#wrong`;
          const clock = new MutableClock(0);
          const svc = new ShareService({
            store: memoryStore(),
            access: grantingAccess,
            clock,
            newId: () => "00000000-0000-0000-0000-000000000001" as Uuid,
          });

          const dto = await svc.createLink(authCtx, VIDEO, { passcode: secret });

          // Drive exactly 5 consecutive incorrect attempts to trip the lock.
          for (let i = 0; i < MAX_PASSCODE_ATTEMPTS - 1; i++) {
            await expect(svc.resolve(dto.credential, wrong)).rejects.toMatchObject({
              code: "SHARE_LINK_EXPIRED",
            });
          }
          await expect(svc.resolve(dto.credential, wrong)).rejects.toMatchObject({
            code: "SHARE_LINK_LOCKED",
          });

          // Anywhere inside the window, even the correct passcode is blocked.
          clock.advance(withinLockMs);
          await expect(svc.resolve(dto.credential, secret)).rejects.toMatchObject({
            code: "SHARE_LINK_LOCKED",
          });

          // After the full window elapses, the correct passcode is accepted.
          clock.advance(SHARE_LOCK_DURATION_MS - withinLockMs);
          const access = await svc.resolve(dto.credential, secret);
          expect(access.videoId).toBe(VIDEO);
        },
      ),
      { numRuns: 100 },
    );
  });
});
