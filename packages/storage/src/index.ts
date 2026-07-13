/**
 * @streetstudio/storage
 *
 * The storage abstraction: the `StorageProvider` contract, the `StorageRouter`
 * that persistence flows through, and the signed-target TTL policy. Concrete
 * providers (Local, S3, R2, Azure Blob, GCS, MinIO) ship as plugins that
 * implement `StorageProvider` — no vendor code lives here.
 */
export const DOMAIN =
  "Storage abstraction: the StorageProvider contract, routing, and signed-target policy. Providers ship as plugins." as const;

export {
  StorageRouter,
  STORAGE_WRITE_ACK_TIMEOUT_MS,
  SIGNED_UPLOAD_MIN_TTL_SECONDS,
  SIGNED_UPLOAD_MAX_TTL_SECONDS,
  SIGNED_UPLOAD_DEFAULT_TTL_SECONDS,
  DIRECT_UPLOAD_MAX_TTL_SECONDS,
} from "./storage.js";
export type {
  StorageProvider,
  ObjectStream,
  PutResult,
  SignedTarget,
  StorageRouterOptions,
  StorageFailureRecorder,
  StorageWriteFailure,
  StorageWriteFailureReason,
} from "./storage.js";
