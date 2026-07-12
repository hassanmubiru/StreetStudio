import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { MemberRecord, SessionRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import { AuthService } from "./service.js";
import type { PasswordHasher } from "./password-hasher.js";
import { HmacAccessTokenIssuer, MAX_ACCESS_TOKEN_TTL_SECONDS } from "./tokens.js";
import type { AuthStores, MemberStore, SessionStore } from "./stores.js";
import { normalizeEmail } from "./stores.js";
import type { Clock } from "./clock.js";

/**
 * Property 6: Session and token invalidation.
 *
 * Feature: streetstudio, Property 6: Session and token invalidation
 *
 * Validates: Requirements 3.4, 3.7
 *
 * For an arbitrary session, a valid access token verifies successfully while
 * its session is live and unexpired. Once the session is invalidated — either
 * because the Member signed out (logout, Requirement 3.4) or because the
 * token's ≤15-minute lifetime has elapsed (Requirement 3.7) — the SAME token is
 * rejected by `verifyAccessToken` with the uniform `AUTHENTICATION_FAILED`
 * error.
 */

/* -------------------------------------------------------------------------
 * Test doubles (mirrors packages/auth/src/service.test.ts)
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
}

const TEST_SECRET = "test-signing-secret-at-least-32-chars-long!";
const T0 = new Date("2024-01-01T00:00:00.000Z");

function makeService(ttlSeconds: number): {
  service: AuthService;
  clock: MutableClock;
} {
  const members = new InMemoryMemberStore();
  const sessions = new InMemorySessionStore();
  const stores: AuthStores = { members, sessions };
  const clock = new MutableClock(new Date(T0));

  let counter = 0;
  const newId = (): Uuid => `id-${++counter}`;

  const service = new AuthService({
    stores,
    passwordHasher: fakeHasher,
    tokenIssuer: new HmacAccessTokenIssuer(TEST_SECRET, clock),
    clock,
    newId,
    accessTokenTtlSeconds: ttlSeconds,
  });

  return { service, clock };
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

const localPart = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
    minLength: 1,
    maxLength: 12,
  })
  .map((a) => a.join(""));

const email = fc
  .tuple(localPart, localPart, fc.constantFrom("com", "org", "io", "dev"))
  .map(([user, domain, tld]) => `${user}@${domain}.${tld}`);

// A password of at least the minimum length (8 characters).
const password = fc.string({ minLength: 8, maxLength: 64 });

// Access-token lifetime in seconds; always within the 15-minute cap so
// `expiresAt = issuedAt + ttl` holds exactly (no clamping surprises).
const ttlSeconds = fc.integer({ min: 1, max: MAX_ACCESS_TOKEN_TTL_SECONDS });

interface Scenario {
  readonly email: string;
  readonly password: string;
  readonly ttlSeconds: number;
  /** Instant (seconds after T0), strictly before expiry, at which the token is still valid. */
  readonly liveOffsetSeconds: number;
  readonly invalidation: "logout" | "expiry";
  /** Extra seconds beyond expiry to advance for the expiry branch. */
  readonly expiryOverrunSeconds: number;
}

const scenario: fc.Arbitrary<Scenario> = fc
  .record({
    email,
    password,
    ttlSeconds,
    invalidation: fc.constantFrom<"logout" | "expiry">("logout", "expiry"),
    liveFraction: fc.double({ min: 0, max: 1, noNaN: true }),
    expiryOverrunSeconds: fc.integer({ min: 0, max: 3600 }),
  })
  .map((r) => ({
    email: r.email,
    password: r.password,
    ttlSeconds: r.ttlSeconds,
    // A point strictly inside [0, ttl): the token is unexpired here.
    liveOffsetSeconds: Math.min(
      r.ttlSeconds - 1,
      Math.floor(r.liveFraction * r.ttlSeconds),
    ),
    invalidation: r.invalidation,
    expiryOverrunSeconds: r.expiryOverrunSeconds,
  }));

/* -------------------------------------------------------------------------
 * Property
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 6: Session and token invalidation", () => {
  it("verifies a live token, then rejects it after logout (R3.4) or expiry (R3.7)", async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async (sc) => {
        const { service, clock } = makeService(sc.ttlSeconds);

        await service.register({ email: sc.email, password: sc.password });
        const { accessToken, sessionId } = await service.login({
          email: sc.email,
          password: sc.password,
        });

        // While the session is live and the token unexpired, verification
        // succeeds and resolves the bound session.
        clock.set(new Date(T0.getTime() + sc.liveOffsetSeconds * 1000));
        const ctx = await service.verifyAccessToken(accessToken);
        expect(ctx.sessionId).toBe(sessionId);

        // Invalidate the session, then the SAME token must be rejected.
        if (sc.invalidation === "logout") {
          // Sign-out at the still-live instant (Requirement 3.4).
          await service.logout(sessionId);
        } else {
          // Advance to at/after the token's expiry (Requirement 3.7).
          const expiryOffset = sc.ttlSeconds + sc.expiryOverrunSeconds;
          clock.set(new Date(T0.getTime() + expiryOffset * 1000));
        }

        const error = await service
          .verifyAccessToken(accessToken)
          .then(() => null)
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe("AUTHENTICATION_FAILED");
      }),
      { numRuns: 200 },
    );
  });
});
