import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { Clock } from "@streetstudio/auth";
import {
  StorageRouter,
  SIGNED_UPLOAD_DEFAULT_TTL_SECONDS,
  DIRECT_UPLOAD_MAX_TTL_SECONDS,
  type ObjectStream,
  type PutResult,
  type SignedTarget,
  type StorageProvider,
} from "./storage.js";

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

/** A fixed clock so signed-target expiry and timestamps are deterministic. */
function fixedClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

/** Options controlling the in-memory provider's behaviour. */
interface FakeProviderOptions {
  readonly id?: string;
  readonly healthy?: boolean;
  /** Base instant used to stamp signed targets. */
  readonly issuedAtIso?: string;
}

/**
 * An in-memory {@link StorageProvider} for sanity checks. It stores objects in
 * a map and stamps signed targets with `issuedAt`/`expiresAt` derived from the
 * effective ttl the router passes in.
 */
class FakeProvider implements StorageProvider {
  readonly id: string;
  readonly objects = new Map<string, ObjectStream>();
  private readonly healthy: boolean;
  private readonly issuedAtIso: string;
  lastSignTtl: number | null = null;

  constructor(options: FakeProviderOptions = {}) {
    this.id = options.id ?? "fake-provider";
    this.healthy = options.healthy ?? true;
    this.issuedAtIso = options.issuedAtIso ?? "2024-01-01T00:00:00.000Z";
  }

  async put(key: string, data: ObjectStream): Promise<PutResult> {
    this.objects.set(key, data);
    return { key };
  }

  async get(key: string): Promise<ObjectStream> {
    const found = this.objects.get(key);
    if (found === undefined) {
      throw new Error(`no object for ${key}`);
    }
    return found;
  }

  async signUploadTarget(key: string, ttlSeconds: number): Promise<SignedTarget> {
    this.lastSignTtl = ttlSeconds;
    const issued = new Date(this.issuedAtIso);
    const expires = new Date(issued.getTime() + ttlSeconds * 1000);
    return {
      key,
      providerId: this.id,
      url: `https://storage.example/${this.id}/${key}`,
      method: "PUT",
      issuedAt: issued.toISOString(),
      expiresAt: expires.toISOString(),
      ttlSeconds,
    };
  }

  async healthCheck(): Promise<void> {
    if (!this.healthy) {
      throw new Error("connectivity check failed");
    }
  }
}

/** A minimal byte stream stand-in for routing sanity checks. */
function byteStream(): ObjectStream {
  // The router only routes the reference through; the concrete stream contents
  // are irrelevant to the interface/routing behaviour under test.
  return {} as ObjectStream;
}

/* -------------------------------------------------------------------------
 * Activation (R9.4)
 * ---------------------------------------------------------------------- */

describe("StorageRouter activation", () => {
  it("activates a provider whose health check succeeds", async () => {
    const router = new StorageRouter();
    const provider = new FakeProvider({ id: "primary" });

    await router.activate(provider);

    expect(router.activeProviderId).toBe("primary");
  });

  it("retains the prior provider and reports invalid config on health-check failure", async () => {
    const router = new StorageRouter();
    const good = new FakeProvider({ id: "good", healthy: true });
    const bad = new FakeProvider({ id: "bad", healthy: false });

    await router.activate(good);

    await expect(router.activate(bad)).rejects.toMatchObject({
      code: "STORAGE_CONFIG_INVALID",
    });
    // R9.4: the previously active provider is retained.
    expect(router.activeProviderId).toBe("good");
  });
});

/* -------------------------------------------------------------------------
 * Routing (R9.1, R9.3)
 * ---------------------------------------------------------------------- */

describe("StorageRouter routing", () => {
  it("routes put/get through the active provider", async () => {
    const router = new StorageRouter();
    const provider = new FakeProvider();
    await router.activate(provider);

    const stream = byteStream();
    const result = await router.put("videos/a.mp4", stream);
    expect(result.key).toBe("videos/a.mp4");
    expect(await router.get("videos/a.mp4")).toBe(stream);
  });

  it("fails with STORAGE_ERROR when no provider is active", async () => {
    const router = new StorageRouter();
    await expect(router.put("k", byteStream())).rejects.toMatchObject({
      code: "STORAGE_ERROR",
    });
  });
});

/* -------------------------------------------------------------------------
 * Signed upload targets (R9.6, R9.7, R29.3)
 * ---------------------------------------------------------------------- */

describe("StorageRouter signed upload targets", () => {
  it("defaults the validity to 900 seconds", async () => {
    const router = new StorageRouter();
    const provider = new FakeProvider();
    await router.activate(provider);

    const target = await router.signUploadTarget("uploads/x");

    expect(provider.lastSignTtl).toBe(SIGNED_UPLOAD_DEFAULT_TTL_SECONDS);
    expect(target.ttlSeconds).toBe(SIGNED_UPLOAD_DEFAULT_TTL_SECONDS);
  });

  it("caps direct-upload validity at 15 minutes", async () => {
    const router = new StorageRouter();
    const provider = new FakeProvider();
    await router.activate(provider);

    await router.signUploadTarget("uploads/x", 3600);

    expect(provider.lastSignTtl).toBe(DIRECT_UPLOAD_MAX_TTL_SECONDS);
  });

  it("rejects a ttl outside the 60..3600 range", async () => {
    const router = new StorageRouter();
    await router.activate(new FakeProvider());

    await expect(router.signUploadTarget("uploads/x", 30)).rejects.toMatchObject({
      code: "STORAGE_CONFIG_INVALID",
    });
  });

  it("rejects an expired target and accepts a still-valid one", async () => {
    const provider = new FakeProvider({
      issuedAtIso: "2024-01-01T00:00:00.000Z",
    });

    // Signed at issuance, valid for 900s -> expires at 00:15:00.
    const validRouter = new StorageRouter({
      clock: fixedClock("2024-01-01T00:10:00.000Z"),
    });
    await validRouter.activate(provider);
    const target = await validRouter.signUploadTarget("uploads/x");
    expect(validRouter.isUploadTargetExpired(target)).toBe(false);
    expect(() => validRouter.assertUploadTargetValid(target)).not.toThrow();

    // A clock past the expiry rejects the same target (R9.7).
    const expiredRouter = new StorageRouter({
      clock: fixedClock("2024-01-01T00:20:00.000Z"),
    });
    expect(expiredRouter.isUploadTargetExpired(target)).toBe(true);
    try {
      expiredRouter.assertUploadTargetValid(target);
      throw new Error("expected assertUploadTargetValid to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("SIGNED_TARGET_EXPIRED");
    }
  });
});
