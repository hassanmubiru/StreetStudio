/**
 * Playback HTTP API — authorized byte-range streaming of a completed upload's
 * object, built on the StreetJS HTTP layer. Binary bodies are written to the
 * raw response (the framework only auto-sends on the error path, so a single
 * write on success is safe). Supports full (200) and partial (206) responses
 * and 416 for unsatisfiable ranges.
 */
import "reflect-metadata";
import {
  Controller,
  Get,
  container,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  type StreetContext,
} from "streetjs";
import type { Uuid } from "@streetstudio/shared";
import type { Actor } from "@streetstudio/uploads";
import { PlaybackService, parseRange } from "../application/playback-service.js";

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

@Controller("/api/playback")
export class PlaybackController {
  private readonly svc = container.resolve(PlaybackService);

  @Get("/")
  async stream(ctx: StreetContext): Promise<void> {
    const actor = requireActor(ctx);
    const key = ctx.query["key"];
    if (!key) {
      throw new BadRequestException("A `key` query parameter is required.");
    }

    const object = await this.svc.resolve(actor, key);
    if (!object) {
      throw new NotFoundException("Object not found.");
    }

    const { res } = ctx;
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", object.contentType);

    const range = parseRange(ctx.headers["range"], object.size);
    if (range === "unsatisfiable") {
      res.setHeader("Content-Range", `bytes */${object.size}`);
      res.statusCode = 416;
      res.end();
      return;
    }
    if (range) {
      const slice = object.bytes.subarray(range.start, range.end + 1);
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${object.size}`);
      res.setHeader("Content-Length", String(slice.length));
      res.statusCode = 206;
      res.end(Buffer.from(slice));
      return;
    }
    res.setHeader("Content-Length", String(object.size));
    res.statusCode = 200;
    res.end(Buffer.from(object.bytes));
  }
}
