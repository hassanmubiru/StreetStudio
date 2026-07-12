import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { ApiKeyRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import {
  ApiKeyService,
  Sha256SecretHasher,
  type ApiKeyAuthorizer,
  type ApiKeyStore,
} from "./api-key.js";
import type { Clock } from "./clock.js";

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
const ORG = "org-1";
const ACTOR = "member-1";

function makeService(overrides?: {
  authorizer?: ApiKeyAuthorizer;
}): { service: ApiKeyService; store: InMemoryApiKeyStore } {
  const store = new InMemoryApiKeyStore();
  let counter = 0;
  const service = new ApiKeyService({
    store,
    clock: fixedClock,
    newId: (): Uuid => `key-${++counter}`,
    ...(overrides?.authorizer ? { authorizer: overrides.authorizer } : {}),
  });
  return { service, store };
}

/* -------------------------------------------------------------------------
 * create / getMeta — one-time secret disclosure (R18.1, R18.2)
 * ---------------------------------------------------------------------- */

describe("ApiKeyService.create + getMeta", () => {
  it("returns the secret exactly once and stores only a salted hash", async () => {
    const { service, store } = makeService();

    const reveal = await service.create(ORG, ACTOR, "CI token", ["read"]);

    expect(reveal.secret).toBeTruthy();
    expect(reveal.apiKey.name).toBe("CI token");
    expect(reveal.apiKey.permissions).toEqual(["read"]);
    // The reveal DTO carries metadata; the secret is separate and one-time.
    expect("secret" in reveal.apiKey).toBe(false);

    // Storage never holds the plaintext secret, only a salted hash.
    const stored = store.byKey.get(`${ORG}/${reveal.apiKey.id}`);
    expect(stored).toBeDefined();
    expect(stored?.secretHash).toBeTruthy();
    expect(stored?.secretHash.includes(reveal.secret)).toBe(false);

    // getMeta returns metadata without any secret field.
    const meta = await service.getMeta(ORG, reveal.apiKey.id);
    expect(meta.id).toBe(reveal.apiKey.id);
    expect("secret" in meta).toBe(false);
  });

  it("rejects names outside 1..255 characters with VALIDATION_FAILED", async () => {
    const { service } = makeService();
    await expect(service.create(ORG, ACTOR, "")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(
      service.create(ORG, ACTOR, "x".repeat(256)),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

/* -------------------------------------------------------------------------
 * authenticate — validity + uniform non-disclosing error (R18.3, R18.5)
 * ---------------------------------------------------------------------- */

describe("ApiKeyService.authenticate", () => {
  it("authenticates a valid key with its org scope and permissions", async () => {
    const { service } = makeService();
    const reveal = await service.create(ORG, ACTOR, "key", ["read", "write"]);

    const ctx = await service.authenticate(reveal.secret);
    expect(ctx.apiKeyId).toBe(reveal.apiKey.id);
    expect(ctx.organizationId).toBe(ORG);
    expect(ctx.permissions).toEqual(["read", "write"]);
  });

  it("denies malformed, unrecognized, and tampered secrets uniformly", async () => {
    const { service } = makeService();
    const reveal = await service.create(ORG, ACTOR, "key");

    const codes = await Promise.all(
      [
        "not-a-secret",
        "",
        `${reveal.secret}tampered`,
        "ssk.b3JnLTE.a2V5LTE.deadbeef", // well-formed shape, wrong secret
      ].map((s) =>
        service
          .authenticate(s)
          .then(() => "OK")
          .catch((e) => (e as AppError).code),
      ),
    );
    expect(codes).toEqual([
      "AUTHENTICATION_FAILED",
      "AUTHENTICATION_FAILED",
      "AUTHENTICATION_FAILED",
      "AUTHENTICATION_FAILED",
    ]);
  });

  it("denies a revoked key with the same uniform error (R18.4)", async () => {
    const { service } = makeService();
    const reveal = await service.create(ORG, ACTOR, "key");

    await service.revoke(ORG, reveal.apiKey.id, ACTOR);

    await expect(service.authenticate(reveal.secret)).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
    });
    // Metadata is retained after revocation with a revoked timestamp.
    const meta = await service.getMeta(ORG, reveal.apiKey.id);
    expect(meta.revokedAt).toBe(T0.toISOString());
  });
});

/* -------------------------------------------------------------------------
 * permission gating for create/revoke (R18.6)
 * ---------------------------------------------------------------------- */

describe("ApiKeyService permission gating", () => {
  const denyAll: ApiKeyAuthorizer = { canManageApiKeys: async () => false };

  it("denies create for a member without API-management permission and changes nothing", async () => {
    const { service, store } = makeService({ authorizer: denyAll });
    await expect(service.create(ORG, ACTOR, "key")).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect(store.byKey.size).toBe(0);
  });

  it("denies revoke for a member without API-management permission and changes nothing", async () => {
    // Create with an allowing service, then attempt revoke with a denying one.
    const { service: creator, store } = makeService();
    const reveal = await creator.create(ORG, ACTOR, "key");

    const gated = new ApiKeyService({
      store,
      clock: fixedClock,
      authorizer: denyAll,
    });
    await expect(
      gated.revoke(ORG, reveal.apiKey.id, ACTOR),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });

    // The key remains active (non-revoked), so it still authenticates.
    const ctx = await creator.authenticate(reveal.secret);
    expect(ctx.apiKeyId).toBe(reveal.apiKey.id);
  });
});

/* -------------------------------------------------------------------------
 * Sha256SecretHasher
 * ---------------------------------------------------------------------- */

describe("Sha256SecretHasher", () => {
  const hasher = new Sha256SecretHasher();

  it("produces a salted hash that verifies and never contains the plaintext", () => {
    const secret = "a-high-entropy-secret-token";
    const hash = hasher.hash(secret);
    expect(hash.includes(secret)).toBe(false);
    expect(hash.includes(":")).toBe(true);
    expect(hasher.verify(hash, secret)).toBe(true);
    expect(hasher.verify(hash, "wrong")).toBe(false);
  });

  it("uses a fresh salt per hash so identical secrets hash differently", () => {
    const secret = "same-secret";
    expect(hasher.hash(secret)).not.toBe(hasher.hash(secret));
  });

  it("returns false (never throws) for a malformed stored hash", () => {
    expect(hasher.verify("garbage-without-separator", "x")).toBe(false);
  });
});
