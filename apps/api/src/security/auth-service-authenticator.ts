/**
 * Bridge the API request lifecycle's authenticate stage to the real
 * `@streetstudio/auth` `AuthService` (auth de-seam, ADR-0020). This is the
 * production {@link Authenticator}: it verifies the presented bearer token via
 * `AuthService.verifyAccessToken` (which checks the token signature/expiry and
 * that the session is still valid against the real store) and maps the outcome
 * to an {@link AuthStatus}.
 */
import type { AuthContext } from "@streetstudio/auth";
import type { ApiRequest, Authenticator } from "../http/lifecycle.js";
import type { AuthStatus } from "./auth-required.js";

/** The slice of `AuthService` this adapter needs (token verification). */
export interface AccessTokenVerifier {
  verifyAccessToken(token: string): Promise<AuthContext>;
}

/**
 * Build an {@link Authenticator} backed by the real auth core. A missing
 * credential is `unauthenticated`; a token that fails verification (bad
 * signature, expired, or a session that was invalidated/expired in the store)
 * is `invalid`; a verified token resolves to the authenticated principal.
 */
export function authServiceAuthenticator(auth: AccessTokenVerifier): Authenticator {
  return {
    async authenticate(request: ApiRequest): Promise<AuthStatus> {
      const token = request.credential;
      if (token === undefined) {
        return { kind: "unauthenticated" };
      }
      try {
        const principal = await auth.verifyAccessToken(token);
        return { kind: "authenticated", principal };
      } catch {
        return { kind: "invalid" };
      }
    },
  };
}
