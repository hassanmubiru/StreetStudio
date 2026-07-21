/**
 * Canonical assembly of the API_Service's {@link MediaPipeline} on the **store
 * of record** — the `@streetstudio/database` repository layer over the single
 * canonical schema (ADR-0021, step 3: repoint a domain's production default onto
 * the canonical path).
 *
 * The pipeline reaches persistence only through its {@link ProcessingStore}
 * port, so repointing is a wiring change: its production default now uses
 * `repositoryProcessingStore` bound to the real `PgPool`-backed repositories
 * (canonical singular, FK-constrained `video`/`asset`/`rendition` tables). The
 * status transition uses the repository's in-place `update`, so the FK-owned
 * assets/renditions are never cascade-deleted. The standalone direct-`PgPool`
 * `postgresProcessingStore` adapter is retained as integration proof.
 */
import { PgPool } from "streetjs";
import {
  MediaPipeline,
  repositoryProcessingStore,
  type MediaPipelineOptions,
  type ProcessingQueue,
  type ProcessingStatusEmitter,
  type Transcoder,
} from "@streetstudio/processing";
import { assemblePostgresRepositories } from "../persistence/postgres-database.js";

/** Collaborators for {@link assemblePostgresMediaPipeline} beyond persistence. */
export interface MediaPipelineCollaborators {
  /** Background-work queue seam (StreetJS queues in production). */
  readonly queue: ProcessingQueue;
  /** Transcoder seam (ffmpeg/vendor outside core). */
  readonly transcoder: Transcoder;
  /** Realtime status-transition seam. */
  readonly emitter: ProcessingStatusEmitter;
  /** Optional behavior options (max attempts, clock, id generator). */
  readonly options?: MediaPipelineOptions;
}

/**
 * Build the real `MediaPipeline` on the canonical repository layer from a live
 * `PgPool` and the injected queue/transcoder/emitter collaborators. The schema
 * is provisioned once at startup via `ensureCanonicalSchema`.
 */
export function assemblePostgresMediaPipeline(
  pool: PgPool,
  collaborators: MediaPipelineCollaborators,
): MediaPipeline {
  const repositories = assemblePostgresRepositories(pool);
  return new MediaPipeline({
    store: repositoryProcessingStore(repositories),
    queue: collaborators.queue,
    transcoder: collaborators.transcoder,
    emitter: collaborators.emitter,
    ...(collaborators.options ? { options: collaborators.options } : {}),
  });
}
