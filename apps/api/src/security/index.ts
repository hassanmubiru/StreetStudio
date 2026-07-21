/**
 * Security middleware and defaults for the API_Service (Requirement 29).
 *
 * Groups the security-by-default building blocks wired into the request
 * lifecycle (rate limit -> authenticate -> validate -> RBAC -> service ->
 * audit):
 *
 *  - {@link RateLimiter}: per-client 100/60s rolling-window limiting with a
 *    retry-after hint on rejection (R29.1).
 *  - {@link AuthRequiredGuard} / {@link PublicEndpointRegistry}: deny
 *    unauthenticated/invalid requests to non-public endpoints with no state
 *    change; public endpoints are declared explicitly (R29.4, R29.5).
 *
 * Secret storage (R29.2) lives in `@streetstudio/config` as `SecretManager`,
 * built on the StreetJS secret interface seam, and is re-exported here for
 * convenient composition-root wiring.
 */
export {
  DEFAULT_RATE_LIMIT,
  DEFAULT_WINDOW_SECONDS,
  RateLimiter,
} from "./rate-limiter.js";
export type {
  RateLimitDecision,
  RateLimiterOptions,
} from "./rate-limiter.js";

export {
  AuthRequiredGuard,
  PublicEndpointRegistry,
} from "./auth-required.js";
export type {
  AuthGuardDecision,
  AuthStatus,
  EndpointId,
  GuardedRequest,
} from "./auth-required.js";

export { systemClock } from "./clock.js";
export type { Clock } from "./clock.js";

// Production authenticator adapter over the real @streetstudio/auth AuthService
// (auth de-seam, ADR-0020): connects the lifecycle authenticate stage to real
// token verification against the real session store.
export { authServiceAuthenticator } from "./auth-service-authenticator.js";
export type { AccessTokenVerifier } from "./auth-service-authenticator.js";

// Secret storage via the StreetJS secret interface (R29.2), owned by
// @streetstudio/config and surfaced here for the composition root.
export {
  SecretManager,
  aesGcmSecretCipher,
  inMemorySecretStore,
  streetSecretCipher,
} from "@streetstudio/config";
export type {
  SecretCipher,
  SecretManagerDeps,
  SecretStore,
  StreetSecretInterface,
} from "@streetstudio/config";
