import { describe, expect, it, vi } from "vitest";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import { AuthRequiredGuard, PublicEndpointRegistry, type AuthStatus } from "../security/auth-required.js";
import { RateLimiter } from "../security/rate-limiter.js";
import { RestRouter, WebSocketGateway, type GatewayConnection } from "./controllers.js";
import type { AuditSink, Authenticator, LifecycleDeps, OperationBinding } from "./lifecycle.js";
import type { PublicOperation } from "./operations.js";

const MEMBER: AuthContext = { memberId: "99999999-9999-9999-9999-999999999999" };
const authOk: AuthStatus = { kind: "authenticated", principal: MEMBER };

function lifecycleDeps(): LifecycleDeps {
  const authenticator: Authenticator = { authenticate: () => Promise.resolve(authOk) };
  const accessControl: AccessControl = {
    can: vi.fn().mockResolvedValue(true),
    assignRole: vi.fn(),
  };
  const auditSink: AuditSink = { record: vi.fn() };
  return {
    rateLimiter: new RateLimiter({ limit: 1000 }),
    authenticator,
    authGuard: new AuthRequiredGuard(new PublicEndpointRegistry()),
    accessControl,
    auditSink,
  };
}

const getVideos: PublicOperation = {
  id: "videos.list",
  channel: "rest",
  method: "GET",
  path: "/videos",
  authz: { kind: "authenticated" },
};

const realtime: PublicOperation = {
  id: "realtime.connect",
  channel: "websocket",
  path: "/realtime",
  authz: { kind: "authenticated" },
};

describe("RestRouter", () => {
  it("dispatches a matched route through the lifecycle", async () => {
    const handle = vi.fn().mockResolvedValue(["v1", "v2"]);
    const router = new RestRouter([{ operation: getVideos, handle }], lifecycleDeps());
    const result = await router.dispatch({
      method: "GET",
      path: "/videos",
      clientKey: "c1",
    });
    expect(result).toEqual(["v1", "v2"]);
    expect(router.hasRoute("get", "/videos")).toBe(true);
  });

  it("throws NOT_FOUND for an unmatched route", async () => {
    const router = new RestRouter([], lifecycleDeps());
    await expect(
      router.dispatch({ method: "GET", path: "/missing", clientKey: "c1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects duplicate route registrations", () => {
    const binding: OperationBinding = { operation: getVideos, handle: () => Promise.resolve() };
    expect(() => new RestRouter([binding, binding], lifecycleDeps())).toThrow(
      /Duplicate REST route/,
    );
  });

  it("ignores non-REST bindings", () => {
    const router = new RestRouter(
      [{ operation: realtime, handle: () => Promise.resolve() }],
      lifecycleDeps(),
    );
    expect(router.routeKeys()).toEqual([]);
  });
});

describe("WebSocketGateway", () => {
  it("opens a connection after the lifecycle authorizes the handshake", async () => {
    const connection: GatewayConnection = { operation: realtime, close: vi.fn() };
    const binding: OperationBinding<GatewayConnection> = {
      operation: realtime,
      handle: () => Promise.resolve(connection),
    };
    const gateway = new WebSocketGateway([binding], lifecycleDeps());
    const opened = await gateway.connect({
      method: "GET",
      path: "/realtime",
      clientKey: "c1",
    });
    expect(opened).toBe(connection);
    expect(gateway.channelPaths()).toEqual(["/realtime"]);
  });

  it("denies an unauthenticated handshake before opening a connection", async () => {
    const handle = vi.fn();
    const deps = lifecycleDeps();
    const gateway = new WebSocketGateway(
      [{ operation: realtime, handle }],
      { ...deps, authenticator: { authenticate: () => Promise.resolve({ kind: "unauthenticated" }) } },
    );
    await expect(
      gateway.connect({ method: "GET", path: "/realtime", clientKey: "c1" }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    expect(handle).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an unknown channel", async () => {
    const gateway = new WebSocketGateway([], lifecycleDeps());
    await expect(
      gateway.connect({ method: "GET", path: "/unknown", clientKey: "c1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
