import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type { ShareLinkRecord, VideoRecord } from "@streetstudio/database";
import type { AccessControl, AuthContext, Clock } from "@streetstudio/auth";
import {
  ShareService,
  ContentPermissionGuard,
  Sha256PasscodeHasher,
  SHARE_VIDEO_PERMISSION,
  MAX_PASSCODE_ATTEMPTS,
  SHARE_LOCK_DURATION_MS,
  type ShareStore,
} from "./share.js";

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

const ORG: Uuid = "11111111-1111-1111-1111-111111111111";
const VIDEO: Uuid = "22222222-2222-2222-2222-222222222222";
const MEMBER: Uuid = "33333333-3333-3333-3333-333333333333";

const authCtx: AuthContext = { memberId: MEMBER };

function video(overrides: Partial<VideoRecord> = {}): VideoRecord {
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

/** In-memory {@link ShareStore} over a Map, with a resolvable Video. */
function memoryStore(vid: VideoRecord | null = video()): ShareStore {
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
      return vid && vid.id === videoId ? vid : null;
    },
    async update(record) {
      links.set(record.id, { ...record });
      return record;
    },
  };
}

function accessGranting(granted: boolean): AccessControl {
  return {
    async can(_ctx: AuthContext, action: string) {
      return granted && action === SHARE_VIDEO_PERMISSION;
    },
    async assignRole() {
      throw new Error("not used");
    },
  };
}

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

/** A deterministic credential generator returning a fixed sequence. */
function sequenceGenerator(values: string[]): () => string {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

async function expectAppError(p: Promise<unknown>, code: string): Promise<void> {
  await expect(p).rejects.toMatchObject({ code });
  await expect(p).rejects.toBeInstanceOf(AppError);
}

function serviceWith(
  store: ShareStore,
  access: AccessControl,
  clock: Clock,
  generateCredential?: () => string,
): ShareService {
  let n = 0;
  return new ShareService({
    store,
    access,
    clock,
    newId: () => `00000000-0000-0000-0000-00000000000${n++}` as Uuid,
    ...(generateCredential ? { generateCredential } : {}),
  });
}

/* -------------------------------------------------------------------------
 * createLink
 * ---------------------------------------------------------------------- */

describe("ShareService.createLink", () => {
  it("returns a credential and gates on share permission (R15.1)", async () => {
    const svc = serviceWith(memoryStore(), accessGranting(true), new MutableClock(0));
    const dto = await svc.createLink(authCtx, VIDEO);
    expect(dto.videoId).toBe(VIDEO);
    expect(dto.credential.length).toBeGreaterThan(0);
    expect(dto.passcodeProtected).toBe(false);
  });

  it("denies creation when the actor lacks share permission (R15.1)", async () => {
    const svc = serviceWith(memoryStore(), accessGranting(false), new MutableClock(0));
    await expectAppError(svc.createLink(authCtx, VIDEO), "AUTHORIZATION_DENIED");
  });

  it("returns NOT_FOUND for an unknown video", async () => {
    const svc = serviceWith(memoryStore(null), accessGranting(true), new MutableClock(0));
    await expectAppError(svc.createLink(authCtx, VIDEO), "NOT_FOUND");
  });

  it("mints a credential unique across existing links (R15.1)", async () => {
    const store = memoryStore();
    // First candidate collides with an existing link's credential; the second
    // is unique and must be chosen.
    const svc = serviceWith(
      store,
      accessGranting(true),
      new MutableClock(0),
      sequenceGenerator(["dup", "dup", "unique"]),
    );
    const first = await svc.createLink(authCtx, VIDEO);
    expect(first.credential).toBe("dup");
    const second = await svc.createLink(authCtx, VIDEO);
    expect(second.credential).toBe("unique");
  });

  it("stores the passcode as a hash, never the plaintext (R15.5)", async () => {
    const store = memoryStore();
    const captured: ShareLinkRecord[] = [];
    const wrapped: ShareStore = {
      ...store,
      async insert(record) {
        captured.push(record);
        return store.insert(record);
      },
    };
    const svc = serviceWith(wrapped, accessGranting(true), new MutableClock(0));
    const dto = await svc.createLink(authCtx, VIDEO, { passcode: "s3cret" });
    expect(dto.passcodeProtected).toBe(true);
    expect(captured[0]!.passcodeHash).not.toBeNull();
    expect(captured[0]!.passcodeHash).not.toContain("s3cret");
  });

  it("rejects an empty passcode (R15.5)", async () => {
    const svc = serviceWith(memoryStore(), accessGranting(true), new MutableClock(0));
    await expectAppError(svc.createLink(authCtx, VIDEO, { passcode: "" }), "VALIDATION_FAILED");
  });
});

/* -------------------------------------------------------------------------
 * resolve — expiry & revocation
 * ---------------------------------------------------------------------- */

describe("ShareService.resolve expiry and revocation", () => {
  it("grants access for an open, valid link (R15.5)", async () => {
    const clock = new MutableClock(0);
    const svc = serviceWith(memoryStore(), accessGranting(true), clock);
    const dto = await svc.createLink(authCtx, VIDEO);
    const access = await svc.resolve(dto.credential);
    expect(access.videoId).toBe(VIDEO);
  });

  it("denies access at or after the expiry (R15.2)", async () => {
    const clock = new MutableClock(0);
    const svc = serviceWith(memoryStore(), accessGranting(true), clock);
    const dto = await svc.createLink(authCtx, VIDEO, {
      expiresAt: new Date(60_000),
    });
    // Before expiry: granted.
    await expect(svc.resolve(dto.credential)).resolves.toEqual({ videoId: VIDEO });
    // At/after expiry: denied with no change to the video.
    clock.advance(60_000);
    await expectAppError(svc.resolve(dto.credential), "SHARE_LINK_EXPIRED");
  });

  it("denies every access after revocation (R15.3)", async () => {
    const clock = new MutableClock(0);
    const svc = serviceWith(memoryStore(), accessGranting(true), clock);
    const dto = await svc.createLink(authCtx, VIDEO);
    await svc.revoke(authCtx, dto.id);
    await expectAppError(svc.resolve(dto.credential), "SHARE_LINK_EXPIRED");
  });

  it("revoke denies when the actor lacks share permission", async () => {
    const clock = new MutableClock(0);
    const store = memoryStore();
    const granting = serviceWith(store, accessGranting(true), clock);
    const dto = await granting.createLink(authCtx, VIDEO);
    const denying = serviceWith(store, accessGranting(false), clock);
    await expectAppError(denying.revoke(authCtx, dto.id), "AUTHORIZATION_DENIED");
  });

  it("denies an unknown credential without disclosure (R15.6)", async () => {
    const svc = serviceWith(memoryStore(), accessGranting(true), new MutableClock(0));
    await expectAppError(svc.resolve("never-issued"), "SHARE_LINK_EXPIRED");
  });
});

/* -------------------------------------------------------------------------
 * resolve — passcode & lockout
 * ---------------------------------------------------------------------- */

describe("ShareService.resolve passcode and lockout", () => {
  it("grants access only on a matching passcode (R15.5, R15.6)", async () => {
    const svc = serviceWith(memoryStore(), accessGranting(true), new MutableClock(0));
    const dto = await svc.createLink(authCtx, VIDEO, { passcode: "open-sesame" });
    await expectAppError(svc.resolve(dto.credential, "wrong"), "SHARE_LINK_EXPIRED");
    await expect(svc.resolve(dto.credential, "open-sesame")).resolves.toEqual({
      videoId: VIDEO,
    });
  });

  it("locks the link for >=15 min after 5 consecutive incorrect attempts (R15.7)", async () => {
    const clock = new MutableClock(0);
    const svc = serviceWith(memoryStore(), accessGranting(true), clock);
    const dto = await svc.createLink(authCtx, VIDEO, { passcode: "pw" });

    // Attempts 1..4 report invalid passcode.
    for (let i = 0; i < MAX_PASSCODE_ATTEMPTS - 1; i++) {
      await expectAppError(svc.resolve(dto.credential, "bad"), "SHARE_LINK_EXPIRED");
    }
    // The 5th consecutive incorrect attempt locks the link.
    await expectAppError(svc.resolve(dto.credential, "bad"), "SHARE_LINK_LOCKED");
    // A correct passcode is still blocked while locked.
    await expectAppError(svc.resolve(dto.credential, "pw"), "SHARE_LINK_LOCKED");

    // Still locked just before the 15-minute deadline.
    clock.advance(SHARE_LOCK_DURATION_MS - 1);
    await expectAppError(svc.resolve(dto.credential, "pw"), "SHARE_LINK_LOCKED");

    // After the lock elapses, a correct passcode is accepted again.
    clock.advance(1);
    await expect(svc.resolve(dto.credential, "pw")).resolves.toEqual({
      videoId: VIDEO,
    });
  });

  it("resets the consecutive-failure count on a correct passcode (R15.5)", async () => {
    const svc = serviceWith(memoryStore(), accessGranting(true), new MutableClock(0));
    const dto = await svc.createLink(authCtx, VIDEO, { passcode: "pw" });
    // Four failures then a success resets the counter.
    for (let i = 0; i < 4; i++) {
      await expectAppError(svc.resolve(dto.credential, "bad"), "SHARE_LINK_EXPIRED");
    }
    await expect(svc.resolve(dto.credential, "pw")).resolves.toEqual({ videoId: VIDEO });
    // A fresh failure does not immediately lock (counter was reset).
    await expectAppError(svc.resolve(dto.credential, "bad"), "SHARE_LINK_EXPIRED");
  });
});

/* -------------------------------------------------------------------------
 * ContentPermissionGuard (R15.4)
 * ---------------------------------------------------------------------- */

describe("ContentPermissionGuard.enforce", () => {
  it("resolves when the requester holds content permission (R15.4)", async () => {
    const guard = new ContentPermissionGuard({
      async can() {
        return true;
      },
      async assignRole() {
        throw new Error("not used");
      },
    });
    await expect(
      guard.enforce(authCtx, "content:view_video", { organizationId: ORG, type: "video", id: VIDEO }),
    ).resolves.toBeUndefined();
  });

  it("denies with AUTHORIZATION_DENIED and makes no change on denial (R15.4)", async () => {
    const guard = new ContentPermissionGuard({
      async can() {
        return false;
      },
      async assignRole() {
        throw new Error("not used");
      },
    });
    await expectAppError(
      guard.enforce(authCtx, "content:edit_comment", { organizationId: ORG, type: "comment", id: VIDEO }),
      "AUTHORIZATION_DENIED",
    );
  });
});

/* -------------------------------------------------------------------------
 * Sha256PasscodeHasher
 * ---------------------------------------------------------------------- */

describe("Sha256PasscodeHasher", () => {
  it("verifies the correct passcode and rejects others without storing plaintext", () => {
    const hasher = new Sha256PasscodeHasher();
    const stored = hasher.hash("hunter2");
    expect(stored).not.toContain("hunter2");
    expect(hasher.verify(stored, "hunter2")).toBe(true);
    expect(hasher.verify(stored, "hunter3")).toBe(false);
  });
});
