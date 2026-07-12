import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { MemberRecord, SessionRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import { AuthService } from "./service.js";
import type { PasswordHasher } from "./password-hasher.js";
import { HmacAccessTokenIssuer, MAX_ACCESS_TOKEN_TTL_SECONDS } from "./tokens.js";
import type { AuthStores, MemberStore, SessionStore } from "./stores.js";
import { normalizeEmail } from "./stores.js";
import type { Clock } from "./clock.js";

/**
 * Property 4: Login issues short-lived tokens with sessions.
 *
 * Feature: streetstudio, Property 4: Login issues short-lived tokens with sessions
 *
 * Validates: Requirements 3.2
 *
 * Requirement 3.2 states that WHEN a Member submits valid credentials, THE
 * API_Service SHALL issue a JWT access token that expires within 15 minutes and
 * create a session record. This property asserts, for arbitrary valid
 * credentials, arbitrary issuance instants, and arbitrary requested token
 * lifetimes (including over-long ones that must be clamped), that a successful
 * login:
 *
 *   1. returns a structurally valid, verifiable JWT access token whose `exp`
 *      claim lies strictly after issuance and no more than 15 minutes after it,
 *   2. reports an `expiresAt` no more than 15 minutes after issuance, and
 *   3. creates a live (non-revoked) session record retrievable by the returned
 *      `sessionId`, bound to the authenticated member and agreeing with the
 *      token's expiry.
 *
 * A fast, deterministic fake password hasher and a controllable clock keep the
 * property about token/session issuance (not the memory-hard hashing cost).
 */

/* -------------------------------------------------------------------------
 * Test doubles (fast + deterministic; not for security)
 * ---------------------------------------------------------------------- */

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

class MutableClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
}

const TEST_SECRET = "test-signing-secret-at-least-32-chars-long!";
const FIFTEEN_MINUTES_MS = MAX_ACCESS_TOKEN_TTL_SECONDS * 1000;

/* -------------------------------------------------------------------------
 * Generators — constrained to the "valid credentials" input space
 * ---------------------------------------------------------------------- */

const identChar = fc.constantFrom(
  ..."abcdefghijklmnopqrstuvwxyz0123456789".split(""),
);
const label = fc
  .array(identChar, { minLength: 1, maxLength: 12 })
  .map((a) => a.join(""));

/** A syntactically valid email: `local@domain.tld`, matching the service regex. */
const validEmail: fc.Arbitrary<string> = fc
  .tuple(label, label, label)
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/** A password of at least the minimum accepted length (8). */
const validPassword: fc.Arbitrary<string> = fc.string({
  minLength: 8,
  maxLength: 128,
});

/** An issuance instant across a wide, arbitrary range of wall-clock times. */
const issuanceInstant: fc.Arbitrary<Date> = fc
  .integer({ min: 0, max: 4_102_444_800_000 }) // epoch .. year 2100
  .map((ms) => new Date(ms));

/**
 * A requested token lifetime in seconds. Spans well under, around, and well
 * over the 15-minute cap so the clamp behaviour is exercised. `undefined`
 * selects the service default.
 */
const requestedTtlSeconds: fc.Arbitrary<number | undefined> = fc.option(
  fc.integer({ min: 1, max: 3 * 60 * 60 }),
  { nil: undefined },
);

interface Scenario {
  readonly email: string;
  readonly password: string;
  readonly at: Date;
  readonly ttlSeconds: number | undefined;
}

const scenario: fc.Arbitrary<Scenario> = fc.record({
  email: validEmail,
  password: validPassword,
  at: issuanceInstant,
  ttlSeconds: requestedTtlSeconds,
});

function makeService(sc: Scenario): {
  service: AuthService;
  members: InMemoryMemberStore;
  sessions: InMemorySessionStore;
  clock: MutableClock;
  issuer: HmacAccessTokenIssuer;
} {
  const members = new InMemoryMemberStore();
  const sessions = new InMemorySessionStore();
  const stores: AuthStores = { members, sessions };
  const clock = new MutableClock(new Date(sc.at));
  const issuer = new HmacAccessTokenIssuer(TEST_SECRET, clock);

  let counter = 0;
  const service = new AuthService({
    stores,
    passwordHasher: fakeHasher,
    tokenIssuer: issuer,
    clock,
    newId: (): Uuid => `id-${++counter}`,
    ...(sc.ttlSeconds !== undefined
      ? { accessTokenTtlSeconds: sc.ttlSeconds }
      : {}),
  });

  return { service, members, sessions, clock, issuer };
}

/* -------------------------------------------------------------------------
 * Property
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 4: Login issues short-lived tokens with sessions", () => {
  it("issues a verifiable JWT expiring within 15 minutes and a matching session", async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async (sc) => {
        const { service, members, sessions, issuer } = makeService(sc);

        const member = await service.register({
          email: sc.email,
          password: sc.password,
        });

        // Issuance instant is the login's view of "now" (clock is not advanced).
        const issuedAtMs = sc.at.getTime();

        const result = await service.login({
          email: sc.email,
          password: sc.password,
        });

        // 1. Structurally a JWT: header.payload.signature.
        expect(result.accessToken.split(".")).toHaveLength(3);

        // ...and a genuinely verifiable one whose claims bind to this login.
        const claims = issuer.verify(result.accessToken);
        expect(claims.memberId).toBe(member.id);
        expect(claims.sessionId).toBe(result.sessionId);

        // 2. Token expiry is strictly after issuance and within 15 minutes.
        //    (JWT `exp` has whole-second precision, so compare at that grain.)
        const tokenExpMs = claims.expiresAt.getTime();
        const issuedSecondFloorMs = Math.floor(issuedAtMs / 1000) * 1000;
        expect(tokenExpMs).toBeGreaterThan(issuedSecondFloorMs);
        expect(tokenExpMs - issuedAtMs).toBeLessThanOrEqual(FIFTEEN_MINUTES_MS);

        // 3. Reported expiresAt is after issuance and within 15 minutes.
        const reportedExpMs = new Date(result.expiresAt).getTime();
        expect(reportedExpMs).toBeGreaterThan(issuedAtMs);
        expect(reportedExpMs - issuedAtMs).toBeLessThanOrEqual(
          FIFTEEN_MINUTES_MS,
        );

        // 4. A live session record exists, retrievable by the returned id.
        const session = await sessions.findById(result.sessionId);
        expect(session).not.toBeNull();
        expect(session?.memberId).toBe(member.id);
        expect(session?.revokedAt).toBeNull();
        expect(session?.issuedAt).toBe(new Date(issuedAtMs).toISOString());
        // Session and reported expiry agree.
        expect(session?.expiresAt).toBe(result.expiresAt);
        // The member backing the session is the one that registered.
        expect(members.byId.has(member.id)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
