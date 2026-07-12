/**
 * @streetstudio/auth
 *
 * Public entry point for authentication, sessions, RBAC evaluation, and API
 * keys. Authentication/authorization primitives are built on StreetJS public
 * entry points. Consumers MUST import from `@streetstudio/auth` and never reach
 * into internal modules.
 *
 * This task delivers the authentication core — registration, login, logout, and
 * access-token verification. Account lockout (task 6.2), OAuth/SSO sign-in
 * (task 6.3), API keys, and RBAC are layered in as separate modules that reuse
 * the session and token machinery exposed here.
 */
export const DOMAIN = "Authentication, sessions, RBAC, and API keys." as const;

// --- Authentication core --------------------------------------------------
export { AuthService, MIN_PASSWORD_LENGTH } from "./service.js";
export type {
  AuthContext,
  AuthResult,
  AuthServiceDeps,
  LockoutPolicy,
  LoginInput,
  RegisterInput,
} from "./service.js";

// --- Password hashing ------------------------------------------------------
export { Argon2idPasswordHasher } from "./password-hasher.js";
export type { PasswordHasher } from "./password-hasher.js";

// --- Access tokens ---------------------------------------------------------
export {
  HmacAccessTokenIssuer,
  InvalidTokenError,
  MAX_ACCESS_TOKEN_TTL_SECONDS,
  toIsoTimestamp,
} from "./tokens.js";
export type { AccessTokenClaims, AccessTokenIssuer } from "./tokens.js";

// --- Persistence ports + default repository adapters -----------------------
export {
  normalizeEmail,
  repositoryAuthStores,
  repositoryMemberStore,
  repositorySessionStore,
} from "./stores.js";
export type { AuthStores, MemberStore, SessionStore } from "./stores.js";

// --- Clock -----------------------------------------------------------------
export { systemClock } from "./clock.js";
export type { Clock } from "./clock.js";

// --- Account lockout (task 6.2) --------------------------------------------
export {
  DEFAULT_LOCK_MS,
  DEFAULT_MAX_FAILURES,
  DEFAULT_WINDOW_MS,
  InMemoryLockoutPolicy,
} from "./lockout.js";
export type { LockoutOptions } from "./lockout.js";
