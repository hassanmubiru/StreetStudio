import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { MemberRecord, SessionRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import { AuthService } from "./service.js";
import type { PasswordHasher } from "./password-hasher.js";
import { HmacAccessTokenIssuer } from "./tokens.js";
import type { AuthStores, MemberStore, SessionStore } from "./stores.js";
import { normalizeEmail } from "./stores.js";
import type { Clock } from "./clock.js";

/**
 * Property 5: Invalid authentication is uniformly non-disclosing.
 *
 * Feature: streetstudio, Property 5: Invalid authentication is uniformly non-disclosing
 *
 * Validates: Requirements 3.3, 3.8
 *
 * For arbitrary invalid login attempts, the authentication error returned for
 * an unknown email must be byte-for-byte identical (same code, message, and
 * status) to the error returned for a known email with the wrong password, so
 * the response never reveals which credential was wrong or whether an email is
 * registered (R3.3).
 *
 * Likewise for registration, attempting to register a duplicate email must
 * produce the same uniform `REGISTRATION_FAILED` error as any other invalid
 * registration (malformed email or too-short password), so the response never
 * discloses whether the email is already registered (R3.8).
 */

/* -------------------------------------------------------------------------
 * Fast, deterministic test doubles (not for security — for logic + speed).
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

const FIXED_NOW = new Date("2024-01-01T00:00:00.000Z");
const fixedClock: Clock = { now: () => FIXED_NOW };
const TEST_SECRET = "test-signing-secret-at-least-32-chars-long!";

function makeService(): AuthService {
  const members = new InMemoryMemberStore();
  const sessions = new InMemorySessionStore();
  const stores: AuthStores = { members, sessions };
  let counter = 0;
  return new AuthService({
    stores,
    passwordHasher: fakeHasher,
    tokenIssuer: new HmacAccessTokenIssuer(TEST_SECRET, fixedClock),
    clock: fixedClock,
    newId: (): Uuid => `id-${++counter}`,
  });
}

/** Capture the AppError thrown by an operation expected to fail. */
async function captureError(op: Promise<unknown>): Promise<AppError> {
  try {
    await op;
    throw new Error("expected the operation to reject, but it resolved");
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

const lower = fc.constantFrom(
  ..."abcdefghijklmnopqrstuvwxyz0123456789".split(""),
);
const localPart = fc.array(lower, { minLength: 1, maxLength: 12 }).map((a) => a.join(""));
const domain = fc.constantFrom("example.com", "test.org", "mail.co", "dev.io");
const emailArb: fc.Arbitrary<string> = fc
  .record({ local: localPart, host: domain })
  .map(({ local, host }) => `${local}@${host}`);

/** A password satisfying the >= 8 character minimum. */
const validPasswordArb = fc.string({ minLength: 8, maxLength: 40 });

/** Two syntactically valid emails that differ after normalization. */
const twoDistinctEmailsArb = fc
  .tuple(emailArb, emailArb)
  .filter(([a, b]) => normalizeEmail(a) !== normalizeEmail(b));

/** A password that differs from the correct one (so verification fails). */
const differentPasswordArb = (correct: string) =>
  validPasswordArb.filter((p) => p !== correct);

/** An "otherwise-invalid" registration: malformed email OR too-short password. */
const invalidRegistrationArb: fc.Arbitrary<{ email: string; password: string }> =
  fc.oneof(
    // Malformed email with an otherwise-valid password.
    fc.record({
      email: fc.constantFrom(
        "not-an-email",
        "no-at-sign.com",
        "a@b",
        "@no-local.com",
        "trailing@",
        "two words@spaces.com",
      ),
      password: validPasswordArb,
    }),
    // Valid email with a password shorter than 8 characters.
    fc.record({
      email: emailArb,
      password: fc.string({ maxLength: 7 }),
    }),
  );

/* -------------------------------------------------------------------------
 * Property 5
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 5: Invalid authentication is uniformly non-disclosing", () => {
  it("returns an identical error for an unknown email and a known email with a wrong password (R3.3)", async () => {
    await fc.assert(
      fc.asyncProperty(
        twoDistinctEmailsArb,
        validPasswordArb,
        fc.string({ maxLength: 40 }),
        async ([knownEmail, unknownEmail], correctPassword, attemptPassword) => {
          const service = makeService();
          await service.register({ email: knownEmail, password: correctPassword });

          // A password guaranteed to be wrong for the known account.
          const wrongPassword =
            attemptPassword === correctPassword
              ? `${attemptPassword}x`
              : attemptPassword;

          const unknownEmailError = await captureError(
            service.login({ email: unknownEmail, password: attemptPassword }),
          );
          const wrongPasswordError = await captureError(
            service.login({ email: knownEmail, password: wrongPassword }),
          );

          // Both are the uniform authentication failure...
          expect(unknownEmailError.code).toBe("AUTHENTICATION_FAILED");
          expect(wrongPasswordError.code).toBe("AUTHENTICATION_FAILED");
          // ...and are indistinguishable from one another.
          expect(unknownEmailError.code).toBe(wrongPasswordError.code);
          expect(unknownEmailError.message).toBe(wrongPasswordError.message);
          expect(unknownEmailError.status).toBe(wrongPasswordError.status);
          expect(unknownEmailError.category).toBe(wrongPasswordError.category);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("returns an identical error for a duplicate email and any other invalid registration (R3.8)", async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        validPasswordArb,
        validPasswordArb,
        invalidRegistrationArb,
        async (existingEmail, existingPassword, duplicatePassword, invalidReg) => {
          const service = makeService();
          await service.register({ email: existingEmail, password: existingPassword });

          // Registering the same email again (with a valid password) must not
          // disclose that the email is already registered.
          const duplicateError = await captureError(
            service.register({ email: existingEmail, password: duplicatePassword }),
          );
          // An otherwise-invalid registration (malformed email / short password).
          const invalidError = await captureError(service.register(invalidReg));

          expect(duplicateError.code).toBe("REGISTRATION_FAILED");
          expect(invalidError.code).toBe("REGISTRATION_FAILED");
          expect(duplicateError.code).toBe(invalidError.code);
          expect(duplicateError.message).toBe(invalidError.message);
          expect(duplicateError.status).toBe(invalidError.status);
          expect(duplicateError.category).toBe(invalidError.category);
          // The uniform message never references the email or its existence.
          expect(duplicateError.message).not.toMatch(/email|exist|registered|taken/i);
        },
      ),
      { numRuns: 200 },
    );
  });
});
