/**
 * Uploads domain model — the rich `UploadSession` entity and its invariants for
 * chunked/resumable uploads. Pure: no framework, no I/O. Tracks which parts have
 * been received and governs the pending → completed / aborted lifecycle.
 */
import type { Uuid, IsoTimestamp } from "@streetstudio/shared";

/** Lifecycle status of an upload session. */
export type UploadStatus = "pending" | "completed" | "aborted";

/** Thrown when an operation violates an upload session's invariants. */
export class UploadStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadStateError";
  }
}

/** The acting member. */
export interface Actor {
  readonly memberId: Uuid;
  readonly organizationId: Uuid;
}

/** Persistent shape of an upload session (matches the table columns). */
export interface UploadSessionProps {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly ownerId: Uuid;
  /** Destination object key the assembled upload is stored under. */
  readonly objectKey: string;
  /** Total number of parts the client will upload (1-based part numbers). */
  readonly totalParts: number;
  /** Part numbers received so far. */
  readonly receivedParts: readonly number[];
  readonly status: UploadStatus;
  readonly createdAt: IsoTimestamp;
  readonly completedAt?: IsoTimestamp;
  readonly abortedAt?: IsoTimestamp;
}

const MAX_PARTS = 10_000;

/** Immutable upload session; transitions return a new instance. */
export class UploadSession {
  private constructor(private readonly props: UploadSessionProps) {}

  static fromProps(props: UploadSessionProps): UploadSession {
    return new UploadSession({ ...props, receivedParts: [...props.receivedParts] });
  }

  /** Begin a new pending upload session. Validates the part count and key. */
  static begin(input: {
    id: Uuid;
    owner: Actor;
    objectKey: string;
    totalParts: number;
    createdAt: IsoTimestamp;
  }): UploadSession {
    const key = input.objectKey.trim();
    if (key.length === 0) {
      throw new UploadStateError("An object key is required.");
    }
    if (!Number.isInteger(input.totalParts) || input.totalParts < 1 || input.totalParts > MAX_PARTS) {
      throw new UploadStateError(
        `totalParts must be an integer in [1, ${MAX_PARTS}] (got ${input.totalParts}).`,
      );
    }
    return new UploadSession({
      id: input.id,
      organizationId: input.owner.organizationId,
      ownerId: input.owner.memberId,
      objectKey: key,
      totalParts: input.totalParts,
      receivedParts: [],
      status: "pending",
      createdAt: input.createdAt,
    });
  }

  get id(): Uuid {
    return this.props.id;
  }
  get organizationId(): Uuid {
    return this.props.organizationId;
  }
  get ownerId(): Uuid {
    return this.props.ownerId;
  }
  get objectKey(): string {
    return this.props.objectKey;
  }
  get totalParts(): number {
    return this.props.totalParts;
  }
  get status(): UploadStatus {
    return this.props.status;
  }
  get receivedParts(): readonly number[] {
    return this.props.receivedParts;
  }

  /** All parts received? */
  get isComplete(): boolean {
    return this.props.receivedParts.length === this.props.totalParts;
  }

  canEdit(actor: Actor): boolean {
    return (
      actor.organizationId === this.props.organizationId &&
      actor.memberId === this.props.ownerId
    );
  }

  /**
   * Record receipt of part `partNumber` (1-based). Idempotent — re-receiving a
   * part is a no-op. Rejects out-of-range parts and any receipt after the
   * session has reached a terminal state.
   */
  receivePart(partNumber: number): UploadSession {
    if (this.props.status !== "pending") {
      throw new UploadStateError(`Cannot receive parts for a ${this.props.status} upload.`);
    }
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > this.props.totalParts) {
      throw new UploadStateError(
        `Part number must be an integer in [1, ${this.props.totalParts}] (got ${partNumber}).`,
      );
    }
    if (this.props.receivedParts.includes(partNumber)) {
      return this; // idempotent
    }
    const receivedParts = [...this.props.receivedParts, partNumber].sort((a, b) => a - b);
    return new UploadSession({ ...this.props, receivedParts });
  }

  /** Complete the upload. Requires every part to have been received. */
  complete(at: IsoTimestamp): UploadSession {
    if (this.props.status === "completed") {
      throw new UploadStateError("Upload is already completed.");
    }
    if (this.props.status === "aborted") {
      throw new UploadStateError("An aborted upload cannot be completed.");
    }
    if (!this.isComplete) {
      const missing = this.props.totalParts - this.props.receivedParts.length;
      throw new UploadStateError(`Cannot complete: ${missing} part(s) still missing.`);
    }
    return new UploadSession({ ...this.props, status: "completed", completedAt: at });
  }

  /** Abort the upload (terminal). */
  abort(at: IsoTimestamp): UploadSession {
    if (this.props.status === "aborted") {
      throw new UploadStateError("Upload is already aborted.");
    }
    if (this.props.status === "completed") {
      throw new UploadStateError("A completed upload cannot be aborted.");
    }
    return new UploadSession({ ...this.props, status: "aborted", abortedAt: at });
  }

  toProps(): UploadSessionProps {
    return { ...this.props, receivedParts: [...this.props.receivedParts] };
  }
}
