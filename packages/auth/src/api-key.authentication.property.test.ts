import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { ApiKeyRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import { ApiKeyService, type ApiKeyStore } from "./api-key.js";
import type { Clock } from "./clock.js";

/**
 * Property 58: API-key authentication reflects validity and permissions.
 *
 * Feature: streetstudio, Property 58: API-key authentication reflects validity and permissions
 *
 * Validates: Requirements 18.3, 18.4, 18.5
 *
 * For any API_Key, a request presenting it authenticates with the key's
 * permissions if and only if the key is valid and non-revoked; malformed,
 * unrecognized, expired, or revoked keys are denied with a uniform
 * non-disclosing authentication error and create no session. Concretely, for
 * arbitrary key creations:
 *
 *  - authenticate(secret) on a valid, non-revoked key resolves to a context
 *    carrying the key's id, its owning organization scope, and exactly the
 *    permissions the key was created with (R18.3).
 *  - authenticate(secret) on a revoked key is denied with the uniform
 *    `AUTHENTICATION_FAILED` error (R18.4).
 *  - authenticate() on a malformed, unrecognized, or tampered secret is denied
 *    with the identical uniform `AUTHENTICATION_FAILED` error — the same code
 *    regardless of failure cause, so nothing about the key's existence is
 *    revealed (R18.5).
 */

/* -------------------------------------------------------------------------
 * Test double: an in-memory ApiKeyStore keyed by `${orgId}/${keyId}`.
 * ---------------------------------------------------------------------- */

class InMemoryApiKeyStore implements ApiKeyStore {
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
  store: InMemoryApiKeyStore;
} {
  const store = new InMemoryApiKeyStore();
  let counter = 0;
  const service = new ApiKeyService({
    store,
    clock: fixedClock,
    newId: (): Uuid => `key-${++counter}`,
  });
  return { service, store };
}

/** Resolve authenticate() to the AppError code, or "OK" on success. */
async function authCode(
  service: ApiKeyService,
  secret: string,
): Promise<string> {
  try {
    await service.authenticate(secret);
    return "OK";
  } catch (e) {
    return (e as AppError).code;
  }
}

/**
 * Replace the random component (4th, dot-delimited segment) of a presented
 * secret while preserving its well-formed `ssk.<orgB64>.<keyB64>.<raw>` shape.
 * The result references a real key but carries the wrong random secret, so it
 * must fail the salted-hash check (R18.5).
 */
function withWrongRawComponent(secret: string, replacement: string): string {
  const parts = secret.split(".");
  parts[parts.length - 1] = replacement;
  return parts.join(".");
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

/** Key names spanning the full valid 1..255 range, biased to the boundaries. */
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

/**
 * Malformed / unrecognized presented secrets that do not correspond to any
 * created key. Includes structurally invalid inputs (wrong prefix, wrong
 * segment count, empty) and structurally valid shapes referencing keys that
 * were never created.
 */
const malformedSecretArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.constant("not-a-secret"),
  fc.string(),
  // Missing/incorrect prefix but four segments.
  fc.constant("xxx.b3JnLTE.a2V5LTE.deadbeef"),
  // Correct prefix, well-formed shape, but references a non-existent key.
  fc.constant("ssk.b3JnLTk5OQ.a2V5LTk5OQ.deadbeefdeadbeef"),
  // Too few / too many segments.
  fc.constant("ssk.b3JnLTE.a2V5LTE"),
  fc.constant("ssk.b3JnLTE.a2V5LTE.raw.extra"),
);

/* -------------------------------------------------------------------------
 * Property 58
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 58: API-key authentication reflects validity and permissions", () => {
  it("authenticates a valid, non-revoked key with its org scope and permissions (R18.3)", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        actorArb,
        nameArb,
        permissionsArb,
        async (orgId, actor, name, permissions) => {
          const { service } = makeService();

          const reveal = await service.create(orgId, actor, name, permissions);
          const ctx = await service.authenticate(reveal.secret);

          // The authenticated context reflects exactly the key's identity,
          // owning-organization scope, and granted permissions (R18.3).
          expect(ctx.apiKeyId).toBe(reveal.apiKey.id);
          expect(ctx.organizationId).toBe(orgId);
          expect(ctx.permissions).toEqual([...permissions]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("denies a revoked key with the uniform AUTHENTICATION_FAILED error (R18.4)", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        actorArb,
        nameArb,
        permissionsArb,
        async (orgId, actor, name, permissions) => {
          const { service } = makeService();

          const reveal = await service.create(orgId, actor, name, permissions);
          // The same secret authenticates while active...
          expect(await authCode(service, reveal.secret)).toBe("OK");

          // ...and is uniformly denied once the key is revoked (R18.4).
          await service.revoke(orgId, reveal.apiKey.id, actor);
          expect(await authCode(service, reveal.secret)).toBe(
            "AUTHENTICATION_FAILED",
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it("denies malformed, unrecognized, and tampered secrets with one uniform, non-disclosing error (R18.5)", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        actorArb,
        nameArb,
        permissionsArb,
        malformedSecretArb,
        fc.string({ minLength: 1, maxLength: 40 }),
        async (orgId, actor, name, permissions, malformed, wrongRaw) => {
          const { service } = makeService();

          const reveal = await service.create(orgId, actor, name, permissions);

          // Candidate invalid secrets covering every denial cause:
          //  - a malformed / unrecognized secret (structure or missing key),
          //  - a well-formed secret with a tampered random component,
          //  - a well-formed secret referencing the real key but wrong secret.
          const invalidSecrets = [
            malformed,
            `${reveal.secret}tampered`,
            withWrongRawComponent(reveal.secret, wrongRaw),
          ];

          const codes = await Promise.all(
            invalidSecrets.map((s) => authCode(service, s)),
          );

          // Every failure surfaces the identical uniform code — the denial
          // cause is never disclosed (R18.5).
          for (const code of codes) {
            expect(code).toBe("AUTHENTICATION_FAILED");
          }
          expect(new Set(codes).size).toBe(1);
        },
      ),
      { numRuns: 200 },
    );
  });
});
