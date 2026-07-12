import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { MemberRecord, SessionRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import { AuthService } from "./service.js";
import type { PasswordHasher } from "./password-hasher.js";
import { HmacAccessTokenIssuer } from "./tokens.js";
import type { AuthStores, MemberStore, SessionStore } from "./stores.js";
import { normalizeEmail } from "./stores.js";
import {
  federatedProviderRegistry,
  type FederatedIdentity,
  type OAuthProvider,
  type SsoProvider,
} from "./federation.js";
import type { Clock } from "./clock.js";

/* -------------------------------------------------------------------------
 * Test doubles
 *
 * These unit tests exercise AuthService.loginWithOAuth / loginWithSSO against
 * mocked OAuth/SSO providers, covering the success (resolve/provision Member +
 * issue session/token) and provider-failure paths that must deny sign-in,
 * create no session, and return the uniform AUTHENTICATION_FAILED error.
 * Requirements 3.5, 3.6, 3.10.
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

class FixedClock implements Clock {
  constructor(private readonly current: Date) {}
  now(): Date {
    return this.current;
  }
}

/**
 * A configurable mock OAuth provider. Resolves with the given identity, or
 * rejects to simulate provider failure/unavailability.
 */
function mockOAuthProvider(
  id: string,
  behavior:
    | { readonly resolve: FederatedIdentity }
    | { readonly reject: Error },
): OAuthProvider {
  return {
    id,
    async exchangeCode(_code: string): Promise<FederatedIdentity> {
      if ("reject" in behavior) throw behavior.reject;
      return behavior.resolve;
    },
  };
}

/** A configurable mock SSO provider. */
function mockSsoProvider(
  id: string,
  behavior:
    | { readonly resolve: FederatedIdentity }
    | { readonly reject: Error },
): SsoProvider {
  return {
    id,
    async verifyAssertion(_assertion: string): Promise<FederatedIdentity> {
      if ("reject" in behavior) throw behavior.reject;
      return behavior.resolve;
    },
  };
}

const TEST_SECRET = "test-signing-secret-at-least-32-chars-long!";
const T0 = new Date("2024-01-01T00:00:00.000Z");

function makeService(providerOverrides?: {
  oauth?: readonly OAuthProvider[];
  sso?: readonly SsoProvider[];
  omitRegistry?: boolean;
}): {
  service: AuthService;
  members: InMemoryMemberStore;
  sessions: InMemorySessionStore;
} {
  const members = new InMemoryMemberStore();
  const sessions = new InMemorySessionStore();
  const stores: AuthStores = { members, sessions };
  const clock = new FixedClock(new Date(T0));

  let counter = 0;
  const newId = (): Uuid => `id-${++counter}`;

  const providers = providerOverrides?.omitRegistry
    ? undefined
    : federatedProviderRegistry({
        ...(providerOverrides?.oauth ? { oauth: providerOverrides.oauth } : {}),
        ...(providerOverrides?.sso ? { sso: providerOverrides.sso } : {}),
      });

  const service = new AuthService({
    stores,
    passwordHasher: fakeHasher,
    tokenIssuer: new HmacAccessTokenIssuer(TEST_SECRET, clock),
    clock,
    newId,
    ...(providers ? { providers } : {}),
  });

  return { service, members, sessions };
}

/* -------------------------------------------------------------------------
 * Successful OAuth sign-in (Requirement 3.5)
 * ---------------------------------------------------------------------- */

describe("AuthService.loginWithOAuth (success)", () => {
  it("provisions a new Member and issues a session + short-lived token", async () => {
    const { service, members, sessions } = makeService({
      oauth: [
        mockOAuthProvider("google", {
          resolve: { subject: "google-123", email: "New@Example.com" },
        }),
      ],
    });

    const result = await service.loginWithOAuth("google", "auth-code");

    // Token is a well-formed JWT and a session was created.
    expect(result.accessToken.split(".")).toHaveLength(3);
    expect(result.sessionId).toBeTruthy();
    expect(sessions.byId.has(result.sessionId)).toBe(true);

    // Member provisioned from the provider-verified (normalized) email, with
    // no password (federated-only account).
    const member = await members.findByEmail("new@example.com");
    expect(member).not.toBeNull();
    expect(member?.email).toBe("new@example.com");
    expect(member?.passwordHash).toBeNull();

    // The issued token verifies to that member + session.
    const ctx = await service.verifyAccessToken(result.accessToken);
    expect(ctx.memberId).toBe(member?.id);
    expect(ctx.sessionId).toBe(result.sessionId);

    // Token lifetime is at most 15 minutes (Requirement 3.2 reused).
    const ttlSeconds = (new Date(result.expiresAt).getTime() - T0.getTime()) / 1000;
    expect(ttlSeconds).toBeGreaterThan(0);
    expect(ttlSeconds).toBeLessThanOrEqual(15 * 60);
  });

  it("resolves an existing Member without provisioning a duplicate", async () => {
    const { service, members } = makeService({
      oauth: [
        mockOAuthProvider("google", {
          resolve: { subject: "google-123", email: "existing@example.com" },
        }),
      ],
    });

    // Seed an existing member with the same email.
    const seeded: MemberRecord = {
      id: "seeded-1",
      email: "existing@example.com",
      passwordHash: "fake:password1",
      createdAt: T0.toISOString() as MemberRecord["createdAt"],
    };
    await members.create(seeded);

    const result = await service.loginWithOAuth("google", "auth-code");

    const ctx = await service.verifyAccessToken(result.accessToken);
    expect(ctx.memberId).toBe("seeded-1");
    // No duplicate member created.
    expect(members.byId.size).toBe(1);
  });
});

/* -------------------------------------------------------------------------
 * Successful SSO sign-in (Requirement 3.6)
 * ---------------------------------------------------------------------- */

describe("AuthService.loginWithSSO (success)", () => {
  it("provisions a new Member and issues a session + short-lived token", async () => {
    const { service, members, sessions } = makeService({
      sso: [
        mockSsoProvider("okta", {
          resolve: { subject: "okta-abc", email: "sso-user@example.com" },
        }),
      ],
    });

    const result = await service.loginWithSSO("okta", "signed-assertion");

    expect(result.accessToken.split(".")).toHaveLength(3);
    expect(sessions.byId.has(result.sessionId)).toBe(true);

    const member = await members.findByEmail("sso-user@example.com");
    expect(member).not.toBeNull();
    expect(member?.passwordHash).toBeNull();

    const ctx = await service.verifyAccessToken(result.accessToken);
    expect(ctx.memberId).toBe(member?.id);
    expect(ctx.sessionId).toBe(result.sessionId);

    const ttlSeconds = (new Date(result.expiresAt).getTime() - T0.getTime()) / 1000;
    expect(ttlSeconds).toBeGreaterThan(0);
    expect(ttlSeconds).toBeLessThanOrEqual(15 * 60);
  });
});

/* -------------------------------------------------------------------------
 * Provider failure / unavailability (Requirement 3.10)
 * ---------------------------------------------------------------------- */

describe("federated sign-in denies on provider failure (Requirement 3.10)", () => {
  it("denies OAuth sign-in when exchangeCode rejects, creating no session", async () => {
    const { service, members, sessions } = makeService({
      oauth: [
        mockOAuthProvider("google", {
          reject: new Error("provider unavailable"),
        }),
      ],
    });

    await expect(
      service.loginWithOAuth("google", "auth-code"),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });

    // No session and no member provisioned.
    expect(sessions.byId.size).toBe(0);
    expect(members.byId.size).toBe(0);
  });

  it("denies SSO sign-in when verifyAssertion rejects, creating no session", async () => {
    const { service, members, sessions } = makeService({
      sso: [
        mockSsoProvider("okta", {
          reject: new Error("invalid assertion"),
        }),
      ],
    });

    await expect(
      service.loginWithSSO("okta", "bad-assertion"),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });

    expect(sessions.byId.size).toBe(0);
    expect(members.byId.size).toBe(0);
  });

  it("uses the same uniform error for provider failure as for a wrong password", async () => {
    const { service } = makeService({
      oauth: [
        mockOAuthProvider("google", { reject: new Error("boom") }),
      ],
    });

    const err = await service
      .loginWithOAuth("google", "auth-code")
      .catch((e) => e as AppError);

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("AUTHENTICATION_FAILED");
    expect(err.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------
 * Unconfigured provider (Requirement 3.10)
 * ---------------------------------------------------------------------- */

describe("federated sign-in denies for an unconfigured provider", () => {
  it("denies OAuth sign-in for a provider id that is not configured", async () => {
    const { service, sessions } = makeService({
      oauth: [
        mockOAuthProvider("google", {
          resolve: { subject: "s", email: "a@example.com" },
        }),
      ],
    });

    await expect(
      service.loginWithOAuth("github", "auth-code"),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    expect(sessions.byId.size).toBe(0);
  });

  it("denies SSO sign-in for a provider id that is not configured", async () => {
    const { service, sessions } = makeService({
      sso: [
        mockSsoProvider("okta", {
          resolve: { subject: "s", email: "a@example.com" },
        }),
      ],
    });

    await expect(
      service.loginWithSSO("azure-ad", "assertion"),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    expect(sessions.byId.size).toBe(0);
  });

  it("denies federated sign-in when no provider registry is configured at all", async () => {
    const { service, sessions } = makeService({ omitRegistry: true });

    await expect(
      service.loginWithOAuth("google", "auth-code"),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    await expect(
      service.loginWithSSO("okta", "assertion"),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    expect(sessions.byId.size).toBe(0);
  });
});

/* -------------------------------------------------------------------------
 * Missing / invalid verified email (Requirement 3.10)
 * ---------------------------------------------------------------------- */

describe("federated sign-in denies when the provider returns no valid email", () => {
  it("denies OAuth sign-in when the resolved identity has an empty email", async () => {
    const { service, members, sessions } = makeService({
      oauth: [
        mockOAuthProvider("google", {
          resolve: { subject: "google-123", email: "" },
        }),
      ],
    });

    await expect(
      service.loginWithOAuth("google", "auth-code"),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    expect(sessions.byId.size).toBe(0);
    expect(members.byId.size).toBe(0);
  });

  it("denies SSO sign-in when the resolved identity email is malformed", async () => {
    const { service, members, sessions } = makeService({
      sso: [
        mockSsoProvider("okta", {
          resolve: { subject: "okta-abc", email: "not-an-email" },
        }),
      ],
    });

    await expect(
      service.loginWithSSO("okta", "assertion"),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    expect(sessions.byId.size).toBe(0);
    expect(members.byId.size).toBe(0);
  });
});
