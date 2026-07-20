/**
 * Recordings domain model — the rich `Recording` entity and its lifecycle
 * invariants. Pure: no framework, no I/O. Business rules about who may edit,
 * publish, or archive a recording live here, not in the API layer.
 */
import type { Uuid, IsoTimestamp } from "@streetstudio/shared";

/** Lifecycle status of a recording. */
export type RecordingStatus = "draft" | "published" | "archived";

/** Thrown when an operation violates a recording's lifecycle invariants. */
export class RecordingStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordingStateError";
  }
}

/** An actor attempting an operation (the authenticated member). */
export interface Actor {
  readonly memberId: Uuid;
  readonly organizationId: Uuid;
}

/** Persistent shape of a recording (matches the `recordings` table columns). */
export interface RecordingProps {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly ownerId: Uuid;
  readonly title: string;
  readonly status: RecordingStatus;
  readonly createdAt: IsoTimestamp;
  readonly publishedAt?: IsoTimestamp;
  readonly archivedAt?: IsoTimestamp;
}

const MAX_TITLE_LENGTH = 200;

/**
 * A recording. Instances are immutable — lifecycle transitions return a new
 * `Recording` and never mutate the receiver, so callers must persist the
 * returned value. Every transition enforces the domain invariants.
 */
export class Recording {
  private constructor(private readonly props: RecordingProps) {}

  /** Rehydrate from persisted props (no transition validation). */
  static fromProps(props: RecordingProps): Recording {
    return new Recording(props);
  }

  /**
   * Create a new draft recording. Validates the title (non-empty after trim,
   * within the length bound). `id`/`createdAt` are supplied by the caller
   * (generated at the edge) to keep the domain deterministic and testable.
   */
  static createDraft(input: {
    id: Uuid;
    owner: Actor;
    title: string;
    createdAt: IsoTimestamp;
  }): Recording {
    const title = input.title.trim();
    if (title.length === 0) {
      throw new RecordingStateError("A recording title must not be empty.");
    }
    if (title.length > MAX_TITLE_LENGTH) {
      throw new RecordingStateError(
        `A recording title must be at most ${MAX_TITLE_LENGTH} characters.`,
      );
    }
    return new Recording({
      id: input.id,
      organizationId: input.owner.organizationId,
      ownerId: input.owner.memberId,
      title,
      status: "draft",
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
  get title(): string {
    return this.props.title;
  }
  get status(): RecordingStatus {
    return this.props.status;
  }

  /** A member may edit a recording if they own it and it is not archived. */
  canEdit(actor: Actor): boolean {
    return (
      actor.organizationId === this.props.organizationId &&
      actor.memberId === this.props.ownerId &&
      this.props.status !== "archived"
    );
  }

  /** A member may view a recording if it belongs to their organization. */
  canView(actor: Actor): boolean {
    return actor.organizationId === this.props.organizationId;
  }

  /**
   * Publish a draft. Only a `draft` may be published; publishing an already
   * published or archived recording is an invariant violation.
   */
  publish(at: IsoTimestamp): Recording {
    if (this.props.status === "published") {
      throw new RecordingStateError("Recording is already published.");
    }
    if (this.props.status === "archived") {
      throw new RecordingStateError("An archived recording cannot be published.");
    }
    return new Recording({ ...this.props, status: "published", publishedAt: at });
  }

  /**
   * Archive a recording. `draft` or `published` may be archived; archiving is
   * terminal, so archiving an already archived recording is a violation.
   */
  archive(at: IsoTimestamp): Recording {
    if (this.props.status === "archived") {
      throw new RecordingStateError("Recording is already archived.");
    }
    return new Recording({ ...this.props, status: "archived", archivedAt: at });
  }

  /** Serialize to the persistent/wire shape. */
  toProps(): RecordingProps {
    return { ...this.props };
  }
}
