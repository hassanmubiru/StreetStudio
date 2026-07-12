/**
 * Access-token issuance and verification.
 *
 * Access tokens are JWTs (JWS, HS256) whose `exp` claim is at most 15 minutes
 * after issuance (Requirement 3.2). Verification checks the signature and the
 * `exp` claim; the surrounding {@link AuthService} additionally validates the
 * referenced session so that logout/expiry invalidate access (Requirements
 * 3.4, 3.7).
 *
 * The signer is defined behind {@link AccessTokenIssuer} so the auth core does
 * not couple to a specific JWT library; {@link HmacAccessTokenIssuer} is a
 * dependency-free HS256 implementation over `node:crypto`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { IsoTimestamp, Uuid } from "@streetstudio/shared";
import { systemClock, type Clock } from "./clock.js";

/** The maximum access-token lifetime permitted by the platform (15 minutes). */
export const MAX_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Claims carried by an issued access token. */
export interface AccessTokenClaims {
  /** Subject: the authenticated member's id (`sub`). */
  readonly memberId: Uuid;
  /** The session this token is bound to (`sid`). */
  readonly sessionId: Uuid;
  /** Expiry instant. */
  readonly expiresAt: Date;
}

/** Issues and verifies signed access tokens. */
export interface AccessTokenIssuer {
  /** Sign `claims` into a compact token string. */
  issue(claims: AccessTokenClaims): string;
  /**
   * Verify a token's signature and expiry. Returns the decoded claims, or
   * throws when the token is malformed, tampered with, or expired.
   */
  verify(token: string): AccessTokenClaims;
}

/** Raised by {@link AccessTokenIssuer.verify} for any invalid token. */
export class InvalidTokenError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidTokenError";
    Object.setPrototypeOf(this, InvalidTokenError.prototype);
  }
}

interface JwtPayload {
  sub: string;
  sid: string;
  iat: number;
  exp: number;
}

const HEADER = { alg: "HS256", typ: "JWT" } as const;

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

/**
 * HS256 (HMAC-SHA256) {@link AccessTokenIssuer}. The signing secret is supplied
 * by validated configuration (`auth.jwtSecret`, >= 32 chars).
 */
export class HmacAccessTokenIssuer implements AccessTokenIssuer {
  private readonly secret: string;
  private readonly clock: Clock;

  constructor(secret: string, clock: Clock = systemClock) {
    if (typeof secret !== "string" || secret.length === 0) {
      throw new Error("HmacAccessTokenIssuer requires a non-empty secret");
    }
    this.secret = secret;
    this.clock = clock;
  }

  private sign(signingInput: string): string {
    return base64UrlEncode(
      createHmac("sha256", this.secret).update(signingInput).digest(),
    );
  }

  issue(claims: AccessTokenClaims): string {
    const exp = Math.floor(claims.expiresAt.getTime() / 1000);
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const payload: JwtPayload = {
      sub: claims.memberId,
      sid: claims.sessionId,
      iat,
      exp,
    };
    const header = base64UrlEncode(JSON.stringify(HEADER));
    const body = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${header}.${body}`;
    return `${signingInput}.${this.sign(signingInput)}`;
  }

  verify(token: string): AccessTokenClaims {
    if (typeof token !== "string") {
      throw new InvalidTokenError("token is not a string");
    }
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new InvalidTokenError("token is malformed");
    }
    const [header, body, signature] = parts as [string, string, string];

    const expected = this.sign(`${header}.${body}`);
    const provided = signature;
    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(provided);
    if (
      expectedBuf.length !== providedBuf.length ||
      !timingSafeEqual(expectedBuf, providedBuf)
    ) {
      throw new InvalidTokenError("token signature is invalid");
    }

    let payload: JwtPayload;
    try {
      payload = JSON.parse(base64UrlDecode(body).toString("utf8")) as JwtPayload;
    } catch {
      throw new InvalidTokenError("token payload is not valid JSON");
    }
    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      typeof payload.exp !== "number"
    ) {
      throw new InvalidTokenError("token payload is missing required claims");
    }

    const expiresAt = new Date(payload.exp * 1000);
    if (Date.now() >= expiresAt.getTime()) {
      throw new InvalidTokenError("token has expired");
    }

    return {
      memberId: payload.sub,
      sessionId: payload.sid,
      expiresAt,
    };
  }
}

/** Format a {@link Date} as an ISO-8601 timestamp string. */
export function toIsoTimestamp(date: Date): IsoTimestamp {
  return date.toISOString();
}
