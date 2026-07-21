/**
 * @streetstudio/identity
 *
 * Identity — real member registration/login with Argon2id password hashing and
 * JWT issuance (via StreetJS `JwtService`), plus the shared auth helpers
 * (`jwtAuth`, `requireActor`, `Actor`) that product APIs use to authenticate
 * requests. Composes StreetJS; reimplements no framework infrastructure.
 */
export const DOMAIN =
  "Identity: registration/login (Argon2id), JWT issuance, and shared auth helpers." as const;

// Shared auth helpers (consumed by other product APIs)
export { jwtAuth, requireActor, type Actor } from "./context.js";

// Domain
export {
  Member,
  MemberStateError,
  normalizeEmail,
  assertPasswordPolicy,
  type MemberProps,
  type MemberView,
} from "./domain/member.js";

// Password hashing (Argon2id)
export { hashPassword, verifyPassword } from "./password.js";

// Application
export { IdentityService, type LoginResult, type Clock } from "./application/identity-service.js";

// Persistence
export { MemberRepository, DuplicateEmailError } from "./persistence/member-repository.js";
export { ensureIdentitySchema, MEMBERS_TABLE_DDL } from "./persistence/schema.js";

// API / composition
export { IdentityController } from "./api/identity-controller.js";
export { createIdentityApp, registerIdentity } from "./api/app.js";
