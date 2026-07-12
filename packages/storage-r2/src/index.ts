/**
 * @streetstudio/storage-r2
 *
 * Cloudflare R2 {@link StorageProvider} delivered as an isolated plugin
 * (Requirement 9.2). R2 is S3-compatible, so this package reuses the S3-style
 * implementation from `@streetstudio/storage-s3`, parameterized by the R2
 * account endpoint. It implements the storage contract from
 * `@streetstudio/media` and the {@link Plugin} contract from
 * `@streetstudio/plugins` (type `"storage"`). No provider is imported into
 * platform core, and no cloud vendor SDK is hard-imported — the S3-compatible
 * client is injected at deployment time.
 */
import type { Plugin } from "@streetstudio/plugins";
import {
  S3StyleStorageProvider,
  createStorageProviderPlugin,
  type S3StorageConfig,
} from "@streetstudio/storage-s3";

export const DOMAIN = "Cloudflare R2 storage provider plugin." as const;

/** Stable identifier for the Cloudflare R2 storage provider plugin. */
export const R2_STORAGE_PLUGIN_ID = "streetstudio.storage.r2";

/** Capability id registered by the R2 storage plugin on activation. */
export const R2_STORAGE_CAPABILITY_ID = "storage.r2";

/**
 * Configuration for the Cloudflare R2 provider. R2 requires an account
 * endpoint (e.g. `https://<account>.r2.cloudflarestorage.com`).
 */
export interface R2StorageConfig extends S3StorageConfig {
  /** The R2 account endpoint. */
  readonly endpoint: string;
}

/** Construct a Cloudflare R2 storage provider (S3-compatible). */
export function createR2StorageProvider(config: R2StorageConfig): S3StyleStorageProvider {
  return new S3StyleStorageProvider(config, "r2");
}

/** Construct the Cloudflare R2 storage plugin. */
export function createR2StoragePlugin(config: R2StorageConfig): Plugin {
  return createStorageProviderPlugin({
    pluginId: R2_STORAGE_PLUGIN_ID,
    capabilityId: R2_STORAGE_CAPABILITY_ID,
    provider: createR2StorageProvider(config),
  });
}

/**
 * A default R2 storage plugin with no client injected; its `healthCheck` fails
 * until an operator supplies a configured client via {@link createR2StoragePlugin}
 * (R9.4).
 */
export const r2StoragePlugin: Plugin = createR2StoragePlugin({
  bucket: "",
  endpoint: "",
});

export default r2StoragePlugin;
