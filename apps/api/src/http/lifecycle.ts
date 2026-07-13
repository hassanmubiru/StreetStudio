/**
 * The API_Service request lifecycle (Requirements 20.4, 20.5, 29.1, 29.4).
 *
 * Every public request — REST, WebSocket handshake, or webhook-management call —
 * flows through the same ordered pipeline before any domain service runs:
 *
 *   rate limit → authenticate → validate → RBAC → service → audit
 *
 * The ordering is the security contract. Rate limiting sheds load before any
 * work (R29.1); authentication resolves the principal and denies unauthenticated
 * or invalid requests to non-public endpoints before validation (R29.4);
 * validation rejects malformed input before authorization; RBAC is evaluated
 * deny-by-default against the Organization that owns the resource so a public
 * API request receives the identical authorization as the equivalent Web_Client
 * request (R20.4); only then does the domain service execute; and finally the
 * audit sink records security-relevant outcomes.
 *
 * Because the service stage is strictly last, any earlier denial short-circuits
 * the request and NOTHING downstream executes — so a denied request performs no
 * state change and returns the appropriate error (R20.5). This module keeps
 * every collaborator behind a narrow seam so the whole pipeline is exercised in
 * tests with in-memory fakes and no real network, database, or clock.
 */
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type { AccessControl, AuthContext, ResourceRef } from "@streetstudio/auth";
import { AuthRequiredGuard, type AuthStatus } from "../security/auth-required.js";
import { RateLimiter } from "../security/rate-limiter.js";
import type { AuthzPolicy, PublicOperation } from "./operations.js";

/** A public request as seen by the lifecycle, independent of transport. */
export interface ApiRequest {
  /** HTTP method (REST) or a channel verb; matched against the operation. */
  readonly method: string;
  /** Route template / channel path matched against the operation. */
  readonly path: string;
  /** Per-client key used for rate limiting (API key id, member id, or IP). */
  readonly clientKey: string;
  /** Raw presented credential (bearer token or API key), if any. */
  readonly credential?: string;
  /** Organization scope for the request (the owning org for RBAC). */
  readonly organizationId?: Uuid;
  /** Path parameters extracted from the route (e.g. `{ id }`). */
  readonly params?: Readonly<Record<string, string>>;
  /** Parsed query parameters. */
  readonly query?: Readonly<Record<string, unknown>>;
  /** Parsed request body. */
  readonly body?: unknown;
}

/** The authenticated context handed to services once the guard passes. */
export interface RequestContext {
  /** The resolved principal, present for authenticated/rbac operations. */
  readonly auth?: AuthContext;
  /** The organization scope the request is bound to, when supplied. */
  readonly organizationId?: Uuid;
}

/**
 * Resolves a presented credential into an {@link AuthStatus}. Wraps the
 * `@streetstudio/auth` token/API-key verification behind a seam so the
 * lifecycle need not know which credential kind was used.
 */
export interface Authenticator {
  authenticate(request: ApiRequest): Promise<AuthStatus>;
}

/** Validates a request's shape/content before authorization runs. */
export interface RequestValidator {
  /** Throw `VALIDATION_FAILED` (or another validation error) when invalid. */
  validate(operation: PublicOperation, request: ApiRequest): void | Promise<void>;
}

/** The stage at which a request outcome is being audited. */
export type AuditOutcome = "authorization_denied" | "success";

/** A security-relevant event appended to the append-only audit log. */
export interface AuditEvent {
  readonly operationId: string;
  readonly outcome: AuditOutcome;
  readonly memberId?: Uuid;
  readonly organizationId?: Uuid;
  /** The RBAC action evaluated, when the operation is RBAC-gated. */
  readonly action?: string;
}

/** Append-only audit sink (R28); records denials and mutating successes. */
export interface AuditSink {
  record(event: AuditEvent): void | Promise<void>;
}

/**
 * Executes a domain service for an operation. Receives the already-validated
 * request and the authenticated context. This is the ONLY stage permitted to
 * mutate state, and it runs strictly after every guard has passed.
 */
export type ServiceInvocation<Out = unknown> = (
  request: ApiRequest,
  context: RequestContext,
) => Promise<Out>;

/**
 * A fully-wired operation: its catalog metadata, the service that fulfills it,
 * how to derive the RBAC resource for a request, whether success is auditable,
 * and an optional per-operation validator.
 */
export interface OperationBinding<Out = unknown> {
  readonly operation: PublicOperation;
  readonly handle: ServiceInvocation<Out>;
  /**
   * Derive the resource an RBAC-gated operation targets. Defaults to scoping by
   * the request's `organizationId` and the operation's declared resource type.
   */
  readonly resource?: (request: ApiRequest, context: RequestContext) => ResourceRef;
  /** Whether a successful invocation is recorded in the audit log. */
  readonly auditable?: boolean;
  /** Per-operation validation, run at the validate stage. */
  readonly validate?: (request: ApiRequest) => void;
}

/** Collaborators the lifecycle depends on, all injectable seams. */
export interface LifecycleDeps {
  readonly rateLimiter: RateLimiter;
  readonly authenticator: Authenticator;
  readonly authGuard: AuthRequiredGuard;
  readonly accessControl: AccessControl;
  readonly auditSink: AuditSink;
  /** Optional cross-cutting validator applied to every operation. */
  readonly validator?: RequestValidator;
}

/** Default RBAC resource derivation: scope by request org + resource type. */
function defaultResource(
  policy: Extract<AuthzPolicy, { kind: "rbac" }>,
  request: ApiRequest,
): ResourceRef {
  const organizationId = request.organizationId;
  if (!organizationId) {
    // No owning organization means the deny-by-default evaluator cannot grant
    // access — surface an authorization denial rather than a soft failure.
    throw new AppError("AUTHORIZATION_DENIED");
  }
  const resource: { organizationId: Uuid; type?: string; id?: string } = {
    organizationId,
  };
  if (policy.resourceType !== undefined) {
    resource.type = policy.resourceType;
  }
  const id = request.params?.["id"];
  if (id !== undefined) {
    resource.id = id;
  }
  return resource;
}

/**
 * Run the full request lifecycle for `binding`/`request`, returning the service
 * result on success. Throws an {@link AppError} at the first stage that denies
 * the request; because the service stage is last, a denial guarantees no state
 * change (R20.5).
 */
export async function runLifecycle<Out>(
  binding: OperationBinding<Out>,
  request: ApiRequest,
  deps: LifecycleDeps,
): Promise<Out> {
  const { operation } = binding;

  // 1. Rate limit — shed excess load before any work (R29.1).
  deps.rateLimiter.enforce(request.clientKey);

  // 2. Authenticate — resolve the principal from the presented credential.
  const authStatus = await deps.authenticator.authenticate(request);

  // 2b. Auth-required guard — deny unauthenticated/invalid to non-public
  //     endpoints before anything else runs (R29.4).
  deps.authGuard.enforce({
    method: operation.method ?? "GET",
    path: operation.path,
    auth: authStatus,
  });

  const context: RequestContext =
    authStatus.kind === "authenticated"
      ? { auth: authStatus.principal as AuthContext, organizationId: request.organizationId }
      : { organizationId: request.organizationId };

  // 3. Validate — reject malformed input before authorization.
  if (deps.validator) {
    await deps.validator.validate(operation, request);
  }
  binding.validate?.(request);

  // 4. RBAC — deny-by-default in the owning organization's scope (R20.4).
  if (operation.authz.kind === "rbac") {
    const ctx = context.auth;
    if (!ctx) {
      // The guard admits only authenticated principals to non-public
      // endpoints, so this is defensive.
      throw new AppError("AUTHORIZATION_DENIED");
    }
    const resource = binding.resource
      ? binding.resource(request, context)
      : defaultResource(operation.authz, request);
    const allowed = await deps.accessControl.can(ctx, operation.authz.action, resource);
    if (!allowed) {
      // Record the denial and stop — no service runs, no state changes (R20.5).
      await deps.auditSink.record({
        operationId: operation.id,
        outcome: "authorization_denied",
        ...(ctx.memberId ? { memberId: ctx.memberId } : {}),
        ...(resource.organizationId ? { organizationId: resource.organizationId } : {}),
        action: operation.authz.action,
      });
      throw new AppError("AUTHORIZATION_DENIED");
    }
  }

  // 5. Service — the only state-changing stage, reached only after all guards.
  const result = await binding.handle(request, context);

  // 6. Audit — record security-relevant successes (R28).
  if (binding.auditable) {
    const event: AuditEvent = {
      operationId: operation.id,
      outcome: "success",
      ...(context.auth?.memberId ? { memberId: context.auth.memberId } : {}),
      ...(context.organizationId ? { organizationId: context.organizationId } : {}),
      ...(operation.authz.kind === "rbac" ? { action: operation.authz.action } : {}),
    };
    await deps.auditSink.record(event);
  }

  return result;
}
