/**
 * @streetstudio/storage-s3
 *
 * Amazon S3 (and S3-compatible) {@link StorageProvider} delivered as an
 * isolated plugin (Requirement 9.2). Implements the storage contract from
 * `@streetstudio/media` and the {@link Plugin} contract from
 * `@streetstudio/plugins` (type `"storage"`). No provider is imported into
 * platform core.
 *
 * No cloud vendor SDK is hard-imported into the workspace build. Instead the
 * provider is a thin adapter over an injectable {@link S3StyleClient} seam:
 * host wiring supplies a client backed by the AWS SDK (or any S3-compatible
 * SDK) at deployment time. Because Cloudflare R2 and MinIO are S3-compatible,
 * this same implementation is parameterized by `endpoint`/`region` and reused
 * by `@streetstudio/storage-r2` and `@streetstudio/storage-minio`.
 */
import type {
  ObjectStream,
  PutResult,
  SignedTarget,
  StorageProvider,
} from "@streetstudio/media";
import type { Capability, Plugin, PluginContext } from "@streetstudio/plugins";

export const DOMAIN =
  "Amazon S3 (and S3-compatible) storage provider plugin." as const;

/** Stable identifier for the Amazon S3 storage provider plugin. */
export const S3_STORAGE_PLUGIN_ID = "streetstudio.storage.s3";

/** Capability id registered by an S3-style storage plugin on activation. */
export const S3_STORAGE_CAPABILITY_ID = "storage.s3";

/** Minimal injectable time source, so signed-target expiry is deterministic. */
export interface StorageClock {
  now(): Date;
}

const systemClock: StorageClock = { now: () => new Date() };

/** Result of an object write against the S3-style backend. */
export interface S3PutResult {
  /** Provider entity tag / version identifier, if returned. */
  readonly etag?: string;
  /** Number of bytes persisted, if known. */
  readonly sizeBytes?: number;
}

/** A presigned direct-to-storage upload target produced by the backend. */
export interface S3PresignedUpload {
  /** The presigned upload URL. */
  readonly url: string;
  /** HTTP method the client must use (defaults to `PUT`). */
  readonly method?: string;
  /** Additional headers the client must send with the upload. */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * The injectable S3-compatible client seam. Host wiring supplies a concrete
 * implementation backed by a vendor SDK; the workspace build depends on none.
 */
export interface S3StyleClient {
  /** Persist `body` under `key` in `bucket`, resolving once acknowledged. */
  putObject(params: {
    readonly bucket: string;
    readonly key: string;
    readonly body: ObjectStream;
  }): Promise<S3PutResult>;
  /** Retrieve the object stored under `key` in `bucket`. */
  getObject(params: {
    readonly bucket: string;
    readonly key: string;
  }): Promise<ObjectStream>;
  /** Produce a presigned upload target valid for `expiresInSeconds`. */
  presignPut(params: {
    readonly bucket: string;
    readonly key: string;
    readonly expiresInSeconds: number;
  }): Promise<S3PresignedUpload>;
  /** Validate configuration/connectivity (e.g. a HEAD-bucket call). */
  ping(): Promise<void>;
}

/** Configuration for an S3-style storage provider. */
export interface S3StorageConfig {
  /** Stable provider identifier; recorded on write failures. */
  readonly id?: string;
  /** Target bucket name. */
  readonly bucket: string;
  /**
   * Injectable S3-compatible client. When omitted, {@link healthCheck} fails so
   * the router retains the previously active provider (R9.4).
   */
  readonly client?: S3StyleClient;
  /** Optional custom endpoint (required for R2/MinIO; omitted for AWS S3). */
  readonly endpoint?: string;
  /** Optional region. */
  readonly region?: string;
  /** Time source for signed-target issue/expiry; defaults to the system clock. */
  readonly clock?: StorageClock;
}

/**
 * A thin, vendor-agnostic S3-compatible {@link StorageProvider} over an
 * injectable {@link S3StyleClient}.
 */
export class S3StyleStorageProvider implements StorageProvider {
  readonly id: string;
  readonly endpoint: string | undefined;
  readonly region: string | undefined;
  private readonly bucket: string;
  private readonly client: S3StyleClient | undefined;
  private readonly clock: StorageClock;

  constructor(config: S3StorageConfig, defaultId: string) {
    this.id = config.id ?? defaultId;
    this.bucket = config.bucket;
    this.client = config.client;
    this.endpoint = config.endpoint;
    this.region = config.region;
    this.clock = config.clock ?? systemClock;
  }

  private requireClient(): S3StyleClient {
    if (this.client === undefined) {
      throw new Error(
        `storage provider "${this.id}" is not configured: no S3-compatible client injected`,
      );
    }
    return this.client;
  }

  async put(key: string, data: ObjectStream): Promise<PutResult> {
    const result = await this.requireClient().putObject({
      bucket: this.bucket,
      key,
      body: data,
    });
    const put: PutResult = { key };
    return result.etag !== undefined || result.sizeBytes !== undefined
      ? { ...put, ...trimUndefined({ etag: result.etag, sizeBytes: result.sizeBytes }) }
      : put;
  }

  async get(key: string): Promise<ObjectStream> {
    return this.requireClient().getObject({ bucket: this.bucket, key });
  }

  async signUploadTarget(key: string, ttlSeconds: number): Promise<SignedTarget> {
    const presigned = await this.requireClient().presignPut({
      bucket: this.bucket,
      key,
      expiresInSeconds: ttlSeconds,
    });
    const issued = this.clock.now();
    const expires = new Date(issued.getTime() + ttlSeconds * 1000);
    const target: SignedTarget = {
      key,
      providerId: this.id,
      url: presigned.url,
      method: presigned.method ?? "PUT",
      issuedAt: issued.toISOString(),
      expiresAt: expires.toISOString(),
      ttlSeconds,
    };
    return presigned.headers !== undefined
      ? { ...target, headers: presigned.headers }
      : target;
  }

  async healthCheck(): Promise<void> {
    // Missing client => invalid configuration; the router retains the prior
    // provider (R9.4). Otherwise validate connectivity through the client.
    await this.requireClient().ping();
  }
}

/** Drop keys whose value is `undefined` so exactOptionalPropertyTypes holds. */
function trimUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Options for {@link createStorageProviderPlugin}. */
export interface StorageProviderPluginOptions {
  /** Stable plugin identifier. */
  readonly pluginId: string;
  /** Capability id registered on activation. */
  readonly capabilityId: string;
  /** The provider exposed as the capability value. */
  readonly provider: StorageProvider;
}

/**
 * Wrap any {@link StorageProvider} as a Plugin_Manager plugin of type
 * `"storage"`. Shared by every S3-family storage plugin package.
 */
export function createStorageProviderPlugin(
  options: StorageProviderPluginOptions,
): Plugin {
  const { pluginId, capabilityId, provider } = options;
  return {
    id: pluginId,
    type: "storage",
    activate(_context: PluginContext): Capability[] {
      return [{ id: capabilityId, kind: "storage", value: provider }];
    },
    deactivate(_context: PluginContext): void {
      // No long-lived resources held by the adapter itself.
    },
  };
}

/** Construct an Amazon S3 storage provider. */
export function createS3StorageProvider(config: S3StorageConfig): S3StyleStorageProvider {
  return new S3StyleStorageProvider(config, "s3");
}

/** Construct the Amazon S3 storage plugin. */
export function createS3StoragePlugin(config: S3StorageConfig): Plugin {
  return createStorageProviderPlugin({
    pluginId: S3_STORAGE_PLUGIN_ID,
    capabilityId: S3_STORAGE_CAPABILITY_ID,
    provider: createS3StorageProvider(config),
  });
}

/**
 * A default S3 storage plugin with no client injected. Its `healthCheck` fails
 * until an operator supplies a configured client via {@link createS3StoragePlugin},
 * so activation is correctly rejected while unconfigured (R9.4).
 */
export const s3StoragePlugin: Plugin = createS3StoragePlugin({ bucket: "" });

export default s3StoragePlugin;
