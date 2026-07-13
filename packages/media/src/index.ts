/**
 * @streetstudio/media
 *
 * Public entry point for the media domain: videos, assets, the storage
 * abstraction, comments, sharing, playback, and search.
 */
import type { AuthContext } from "@streetstudio/auth";
import type { PluginType } from "@streetstudio/plugins";

export const DOMAIN =
  "Media domain: videos, assets, storage abstraction, comments, sharing, playback, and search." as const;

/** Placeholder access context threaded through media operations. */
export interface AccessContext {
  readonly auth: AuthContext;
}

/** Storage providers are supplied by plugins of this type. */
export const STORAGE_PLUGIN_TYPE: PluginType = "storage";

// --- Content Hierarchy Service (task 11.1) ---------------------------------
export {
  ContentService,
  repositoryContentStore,
  CREATE_PROJECT_PERMISSION,
  CREATE_FOLDER_PERMISSION,
  MAX_FOLDER_NESTING_DEPTH,
  NAME_MIN_LENGTH,
  NAME_MAX_LENGTH,
} from "./content.js";
export type {
  ContentServiceDeps,
  ContentStore,
  FolderRef,
} from "./content.js";

// --- Storage Abstraction and Provider Contract (task 13.1) -----------------
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

// --- Streaming & Playback Service (task 17.1) ------------------------------
export {
  PlaybackService,
  repositoryPlaybackStore,
  repositoryShareCredentialResolver,
  VIEW_VIDEO_PERMISSION,
} from "./playback.js";
export type {
  PlaybackServiceDeps,
  PlaybackStore,
  PlaybackContext,
  ShareCredentialResolver,
  ResolvedShare,
  StreamManifest,
  ManifestRendition,
} from "./playback.js";

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

// --- Comments, Threads, Reactions & Mentions Service (task 20.1) -----------
export {
  CommentService,
  repositoryCommentStore,
  POST_COMMENT_PERMISSION,
  COMMENT_BODY_MIN_LENGTH,
  COMMENT_BODY_MAX_LENGTH,
  MENTION_EVENT_TYPE,
} from "./comment.js";
export type {
  CommentServiceDeps,
  CommentStore,
  ReactionTarget,
  MentionNotifier,
} from "./comment.js";

// --- Search & Transcript Search Service (task 23.1) ------------------------
export {
  SearchService,
  SEARCH_QUERY_MIN_LENGTH,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_MAX_PAGE_SIZE,
  VIEW_ASSET_PERMISSION,
} from "./search.js";
export type {
  SearchServiceDeps,
  SearchIndex,
  IndexedMatch,
  SearchHit,
  SearchPage,
  Cursor,
} from "./search.js";

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
