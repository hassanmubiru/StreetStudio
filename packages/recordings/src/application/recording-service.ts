/**
 * Recordings use cases: orchestrate the {@link Recording} domain model and the
 * repository, and enforce authorization via the domain's own `canEdit`/`canView`
 * rules. This is the application layer — it composes the framework (exceptions)
 * and persistence; it holds no lifecycle rules of its own (those live in the
 * domain).
 */
import { ForbiddenException, NotFoundException } from "streetjs";
import type { Uuid, IsoTimestamp } from "@streetstudio/shared";
import { Recording, type Actor } from "../domain/recording.js";
import { RecordingRepository } from "../persistence/recording-repository.js";

/** Injectable clock so time-dependent behaviour is deterministic in tests. */
export interface Clock {
  now(): IsoTimestamp;
}
const systemClock: Clock = {
  now: () => new Date().toISOString() as IsoTimestamp,
};

export interface CreateRecordingInput {
  /** Server-generated identity (created at the edge). */
  readonly id: Uuid;
  readonly title: string;
}

export class RecordingService {
  constructor(
    private readonly repo: RecordingRepository,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Create a new draft recording owned by the actor. */
  async create(actor: Actor, input: CreateRecordingInput): Promise<Recording> {
    const recording = Recording.createDraft({
      id: input.id,
      owner: actor,
      title: input.title,
      createdAt: this.clock.now(),
    });
    await this.repo.insert(recording);
    return recording;
  }

  /** Fetch a recording the actor may view, or throw. */
  async get(actor: Actor, id: Uuid): Promise<Recording> {
    const recording = await this.repo.findById(id);
    if (!recording || !recording.canView(actor)) {
      // Do not disclose existence across organizations.
      throw new NotFoundException("Recording not found.");
    }
    return recording;
  }

  /** List recordings in the actor's organization. */
  list(actor: Actor, limit?: number, offset?: number): Promise<Recording[]> {
    return this.repo.listByOrganization(actor.organizationId, limit, offset);
  }

  /** Publish a recording the actor owns. */
  async publish(actor: Actor, id: Uuid): Promise<Recording> {
    const recording = await this.get(actor, id);
    if (!recording.canEdit(actor)) {
      throw new ForbiddenException("You cannot publish this recording.");
    }
    const published = recording.publish(this.clock.now());
    await this.repo.save(published);
    return published;
  }

  /** Archive a recording the actor owns. */
  async archive(actor: Actor, id: Uuid): Promise<Recording> {
    const recording = await this.get(actor, id);
    if (!recording.canEdit(actor)) {
      throw new ForbiddenException("You cannot archive this recording.");
    }
    const archived = recording.archive(this.clock.now());
    await this.repo.save(archived);
    return archived;
  }
}
