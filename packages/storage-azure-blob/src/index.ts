/**
 * @streetstudio/storage-azure-blob
 *
 * Azure Blob Storage {@link StorageProvider} delivered as an isolated plugin
 * (Requirement 9.2). Implements the storage contract from
 * `@streetstudio/storage` and the {@link Plugin} contract from
 * `@streetstudio/plugins` (type `"storage"`). No provider is imported into
 * platform core.
 *
 * No Azure vendor SDK is hard-imported into the workspace build. The provider
 * is a thin adapter over an injectable {@link AzureBlobClient} seam that host
 * wiring supplies (backed by `@azure/storage-blob`) at deployment time.
 */
import type {
  ObjectStream,
  PutResult,
  SignedTarget,
  StorageProvider,
} from "@streetstudio/storage";
import type { Capability, Plugin, PluginContext } from "@streetstudio/plugins";

export const DOMAIN = "Azure Blob Storage provider plugin." as const;

/** Stable identifier for the Azure Blob storage provider plugin. */
export const AZURE_BLOB_STORAGE_PLUGIN_ID = "streetstudio.storage.azure-blob";

/** Capability id registered by the Azure Blob storage plugin on activation. */
export const AZURE_BLOB_STORAGE_CAPABILITY_ID = "storage.azure-blob";

/** Default provider id when none is supplied. */
export const DEFAULT_AZURE_BLOB_PROVIDER_ID = "azure-blob";

/** Minimal injectable time source, so signed-target expiry is deterministic. */
export interface StorageClock {
  now(): Date;
}

const systemClock: StorageClock = { now: () => new Date() };

/** Result of a blob upload. */
export interface AzureBlobUploadResult {
  /** ETag returned by the service, if any. */
  readonly etag?: string;
  /** Number of bytes persisted, if known. */
  readonly sizeBytes?: number;
}

/** A SAS (shared-access-signature) upload target produced by the service. */
export interface AzureSasUpload {
  /** The SAS upload URL. */
  readonly url: string;
  /** HTTP method the client must use (defaults to `PUT`). */
  readonly method?: string;
  /** Additional headers the client must send with the upload. */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * The injectable Azure Blob client seam. Host wiring supplies a concrete
 * implementation backed by the Azure SDK; the workspace build depends on none.
 */
export interface AzureBlobClient {
  /** Upload `body` to the blob named `blob` in `container`. */
  uploadBlob(params: {
    readonly container: string;
    readonly blob: string;
    readonly body: ObjectStream;
  }): Promise<AzureBlobUploadResult>;
  /** Download the blob named `blob` from `container`. */
  downloadBlob(params: {
    readonly container: string;
    readonly blob: string;
  }): Promise<ObjectStream>;
  /** Generate a SAS upload URL valid for `expiresInSeconds`. */
  generateSasUpload(params: {
    readonly container: string;
    readonly blob: string;
    readonly expiresInSeconds: number;
  }): Promise<AzureSasUpload>;
  /** Validate configuration/connectivity (e.g. a get-container-properties call). */
  ping(): Promise<void>;
}

/** Configuration for the Azure Blob storage provider. */
export interface AzureBlobStorageConfig {
  /** Stable provider identifier; recorded on write failures. */
  readonly id?: string;
  /** Target container name. */
  readonly container: string;
  /**
   * Injectable Azure Blob client. When omitted, {@link healthCheck} fails so
   * the router retains the previously active provider (R9.4).
   */
  readonly client?: AzureBlobClient;
  /** Time source for signed-target issue/expiry; defaults to the system clock. */
  readonly clock?: StorageClock;
}

/** A thin, vendor-agnostic Azure Blob {@link StorageProvider}. */
export class AzureBlobStorageProvider implements StorageProvider {
  readonly id: string;
  private readonly container: string;
  private readonly client: AzureBlobClient | undefined;
  private readonly clock: StorageClock;

  constructor(config: AzureBlobStorageConfig) {
    this.id = config.id ?? DEFAULT_AZURE_BLOB_PROVIDER_ID;
    this.container = config.container;
    this.client = config.client;
    this.clock = config.clock ?? systemClock;
  }

  private requireClient(): AzureBlobClient {
    if (this.client === undefined) {
      throw new Error(
        `storage provider "${this.id}" is not configured: no Azure Blob client injected`,
      );
    }
    return this.client;
  }

  async put(key: string, data: ObjectStream): Promise<PutResult> {
    const result = await this.requireClient().uploadBlob({
      container: this.container,
      blob: key,
      body: data,
    });
    return { key, etag: result.etag, sizeBytes: result.sizeBytes };
  }

  async get(key: string): Promise<ObjectStream> {
    return this.requireClient().downloadBlob({ container: this.container, blob: key });
  }

  async signUploadTarget(key: string, ttlSeconds: number): Promise<SignedTarget> {
    const sas = await this.requireClient().generateSasUpload({
      container: this.container,
      blob: key,
      expiresInSeconds: ttlSeconds,
    });
    const issued = this.clock.now();
    const expires = new Date(issued.getTime() + ttlSeconds * 1000);
    return {
      key,
      providerId: this.id,
      url: sas.url,
      method: sas.method ?? "PUT",
      headers: sas.headers,
      issuedAt: issued.toISOString(),
      expiresAt: expires.toISOString(),
      ttlSeconds,
    };
  }

  async healthCheck(): Promise<void> {
    await this.requireClient().ping();
  }
}

/** Construct an Azure Blob storage provider. */
export function createAzureBlobStorageProvider(
  config: AzureBlobStorageConfig,
): AzureBlobStorageProvider {
  return new AzureBlobStorageProvider(config);
}

/** Construct the Azure Blob storage plugin. */
export function createAzureBlobStoragePlugin(config: AzureBlobStorageConfig): Plugin {
  const provider = createAzureBlobStorageProvider(config);
  return {
    id: AZURE_BLOB_STORAGE_PLUGIN_ID,
    type: "storage",
    activate(_context: PluginContext): Capability[] {
      return [
        { id: AZURE_BLOB_STORAGE_CAPABILITY_ID, kind: "storage", value: provider },
      ];
    },
    deactivate(_context: PluginContext): void {
      // No long-lived resources held by the adapter itself.
    },
  };
}

/**
 * A default Azure Blob storage plugin with no client injected; its
 * `healthCheck` fails until an operator supplies a configured client via
 * {@link createAzureBlobStoragePlugin} (R9.4).
 */
export const azureBlobStoragePlugin: Plugin = createAzureBlobStoragePlugin({
  container: "",
});

export default azureBlobStoragePlugin;
