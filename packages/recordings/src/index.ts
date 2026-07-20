/**
 * @streetstudio/recordings
 *
 * The Recordings domain — the lifecycle of a captured recording (draft →
 * published → archived) and the rules that govern it — built on the StreetJS
 * framework. Domain rules are pure; persistence and the HTTP API compose
 * StreetJS (`PgPool`, HTTP/DI) and never reimplement it.
 */
export const DOMAIN =
  "Recordings: lifecycle (draft → published → archived), persistence, and API." as const;

// Domain
export {
  Recording,
  RecordingStateError,
  type RecordingStatus,
  type RecordingProps,
  type Actor,
} from "./domain/recording.js";

// Application
export {
  RecordingService,
  type CreateRecordingInput,
  type Clock,
} from "./application/recording-service.js";

// Persistence
export { RecordingRepository } from "./persistence/recording-repository.js";
export { ensureRecordingsSchema, RECORDINGS_TABLE_DDL } from "./persistence/schema.js";

// API / composition
export { RecordingsController } from "./api/recordings-controller.js";
export { createRecordingsApp, registerRecordings } from "./api/app.js";
