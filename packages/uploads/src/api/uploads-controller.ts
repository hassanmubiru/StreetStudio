/**
 * Uploads HTTP API — feature-oriented endpoints for chunked/resumable uploads,
 * built on the StreetJS HTTP layer. Part bytes are carried as base64 in a JSON
 * body (works with the framework's JSON parsing and is transport-testable);
 * they are decoded to real bytes and persisted through the storage layer. Maps
 * domain invariant violations to the framework exception taxonomy.
 */
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import {
  Controller,
  Get,
  Post,
  Put,
  container,
  BadRequestException,
  UnauthorizedException,
  type StreetContext,
} from "streetjs";
import type { Uuid } from "@streetstudio/shared";
import { UploadService } from "../application/upload-service.js";
import { UploadStateError, type Actor } from "../domain/upload-session.js";

function requireActor(ctx: StreetContext): Actor {
  if (!ctx.user) {
    throw new UnauthorizedException("Authentication required.");
  }
  const org = ctx.headers["x-organization-id"];
  if (!org) {
    throw new UnauthorizedException("An active organization (X-Organization-Id) is required.");
  }
  return { memberId: ctx.user.id as Uuid, organizationId: org as Uuid };
}

function requireId(ctx: StreetContext): Uuid {
  const id = ctx.params["id"];
  if (!id) throw new BadRequestException("An upload id is required.");
  return id as Uuid;
}

function toThrowable(error: unknown): unknown {
  return error instanceof UploadStateError ? new BadRequestException(error.message) : error;
}

@Controller("/api/uploads")
export class UploadsController {
  private readonly svc = container.resolve(UploadService);

  @Post("/")
  async begin(ctx: StreetContext): Promise<void> {
    const actor = requireActor(ctx);
    const body = (ctx.body ?? {}) as { objectKey?: unknown; totalParts?: unknown; contentType?: unknown };
    if (typeof body.objectKey !== "string" || typeof body.totalParts !== "number") {
      throw new BadRequestException("`objectKey` (string) and `totalParts` (number) are required.");
    }
    try {
      const session = await this.svc.begin(actor, {
        id: randomUUID(),
        objectKey: body.objectKey,
        totalParts: body.totalParts,
        ...(typeof body.contentType === "string" ? { contentType: body.contentType } : {}),
      });
      ctx.json(session.toProps(), 201);
    } catch (error) {
      throw toThrowable(error);
    }
  }

  @Get("/:id")
  async status(ctx: StreetContext): Promise<void> {
    const actor = requireActor(ctx);
    const session = await this.svc.get(actor, requireId(ctx));
    ctx.json(session.toProps());
  }

  @Put("/:id/parts/:partNumber")
  async uploadPart(ctx: StreetContext): Promise<void> {
    const actor = requireActor(ctx);
    const id = requireId(ctx);
    const partNumber = Number(ctx.params["partNumber"]);
    if (!Number.isInteger(partNumber)) {
      throw new BadRequestException("Part number must be an integer.");
    }
    const body = (ctx.body ?? {}) as { data?: unknown };
    if (typeof body.data !== "string") {
      throw new BadRequestException("`data` (base64-encoded part bytes) is required.");
    }
    const bytes = new Uint8Array(Buffer.from(body.data, "base64"));
    try {
      const session = await this.svc.uploadPart(actor, id, partNumber, bytes);
      ctx.json(session.toProps());
    } catch (error) {
      throw toThrowable(error);
    }
  }

  @Post("/:id/complete")
  async complete(ctx: StreetContext): Promise<void> {
    const actor = requireActor(ctx);
    try {
      const { session, object } = await this.svc.complete(actor, requireId(ctx));
      ctx.json({ session: session.toProps(), object });
    } catch (error) {
      throw toThrowable(error);
    }
  }

  @Post("/:id/abort")
  async abort(ctx: StreetContext): Promise<void> {
    const actor = requireActor(ctx);
    try {
      const session = await this.svc.abort(actor, requireId(ctx));
      ctx.json(session.toProps());
    } catch (error) {
      throw toThrowable(error);
    }
  }
}
