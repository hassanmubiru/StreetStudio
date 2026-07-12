/**
 * @streetstudio/storage-gcs
 *
 * Google Cloud Storage {@link StorageProvider} delivered as an isolated plugin
 * (Requirement 9.2). Implements the storage contract from
 * `@streetstudio/media` and the {@link Plugin} contract from
 * `@streetstudio/plugins` (type `"storage"`). No provider is imported into
 * platform core.
 *
 * No Google vendor SDK is hard-imported into the workspace build. The provider
 * is a thin adapter over an injectable {@link GcsClient} seam that host wiring
 * supplies (backed by `@google-cloud/storage`) at deployment time.
 */
import type {
  ObjectStream,
  PutResult,
  SignedTarget,
  StorageProvider,
} from "@streetstudio/media";
import type { Capability, Plugin, PluginContext } from "@streetstudio/plugins";

export const DOMAIN = "Google Cloud Storage provider plugin." as const;

/** Stable identifier for the Google Cloud Storage provider plugin. */
export const GCS_STORAGE_PLUGIN_ID = "streetstudio.storage.gcs";

/** Capability id registered by the GCS storage plugin on activation. */
export const GCS_STORAGE_CAPABILITY_ID = "storage.gcs";

/** Default provider id when none is supplied. */
export const DEFAULT_GCS_PROVIDER_ID = "gcs";

/** Minimal injectable time source, so signed-target expiry is deterministic. */
export interface StorageClock {
  now(): Date;
}

const systemClock: StorageClock = { now: () => new Date() };

/** Result of an object write. */
export interface GcsWriteResult {
  /** Object generation/version identifier, if any. */
  readonly generation?: string;
  /** Number of bytes persisted, if known. */
  readonly sizeBytes?: number;
}

/** A V4-signed resumable/simple upload target produced by the service. */
export interface GcsSignedUpload {
  /** The signed upload URL. */
  readonly url: string;
  /** HTTP method the client must use (defaults to `PUT`). */
  readonly method?: string;
  /** Additional headers the client must send with the upload. */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * The injectable GCS client seam. Host wiring supplies a concrete
 * implementation backed by the Google Cloud SDK; the workspace build depends on
 * none.
 */
export interface GcsClient {
  /** Persist `body` under `object` in `bucket`. */
  saveObject(params: {
    readonly bucket: string;
    readonly object: string;
    readonly body: ObjectStream;
  }): Promise<GcsWriteResult>;
  /** Read the object named `object` from `bucket`. */
  readObject(params: {
    readonly bucket: string;
    readonly object: string;
  }): Promise<ObjectStream>;
  /** Generate a V4-signed upload URL valid for `expiresInSeconds`. */
  getSignedUploadUrl(params: {
    readonly bucket: string;
    readonly object: string;
    readonly expiresInSeconds: number;
  }): Promise<GcsSignedUpload>;
  /** Validate configuration/connectivity (e.g. a get-bucket-metadata call). */
  ping(): Promise<void>;
}

/** Configuration for the Google Cloud Storage provider. */
export interface GcsStorageConfig {
  /** Stable provider identifier; recorded on write failures. */
  readonly id?: string;
  /** Target bucket name. */
  readonly bucket: string;
  /**
   * Injectable GCS client. When omitted, {@link healthCheck} fails so the
   * router retains the previously active provider (R9.4).
   */
  readonly client?: GcsClient;
  /** Time source for signed-target issue/expiry; defaults to the system clock. */
  readonly clock?: StorageClock;
}

/** A thin, vendor-agnostic Google Cloud Storage {@link StorageProvider}. */
export class GcsStorageProvider implements StorageProvider {
  readonly id: string;
  private readonly bucket: string;
  private readonly client: GcsClient | undefined;
  private readonly clock: StorageClock;

  constructor(config: GcsStorageConfig) {
    this.id = config.id ?? DEFAULT_GCS_PROVIDER_ID;
    this.bucket = config.bucket;
    this.client = config.client;
    this.clock = config.clock ?? systemClock;
  }

  private requireClient(): GcsClient {
    if (this.client === undefined) {
      throw new Error(
        `storage provider "${this.id}" is not configured: no GCS client injected`,
      );
    }
    return this.client;
  }

  async put(key: string, data: ObjectStream): Promise<PutResult> {
    const result = await this.requireClient().saveObject({
      bucket: this.bucket,
      object: key,
      body: data,
    });
    return { key, etag: result.generation, sizeBytes: result.sizeBytes };
  }

  async get(key: string): Promise<ObjectStream> {
    return this.requireClient().readObject({ bucket: this.bucket, object: key });
  }

  async signUploadTarget(key: string, ttlSeconds: number): Promise<SignedTarget> {
    const signed = await this.requireClient().getSignedUploadUrl({
      bucket: this.bucket,
      object: key,
      expiresInSeconds: ttlSeconds,
    });
    const issued = this.clock.now();
    const expires = new Date(issued.getTime() + ttlSeconds * 1000);
    return {
      key,
      providerId: this.id,
      url: signed.url,
      method: signed.method ?? "PUT",
      headers: signed.headers,
      issuedAt: issued.toISOString(),
      expiresAt: expires.toISOString(),
      ttlSeconds,
    };
  }

  async healthCheck(): Promise<void> {
    await this.requireClient().ping();
  }
}

/** Construct a Google Cloud Storage provider. */
export function createGcsStorageProvider(config: GcsStorageConfig): GcsStorageProvider {
  return new GcsStorageProvider(config);
}

/** Construct the Google Cloud Storage plugin. */
export function createGcsStoragePlugin(config: GcsStorageConfig): Plugin {
  const provider = createGcsStorageProvider(config);
  return {
    id: GCS_STORAGE_PLUGIN_ID,
    type: "storage",
    activate(_context: PluginContext): Capability[] {
      return [{ id: GCS_STORAGE_CAPABILITY_ID, kind: "storage", value: provider }];
    },
    deactivate(_context: PluginContext): void {
      // No long-lived resources held by the adapter itself.
    },
  };
}

/**
 * A default GCS storage plugin with no client injected; its `healthCheck` fails
 * until an operator supplies a configured client via {@link createGcsStoragePlugin}
 * (R9.4).
 */
export const gcsStoragePlugin: Plugin = createGcsStoragePlugin({ bucket: "" });

export default gcsStoragePlugin;
