/**
 * Dashboard upload orchestration: a client-side state machine over the SDK's
 * upload-session surface (`create` → track `ackedChunks` progress → `complete`
 * / `abort`). This is the *session lifecycle* a UI drives; the byte-level chunk
 * capture, offline queue, and retry logic live in `@streetstudio/recorder`.
 * Nothing here duplicates that — it only composes public SDK calls and derives
 * the progress/state a screen renders. No backend logic lives here.
 */
import type { UploadSessionDto, Uuid } from "@streetstudio/shared";
import type { CreateUploadInput } from "@streetstudio/sdk";
import type { DashboardSession } from "./session.js";

/** Derived, render-ready progress for an upload session. */
export interface UploadProgress {
  /** The session this progress was derived from. */
  readonly session: UploadSessionDto;
  readonly ackedChunks: number;
  readonly totalChunks: number;
  /** Fraction of chunks acknowledged, clamped to `0..1`. */
  readonly fraction: number;
  /** Integer percent `0..100` (rounded from {@link fraction}). */
  readonly percent: number;
  /** True when every chunk has been acknowledged by the server. */
  readonly allChunksAcked: boolean;
  /** True when the session has reached a terminal status (not `open`). */
  readonly isTerminal: boolean;
}

/**
 * Derive progress from an upload session. Pure and transport-agnostic. Guards
 * against a zero/negative `totalChunks` (fraction/percent become `0`) and
 * clamps the acknowledged fraction to `0..1`.
 */
export function uploadProgress(session: UploadSessionDto): UploadProgress {
  const totalChunks = session.totalChunks;
  const ackedChunks = session.ackedChunks;
  const fraction =
    totalChunks > 0 ? Math.min(1, Math.max(0, ackedChunks / totalChunks)) : 0;
  return {
    session,
    ackedChunks,
    totalChunks,
    fraction,
    percent: Math.round(fraction * 100),
    allChunksAcked: totalChunks > 0 && ackedChunks >= totalChunks,
    isTerminal: session.status !== "open",
  };
}

/**
 * Stateful controller for a single upload session. Holds the latest known
 * {@link UploadSessionDto} and exposes lifecycle transitions over the SDK. The
 * caller uploads the actual chunk bytes out-of-band (e.g. via the recorder /
 * signed targets) and calls {@link refresh} to observe server acknowledgements.
 */
export class UploadController {
  private session?: UploadSessionDto;

  constructor(private readonly dashboard: DashboardSession) {}

  /** The latest known session, or `undefined` before {@link begin}. */
  get current(): UploadSessionDto | undefined {
    return this.session;
  }

  /** Derived progress for the current session, or `undefined` if none. */
  get progress(): UploadProgress | undefined {
    return this.session ? uploadProgress(this.session) : undefined;
  }

  private requireSessionId(): Uuid {
    if (!this.session) {
      throw new Error(
        "No active upload session — call begin() before refresh/complete/abort.",
      );
    }
    return this.session.id;
  }

  /** Create a new upload session and adopt it as the current one. */
  async begin(input: CreateUploadInput): Promise<UploadSessionDto> {
    this.session = await this.dashboard.api.uploads.create(input);
    return this.session;
  }

  /** Re-fetch the current session to observe server-side chunk acks/status. */
  async refresh(): Promise<UploadSessionDto> {
    this.session = await this.dashboard.api.uploads.get(this.requireSessionId());
    return this.session;
  }

  /**
   * Finalize the upload. The server validates that all chunks are present; this
   * method surfaces the resulting session (typically `completed`). Callers can
   * consult {@link progress}'s `allChunksAcked` first to avoid a doomed attempt.
   */
  async complete(): Promise<UploadSessionDto> {
    this.session = await this.dashboard.api.uploads.complete(
      this.requireSessionId(),
    );
    return this.session;
  }

  /** Abort the upload, releasing the session server-side. */
  async abort(): Promise<UploadSessionDto> {
    this.session = await this.dashboard.api.uploads.abort(
      this.requireSessionId(),
    );
    return this.session;
  }
}
