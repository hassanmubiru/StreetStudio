import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { emailArb, passwordArb } from "@streetstudio/shared/testing";
import type { MemberRecord, SessionRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import { AuthService } from "./service.js";
import { Argon2idPasswordHasher } from "./password-hasher.js";
import { HmacAccessTokenIssuer } from "./tokens.js";
import type { AuthStores, MemberStore, SessionStore } from "./stores.js";
import { normalizeEmail } from "./stores.js";
import type { Clock } from "./clock.js";

/**
 * Property 3: Registration creates retrievable accounts without plaintext passwords.
 *
 * Feature: streetstudio, Property 3: Registration creates retrievable accounts without plaintext passwords
 *
 * Validates: Requirements 3.1
 *
 * For any syntactically valid, non-duplicate email and any password of at least
 * 8 characters, {@link AuthService.register} creates a Member account that is
 * afterwards retrievable (by id and by normalized email), stores only a hash of
 * the password — never the plaintext — and returns a DTO that omits the hash
 * entirely (Requirement 3.1; design "Authentication & Session").
 */

/* -------------------------------------------------------------------------
 * In-memory test doubles (mirrors service.test.ts construction pattern).
 * ---------------------------------------------------------------------- */

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

const fixedClock: Clock = { now: () => new Date("2024-01-01T00:00:00.000Z") };
const TEST_SECRET = "test-signing-secret-at-least-32-chars-long!";

/**
 * Build a fresh service (and its member store) for each generated case, so a
 * generated email is always non-duplicate within its own run. Uses the real
 * Argon2id hasher so the "never stores plaintext" guarantee is exercised
 * against the production hashing algorithm.
 */
function makeService(): { service: AuthService; members: InMemoryMemberStore } {
  const members = new InMemoryMemberStore();
  const sessions = new InMemorySessionStore();
  const stores: AuthStores = { members, sessions };
  let counter = 0;
  const service = new AuthService({
    stores,
    passwordHasher: new Argon2idPasswordHasher(),
    tokenIssuer: new HmacAccessTokenIssuer(TEST_SECRET, fixedClock),
    clock: fixedClock,
    newId: (): Uuid => `member-${++counter}`,
  });
  return { service, members };
}

describe("Feature: streetstudio, Property 3: Registration creates retrievable accounts without plaintext passwords", () => {
  it("creates a retrievable account, stores only a hash (never the plaintext), and omits the hash from the DTO", async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, passwordArb, async (email, password) => {
        const { service, members } = makeService();

        const dto = await service.register({ email, password });

        // The returned DTO describes the account and NEVER carries the hash.
        expect(dto.id).toBeTruthy();
        expect(dto.email).toBe(normalizeEmail(email));
        expect(dto.createdAt).toBeTruthy();
        expect("passwordHash" in (dto as Record<string, unknown>)).toBe(false);

        // The account is retrievable by id...
        const byId = await members.findById(dto.id);
        expect(byId).not.toBeNull();
        // ...and by its normalized email.
        const byEmail = await members.findByEmail(email);
        expect(byEmail?.id).toBe(dto.id);

        // The stored record carries a real hash, never the plaintext.
        const stored = byId as MemberRecord;
        expect(stored.passwordHash).toBeTruthy();
        expect(stored.passwordHash).not.toBe(password);
        expect(stored.passwordHash?.includes(password)).toBe(false);
        expect(stored.passwordHash?.startsWith("$argon2id$")).toBe(true);

        // The stored hash genuinely verifies against the original password,
        // proving it is a hash OF the password and not some unrelated value.
        const hasher = new Argon2idPasswordHasher();
        expect(await hasher.verify(stored.passwordHash as string, password)).toBe(
          true,
        );
      }),
      { numRuns: 100 },
    );
  }, 120_000);
});
