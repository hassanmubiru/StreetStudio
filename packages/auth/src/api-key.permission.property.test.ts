import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { ApiKeyRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import {
  ApiKeyService,
  type ApiKeyAuthorizer,
  type ApiKeyStore,
} from "./api-key.js";
import type { Clock } from "./clock.js";

/**
 * Property 59: API-key management is permission-gated.
 *
 * Feature: streetstudio, Property 59: API-key management is permission-gated
 *
 * Validates: Requirements 18.6
 *
 * For arbitrary actors and organizations, {@link ApiKeyService.create} and
 * {@link ApiKeyService.revoke} succeed only when the injected
 * {@link ApiKeyAuthorizer} grants management permission for that (actor, org).
 * When the authorizer denies, both operations are rejected with
 * `AUTHORIZATION_DENIED` and no API key is created or changed.
 */

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

/** An in-memory {@link ApiKeyStore} keyed by `${orgId}/${keyId}`. */
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

const T0 = new Date("2024-01-01T00:00:00.000Z");
const fixedClock: Clock = { now: () => T0 };

/**
 * An authorizer that grants management only for (actor, org) pairs present in
 * `granted`, and records every (actor, org) it was consulted with so the test
 * can confirm the gate is driven by the caller and target organization.
 */
function decisionAuthorizer(granted: ReadonlySet<string>): {
  authorizer: ApiKeyAuthorizer;
  calls: Array<{ actor: Uuid; organizationId: Uuid }>;
} {
  const calls: Array<{ actor: Uuid; organizationId: Uuid }> = [];
  const authorizer: ApiKeyAuthorizer = {
    async canManageApiKeys(actor: Uuid, organizationId: Uuid): Promise<boolean> {
      calls.push({ actor, organizationId });
      return granted.has(`${actor}::${organizationId}`);
    },
  };
  return { authorizer, calls };
}

/** A snapshot of the store's contents, used to assert nothing changed. */
function snapshot(store: InMemoryApiKeyStore): Map<string, ApiKeyRecord> {
  return new Map(
    [...store.byKey.entries()].map(([k, v]) => [k, { ...v }]),
  );
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

const uuid = fc.uuid() as fc.Arbitrary<Uuid>;
const orgId = uuid;
const actorId = uuid;
// A valid API-key name is 1..255 characters (R18.1).
const validName = fc.string({ minLength: 1, maxLength: 255 });
const permissions = fc.array(
  fc.constantFrom("read", "write", "admin", "billing:read"),
  { maxLength: 4 },
);

/* -------------------------------------------------------------------------
 * Property 59
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 59: API-key management is permission-gated", () => {
  it("create() and revoke() succeed iff the authorizer grants management, else AUTHORIZATION_DENIED with no change", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgId,
        actorId,
        validName,
        permissions,
        fc.boolean(),
        async (organizationId, actor, name, perms, allowed) => {
          const store = new InMemoryApiKeyStore();
          const grant = allowed
            ? new Set([`${actor}::${organizationId}`])
            : new Set<string>();
          const { authorizer, calls } = decisionAuthorizer(grant);

          let counter = 0;
          const service = new ApiKeyService({
            store,
            authorizer,
            clock: fixedClock,
            newId: (): Uuid => `key-${++counter}` as Uuid,
          });

          /* --- create() ------------------------------------------------ */
          const before = snapshot(store);
          if (allowed) {
            const reveal = await service.create(
              organizationId,
              actor,
              name,
              perms,
            );
            // A key was created and persisted with the caller's org scope.
            expect(reveal.secret).toBeTruthy();
            expect(reveal.apiKey.organizationId).toBe(organizationId);
            const stored = store.byKey.get(
              `${organizationId}/${reveal.apiKey.id}`,
            );
            expect(stored).toBeDefined();
            expect(store.byKey.size).toBe(1);
          } else {
            await expect(
              service.create(organizationId, actor, name, perms),
            ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
            // Denial changes nothing.
            expect(store.byKey).toEqual(before);
            expect(store.byKey.size).toBe(0);
          }
          // The gate was consulted with exactly this actor and organization.
          expect(calls).toContainEqual({ actor, organizationId });

          /* --- revoke() ------------------------------------------------ */
          // Seed an existing, active key regardless of the authorizer under
          // test, using a separate permissive creator on the same store.
          const creator = new ApiKeyService({
            store,
            clock: fixedClock,
            newId: (): Uuid => `seed-${++counter}` as Uuid,
          });
          const seeded = await creator.create(
            organizationId,
            actor,
            "seed-key",
          );
          const seededId = seeded.apiKey.id;
          const beforeRevoke = snapshot(store);

          if (allowed) {
            await service.revoke(organizationId, seededId, actor);
            const rec = store.byKey.get(`${organizationId}/${seededId}`);
            expect(rec?.revokedAt).toBe(T0.toISOString());
            // A granted revoke of an active key is denied at authentication.
            await expect(
              creator.authenticate(seeded.secret),
            ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
          } else {
            await expect(
              service.revoke(organizationId, seededId, actor),
            ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
            // Denial changes nothing: the key is untouched and still valid.
            expect(store.byKey).toEqual(beforeRevoke);
            const rec = store.byKey.get(`${organizationId}/${seededId}`);
            expect(rec?.revokedAt).toBeNull();
            const ctx = await creator.authenticate(seeded.secret);
            expect(ctx.apiKeyId).toBe(seededId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
