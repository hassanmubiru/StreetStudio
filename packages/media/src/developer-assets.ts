/**
 * Developer Mode assets (`packages/media`).
 *
 * Implements the design's "Developer Mode" section and Requirement 23:
 * Developer Mode. The {@link DeveloperAssets} service attaches developer-oriented
 * artifacts to a Video as Assets, gated on the Video having Developer Mode
 * enabled:
 *
 *  - {@link DeveloperAssets.attachCodeSnippet} stores a code snippet as an Asset
 *    of type `code_snippet` IF AND ONLY IF its length is between
 *    {@link DEV_ASSET_BODY_MIN_LENGTH} and {@link DEV_ASSET_BODY_MAX_LENGTH}
 *    characters (R23.1, R23.5).
 *  - {@link DeveloperAssets.attachMarkdown} stores a markdown attachment as an
 *    Asset of type `markdown` under the same 1..100,000-character bound (R23.3,
 *    R23.5).
 *  - {@link DeveloperAssets.recordTerminal} stores a terminal session as an
 *    Asset of type `terminal` (R23.2).
 *  - {@link DeveloperAssets.attachApiRecording} stores an API recording as an
 *    Asset of type `api_recording` (R23.4).
 *
 * Developer Mode is a property of the target Video: every operation resolves the
 * Video first and, WHERE Developer Mode is not enabled, rejects the request with
 * the shared `DEVELOPER_MODE_REQUIRED` error ("Developer Mode is required for
 * this action") and makes no change — for every operation, before any length or
 * permission check, so a disabled Video uniformly rejects (R23.6). Only once
 * Developer Mode is confirmed enabled does a code/markdown attachment validate
 * its length (raising `VALIDATION_FAILED` on a 0-length or over-100,000-character
 * body, R23.5) and the actor's create permission get enforced through the
 * {@link AccessControl} seam in the Video's owning Organization scope.
 *
 * Every failure is surfaced through the shared error taxonomy (`AppError`): an
 * unknown Video raises `NOT_FOUND`; a Video without Developer Mode raises
 * `DEVELOPER_MODE_REQUIRED`; an out-of-range code/markdown body raises
 * `VALIDATION_FAILED`; and a requester lacking create permission raises
 * `AUTHORIZATION_DENIED`. In every failure case no Asset is created and the
 * Video is left unchanged.
 *
 * Persistence is reached only through the narrow {@link DeveloperAssetStore}
 * port and authorization only through the {@link AccessControl} seam from
 * `@streetstudio/auth`, so the service is decoupled from the concrete database
 * layer and unit-testable with in-memory fakes. The default adapter
 * ({@link repositoryDeveloperAssetStore}) is backed by the Asset and Video
 * repositories exposed by `@streetstudio/database`.
 */
import { newUuid } from "@streetstudio/database";
import type {
  AssetRecord,
  Repositories,
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
import type { AssetDto, AssetType, Uuid } from "@streetstudio/shared";

/**
 * Minimum length, in characters, of a code snippet or markdown attachment
 * (R23.1, R23.3, R23.5). A 0-length body is rejected.
 */
export const DEV_ASSET_BODY_MIN_LENGTH = 1;

/**
 * Maximum length, in characters, of a code snippet or markdown attachment
 * (R23.1, R23.3, R23.5). A body exceeding this bound is rejected.
 */
export const DEV_ASSET_BODY_MAX_LENGTH = 100000;

/**
 * Permission a Role must grant to attach a developer Asset to a Video within an
 * Organization. Evaluated by {@link AccessControl.can} in the Video's owning
 * Organization scope.
 */
export const CREATE_ASSET_PERMISSION = "content:create_asset";

/**
 * A captured terminal session to store as an Asset (R23.2). The recorded
 * `content` is the session transcript/recording payload; `shell` optionally
 * names the shell it was captured from. The capture is serialized into the
 * Asset body and its concrete rendering is a presentation concern.
 */
export interface TerminalCapture {
  /** The captured terminal session payload. */
  readonly content: string;
  /** Optional shell the session was captured from (e.g. "bash", "zsh"). */
  readonly shell?: string;
}

/**
 * A captured API request/response recording to store as an Asset (R23.4). The
 * recorded `content` is the recording payload (e.g. a serialized HTTP archive);
 * `format` optionally names its encoding. The recording is serialized into the
 * Asset body.
 */
export interface ApiRecording {
  /** The captured API recording payload. */
  readonly content: string;
  /** Optional format/encoding of the recording (e.g. "har"). */
  readonly format?: string;
}

/**
 * Persistence port for developer Assets. Deliberately narrow: the service
 * resolves the target Video (for the Developer Mode flag and the owning
 * Organization that scopes authorization) and inserts an Asset.
 */
export interface DeveloperAssetStore {
  /** Find a Video by id irrespective of tenant, or null when absent. */
  findVideo(videoId: Uuid): Promise<VideoRecord | null>;
  /** Persist a new Asset and return it. */
  insertAsset(record: AssetRecord): Promise<AssetRecord>;
}

/** Dependencies required to construct a {@link DeveloperAssets} service. */
export interface DeveloperAssetsDeps {
  /** Asset/Video persistence port. */
  readonly store: DeveloperAssetStore;
  /** RBAC evaluator used to gate Asset creation in the Video's owning scope. */
  readonly access: AccessControl;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
  /** UUID generator; defaults to the database id generator. */
  readonly newId?: () => Uuid;
}

/** Whether `body` is within the permitted developer-asset length bounds (R23.5). */
function isValidBody(body: string): boolean {
  return (
    body.length >= DEV_ASSET_BODY_MIN_LENGTH &&
    body.length <= DEV_ASSET_BODY_MAX_LENGTH
  );
}

/**
 * The Developer Mode assets service. See the module doc for the exact semantics
 * of each operation.
 */
export class DeveloperAssets {
  private readonly store: DeveloperAssetStore;
  private readonly access: AccessControl;
  private readonly clock: Clock;
  private readonly newId: () => Uuid;

  constructor(deps: DeveloperAssetsDeps) {
    this.store = deps.store;
    this.access = deps.access;
    this.clock = deps.clock ?? systemClock;
    this.newId = deps.newId ?? newUuid;
  }

  /**
   * Attach a code snippet to `videoId` as an Asset of type `code_snippet`.
   * Stores and returns the Asset IF AND ONLY IF the Video has Developer Mode
   * enabled (R23.6) and `code` is 1–100,000 characters (R23.1, R23.5); any
   * failure throws and creates no Asset.
   */
  async attachCodeSnippet(
    actor: AuthContext,
    videoId: Uuid,
    code: string,
  ): Promise<AssetDto> {
    return this.attachBody(actor, videoId, "code_snippet", code);
  }

  /**
   * Attach a markdown document to `videoId` as an Asset of type `markdown`.
   * Stores and returns the Asset IF AND ONLY IF the Video has Developer Mode
   * enabled (R23.6) and `md` is 1–100,000 characters (R23.3, R23.5); any
   * failure throws and creates no Asset.
   */
  async attachMarkdown(
    actor: AuthContext,
    videoId: Uuid,
    md: string,
  ): Promise<AssetDto> {
    return this.attachBody(actor, videoId, "markdown", md);
  }

  /**
   * Record a terminal session on `videoId` as an Asset of type `terminal`
   * (R23.2). Stores and returns the Asset only when the Video has Developer
   * Mode enabled (R23.6); otherwise throws and creates no Asset.
   */
  async recordTerminal(
    actor: AuthContext,
    videoId: Uuid,
    session: TerminalCapture,
  ): Promise<AssetDto> {
    const video = await this.requireDeveloperMode(videoId);
    await this.requireCreatePermission(actor, video);
    return this.createAsset(video, "terminal", serialize(session));
  }

  /**
   * Store an API recording on `videoId` as an Asset of type `api_recording`
   * (R23.4). Stores and returns the Asset only when the Video has Developer
   * Mode enabled (R23.6); otherwise throws and creates no Asset.
   */
  async attachApiRecording(
    actor: AuthContext,
    videoId: Uuid,
    rec: ApiRecording,
  ): Promise<AssetDto> {
    const video = await this.requireDeveloperMode(videoId);
    await this.requireCreatePermission(actor, video);
    return this.createAsset(video, "api_recording", serialize(rec));
  }

  /* -------------------------- internals -------------------------------- */

  /**
   * Shared path for the length-bounded, text-body attachments (code snippets
   * and markdown). Enforces Developer Mode FIRST (R23.6) so a disabled Video
   * rejects uniformly regardless of body length, then validates the body length
   * (R23.5) and the actor's create permission before creating the Asset.
   */
  private async attachBody(
    actor: AuthContext,
    videoId: Uuid,
    type: Extract<AssetType, "code_snippet" | "markdown">,
    body: string,
  ): Promise<AssetDto> {
    const video = await this.requireDeveloperMode(videoId);
    if (!isValidBody(body)) {
      throw new AppError("VALIDATION_FAILED");
    }
    await this.requireCreatePermission(actor, video);
    return this.createAsset(video, type, body);
  }

  /**
   * Resolve the target Video and require that it has Developer Mode enabled.
   * Throws `NOT_FOUND` when the Video does not exist, and
   * `DEVELOPER_MODE_REQUIRED` when Developer Mode is not enabled (R23.6).
   */
  private async requireDeveloperMode(videoId: Uuid): Promise<VideoRecord> {
    const video = await this.store.findVideo(videoId);
    if (!video) {
      throw new AppError("NOT_FOUND");
    }
    if (!video.developerMode) {
      throw new AppError("DEVELOPER_MODE_REQUIRED");
    }
    return video;
  }

  /**
   * Throw `AUTHORIZATION_DENIED` unless `actor` may create an Asset on `video`
   * in the Video's owning Organization scope.
   */
  private async requireCreatePermission(
    actor: AuthContext,
    video: VideoRecord,
  ): Promise<void> {
    const permitted = await this.access.can(actor, CREATE_ASSET_PERMISSION, {
      organizationId: video.organizationId,
      type: "video",
      id: video.id,
    });
    if (!permitted) {
      throw new AppError("AUTHORIZATION_DENIED");
    }
  }

  /** Persist an Asset of `type` carrying `body`, associated with `video`. */
  private async createAsset(
    video: VideoRecord,
    type: AssetType,
    body: string,
  ): Promise<AssetDto> {
    const record: AssetRecord = {
      id: this.newId(),
      videoId: video.id,
      folderId: null,
      type,
      objectKeyOrBody: body,
      createdAt: toIsoTimestamp(this.clock.now()),
    };
    const created = await this.store.insertAsset(record);
    return toAssetDto(created);
  }
}

/** Serialize a structured capture/recording into its stored Asset body. */
function serialize(payload: TerminalCapture | ApiRecording): string {
  return JSON.stringify(payload);
}

/** Map an {@link AssetRecord} to its wire DTO, omitting absent optional fields. */
function toAssetDto(record: AssetRecord): AssetDto {
  return {
    id: record.id,
    type: record.type,
    createdAt: record.createdAt,
    ...(record.videoId !== null ? { videoId: record.videoId } : {}),
    ...(record.folderId !== null ? { folderId: record.folderId } : {}),
  };
}

/**
 * Default {@link DeveloperAssetStore} backed by the repositories from
 * `@streetstudio/database`.
 *
 * Assets are id-keyed globally (the Asset repository). Videos are resolved via
 * the tenant-scoped Video repository's unscoped lookup because a developer
 * attachment carries only a `videoId`; the resolved record's `organizationId`
 * then scopes authorization (the "resolve, then authorize in the owning scope"
 * pattern shared with the Comment store).
 */
export function repositoryDeveloperAssetStore(
  repositories: Pick<Repositories, "assets" | "videos">,
): DeveloperAssetStore {
  const { assets, videos } = repositories;
  return {
    findVideo: (videoId) => videos.findByIdUnscoped(videoId),
    insertAsset: (record) => assets.insert(record),
  };
}
