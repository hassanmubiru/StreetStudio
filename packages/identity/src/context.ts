/**
 * Shared auth helpers for StreetStudio product APIs. Consolidates the JWT auth
 * wiring and the `requireActor` pattern that each domain slice previously
 * duplicated, so every API derives the acting member the same way.
 */
import { JwtService, authMiddleware, UnauthorizedException } from "streetjs";
import type { MiddlewareFn, StreetContext } from "streetjs";
import type { Uuid } from "@streetstudio/shared";

/**
 * The acting member: identity from the verified JWT (`sub`), organization from
 * the per-request scope header. A member may belong to several organizations, so
 * the active organization is a header, not a token claim.
 */
export interface Actor {
  readonly memberId: Uuid;
  readonly organizationId: Uuid;
}

/** Build the StreetJS JWT auth middleware from a signing secret. */
export function jwtAuth(secret: string): MiddlewareFn {
  return authMiddleware(new JwtService(secret));
}

/**
 * Resolve the {@link Actor} from an authenticated request. Requires a verified
 * principal (`ctx.user`, populated by {@link jwtAuth}) and an
 * `X-Organization-Id` scope header. Throws 401 when either is missing.
 */
export function requireActor(ctx: StreetContext): Actor {
  if (!ctx.user) {
    throw new UnauthorizedException("Authentication required.");
  }
  const org = ctx.headers["x-organization-id"];
  if (!org) {
    throw new UnauthorizedException("An active organization (X-Organization-Id) is required.");
  }
  return { memberId: ctx.user.id as Uuid, organizationId: org as Uuid };
}
