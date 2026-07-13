import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type {
  AccessControl,
  Action,
  AuthContext,
  ResourceRef,
  RoleName,
} from "@streetstudio/auth";
import { createApiService, type HandlerResolver } from "./composition-root.js";
import type {
  ApiRequest,
  AuditEvent,
  AuditSink,
  Authenticator,
  ServiceInvocation,
} from "./lifecycle.js";
import type { AuthStatus } from "../security/auth-required.js";
import type { GatewayConnection } from "./controllers.js";
import type { AuthzPolicy, PublicOperation } from "./operations.js";
import { RateLimiter } from "../security/rate-limiter.js";

/**
 * Property 65: Public API authorization matches web equivalents.
 *
 * Feature: streetstudio, Property 65: Public API authorization matches web equivalents
 *
 * Validates: Requirements 20.4, 20.5
 *
 * For any operation and requester context, the authorization decision made for
 * a public API request equals the decision made for the equivalent Web_Client
 * request (R20.4), and a request lacking the required authorization is denied
 * with no state change and an authorization error (R20.5).
 *
 * The design realizes web/API parity by driving authorization from a single
 * per-operation {@link AuthzPolicy} that the composition root applies uniformly
 * regardless of the channel or client that issued the request. There is no
 * separate "web" authorization code path to diff against; instead the parity
 * guarantee is that the allow/deny decision depends ONLY on the operation's
 * policy and the requester's grants — never on the transport. These properties
 * prove exactly that:
 *
 *  - A "web-equivalent" reference authorizer computes the expected decision
 *    purely from the policy + the requester's grants (deny-by-default). The
 *    real API_Service must match it. This is the web-equivalence claim (R20.4).
 *  - The SAME operation policy exposed over both the REST router and the
 *    WebSocket gateway must produce the SAME decision on both channels —
 *    channel-independent parity, which is what makes "the equivalent Web_Client
 *    request" well-defined.
 *  - When the required grant is absent the request is denied with
 *    AUTHORIZATION_DENIED, the domain service handler is NEVER invoked (no
 *    state change), and a denial is written to the audit log (R20.5).
 *  - When the grant is present the domain service runs.
 *
 * The whole pipeline is exercised through in-memory fakes (Authenticator,
 * deny-by-default AccessControl, AuditSink, and recording service handlers)
 * with no real network, database, or clock.
 */

/** The universe of RBAC actions used by generated rbac operations. */
const ACTIONS: readonly Action[] = [
  "project:create",
  "video:read",
  "comment:create",
  "org:update",
  "webhook:delete",
];

/** Arbitrary authorization policy across all three policy kinds. */
const policyArb: fc.Arbitrary<AuthzPolicy> = fc.oneof(
  fc.constant<AuthzPolicy>({ kind: "public" }),
  fc.constant<AuthzPolicy>({ kind: "authenticated" }),
  fc
    .constantFrom(...ACTIONS)
    .map((action): AuthzPolicy => ({ kind: "rbac", action, resourceType: "resource" })),
);

/** Arbitrary set of RBAC actions the requesting principal has been granted. */
const grantsArb: fc.Arbitrary<readonly Action[]> = fc.subarray([...ACTIONS]);

/**
 * A deny-by-default {@link AccessControl} fake. `can` resolves `true` only for
 * an action explicitly present in `granted`; every other action resolves
 * `false` (never throws for a denial), exactly like the real RBAC evaluator.
 */
function fakeAccessControl(granted: ReadonlySet<Action>): AccessControl {
  return {
    async can(_ctx: AuthContext, action: Action, _resource: ResourceRef): Promise<boolean> {
      return granted.has(action);
    },
    async assignRole(
      _actor: AuthContext,
      _orgId: Uuid,
      _member: Uuid,
      _role: RoleName,
    ): Promise<void> {
      // Not exercised by this property.
    },
  };
}

/** An {@link Authenticator} that always resolves the given authenticated principal. */
function fakeAuthenticator(principal: AuthContext): Authenticator {
  return {
    async authenticate(_request: ApiRequest): Promise<AuthStatus> {
      return { kind: "authenticated", principal };
    },
  };
}

/** An {@link AuditSink} that appends every event to `log`. */
function recordingAuditSink(log: AuditEvent[]): AuditSink {
  return {
    record(event: AuditEvent): void {
      log.push(event);
    },
  };
}

/**
 * The web-equivalent reference decision: with an authenticated principal, a
 * `public` or `authenticated` operation is always allowed, and an `rbac`
 * operation is allowed iff the principal was granted the required action. This
 * is the decision an equivalent Web_Client request would receive.
 */
function referenceAllows(policy: AuthzPolicy, grants: ReadonlySet<Action>): boolean {
  switch (policy.kind) {
    case "public":
    case "authenticated":
      return true;
    case "rbac":
      return grants.has(policy.action);
  }
}

/** Build a REST and a WebSocket operation that share a single authz policy. */
function operationsFor(policy: AuthzPolicy): {
  rest: PublicOperation;
  ws: PublicOperation;
  all: readonly PublicOperation[];
} {
  const rest: PublicOperation = {
    id: "parity.rest",
    channel: "rest",
    method: "POST",
    path: "/parity",
    authz: policy,
  };
  const ws: PublicOperation = {
    id: "parity.ws",
    channel: "websocket",
    path: "/parity-ws",
    authz: policy,
  };
  return { rest, ws, all: [rest, ws] };
}

/**
 * Assemble an API_Service over the shared catalog with recording collaborators.
 * `invoked` collects the ids of any service handler that runs (proving whether
 * state would change); `audits` collects every audit event.
 */
function buildService(
  policy: AuthzPolicy,
  principal: AuthContext,
  grants: ReadonlySet<Action>,
) {
  const { rest, ws, all } = operationsFor(policy);
  const invoked: string[] = [];
  const audits: AuditEvent[] = [];

  const handlers: HandlerResolver = {
    resolve(operationId: string): ServiceInvocation {
      return async (_request, _context) => {
        invoked.push(operationId);
        if (operationId === ws.id) {
          const connection: GatewayConnection = {
            operation: ws,
            close() {
              /* no-op */
            },
          };
          return connection;
        }
        return { ok: true };
      };
    },
  };

  const service = createApiService({
    container: { resolve: () => undefined, has: () => true },
    handlers,
    // Permissive limiter so rate limiting never interferes with the property.
    rateLimiter: new RateLimiter({ limit: 1_000_000 }),
    authenticator: fakeAuthenticator(principal),
    accessControl: fakeAccessControl(grants),
    auditSink: recordingAuditSink(audits),
    operations: all,
  });

  return { service, rest, ws, invoked, audits };
}

/** Run an async thunk, classifying the result as allowed or a typed denial. */
async function outcomeOf(
  run: () => Promise<unknown>,
): Promise<{ allowed: true } | { allowed: false; code: string }> {
  try {
    await run();
    return { allowed: true };
  } catch (err) {
    if (err instanceof AppError) {
      return { allowed: false, code: err.code };
    }
    throw err;
  }
}

const memberIdArb = fc.uuid();
const orgIdArb = fc.uuid();

describe("Feature: streetstudio, Property 65: Public API authorization matches web equivalents", () => {
  it("authorizes API requests identically across REST and WebSocket channels, matching the web-equivalent decision", async () => {
    await fc.assert(
      fc.asyncProperty(
        policyArb,
        grantsArb,
        memberIdArb,
        orgIdArb,
        async (policy, grantList, memberId, organizationId) => {
          const grants = new Set<Action>(grantList);
          const principal: AuthContext = { memberId };
          const expected = referenceAllows(policy, grants);

          // --- REST channel ------------------------------------------------
          const rest = buildService(policy, principal, grants);
          const restReq: ApiRequest = {
            method: "POST",
            path: "/parity",
            clientKey: `rest:${memberId}`,
            credential: "token",
            organizationId,
            params: {},
          };
          const restOutcome = await outcomeOf(() => rest.service.router.dispatch(restReq));

          // --- WebSocket channel ------------------------------------------
          const ws = buildService(policy, principal, grants);
          const wsReq: ApiRequest = {
            method: "CONNECT",
            path: "/parity-ws",
            clientKey: `ws:${memberId}`,
            credential: "token",
            organizationId,
            params: {},
          };
          const wsOutcome = await outcomeOf(() => ws.service.gateway.connect(wsReq));

          // Channel-independent parity: both channels reach the SAME decision,
          // and that decision equals the web-equivalent reference (R20.4).
          expect(restOutcome.allowed).toBe(expected);
          expect(wsOutcome.allowed).toBe(expected);

          if (expected) {
            // Allowed: the domain service ran on each channel.
            expect(rest.invoked).toEqual([rest.rest.id]);
            expect(ws.invoked).toEqual([ws.ws.id]);
          } else {
            // Denied lacking the required grant (R20.5): an authorization error,
            // no service handler ever ran (no state change), and the denial was
            // audited — identically on both channels.
            expect(restOutcome).toEqual({ allowed: false, code: "AUTHORIZATION_DENIED" });
            expect(wsOutcome).toEqual({ allowed: false, code: "AUTHORIZATION_DENIED" });
            expect(rest.invoked).toEqual([]);
            expect(ws.invoked).toEqual([]);

            const restDenials = rest.audits.filter(
              (e) => e.outcome === "authorization_denied",
            );
            const wsDenials = ws.audits.filter((e) => e.outcome === "authorization_denied");
            expect(restDenials).toHaveLength(1);
            expect(wsDenials).toHaveLength(1);
            expect(rest.audits.some((e) => e.outcome === "success")).toBe(false);
            expect(ws.audits.some((e) => e.outcome === "success")).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("denies an rbac request lacking the required grant with AUTHORIZATION_DENIED, no state change, and an audited denial (R20.5)", async () => {
    await fc.assert(
      fc.asyncProperty(
        // An rbac policy whose required action is guaranteed NOT granted.
        fc.constantFrom(...ACTIONS),
        memberIdArb,
        orgIdArb,
        fc.constantFrom<"rest" | "ws">("rest", "ws"),
        async (action, memberId, organizationId, channel) => {
          const policy: AuthzPolicy = { kind: "rbac", action, resourceType: "resource" };
          // Grant every OTHER action but never the required one, so the
          // deny-by-default evaluator must refuse.
          const grants = new Set<Action>(ACTIONS.filter((a) => a !== action));
          const principal: AuthContext = { memberId };
          const harness = buildService(policy, principal, grants);

          const request: ApiRequest =
            channel === "rest"
              ? {
                  method: "POST",
                  path: "/parity",
                  clientKey: `rest:${memberId}`,
                  credential: "token",
                  organizationId,
                  params: {},
                }
              : {
                  method: "CONNECT",
                  path: "/parity-ws",
                  clientKey: `ws:${memberId}`,
                  credential: "token",
                  organizationId,
                  params: {},
                };

          const outcome = await outcomeOf(() =>
            channel === "rest"
              ? harness.service.router.dispatch(request)
              : harness.service.gateway.connect(request),
          );

          // Denied with an authorization error.
          expect(outcome).toEqual({ allowed: false, code: "AUTHORIZATION_DENIED" });
          // No state change: the domain service handler never ran.
          expect(harness.invoked).toEqual([]);
          // The denial was recorded to the audit log, scoped to the request.
          const denials = harness.audits.filter((e) => e.outcome === "authorization_denied");
          expect(denials).toHaveLength(1);
          expect(denials[0]?.operationId).toBe(
            channel === "rest" ? harness.rest.id : harness.ws.id,
          );
          expect(denials[0]?.action).toBe(action);
          expect(harness.audits.some((e) => e.outcome === "success")).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
