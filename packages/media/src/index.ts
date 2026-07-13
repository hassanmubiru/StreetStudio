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
