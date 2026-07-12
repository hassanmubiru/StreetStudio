import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { ApiKeyRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import { ApiKeyService, type ApiKeyStore } from "./api-key.js";
import type { Clock } from "./clock.js";

/**
 * Property 57: API-key secrets are disclosed exactly once.
 *
 * Feature: streetstudio, Property 57: API-key secrets are disclosed exactly once
 *
 * Validates: Requirements 18.1, 18.2
 *
 * For any API_Key created with a name of 1 to 255 characters, the secret value
 * is returned only within the creation response, and subsequent retrievals
 * return metadata without the secret. Concretely, for arbitrary key creations:
 *
 *  - create() returns a non-empty plaintext secret in its reveal, and the
 *    reveal's metadata DTO carries no secret field (R18.1).
 *  - The persisted record holds only a salted hash and never the plaintext
 *    secret or its random component — no stored field equals or contains the
 *    disclosed secret (R18.2).
 *  - getMeta() returns metadata that has no secret field and never equals or
 *    contains the plaintext secret, so the secret is unretrievable after
 *    creation (R18.2).
 */

/* -------------------------------------------------------------------------
 * Test double: an in-memory ApiKeyStore that also exposes every record so the
 * property can inspect the full persisted representation for leaks.
 * ---------------------------------------------------------------------- */

class InspectableApiKeyStore implements ApiKeyStore {
  readonly byKey = new Map<string, ApiKeyRecord>();

  private k(orgId: Uuid, keyId: Uuid): string {
    return `${orgId}/${keyId}`;
  }

  async create(record: ApiKeyRecord): Promise<ApiKeyRecord> {
    this.byKey.set(this.k(record.organizationId, record.id), record);
    return record;
  }
  async findById(orgId: Uuid, keyId: Uuid): Promise<ApiKeyRecord | null> {
    return this.byKey.get(this.k(orgId, keyId)) ?? null;
  }
  async markRevoked(record: ApiKeyRecord, revokedAt: string): Promise<void> {
    this.byKey.set(this.k(record.organizationId, record.id), {
      ...record,
      revokedAt,
    });
  }
}

const FIXED_NOW = new Date("2024-01-01T00:00:00.000Z");
const fixedClock: Clock = { now: () => FIXED_NOW };

function makeService(): {
  service: ApiKeyService;
  store: InspectableApiKeyStore;
} {
  const store = new InspectableApiKeyStore();
  let counter = 0;
  const service = new ApiKeyService({
    store,
    clock: fixedClock,
    newId: (): Uuid => `key-${++counter}`,
  });
  return { service, store };
}

/**
 * Extract the random component of a presented secret. The format produced by
 * the service is `ssk.<orgB64>.<keyB64>.<raw>`; the raw high-entropy token is
 * the fourth, dot-delimited segment and is what the stored hash protects.
 */
function rawComponent(secret: string): string {
  const parts = secret.split(".");
  return parts[parts.length - 1] ?? "";
}

/** True iff `value`, recursively, exposes `secret` verbatim as a substring. */
function containsSecret(value: unknown, secret: string): boolean {
  if (typeof value === "string") return value.includes(secret);
  if (Array.isArray(value)) return value.some((v) => containsSecret(v, secret));
  if (value !== null && typeof value === "object") {
    return Object.values(value).some((v) => containsSecret(v, secret));
  }
  return false;
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

/** Organization ids that are valid, distinct-looking tenant scopes. */
const orgIdArb: fc.Arbitrary<Uuid> = fc
  .integer({ min: 1, max: 1_000_000 })
  .map((n) => `org-${n}`);

/** Actor (member) ids performing the creation. */
const actorArb: fc.Arbitrary<Uuid> = fc
  .integer({ min: 1, max: 1_000_000 })
  .map((n) => `member-${n}`);

/**
 * Key names spanning the full valid 1..255 range, biased toward the boundaries
 * (1 and 255) and including characters that could confuse substring checks.
 */
const nameArb: fc.Arbitrary<string> = fc.oneof(
  fc.string({ minLength: 1, maxLength: 255 }).filter((s) => s.length >= 1),
  fc.constant("a"),
  fc.constant("x".repeat(255)),
);

/** Arbitrary permission sets, including the empty set. */
const permissionsArb: fc.Arbitrary<readonly string[]> = fc.array(
  fc.constantFrom("read", "write", "admin", "share", "delete"),
  { maxLength: 5 },
);

/* -------------------------------------------------------------------------
 * Property 57
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 57: API-key secrets are disclosed exactly once", () => {
  it("discloses the secret only in the creation reveal and never through storage or getMeta (R18.1, R18.2)", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        actorArb,
        nameArb,
        permissionsArb,
        async (orgId, actor, name, permissions) => {
          const { service, store } = makeService();

          const reveal = await service.create(orgId, actor, name, permissions);

          // --- R18.1: the secret is disclosed exactly once, in the reveal. ---
          expect(typeof reveal.secret).toBe("string");
          expect(reveal.secret.length).toBeGreaterThan(0);
          // The reveal's metadata DTO carries no secret field.
          expect("secret" in reveal.apiKey).toBe(false);
          expect(containsSecret(reveal.apiKey, reveal.secret)).toBe(false);

          const secret = reveal.secret;
          const raw = rawComponent(secret);
          expect(raw.length).toBeGreaterThan(0);

          // --- R18.2: storage holds only a salted hash, never the plaintext. ---
          const stored = store.byKey.get(`${orgId}/${reveal.apiKey.id}`);
          expect(stored).toBeDefined();
          const record = stored as ApiKeyRecord;
          // A non-empty salted hash is present...
          expect(record.secretHash.length).toBeGreaterThan(0);
          // ...but it is not the plaintext, and contains neither the full
          // presented secret nor its high-entropy random component.
          expect(record.secretHash).not.toBe(secret);
          expect(record.secretHash.includes(secret)).toBe(false);
          expect(record.secretHash.includes(raw)).toBe(false);
          // No field of the stored record leaks the secret anywhere.
          expect(containsSecret(record, secret)).toBe(false);
          expect(containsSecret(record, raw)).toBe(false);

          // --- R18.2: getMeta returns metadata without the secret. ---
          const meta = await service.getMeta(orgId, reveal.apiKey.id);
          expect("secret" in meta).toBe(false);
          expect(containsSecret(meta, secret)).toBe(false);
          expect(containsSecret(meta, raw)).toBe(false);
          // Metadata still identifies the key and preserves its non-secret fields.
          expect(meta.id).toBe(reveal.apiKey.id);
          expect(meta.name).toBe(name);
        },
      ),
      { numRuns: 200 },
    );
  });
});
