import { describe, expect, it, vi } from "vitest";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import type { AuthStatus } from "../security/auth-required.js";
import { RateLimiter } from "../security/rate-limiter.js";
import {
  MapServiceContainer,
  containerHandlerResolver,
  createApiService,
  type ApiServiceConfig,
} from "./composition-root.js";
import type { AuditSink, Authenticator, ServiceInvocation } from "./lifecycle.js";
import { PUBLIC_OPERATIONS, restKey, restOperations } from "./operations.js";

const MEMBER: AuthContext = { memberId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
const ORG = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const authOk: AuthStatus = { kind: "authenticated", principal: MEMBER };

function containerForAll(handler: ServiceInvocation): MapServiceContainer {
  const container = new MapServiceContainer();
  for (const op of PUBLIC_OPERATIONS) {
    container.register(op.id, handler);
  }
  return container;
}

function config(overrides: Partial<ApiServiceConfig> = {}): ApiServiceConfig {
  const handler: ServiceInvocation = () => Promise.resolve({ ok: true });
  const authenticator: Authenticator = { authenticate: () => Promise.resolve(authOk) };
  const accessControl: AccessControl = {
    can: vi.fn().mockResolvedValue(true),
    assignRole: vi.fn(),
  };
  const auditSink: AuditSink = { record: vi.fn() };
  return {
    container: containerForAll(handler),
    authenticator,
    accessControl,
    auditSink,
    rateLimiter: new RateLimiter({ limit: 10000 }),
    ...overrides,
  };
}

describe("createApiService wiring", () => {
  it("binds a REST route for every REST operation in the catalog", () => {
    const service = createApiService(config());
    const expected = restOperations()
      .map((op) => restKey(op.method ?? "GET", op.path))
      .sort();
    expect(service.router.routeKeys()).toEqual(expected);
  });

  it("registers exactly the public REST operations as no-auth endpoints", () => {
    const service = createApiService(config());
    const listed = service.publicEndpoints
      .list()
      .map((e) => restKey(e.method, e.path))
      .sort();
    const expected = PUBLIC_OPERATIONS.filter(
      (op) => op.authz.kind === "public" && op.channel === "rest",
    )
      .map((op) => restKey(op.method ?? "GET", op.path))
      .sort();
    expect(listed).toEqual(expected);
  });

  it("wires the WebSocket realtime channel through the gateway", () => {
    const service = createApiService(config());
    expect(service.gateway.channelPaths()).toContain("/realtime");
  });

  it("fails fast when a domain-service handler is missing from the container", () => {
    const container = new MapServiceContainer();
    // Register everything except one operation to simulate a wiring gap.
    for (const op of PUBLIC_OPERATIONS) {
      if (op.id === "projects.create") continue;
      container.register(op.id, () => Promise.resolve());
    }
    expect(() => createApiService(config({ container }))).toThrow(/projects\.create/);
  });

  it("dispatches a REST request through the lifecycle to the resolved handler", async () => {
    const handle = vi.fn().mockResolvedValue({ id: "v1" });
    const container = containerForAll(handle);
    const service = createApiService(config({ container }));

    const result = await service.router.dispatch({
      method: "GET",
      path: "/videos/:id",
      clientKey: "c1",
      organizationId: ORG,
      params: { id: "cccccccc-cccc-cccc-cccc-cccccccccccc" },
    });
    expect(result).toEqual({ id: "v1" });
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("denies a REST request when RBAC withholds the required grant (R20.4/R20.5)", async () => {
    const handle = vi.fn().mockResolvedValue({ id: "v1" });
    const accessControl: AccessControl = {
      can: vi.fn().mockResolvedValue(false),
      assignRole: vi.fn(),
    };
    const service = createApiService(
      config({ container: containerForAll(handle), accessControl }),
    );
    await expect(
      service.router.dispatch({
        method: "DELETE",
        path: "/projects/:id",
        clientKey: "c1",
        organizationId: ORG,
        params: { id: "dddddddd-dddd-dddd-dddd-dddddddddddd" },
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(handle).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for an unregistered route", async () => {
    const service = createApiService(config());
    await expect(
      service.router.dispatch({ method: "GET", path: "/nope", clientKey: "c1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("containerHandlerResolver", () => {
  it("resolves handlers from the container by operation id", () => {
    const handler: ServiceInvocation = () => Promise.resolve();
    const container = new MapServiceContainer().register("videos.get", handler);
    const resolver = containerHandlerResolver(container);
    expect(resolver.resolve("videos.get")).toBe(handler);
  });
});
