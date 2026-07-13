import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import { AuthRequiredGuard, PublicEndpointRegistry, type AuthStatus } from "../security/auth-required.js";
import { RateLimiter } from "../security/rate-limiter.js";
import {
  runLifecycle,
  type ApiRequest,
  type AuditEvent,
  type Authenticator,
  type AuditSink,
  type LifecycleDeps,
  type OperationBinding,
} from "./lifecycle.js";
import type { PublicOperation } from "./operations.js";

const MEMBER: AuthContext = { memberId: "11111111-1111-1111-1111-111111111111" };
const ORG = "22222222-2222-2222-2222-222222222222";

const authOk: AuthStatus = { kind: "authenticated", principal: MEMBER };
const unauth: AuthStatus = { kind: "unauthenticated" };

function fakeAuthenticator(status: AuthStatus): Authenticator {
  return { authenticate: () => Promise.resolve(status) };
}

function fakeAccessControl(allowed: boolean): AccessControl {
  return {
    can: vi.fn().mockResolvedValue(allowed),
    assignRole: vi.fn().mockResolvedValue(undefined),
  };
}

class RecordingAudit implements AuditSink {
  readonly events: AuditEvent[] = [];
  record(event: AuditEvent): void {
    this.events.push(event);
  }
}

function deps(overrides: Partial<LifecycleDeps> = {}): {
  deps: LifecycleDeps;
  audit: RecordingAudit;
} {
  const audit = new RecordingAudit();
  const base: LifecycleDeps = {
    rateLimiter: new RateLimiter({ limit: 1000 }),
    authenticator: fakeAuthenticator(authOk),
    authGuard: new AuthRequiredGuard(new PublicEndpointRegistry()),
    accessControl: fakeAccessControl(true),
    auditSink: audit,
    ...overrides,
  };
  return { deps: base, audit };
}

const rbacOp: PublicOperation = {
  id: "projects.update",
  channel: "rest",
  method: "PATCH",
  path: "/projects/:id",
  authz: { kind: "rbac", action: "project:update", resourceType: "project" },
};

const publicOp: PublicOperation = {
  id: "auth.login",
  channel: "rest",
  method: "POST",
  path: "/auth/login",
  authz: { kind: "public" },
};

function binding<Out>(
  operation: PublicOperation,
  handle: OperationBinding<Out>["handle"],
  auditable = true,
): OperationBinding<Out> {
  return { operation, handle, auditable };
}

function request(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    method: "PATCH",
    path: "/projects/:id",
    clientKey: "client-1",
    organizationId: ORG,
    params: { id: "33333333-3333-3333-3333-333333333333" },
    ...overrides,
  };
}

describe("runLifecycle stage ordering", () => {
  let handle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handle = vi.fn().mockResolvedValue({ ok: true });
  });

  it("runs the service and audits on success when authorized", async () => {
    const { deps: d, audit } = deps();
    const result = await runLifecycle(binding(rbacOp, handle), request(), d);
    expect(result).toEqual({ ok: true });
    expect(handle).toHaveBeenCalledTimes(1);
    expect(audit.events).toEqual([
      {
        operationId: "projects.update",
        outcome: "success",
        memberId: MEMBER.memberId,
        organizationId: ORG,
        action: "project:update",
      },
    ]);
  });

  it("rejects with RATE_LIMITED before authenticating when over the limit", async () => {
    const authSpy = vi.fn<Authenticator["authenticate"]>().mockResolvedValue(authOk);
    const { deps: d } = deps({
      rateLimiter: new RateLimiter({ limit: 1 }),
      authenticator: { authenticate: authSpy },
    });
    await runLifecycle(binding(rbacOp, handle), request(), d); // consumes the single slot
    authSpy.mockClear();
    handle.mockClear();

    await expect(runLifecycle(binding(rbacOp, handle), request(), d)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(authSpy).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
  });

  it("denies unauthenticated requests to non-public endpoints before the service", async () => {
    const { deps: d } = deps({ authenticator: fakeAuthenticator(unauth) });
    await expect(runLifecycle(binding(rbacOp, handle), request(), d)).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
    expect(handle).not.toHaveBeenCalled();
  });

  it("allows public endpoints without authentication and skips RBAC", async () => {
    const publicGuard = new AuthRequiredGuard(
      new PublicEndpointRegistry([{ method: "POST", path: "/auth/login" }]),
    );
    const can = vi.fn().mockResolvedValue(false);
    const { deps: d } = deps({
      authenticator: fakeAuthenticator(unauth),
      authGuard: publicGuard,
      accessControl: { can, assignRole: vi.fn() },
    });
    const result = await runLifecycle(
      binding(publicOp, handle),
      request({ method: "POST", path: "/auth/login" }),
      d,
    );
    expect(result).toEqual({ ok: true });
    expect(can).not.toHaveBeenCalled();
  });
});

describe("runLifecycle authorization denial (no state change, R20.5)", () => {
  it("denies with AUTHORIZATION_DENIED and never invokes the service", async () => {
    const handle = vi.fn().mockResolvedValue({ ok: true });
    const { deps: d, audit } = deps({ accessControl: fakeAccessControl(false) });

    await expect(runLifecycle(binding(rbacOp, handle), request(), d)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect(handle).not.toHaveBeenCalled();
    // The denial is audited; no success event is recorded.
    expect(audit.events).toEqual([
      {
        operationId: "projects.update",
        outcome: "authorization_denied",
        memberId: MEMBER.memberId,
        organizationId: ORG,
        action: "project:update",
      },
    ]);
  });

  it("denies an RBAC request that carries no organization scope", async () => {
    const handle = vi.fn().mockResolvedValue({ ok: true });
    const { deps: d } = deps();
    await expect(
      runLifecycle(binding(rbacOp, handle), request({ organizationId: undefined }), d),
    ).rejects.toBeInstanceOf(AppError);
    expect(handle).not.toHaveBeenCalled();
  });

  it("validates before authorization and before the service", async () => {
    const handle = vi.fn().mockResolvedValue({ ok: true });
    const can = vi.fn().mockResolvedValue(true);
    const { deps: d } = deps({ accessControl: { can, assignRole: vi.fn() } });
    const failing: OperationBinding = {
      operation: rbacOp,
      handle,
      validate: () => {
        throw new AppError("VALIDATION_FAILED");
      },
    };
    await expect(runLifecycle(failing, request(), d)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(can).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
  });
});
