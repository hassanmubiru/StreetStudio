/**
 * @streetstudio/media
 *
 * Public entry point for the media domain: videos, assets, the storage
 * abstraction, comments, sharing, playback, and search.
 */
import type { AuthContext } from "@streetstudio/auth";
import type { PluginType } from "@streetstudio/plugins";

export const DOMAIN =
  "Media domain: videos, assets, uploads, sharing, developer assets, and engineering reviews." as const;

/** Placeholder access context threaded through media operations. */
export interface AccessContext {
  readonly auth: AuthContext;
}

/** Storage providers are supplied by plugins of this type. */
export const STORAGE_PLUGIN_TYPE: PluginType = "storage";

// The content hierarchy (projects/folders/workspaces) lives in
// `@streetstudio/projects`; the storage abstraction and StorageProvider contract
// live in `@streetstudio/storage` (providers ship as plugins). The media upload
// service consumes the storage router from `@streetstudio/storage`.

// --- Media-domain permission contracts -------------------------------------
// Streaming & playback itself now lives in `@streetstudio/player`; the
// VIEW_VIDEO_PERMISSION contract remains here in the media domain (it gates
// comments and search too) and is re-exported by the player for its consumers.
export { VIEW_VIDEO_PERMISSION } from "./permissions.js";

// --- Sharing & Content Permissions (task 19.1) -----------------------------
export {
  ShareService,
  ContentPermissionGuard,
  Sha256PasscodeHasher,
  repositoryShareStore,
  SHARE_VIDEO_PERMISSION,
  MAX_PASSCODE_ATTEMPTS,
  SHARE_LOCK_DURATION_MS,
} from "./share.js";
export type {
  ShareServiceDeps,
  ShareStore,
  ShareOptions,
  ShareAccess,
  PasscodeHasher,
  ContentResourceType,
  ContentResourceRef,
} from "./share.js";

// --- Chunked & Resumable Upload Service (task 14.1) ------------------------
export {
  UploadService,
  repositoryUploadStore,
  storageRouterChunkStorage,
  sha256ChunkVerifier,
  MIN_CHUNK_BYTES,
  MAX_CHUNK_BYTES,
  UPLOAD_SESSION_LIFETIME_MS,
  MAX_CHUNK_INTEGRITY_ATTEMPTS,
} from "./upload.js";
export type {
  UploadServiceDeps,
  UploadStore,
  ChunkStorage,
  ChunkVerifier,
  UploadProgressEmitter,
  UploadProgressEvent,
  UploadMeta,
  UploadChunk,
  ChunkAck,
  UploadStatus,
  AssembledObject,
  StorageRouterChunkStorageOptions,
} from "./upload.js";

// Comments live in `@streetstudio/comments`; search lives in
// `@streetstudio/search`. Both build on the media-domain permission contracts
// exported above (`VIEW_VIDEO_PERMISSION`).

// --- Developer Mode Assets Service (task 30.1) -----------------------------
export {
  DeveloperAssets,
  repositoryDeveloperAssetStore,
  CREATE_ASSET_PERMISSION,
  DEV_ASSET_BODY_MIN_LENGTH,
  DEV_ASSET_BODY_MAX_LENGTH,
} from "./developer-assets.js";
export type {
  DeveloperAssetsDeps,
  DeveloperAssetStore,
  TerminalCapture,
  ApiRecording,
} from "./developer-assets.js";

// --- Engineering Reviews Service (task 31.1) -------------------------------
export {
  ReviewService,
  repositoryReviewStore,
  LINK_PULL_REQUEST_PERMISSION,
} from "./review.js";
export type {
  ReviewServiceDeps,
  ReviewStore,
  SourceControlAccess,
  CommentPoster,
  PrRef,
  ResolvedPullRequest,
} from "./review.js";

// The knowledge base (transcript indexing, summaries, doc links) lives in
// `@streetstudio/knowledge`, which evolves independently of media bytes.
