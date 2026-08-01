/**
 * Access-token issuer backed by the **published** `streetjs` `JwtService`
 * (ADR-0020 step 2 — adopt the framework's JWT primitive instead of a
 * hand-rolled signer).
 *
 * JWT signing/verification is reusable security infrastructure the framework
 * owns: `streetjs`'s `JwtService` is a strict HS256 implementation that confines
 * the header algorithm (rejecting `alg:none` / algorithm-confusion), compares
 * signatures in constant time, and enforces `exp`/`nbf`/`iat` — at least as
 * strict as the product's former `HmacAccessTokenIssuer`. This adapter exposes
 * it behind the auth core's {@link AccessTokenIssuer} port so `AuthService`
 * stays decoupled from the JWT library; the port's reference HS256 implementation
 * (`HmacAccessTokenIssuer`) remains in `@streetstudio/auth` for unit/property
 * tests.
 *
 * The adapter maps the port's claim shape (`memberId`→`sub`, `sessionId`→`sid`,
 * `expiresAt`→`exp`) onto `JwtService`, throws {@link InvalidTokenError} on any
 * invalid/expired token (the port contract; a `null` from `JwtService.verify`
 * becomes a throw), and re-checks `exp` defensively so expiry is enforced here
 * regardless of the framework's internals.
 */
import { JwtService } from "streetjs";
import {
  InvalidTokenError,
  type AccessTokenClaims,
  type AccessTokenIssuer,
} from "@streetstudio/auth";

/** An {@link AccessTokenIssuer} composing the framework `JwtService`. */
export class StreetJwtAccessTokenIssuer implements AccessTokenIssuer {
  private readonly jwt: JwtService;

  /** @param secret the validated `auth.jwtSecret` (>= 32 chars, enforced by `JwtService`). */
  constructor(secret: string) {
    this.jwt = new JwtService(secret);
  }

  /** Sign the claims into a compact HS256 JWT with `sub`/`sid`/`exp`. */
  issue(claims: AccessTokenClaims): string {
    // The framework sets `exp = now + expiresInSeconds`; derive it from the
    // requested expiry so the token expires exactly when the caller intends
    // (AuthService already clamps this to <= MAX_ACCESS_TOKEN_TTL_SECONDS).
    const nowMs = Date.now();
    const expiresInSeconds = Math.max(
      0,
      Math.floor((claims.expiresAt.getTime() - nowMs) / 1000),
    );
    return this.jwt.sign(
      { sub: claims.memberId, sid: claims.sessionId },
      { expiresInSeconds },
    );
  }

  /** Verify signature + expiry and return the decoded claims, or throw. */
  verify(token: string): AccessTokenClaims {
    if (typeof token !== "string") {
      throw new InvalidTokenError("token is not a string");
    }
    // `JwtService.verify` confines the algorithm to HS256, checks the signature
    // in constant time, and rejects expired/not-yet-valid tokens, returning
    // `null` on any failure — which the port contract requires we surface as a
    // thrown InvalidTokenError.
    const payload = this.jwt.verify(token);
    if (payload === null) {
      throw new InvalidTokenError("token signature is invalid or expired");
    }
    const sub = payload["sub"];
    const sid = payload["sid"];
    const exp = payload["exp"];
    if (typeof sub !== "string" || typeof sid !== "string" || typeof exp !== "number") {
      throw new InvalidTokenError("token payload is missing required claims");
    }
    // Defensive expiry re-check (independent of the framework's internals).
    const expiresAt = new Date(exp * 1000);
    if (Date.now() >= expiresAt.getTime()) {
      throw new InvalidTokenError("token has expired");
    }
    return {
      memberId: sub as AccessTokenClaims["memberId"],
      sessionId: sid as AccessTokenClaims["sessionId"],
      expiresAt,
    };
  }
}
