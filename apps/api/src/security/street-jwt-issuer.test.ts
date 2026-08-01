import { describe, expect, it } from "vitest";
import { InvalidTokenError } from "@streetstudio/auth";
import type { Uuid } from "@streetstudio/shared";
import { StreetJwtAccessTokenIssuer } from "./street-jwt-issuer.js";

const SECRET = "test-only-jwt-secret-at-least-32-characters-long";
const MEMBER = "11111111-1111-4111-8111-111111111111" as Uuid;
const SESSION = "22222222-2222-4222-8222-222222222222" as Uuid;

function futureClaims(secondsAhead = 900) {
  return {
    memberId: MEMBER,
    sessionId: SESSION,
    expiresAt: new Date(Date.now() + secondsAhead * 1000),
  };
}

describe("StreetJwtAccessTokenIssuer (streetjs JwtService adapter, ADR-0020 step 2)", () => {
  it("round-trips: issue then verify returns the same member/session", () => {
    const issuer = new StreetJwtAccessTokenIssuer(SECRET);
    const token = issuer.issue(futureClaims());

    // A proper compact JWS with an HS256 header.
    const [headerB64] = token.split(".");
    const header = JSON.parse(Buffer.from(headerB64 ?? "", "base64url").toString());
    expect(header).toMatchObject({ alg: "HS256", typ: "JWT" });

    const claims = issuer.verify(token);
    expect(claims.memberId).toBe(MEMBER);
    expect(claims.sessionId).toBe(SESSION);
    expect(claims.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a token whose signature was tampered with", () => {
    const issuer = new StreetJwtAccessTokenIssuer(SECRET);
    const token = issuer.issue(futureClaims());
    expect(() => issuer.verify(`${token}x`)).toThrow(InvalidTokenError);
  });

  it("rejects a token signed with a different secret", () => {
    const a = new StreetJwtAccessTokenIssuer(SECRET);
    const b = new StreetJwtAccessTokenIssuer("another-secret-at-least-32-characters-long!!");
    const token = b.issue(futureClaims());
    expect(() => a.verify(token)).toThrow(InvalidTokenError);
  });

  it("rejects an `alg:none` forgery (algorithm confinement)", () => {
    const issuer = new StreetJwtAccessTokenIssuer(SECRET);
    const real = issuer.issue(futureClaims());
    const payloadB64 = real.split(".")[1] ?? "";
    const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const forged = `${b({ alg: "none", typ: "JWT" })}.${payloadB64}.`;
    expect(() => issuer.verify(forged)).toThrow(InvalidTokenError);
  });

  it("rejects an expired token", () => {
    const issuer = new StreetJwtAccessTokenIssuer(SECRET);
    const token = issuer.issue({
      memberId: MEMBER,
      sessionId: SESSION,
      expiresAt: new Date(Date.now() - 1000), // already past
    });
    expect(() => issuer.verify(token)).toThrow(InvalidTokenError);
  });

  it("rejects a malformed token", () => {
    const issuer = new StreetJwtAccessTokenIssuer(SECRET);
    expect(() => issuer.verify("not-a-jwt")).toThrow(InvalidTokenError);
    expect(() => issuer.verify("")).toThrow(InvalidTokenError);
  });
});
