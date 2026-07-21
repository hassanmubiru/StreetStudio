/**
 * Concrete, config-driven assembly of the API_Service's authentication and
 * authorization collaborators on **real PostgreSQL** (auth de-seam, ADR-0020).
 *
 * Given a StreetJS `PgPool` and a JWT secret, this builds the real
 * `AuthService` (Argon2id + HMAC tokens over the real member/session stores),
 * the lifecycle {@link Authenticator} that verifies bearer tokens against it,
 * and the deny-by-default `AccessControl` (RBAC) over the real roles/memberships
 * store — exactly the collaborators {@link createApiService} needs. This is the
 * production wiring the abstract composition root was designed to receive.
 */
import { PgPool } from "streetjs";
import type { AccessControl } from "@streetstudio/auth";
import {
  AuthService,
  Argon2idPasswordHasher,
  HmacAccessTokenIssuer,
  RbacAccessControl,
  ensureAuthSchema,
  ensureRbacSchema,
  postgresAuthStores,
  postgresRbacStore,
} from "@streetstudio/auth";
import type { Authenticator } from "../http/lifecycle.js";
import { authServiceAuthenticator } from "./auth-service-authenticator.js";

/** The real auth collaborators for {@link createApiService}. */
export interface ApiAuthComponents {
  /** The real authentication core (register/login/verify/logout). */
  readonly authService: AuthService;
  /** Lifecycle authenticate-stage adapter over {@link authService}. */
  readonly authenticator: Authenticator;
  /** Deny-by-default RBAC evaluator over the real Postgres store. */
  readonly accessControl: AccessControl;
}

/** Ensure the auth + RBAC schema (members, auth_sessions, roles, memberships). */
export async function ensureApiAuthSchema(pool: PgPool): Promise<void> {
  await ensureAuthSchema(pool);
  await ensureRbacSchema(pool);
}

/**
 * Assemble the real Postgres-backed auth components from a live `PgPool` and JWT
 * secret. The returned `authenticator` + `accessControl` are passed straight
 * into {@link createApiService}; `authService` powers the public auth endpoints.
 */
export function assemblePostgresAuth(pool: PgPool, jwtSecret: string): ApiAuthComponents {
  const authService = new AuthService({
    stores: postgresAuthStores(pool),
    passwordHasher: new Argon2idPasswordHasher(),
    tokenIssuer: new HmacAccessTokenIssuer(jwtSecret),
  });
  return {
    authService,
    authenticator: authServiceAuthenticator(authService),
    accessControl: new RbacAccessControl({ store: postgresRbacStore(pool) }),
  };
}
