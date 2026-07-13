import { describe, expect, it } from "vitest";
import { AppError } from "@streetstudio/shared";
import {
  AuthRequiredGuard,
  PublicEndpointRegistry,
  type AuthStatus,
} from "./auth-required.js";

const authenticated: AuthStatus = { kind: "authenticated", principal: { id: "m1" } };
const unauthenticated: AuthStatus = { kind: "unauthenticated" };
const invalid: AuthStatus = { kind: "invalid" };

describe("PublicEndpointRegistry", () => {
  it("matches registered endpoints case-insensitively by method", () => {
    const registry = new PublicEndpointRegistry([{ method: "GET", path: "/health" }]);
    expect(registry.isPublic("get", "/health")).toBe(true);
    expect(registry.isPublic("POST", "/health")).toBe(false);
    expect(registry.isPublic("GET", "/private")).toBe(false);
  });

  it("lists registered public endpoints for documentation", () => {
    const registry = new PublicEndpointRegistry([{ method: "GET", path: "/health" }]);
    expect(registry.list()).toEqual([{ method: "GET", path: "/health" }]);
  });
});

describe("AuthRequiredGuard", () => {
  const registry = new PublicEndpointRegistry([{ method: "GET", path: "/health" }]);
  const guard = new AuthRequiredGuard(registry);

  it("allows public endpoints without authentication", () => {
    const decision = guard.evaluate({ method: "GET", path: "/health", auth: unauthenticated });
    expect(decision.allowed).toBe(true);
    expect(decision.public).toBe(true);
  });

  it("allows authenticated requests to non-public endpoints", () => {
    const decision = guard.evaluate({ method: "GET", path: "/videos", auth: authenticated });
    expect(decision.allowed).toBe(true);
  });

  it("denies unauthenticated requests to non-public endpoints", () => {
    const decision = guard.evaluate({ method: "GET", path: "/videos", auth: unauthenticated });
    expect(decision.allowed).toBe(false);
    expect(decision.errorCode).toBe("AUTHENTICATION_REQUIRED");
  });

  it("denies invalid-auth requests to non-public endpoints", () => {
    const decision = guard.evaluate({ method: "POST", path: "/videos", auth: invalid });
    expect(decision.allowed).toBe(false);
    expect(decision.errorCode).toBe("AUTHENTICATION_FAILED");
  });

  it("enforce throws an authentication error on denial", () => {
    try {
      guard.enforce({ method: "GET", path: "/videos", auth: unauthenticated });
      expect.unreachable("expected an authentication error");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("AUTHENTICATION_REQUIRED");
    }
  });

  it("defaults to closed when no public endpoints are registered", () => {
    const closed = new AuthRequiredGuard();
    expect(closed.evaluate({ method: "GET", path: "/health", auth: unauthenticated }).allowed).toBe(
      false
    );
  });
});
