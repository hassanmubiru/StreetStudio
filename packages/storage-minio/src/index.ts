/**
 * @streetstudio/storage-minio
 *
 * MinIO {@link StorageProvider} delivered as an isolated plugin (Requirement
 * 9.2). MinIO is S3-compatible, so this package reuses the S3-style
 * implementation from `@streetstudio/storage-s3`, parameterized by the MinIO
 * server endpoint. It implements the storage contract from
 * `@streetstudio/storage` and the {@link Plugin} contract from
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

export const DOMAIN = "MinIO storage provider plugin." as const;

/** Stable identifier for the MinIO storage provider plugin. */
export const MINIO_STORAGE_PLUGIN_ID = "streetstudio.storage.minio";

/** Capability id registered by the MinIO storage plugin on activation. */
export const MINIO_STORAGE_CAPABILITY_ID = "storage.minio";

/**
 * Configuration for the MinIO provider. MinIO requires a server endpoint (e.g.
 * `https://minio.internal:9000`).
 */
export interface MinioStorageConfig extends S3StorageConfig {
  /** The MinIO server endpoint. */
  readonly endpoint: string;
}

/** Construct a MinIO storage provider (S3-compatible). */
export function createMinioStorageProvider(
  config: MinioStorageConfig,
): S3StyleStorageProvider {
  return new S3StyleStorageProvider(config, "minio");
}

/** Construct the MinIO storage plugin. */
export function createMinioStoragePlugin(config: MinioStorageConfig): Plugin {
  return createStorageProviderPlugin({
    pluginId: MINIO_STORAGE_PLUGIN_ID,
    capabilityId: MINIO_STORAGE_CAPABILITY_ID,
    provider: createMinioStorageProvider(config),
  });
}

/**
 * A default MinIO storage plugin with no client injected; its `healthCheck`
 * fails until an operator supplies a configured client via
 * {@link createMinioStoragePlugin} (R9.4).
 */
export const minioStoragePlugin: Plugin = createMinioStoragePlugin({
  bucket: "",
  endpoint: "",
});

export default minioStoragePlugin;
