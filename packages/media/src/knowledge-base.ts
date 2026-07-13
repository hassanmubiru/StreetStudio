/**
 * Knowledge Base (`packages/media`).
 *
 * Implements the design's "Knowledge Base" section and Requirement 25: Knowledge
 * Base. The {@link KnowledgeBase} turns recorded Videos into discoverable
 * knowledge by capturing three kinds of associated artifact:
 *
 *  - {@link KnowledgeBase.indexTranscript} persists a Video's transcript and
 *    makes its text searchable within the requesting Members' authorized scope
 *    (R25.1). The transcript is stored with an `indexedAt` timestamp and its
 *    segment text is pushed to the pluggable {@link TranscriptIndexer} seam
 *    (the search backend the {@link SearchService} reads), so the transcript
 *    becomes searchable. This is a system/pipeline operation invoked when a
 *    transcript becomes available, so it takes no {@link AuthContext} and
 *    performs no permission check.
 *  - {@link KnowledgeBase.storeSummary} stores a provider-produced summary of a
 *    Video IF AND ONLY IF its body is between {@link SUMMARY_BODY_MIN_LENGTH}
 *    and {@link SUMMARY_BODY_MAX_LENGTH} characters (R25.2). The producing
 *    AI_Provider plugin is recorded as the summary's `sourcePluginId` (the
 *    "provider-produced" association of R25.2). Like transcript indexing this
 *    is an AI-pipeline operation and takes no {@link AuthContext}.
 *  - {@link KnowledgeBase.linkDoc} links an external documentation reference to
 *    a Video and makes it retrievable IF AND ONLY IF (a) the URL is between
 *    {@link DOC_URL_MIN_LENGTH} and {@link DOC_URL_MAX_LENGTH} characters
 *    (R25.3, R25.4), (b) the requester holds edit permission in the Video's
 *    owning Organization (R25.5), and (c) the Video has fewer than
 *    {@link MAX_DOC_LINKS_PER_VIDEO} existing documentation links (R25.3,
 *    R25.6). When all hold the association is stored and the resulting
 *    {@link DocLinkDto} returned; otherwise no association is created.
 *
 * `linkDoc` resolution order is deliberate: the Video is resolved first
 * (`NOT_FOUND` when unknown), then the URL is validated (`VALIDATION_FAILED`,
 * R25.4), then edit permission is enforced (`AUTHORIZATION_DENIED`, R25.5) —
 * placed before the cap check so an unauthorized caller cannot probe how many
 * links a Video already has — then the per-Video cap is enforced (`CONFLICT`,
 * R25.6). Any failure creates no link association (R25.4, R25.5, R25.6).
 *
 * Every failure is surfaced through the shared error taxonomy (`AppError`): an
 * unknown Video raises `NOT_FOUND`; an empty/over-2048-character URL raises
 * `VALIDATION_FAILED` (R25.4); a requester lacking edit permission raises
 * `AUTHORIZATION_DENIED` (R25.5); and a Video already at the 100-link cap raises
 * `CONFLICT` (R25.6) — a state conflict distinct from the URL validation error.
 *
 * Persistence is reached only through the narrow {@link KnowledgeStore} port,
 * search indexing only through the {@link TranscriptIndexer} seam, and
 * authorization only through the {@link AccessControl} seam from
 * `@streetstudio/auth`, so the service is decoupled from the concrete database
 * and search backends and unit-testable with in-memory fakes. The default store
 * adapter ({@link repositoryKnowledgeStore}) is backed by the Transcript,
 * Summary, DocLink, and Video repositories exposed by `@streetstudio/database`.
 */
import { newUuid } from "@streetstudio/database";
import type {
  DocLinkRecord,
  Repositories,
  SummaryRecord,
  TranscriptRecord,
  VideoRecord,
} from "@streetstudio/database";
import {
  systemClock,
  toIsoTimestamp,
  type AccessControl,
  type AuthContext,
  type Clock,
} from "@streetstudio/auth";
import { AppError } from "@streetstudio/shared";
import type {
  DocLinkDto,
  SummaryDto,
  TranscriptSegmentDto,
  Uuid,
} from "@streetstudio/shared";

/** Minimum length, in characters, of a provider-produced summary (R25.2). Empty is rejected. */
export const SUMMARY_BODY_MIN_LENGTH = 1;

/** Maximum length, in characters, of a provider-produced summary (R25.2). */
export const SUMMARY_BODY_MAX_LENGTH = 10000;

/** Minimum length, in characters, of a documentation reference URL (R25.4). Empty is rejected. */
export const DOC_URL_MIN_LENGTH = 1;

/** Maximum length, in characters, of a documentation reference URL (R25.4). */
export const DOC_URL_MAX_LENGTH = 2048;

/** Maximum number of documentation links that may be associated with one Video (R25.3, R25.6). */
export const MAX_DOC_LINKS_PER_VIDEO = 100;

/**
 * Permission a Role must grant to link a documentation reference to a Video
 * within an Organization (R25.5). Evaluated by {@link AccessControl.can} in the
 * Video's owning Organization scope.
 */
export const LINK_DOC_PERMISSION = "content:link_doc";

/**
 * A Video transcript's content: an ordered list of timed segments. This is the
 * `Transcript` the design's `indexTranscript(videoId, transcript)` accepts —
 * the segment text is what becomes searchable (R25.1).
 */
export interface Transcript {
  /** The transcript's timed segments, in playback order. */
  readonly segments: readonly TranscriptSegmentDto[];
}

/**
 * Narrow, injectable port over the search index/backend that makes transcript
 * text searchable (R25.1).
 *
 * The Knowledge Base does not depend on a concrete search backend; a caller
 * wires an adapter that pushes the transcript's segment text into whatever index
 * the {@link SearchService} reads (full-text, vector, or AI_Provider-backed
 * semantic index). Authorization is NOT this seam's concern — the
 * {@link SearchService} filters every candidate to the requester's authorized
 * scope at query time.
 */
export interface TranscriptIndexer {
  /** Make `segments` searchable for `videoId`. */
  index(videoId: Uuid, segments: readonly TranscriptSegmentDto[]): Promise<void>;
}

/**
 * Persistence port for Knowledge Base artifacts. Deliberately narrow: it
 * persists transcripts and summaries, resolves the target Video (for the owning
 * Organization that scopes `linkDoc` authorization), counts a Video's existing
 * documentation links (for the per-Video cap), and inserts a documentation link.
 */
export interface KnowledgeStore {
  /** Find a Video by id irrespective of tenant, or null when absent. */
  findVideo(videoId: Uuid): Promise<VideoRecord | null>;
  /** Persist a Video transcript and return it. */
  insertTranscript(record: TranscriptRecord): Promise<TranscriptRecord>;
  /** Persist a provider-produced summary and return it. */
  insertSummary(record: SummaryRecord): Promise<SummaryRecord>;
  /** Count the documentation links already associated with `videoId` (R25.6). */
  countDocLinks(videoId: Uuid): Promise<number>;
  /** Persist a new documentation link and return it. */
  insertDocLink(record: DocLinkRecord): Promise<DocLinkRecord>;
}

/** Dependencies required to construct a {@link KnowledgeBase}. */
export interface KnowledgeBaseDeps {
  /** Transcript/Summary/DocLink/Video persistence port. */
  readonly store: KnowledgeStore;
  /** Search backend seam used to make transcript text searchable (R25.1). */
  readonly indexer: TranscriptIndexer;
  /** RBAC evaluator used to gate `linkDoc` in the Video's owning scope (R25.5). */
  readonly access: AccessControl;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
  /** UUID generator; defaults to the database id generator. */
  readonly newId?: () => Uuid;
}

/** Whether `body` is within the permitted summary length bounds (R25.2). */
function isValidSummaryBody(body: string): boolean {
  return (
    body.length >= SUMMARY_BODY_MIN_LENGTH &&
    body.length <= SUMMARY_BODY_MAX_LENGTH
  );
}

/** Whether `url` is within the permitted documentation-reference length bounds (R25.4). */
function isValidDocUrl(url: string): boolean {
  return url.length >= DOC_URL_MIN_LENGTH && url.length <= DOC_URL_MAX_LENGTH;
}

/**
 * The Knowledge Base service. See the module doc for the exact semantics of each
 * operation.
 */
export class KnowledgeBase {
  private readonly store: KnowledgeStore;
  private readonly indexer: TranscriptIndexer;
  private readonly access: AccessControl;
  private readonly clock: Clock;
  private readonly newId: () => Uuid;

  constructor(deps: KnowledgeBaseDeps) {
    this.store = deps.store;
    this.indexer = deps.indexer;
    this.access = deps.access;
    this.clock = deps.clock ?? systemClock;
    this.newId = deps.newId ?? newUuid;
  }

  /**
   * Index `transcript` for `videoId`: persist it with an `indexedAt` timestamp
   * and push its segment text to the search backend so it becomes searchable to
   * Members within their authorized scope (R25.1). This is a system/pipeline
   * operation and performs no permission check.
   */
  async indexTranscript(videoId: Uuid, transcript: Transcript): Promise<void> {
    const record: TranscriptRecord = {
      id: this.newId(),
      videoId,
      segments: [...transcript.segments],
      indexedAt: toIsoTimestamp(this.clock.now()),
    };
    await this.store.insertTranscript(record);
    // R25.1 — make the transcript text searchable within authorized scope.
    await this.indexer.index(videoId, record.segments);
  }

  /**
   * Store a provider-produced `summary` for `videoId`, attributed to the
   * producing AI_Provider plugin `sourcePluginId`. Stores and returns the
   * summary IF AND ONLY IF `summary` is 1–10,000 characters (R25.2); an
   * out-of-range body raises `VALIDATION_FAILED` and stores nothing.
   *
   * The design signature is `storeSummary(videoId, summary)`; the producing
   * plugin id is threaded through so the stored Summary records which enabled
   * AI_Provider produced it (the "provider-produced" association of R25.2),
   * which the {@link SummaryRecord} requires.
   */
  async storeSummary(
    videoId: Uuid,
    summary: string,
    sourcePluginId: Uuid,
  ): Promise<SummaryDto> {
    if (!isValidSummaryBody(summary)) {
      throw new AppError("VALIDATION_FAILED");
    }
    const record: SummaryRecord = {
      id: this.newId(),
      videoId,
      body: summary,
      sourcePluginId,
    };
    const created = await this.store.insertSummary(record);
    return toSummaryDto(created);
  }

  /**
   * Link the documentation reference `url` to `videoId` and make it retrievable.
   * Stores and returns the association IF AND ONLY IF the URL is 1–2048
   * characters (R25.3, R25.4), the requester holds edit permission in the
   * Video's owning Organization (R25.5), and the Video has fewer than 100
   * existing documentation links (R25.3, R25.6).
   *
   * Resolution order: the Video is resolved first (`NOT_FOUND` when unknown),
   * then the URL is validated (`VALIDATION_FAILED`, R25.4), then edit permission
   * is enforced (`AUTHORIZATION_DENIED`, R25.5, before the cap so an
   * unauthorized caller cannot probe the link count), then the per-Video cap is
   * enforced (`CONFLICT`, R25.6). Any failure creates no association.
   */
  async linkDoc(
    actor: AuthContext,
    videoId: Uuid,
    url: string,
  ): Promise<DocLinkDto> {
    const video = await this.store.findVideo(videoId);
    if (!video) {
      throw new AppError("NOT_FOUND");
    }

    // R25.4 — the reference must be a non-empty URL of at most 2048 characters.
    if (!isValidDocUrl(url)) {
      throw new AppError("VALIDATION_FAILED");
    }

    // R25.5 — edit permission, evaluated in the Video's owning Organization
    // scope. Checked before the cap so a denied caller learns nothing about the
    // current link count.
    const permitted = await this.access.can(actor, LINK_DOC_PERMISSION, {
      organizationId: video.organizationId,
      type: "video",
      id: video.id,
    });
    if (!permitted) {
      throw new AppError("AUTHORIZATION_DENIED");
    }

    // R25.6 — reject once the Video already holds the maximum number of links.
    const existing = await this.store.countDocLinks(video.id);
    if (existing >= MAX_DOC_LINKS_PER_VIDEO) {
      throw new AppError("CONFLICT");
    }

    const record: DocLinkRecord = {
      id: this.newId(),
      videoId: video.id,
      url,
      createdAt: toIsoTimestamp(this.clock.now()),
    };
    const created = await this.store.insertDocLink(record);
    return toDocLinkDto(created);
  }
}

/** Map a {@link SummaryRecord} to its wire DTO. */
function toSummaryDto(record: SummaryRecord): SummaryDto {
  return {
    id: record.id,
    videoId: record.videoId,
    body: record.body,
    sourcePluginId: record.sourcePluginId,
  };
}

/** Map a {@link DocLinkRecord} to its wire DTO. */
function toDocLinkDto(record: DocLinkRecord): DocLinkDto {
  return {
    id: record.id,
    videoId: record.videoId,
    url: record.url,
    createdAt: record.createdAt,
  };
}

/**
 * Default {@link KnowledgeStore} backed by the repositories from
 * `@streetstudio/database`.
 *
 * Transcripts, Summaries, and DocLinks are id-keyed globally (the Transcript,
 * Summary, and DocLink repositories). Videos are resolved via the tenant-scoped
 * Video repository's unscoped lookup because a `linkDoc` request carries only a
 * `videoId`; the resolved record's `organizationId` then scopes authorization
 * (the "resolve, then authorize in the owning scope" pattern shared with the
 * Comment, Developer-asset, and Review stores). The per-Video link count is
 * derived from the DocLink repository filtered by `videoId`.
 */
export function repositoryKnowledgeStore(
  repositories: Pick<
    Repositories,
    "transcripts" | "summaries" | "docLinks" | "videos"
  >,
): KnowledgeStore {
  const { transcripts, summaries, docLinks, videos } = repositories;
  return {
    findVideo: (videoId) => videos.findByIdUnscoped(videoId),
    insertTranscript: (record) => transcripts.insert(record),
    insertSummary: (record) => summaries.insert(record),
    countDocLinks: async (videoId) => {
      const all = await docLinks.list();
      return all.filter((link) => link.videoId === videoId).length;
    },
    insertDocLink: (record) => docLinks.insert(record),
  };
}
