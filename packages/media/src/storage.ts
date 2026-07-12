/**
 * Storage Abstraction and Provider Contract (`packages/media`).
 *
 * Implements the design's "Storage Abstraction" section and Requirement 9
 * (Storage Abstraction and Providers) plus the direct-upload expiry defaults of
 * Requirement 29.3. Media persistence is provider-agnostic: every read and
 * write flows through the narrow {@link StorageProvider} interface, and all
 * routing, activation, timeout, and signed-target expiry policy lives in the
 * {@link StorageRouter}. Concrete vendor providers (Local, S3, R2, Azure Blob,
 * GCS, MinIO) are supplied as plugins (task 26, R9.2) and MUST NOT be
 * referenced from core — this module contains no vendor logic.
 *
 * Semantics:
 *  - Persistence flows exclusively through {@link StorageProvider}; the router
 *    holds a single active provider and never bypasses it (R9.1, R9.3).
 *  - A write that is not acknowledged within {@link STORAGE_WRITE_ACK_TIMEOUT_MS}
 *    (30s) or that fails is aborted; the router records the failure with the
 *    provider identifier and a timestamp and surfaces `STORAGE_ERROR` (R9.5).
 *  - Activating a provider validates its configuration and connectivity through
 *    {@link StorageProvider.healthCheck}; on failure the previously active
 *    provider is retained and `STORAGE_CONFIG_INVALID` is raised (R9.4).
 *  - Signed upload targets are valid for an operator-configured duration
 *    between {@link SIGNED_UPLOAD_MIN_TTL_SECONDS} and
 *    {@link SIGNED_UPLOAD_MAX_TTL_SECONDS} (defaulting to
 *    {@link SIGNED_UPLOAD_DEFAULT_TTL_SECONDS}); because they authorize a direct
 *    upload to storage, the issued validity is additionally bounded to
 *    {@link DIRECT_UPLOAD_MAX_TTL_SECONDS} (15 minutes) (R9.6, R29.3). A target
 *    presented at or after its expiry is rejected with `SIGNED_TARGET_EXPIRED`
 *    (R9.7).
 *
 * Time is read from an injectable {@link Clock} so failure timestamps and
 * signed-target expiry are deterministic under test; the per-write acknowledg
 * timeout is likewise configurable.
 */
import { systemClock, toIsoTimestamp, type Clock } from "@streetstudio/auth";
import { AppError } from "@streetstudio/shared";
import type { IsoTimestamp } from "@streetstudio/shared";
import type { ReadableStream } from "node:stream/web";

/**
 * Maximum time a configured provider has to acknowledge a write before the
 * router aborts it and surfaces `STORAGE_ERROR` (R9.5).
 */
export const STORAGE_WRITE_ACK_TIMEOUT_MS = 30_000;

/** Minimum operator-configurable signed upload target validity (R9.6). */
export const SIGNED_UPLOAD_MIN_TTL_SECONDS = 60;

/** Maximum operator-configurable signed upload target validity (R9.6). */
export const SIGNED_UPLOAD_MAX_TTL_SECONDS = 3600;

/** Default signed upload target validity when none is specified (R9.6). */
export const SIGNED_UPLOAD_DEFAULT_TTL_SECONDS = 900;

/**
 * Hard upper bound (15 minutes) on the validity of credentials issued for a
 * direct upload to storage. Signed upload targets authorize a direct
 * client-to-storage upload, so their issued validity is capped here regardless
 * of the configured duration (R9.6, R29.3).
 */
export const DIRECT_UPLOAD_MAX_TTL_SECONDS = 900;

/** A stream of object bytes exchanged with a {@link StorageProvider}. */
export type ObjectStream = ReadableStream<Uint8Array>;

/** Outcome of a successful {@link StorageProvider.put}. */
export interface PutResult {
  /** The key the object was written under. */
  readonly key: string;
  /** Optional provider entity tag / version identifier. */
  readonly etag?: string;
  /** Optional number of bytes persisted. */
  readonly sizeBytes?: number;
}

/**
 * A signed, time-bounded target authorizing a direct client-to-storage upload.
 * The `url`/`method`/`headers` are the vendor-specific credential material
 * produced by the provider; the router treats `issuedAt`/`expiresAt` as the
 * authoritative validity window it enforces (R9.6, R9.7, R29.3).
 */
export interface SignedTarget {
  /** The object key the upload authorizes. */
  readonly key: string;
  /** Identifier of the provider that issued the target. */
  readonly providerId: string;
  /** Signed upload endpoint / URL produced by the provider. */
  readonly url: string;
  /** HTTP method the client must use for the direct upload (default `PUT`). */
  readonly method?: string;
  /** Additional headers the client must send with the direct upload. */
  readonly headers?: Readonly<Record<string, string>>;
  /** When the target was issued. */
  readonly issuedAt: IsoTimestamp;
  /** When the target expires; at/after this instant it is rejected (R9.7). */
  readonly expiresAt: IsoTimestamp;
  /** The issued validity window, in seconds. */
  readonly ttlSeconds: number;
}

/**
 * The pluggable persistence contract. Every media object read/write flows
 * through this interface (R9.1); concrete implementations are provided by
 * Storage_Provider plugins (R9.2) and are never referenced from core.
 */
export interface StorageProvider {
  /** Stable identifier for the provider, recorded on write failures (R9.5). */
  readonly id: string;
  /**
   * Persist `data` under `key`. The returned promise resolves once the write is
   * acknowledged; the router enforces the acknowledgment timeout (R9.5).
   */
  put(key: string, data: ObjectStream): Promise<PutResult>;
  /** Retrieve the object stored under `key` (R9.1). */
  get(key: string): Promise<ObjectStream>;
  /**
   * Issue a signed, direct-to-storage upload target for `key` valid for
   * `ttlSeconds`. The router validates and bounds `ttlSeconds` before calling
   * (R9.6, R29.3).
   */
  signUploadTarget(key: string, ttlSeconds: number): Promise<SignedTarget>;
  /**
   * Validate required configuration and backend connectivity. Rejecting signals
   * missing config or an unreachable backend, which blocks activation (R9.4).
   */
  healthCheck(): Promise<void>;
}

/** Reason a write was aborted, recorded alongside the provider id (R9.5). */
export type StorageWriteFailureReason = "write-timeout" | "write-failure";

/** A recorded storage write failure (R9.5). */
export interface StorageWriteFailure {
  /** Identifier of the provider whose write failed. */
  readonly providerId: string;
  /** The object key the failed write targeted. */
  readonly key: string;
  /** Whether the write timed out or the provider returned a failure. */
  readonly reason: StorageWriteFailureReason;
  /** When the failure was recorded (from the injected clock). */
  readonly timestamp: IsoTimestamp;
}

/**
 * Sink for write-failure records (R9.5). Host wiring supplies an implementation
 * (e.g. backed by the Audit Log or metrics); the router calls it before
 * surfacing `STORAGE_ERROR`. A recorder failure never masks the original error.
 */
export interface StorageFailureRecorder {
  /** Record a storage write failure. */
  record(failure: StorageWriteFailure): void | Promise<void>;
}

/** Options for constructing a {@link StorageRouter}. */
export interface StorageRouterOptions {
  /** Time source for failure timestamps and expiry; defaults to the system clock. */
  readonly clock?: Clock;
  /** Sink recording write failures (R9.5); optional. */
  readonly failureRecorder?: StorageFailureRecorder;
  /**
   * Per-write acknowledgment timeout in milliseconds. Defaults to
   * {@link STORAGE_WRITE_ACK_TIMEOUT_MS} (R9.5); primarily overridden for tests.
   */
  readonly writeAckTimeoutMs?: number;
}

/** Internal sentinel distinguishing a write timeout from a provider failure. */
class StorageWriteTimeoutError extends Error {
  constructor() {
    super("storage write acknowledgment timed out");
    this.name = "StorageWriteTimeoutError";
  }
}

/**
 * Routes media persistence exclusively through the active {@link StorageProvider}
 * and owns all storage policy: activation validation with prior-provider
 * retention (R9.4), the write acknowledgment timeout and failure recording
 * (R9.5), and signed upload target duration bounds and expiry rejection (R9.6,
 * R9.7, R29.3). It contains no vendor logic — every backend concern is reached
 * through the injected provider (R9.1, R9.2).
 */
export class StorageRouter {
  private active: StorageProvider | null = null;
  private readonly clock: Clock;
  private readonly failureRecorder?: StorageFailureRecorder;
  private readonly writeAckTimeoutMs: number;

  constructor(options: StorageRouterOptions = {}) {
    this.clock = options.clock ?? systemClock;
    if (options.failureRecorder !== undefined) {
      this.failureRecorder = options.failureRecorder;
    }
    this.writeAckTimeoutMs =
      options.writeAckTimeoutMs ?? STORAGE_WRITE_ACK_TIMEOUT_MS;
  }

  /** The id of the currently active provider, or null when none is active. */
  get activeProviderId(): string | null {
    return this.active?.id ?? null;
  }

  /**
   * Activate `provider` as the storage backend. Its configuration and
   * connectivity are validated via {@link StorageProvider.healthCheck}; on
   * failure the previously active provider is retained and
   * `STORAGE_CONFIG_INVALID` is raised (R9.4). The new provider only becomes
   * active after a successful check.
   */
  async activate(provider: StorageProvider): Promise<void> {
    try {
      await provider.healthCheck();
    } catch (err) {
      // R9.4: retain the previously active provider (this.active is untouched)
      // and report the invalid configuration.
      throw new AppError("STORAGE_CONFIG_INVALID", {
        details: { providerId: provider.id },
        cause: err,
      });
    }
    this.active = provider;
  }

  /**
   * Persist `data` under `key` through the active provider. If the write is not
   * acknowledged within the configured timeout, or the provider returns a
   * failure, the write is aborted, the failure is recorded with the provider id
   * and a timestamp, and `STORAGE_ERROR` is raised (R9.5).
   */
  async put(key: string, data: ObjectStream): Promise<PutResult> {
    const provider = this.requireActive();
    try {
      return await this.putWithAckTimeout(provider, key, data);
    } catch (err) {
      const reason: StorageWriteFailureReason =
        err instanceof StorageWriteTimeoutError
          ? "write-timeout"
          : "write-failure";
      const timestamp = await this.recordFailure(provider.id, key, reason);
      throw new AppError("STORAGE_ERROR", {
        details: { providerId: provider.id, key, reason, timestamp },
        cause: err,
      });
    }
  }

  /** Retrieve the object stored under `key` through the active provider (R9.1). */
  async get(key: string): Promise<ObjectStream> {
    const provider = this.requireActive();
    try {
      return await provider.get(key);
    } catch (err) {
      throw new AppError("STORAGE_ERROR", {
        details: { providerId: provider.id, key, reason: "read-failure" },
        cause: err,
      });
    }
  }

  /**
   * Issue a signed, direct-to-storage upload target for `key`. `ttlSeconds`
   * defaults to {@link SIGNED_UPLOAD_DEFAULT_TTL_SECONDS} and must fall within
   * [{@link SIGNED_UPLOAD_MIN_TTL_SECONDS}, {@link SIGNED_UPLOAD_MAX_TTL_SECONDS}]
   * or the request is rejected with `STORAGE_CONFIG_INVALID`. Because the target
   * authorizes a direct upload, the validity passed to the provider is bounded
   * to {@link DIRECT_UPLOAD_MAX_TTL_SECONDS} (15 minutes) (R9.6, R29.3). The
   * router verifies the returned target's validity window stays within those
   * bounds before returning it.
   */
  async signUploadTarget(
    key: string,
    ttlSeconds: number = SIGNED_UPLOAD_DEFAULT_TTL_SECONDS,
  ): Promise<SignedTarget> {
    const provider = this.requireActive();

    if (
      !Number.isInteger(ttlSeconds) ||
      ttlSeconds < SIGNED_UPLOAD_MIN_TTL_SECONDS ||
      ttlSeconds > SIGNED_UPLOAD_MAX_TTL_SECONDS
    ) {
      throw new AppError("STORAGE_CONFIG_INVALID", {
        details: {
          reason: "ttl-out-of-range",
          ttlSeconds,
          min: SIGNED_UPLOAD_MIN_TTL_SECONDS,
          max: SIGNED_UPLOAD_MAX_TTL_SECONDS,
        },
      });
    }

    // Cap direct-to-storage credential validity at 15 minutes (R29.3).
    const effectiveTtl = Math.min(ttlSeconds, DIRECT_UPLOAD_MAX_TTL_SECONDS);

    let target: SignedTarget;
    try {
      target = await provider.signUploadTarget(key, effectiveTtl);
    } catch (err) {
      throw new AppError("STORAGE_ERROR", {
        details: { providerId: provider.id, key, reason: "sign-failure" },
        cause: err,
      });
    }

    // Defense-in-depth: enforce the validity window bounds regardless of what
    // the provider returned (R9.6, R29.3).
    const validity = validitySeconds(target);
    if (
      validity < SIGNED_UPLOAD_MIN_TTL_SECONDS ||
      validity > DIRECT_UPLOAD_MAX_TTL_SECONDS
    ) {
      throw new AppError("STORAGE_ERROR", {
        details: {
          providerId: provider.id,
          key,
          reason: "target-validity-out-of-bounds",
          validitySeconds: validity,
        },
      });
    }

    return target;
  }

  /**
   * Whether `target` has expired as of `now` (defaults to the injected clock).
   * A target is expired at or after its `expiresAt` instant (R9.7).
   */
  isUploadTargetExpired(target: SignedTarget, now: Date = this.clock.now()): boolean {
    return now.getTime() >= new Date(target.expiresAt).getTime();
  }

  /**
   * Reject a presented upload target whose validity has elapsed with
   * `SIGNED_TARGET_EXPIRED` (R9.7). Returns normally when the target is valid.
   */
  assertUploadTargetValid(target: SignedTarget): void {
    if (this.isUploadTargetExpired(target)) {
      throw new AppError("SIGNED_TARGET_EXPIRED", {
        details: {
          key: target.key,
          providerId: target.providerId,
          expiresAt: target.expiresAt,
        },
      });
    }
  }

  /* --------------------------- internals ------------------------------- */

  private requireActive(): StorageProvider {
    if (this.active === null) {
      throw new AppError("STORAGE_ERROR", {
        details: { reason: "no-provider-active" },
      });
    }
    return this.active;
  }

  /**
   * Await `provider.put`, rejecting with {@link StorageWriteTimeoutError} if it
   * is not acknowledged within {@link writeAckTimeoutMs} (R9.5).
   */
  private putWithAckTimeout(
    provider: StorageProvider,
    key: string,
    data: ObjectStream,
  ): Promise<PutResult> {
    return new Promise<PutResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new StorageWriteTimeoutError());
      }, this.writeAckTimeoutMs);
      // Do not keep the event loop alive solely for this timer.
      if (
        typeof timer === "object" &&
        typeof (timer as { unref?: () => void }).unref === "function"
      ) {
        (timer as { unref: () => void }).unref();
      }
      provider.put(key, data).then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        (err: unknown) => {
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    });
  }

  private async recordFailure(
    providerId: string,
    key: string,
    reason: StorageWriteFailureReason,
  ): Promise<IsoTimestamp> {
    const timestamp = toIsoTimestamp(this.clock.now());
    if (this.failureRecorder !== undefined) {
      try {
        await this.failureRecorder.record({ providerId, key, reason, timestamp });
      } catch {
        // A recorder failure must never mask the original storage error.
      }
    }
    return timestamp;
  }
}

/** Compute the validity window of a signed target in whole seconds. */
function validitySeconds(target: SignedTarget): number {
  const issued = new Date(target.issuedAt).getTime();
  const expires = new Date(target.expiresAt).getTime();
  return Math.round((expires - issued) / 1000);
}
