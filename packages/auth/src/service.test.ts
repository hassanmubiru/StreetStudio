import { describe, it, expect, beforeEach } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { MemberRecord, SessionRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import { AuthService, type LockoutPolicy } from "./service.js";
import { Argon2idPasswordHasher, type PasswordHasher } from "./password-hasher.js";
import { HmacAccessTokenIssuer } from "./tokens.js";
import type { AuthStores, MemberStore, SessionStore } from "./stores.js";
import { normalizeEmail } from "./stores.js";
import type { Clock } from "./clock.js";

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

/** A deterministic, fast password hasher for logic tests (not for security). */
const fakeHasher: PasswordHasher = {
  hash: async (password) => `fake:${password}`,
  verify: async (hash, password) => hash === `fake:${password}`,
};

class InMemoryMemberStore implements MemberStore {
  readonly byId = new Map<Uuid, MemberRecord>();

  async findByEmail(email: string): Promise<MemberRecord | null> {
    const normalized = normalizeEmail(email);
    for (const m of this.byId.values()) {
      if (normalizeEmail(m.email) === normalized) return m;
    }
    return null;
  }
  async findById(id: Uuid): Promise<MemberRecord | null> {
    return this.byId.get(id) ?? null;
  }
  async create(record: MemberRecord): Promise<MemberRecord> {
    this.byId.set(record.id, record);
    return record;
  }
}

class InMemorySessionStore implements SessionStore {
  readonly byId = new Map<Uuid, SessionRecord>();

  async create(record: SessionRecord): Promise<SessionRecord> {
    this.byId.set(record.id, record);
    return record;
  }
  async findById(id: Uuid): Promise<SessionRecord | null> {
    return this.byId.get(id) ?? null;
  }
  async invalidate(id: Uuid): Promise<void> {
    this.byId.delete(id);
  }
}

/** A clock whose "now" the test controls. */
class MutableClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  set(date: Date): void {
    this.current = date;
  }
  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

const TEST_SECRET = "test-signing-secret-at-least-32-chars-long!";
const T0 = new Date("2024-01-01T00:00:00.000Z");

function makeService(overrides?: {
  clock?: MutableClock;
  lockoutPolicy?: LockoutPolicy;
  accessTokenTtlSeconds?: number;
  ids?: () => Uuid;
}): {
  service: AuthService;
  stores: AuthStores;
  members: InMemoryMemberStore;
  sessions: InMemorySessionStore;
  clock: MutableClock;
} {
  const members = new InMemoryMemberStore();
  const sessions = new InMemorySessionStore();
  const stores: AuthStores = { members, sessions };
  const clock = overrides?.clock ?? new MutableClock(new Date(T0));

  let counter = 0;
  const newId = overrides?.ids ?? ((): Uuid => `id-${++counter}`);

  const service = new AuthService({
    stores,
    passwordHasher: fakeHasher,
    tokenIssuer: new HmacAccessTokenIssuer(TEST_SECRET, clock),
    clock,
    newId,
    ...(overrides?.accessTokenTtlSeconds !== undefined
      ? { accessTokenTtlSeconds: overrides.accessTokenTtlSeconds }
      : {}),
    ...(overrides?.lockoutPolicy ? { lockoutPolicy: overrides.lockoutPolicy } : {}),
  });

  return { service, stores, members, sessions, clock };
}

/* -------------------------------------------------------------------------
 * register
 * ---------------------------------------------------------------------- */

describe("AuthService.register", () => {
  it("creates a member and returns a DTO without the password hash", async () => {
    const { service, members } = makeService();

    const dto = await service.register({
      email: "Alice@Example.com",
      password: "correct horse",
    });

    expect(dto.email).toBe("alice@example.com"); // normalized
    expect(dto.id).toBeTruthy();
    expect("passwordHash" in dto).toBe(false);

    const stored = members.byId.get(dto.id);
    expect(stored).toBeDefined();
    // Never stores plaintext.
    expect(stored?.passwordHash).not.toBe("correct horse");
    expect(stored?.passwordHash).toBe("fake:correct horse");
  });

  it("rejects a password shorter than 8 characters with REGISTRATION_FAILED", async () => {
    const { service } = makeService();
    await expect(
      service.register({ email: "bob@example.com", password: "short7!" }),
    ).rejects.toMatchObject({ code: "REGISTRATION_FAILED" });
  });

  it("rejects a syntactically invalid email with REGISTRATION_FAILED", async () => {
    const { service } = makeService();
    await expect(
      service.register({ email: "not-an-email", password: "longenough" }),
    ).rejects.toMatchObject({ code: "REGISTRATION_FAILED" });
  });

  it("rejects a duplicate email (case-insensitive) with REGISTRATION_FAILED", async () => {
    const { service } = makeService();
    await service.register({ email: "dup@example.com", password: "password1" });
    await expect(
      service.register({ email: "DUP@example.com", password: "password2" }),
    ).rejects.toMatchObject({ code: "REGISTRATION_FAILED" });
  });
});

/* -------------------------------------------------------------------------
 * login
 * ---------------------------------------------------------------------- */

describe("AuthService.login", () => {
  it("issues a token and session for valid credentials, expiring within 15 minutes", async () => {
    const { service, sessions } = makeService();
    await service.register({ email: "a@example.com", password: "password1" });

    const result = await service.login({
      email: "a@example.com",
      password: "password1",
    });

    expect(result.accessToken.split(".")).toHaveLength(3);
    expect(result.sessionId).toBeTruthy();
    expect(sessions.byId.has(result.sessionId)).toBe(true);

    const expiresAt = new Date(result.expiresAt).getTime();
    const ttlSeconds = (expiresAt - T0.getTime()) / 1000;
    expect(ttlSeconds).toBeGreaterThan(0);
    expect(ttlSeconds).toBeLessThanOrEqual(15 * 60);
  });

  it("clamps an over-long requested TTL to 15 minutes", async () => {
    const { service } = makeService({ accessTokenTtlSeconds: 60 * 60 });
    await service.register({ email: "a@example.com", password: "password1" });
    const result = await service.login({
      email: "a@example.com",
      password: "password1",
    });
    const ttlSeconds = (new Date(result.expiresAt).getTime() - T0.getTime()) / 1000;
    expect(ttlSeconds).toBe(15 * 60);
  });

  it("rejects a wrong password with a uniform AUTHENTICATION_FAILED error", async () => {
    const { service } = makeService();
    await service.register({ email: "a@example.com", password: "password1" });
    await expect(
      service.login({ email: "a@example.com", password: "wrongpass" }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });

  it("rejects an unknown email with the same error as a wrong password", async () => {
    const { service } = makeService();
    await service.register({ email: "a@example.com", password: "password1" });

    const wrongPassword = await service
      .login({ email: "a@example.com", password: "wrongpass" })
      .catch((e) => e as AppError);
    const unknownEmail = await service
      .login({ email: "ghost@example.com", password: "password1" })
      .catch((e) => e as AppError);

    expect(wrongPassword).toBeInstanceOf(AppError);
    expect(unknownEmail).toBeInstanceOf(AppError);
    expect(unknownEmail.code).toBe(wrongPassword.code);
    expect(unknownEmail.message).toBe(wrongPassword.message);
    expect(unknownEmail.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------
 * verifyAccessToken + logout
 * ---------------------------------------------------------------------- */

describe("AuthService.verifyAccessToken", () => {
  it("resolves the member and session for a valid token", async () => {
    const { service } = makeService();
    const member = await service.register({
      email: "a@example.com",
      password: "password1",
    });
    const { accessToken, sessionId } = await service.login({
      email: "a@example.com",
      password: "password1",
    });

    const ctx = await service.verifyAccessToken(accessToken);
    expect(ctx.memberId).toBe(member.id);
    expect(ctx.sessionId).toBe(sessionId);
  });

  it("rejects a token after the session is invalidated by logout", async () => {
    const { service } = makeService();
    await service.register({ email: "a@example.com", password: "password1" });
    const { accessToken, sessionId } = await service.login({
      email: "a@example.com",
      password: "password1",
    });

    await service.logout(sessionId);

    await expect(service.verifyAccessToken(accessToken)).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
    });
  });

  it("rejects an expired token", async () => {
    const { service, clock } = makeService();
    await service.register({ email: "a@example.com", password: "password1" });
    const { accessToken } = await service.login({
      email: "a@example.com",
      password: "password1",
    });

    clock.advanceSeconds(15 * 60 + 1);

    await expect(service.verifyAccessToken(accessToken)).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
    });
  });

  it("rejects a tampered token", async () => {
    const { service } = makeService();
    await service.register({ email: "a@example.com", password: "password1" });
    const { accessToken } = await service.login({
      email: "a@example.com",
      password: "password1",
    });

    const tampered = `${accessToken}x`;
    await expect(service.verifyAccessToken(tampered)).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
    });
  });

  it("logout is idempotent for an unknown session", async () => {
    const { service } = makeService();
    await expect(service.logout("missing-session")).resolves.toBeUndefined();
  });
});

/* -------------------------------------------------------------------------
 * lockout policy hook (task 6.2 integration point)
 * ---------------------------------------------------------------------- */

describe("AuthService lockout hook", () => {
  it("rejects login when the policy reports the account is locked", async () => {
    const calls: string[] = [];
    const policy: LockoutPolicy = {
      isLocked: async () => true,
      recordFailure: async (email) => {
        calls.push(`fail:${email}`);
      },
      reset: async (email) => {
        calls.push(`reset:${email}`);
      },
    };
    const { service } = makeService({ lockoutPolicy: policy });
    await service.register({ email: "a@example.com", password: "password1" });

    await expect(
      service.login({ email: "a@example.com", password: "password1" }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    // Locked before verification: no failure recorded, no reset.
    expect(calls).toEqual([]);
  });

  it("records a failure on bad credentials and resets on success", async () => {
    const calls: string[] = [];
    const policy: LockoutPolicy = {
      isLocked: async () => false,
      recordFailure: async (email) => {
        calls.push(`fail:${email}`);
      },
      reset: async (email) => {
        calls.push(`reset:${email}`);
      },
    };
    const { service } = makeService({ lockoutPolicy: policy });
    await service.register({ email: "a@example.com", password: "password1" });

    await service
      .login({ email: "a@example.com", password: "nope" })
      .catch(() => undefined);
    await service.login({ email: "a@example.com", password: "password1" });

    expect(calls).toEqual(["fail:a@example.com", "reset:a@example.com"]);
  });
});

/* -------------------------------------------------------------------------
 * Argon2id hasher (real algorithm)
 * ---------------------------------------------------------------------- */

describe("Argon2idPasswordHasher", () => {
  const hasher = new Argon2idPasswordHasher();

  it("produces an Argon2id hash that never contains the plaintext and verifies", async () => {
    const password = "a-real-password-123";
    const hash = await hasher.hash(password);

    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash.includes(password)).toBe(false);
    expect(await hasher.verify(hash, password)).toBe(true);
    expect(await hasher.verify(hash, "wrong-password")).toBe(false);
  });

  it("returns false (never throws) for a malformed hash", async () => {
    expect(await hasher.verify("not-a-valid-hash", "whatever")).toBe(false);
  });
});
