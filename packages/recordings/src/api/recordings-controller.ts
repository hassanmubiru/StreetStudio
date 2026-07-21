/**
 * Recordings HTTP API — feature-oriented endpoints mapped to product use cases
 * (create / list / get / publish / archive), built on the StreetJS HTTP layer.
 * The controller translates HTTP ⇄ use cases and maps domain invariant
 * violations to the framework's exception taxonomy; it holds no business rules.
 */
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import {
  Controller,
  Get,
  Post,
  container,
  BadRequestException,
  type StreetContext,
} from "streetjs";
import type { Uuid } from "@streetstudio/shared";
import { requireActor } from "@streetstudio/identity";
import { RecordingService } from "../application/recording-service.js";
import { RecordingStateError } from "../domain/recording.js";

function requireId(ctx: StreetContext): Uuid {
  const id = ctx.params["id"];
  if (!id) {
    throw new BadRequestException("A recording id is required.");
  }
  return id as Uuid;
}

function toThrowable(error: unknown): unknown {
  // Domain invariant violations are client errors.
  return error instanceof RecordingStateError
    ? new BadRequestException(error.message)
    : error;
}

@Controller("/api/recordings")
export class RecordingsController {
  private readonly svc = container.resolve(RecordingService);

  @Post("/")
  async create(ctx: StreetContext): Promise<void> {
    const actor = requireActor(ctx);
    const body = (ctx.body ?? {}) as { title?: unknown };
    if (typeof body.title !== "string") {
      throw new BadRequestException("`title` is required and must be a string.");
    }
    try {
      const recording = await this.svc.create(actor, {
        id: randomUUID(),
        title: body.title,
      });
      ctx.json(recording.toProps(), 201);
    } catch (error) {
      throw toThrowable(error);
    }
  }

  @Get("/")
  async list(ctx: StreetContext): Promise<void> {
    const actor = requireActor(ctx);
    const rawLimit = ctx.query["limit"];
    const limit = rawLimit ? Number(rawLimit) : undefined;
    const items = await this.svc.list(actor, limit);
    ctx.json({ items: items.map((r) => r.toProps()) });
  }

  @Get("/:id")
  async get(ctx: StreetContext): Promise<void> {
    const actor = requireActor(ctx);
    const recording = await this.svc.get(actor, requireId(ctx));
    ctx.json(recording.toProps());
  }

  @Post("/:id/publish")
  async publish(ctx: StreetContext): Promise<void> {
    const actor = requireActor(ctx);
    try {
      const recording = await this.svc.publish(actor, requireId(ctx));
      ctx.json(recording.toProps());
    } catch (error) {
      throw toThrowable(error);
    }
  }

  @Post("/:id/archive")
  async archive(ctx: StreetContext): Promise<void> {
    const actor = requireActor(ctx);
    try {
      const recording = await this.svc.archive(actor, requireId(ctx));
      ctx.json(recording.toProps());
    } catch (error) {
      throw toThrowable(error);
    }
  }
}
