/**
 * Identity HTTP API — the public authentication endpoints (register, login).
 * These are intentionally unauthenticated (they establish authentication); other
 * product APIs apply `jwtAuth` and consume the issued token.
 */
import "reflect-metadata";
import { Controller, Post, container, BadRequestException, type StreetContext } from "streetjs";
import { IdentityService } from "../application/identity-service.js";
import { MemberStateError } from "../domain/member.js";

function credentials(ctx: StreetContext): { email: string; password: string } {
  const body = (ctx.body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof body.email !== "string" || typeof body.password !== "string") {
    throw new BadRequestException("`email` and `password` are required.");
  }
  return { email: body.email, password: body.password };
}

function toThrowable(error: unknown): unknown {
  return error instanceof MemberStateError ? new BadRequestException(error.message) : error;
}

@Controller("/auth")
export class IdentityController {
  private readonly svc = container.resolve(IdentityService);

  @Post("/register")
  async register(ctx: StreetContext): Promise<void> {
    const { email, password } = credentials(ctx);
    try {
      const member = await this.svc.register(email, password);
      ctx.json({ member }, 201);
    } catch (error) {
      throw toThrowable(error);
    }
  }

  @Post("/login")
  async login(ctx: StreetContext): Promise<void> {
    const { email, password } = credentials(ctx);
    const result = await this.svc.login(email, password);
    ctx.json(result);
  }
}
