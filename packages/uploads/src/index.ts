/**
 * @streetstudio/uploads
 *
 * The Uploads domain — chunked/resumable upload sessions (pending → completed /
 * aborted) that assemble **real objects** in storage — built on the StreetJS
 * framework and `@streetjs/storage`. Domain rules are pure; persistence, object
 * storage, and the HTTP API compose the framework and never reimplement it.
 */
export const DOMAIN =
  "Uploads: chunked/resumable sessions assembling real objects in storage." as const;

// Domain
export {
  UploadSession,
  UploadStateError,
  type UploadStatus,
  type UploadSessionProps,
  type Actor,
} from "./domain/upload-session.js";

// Application
export {
  UploadService,
  type BeginUploadInput,
  type Clock,
} from "./application/upload-service.js";

// Persistence
export { UploadSessionRepository } from "./persistence/upload-session-repository.js";
export { ensureUploadsSchema, UPLOAD_SESSIONS_TABLE_DDL } from "./persistence/schema.js";

// API / composition
export { UploadsController } from "./api/uploads-controller.js";
export { createUploadsApp, registerUploads } from "./api/app.js";
