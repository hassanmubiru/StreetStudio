/**
 * Auth-required-by-default middleware (Requirements 29.4, 29.5, Property 87).
 *
 * Every network-exposed endpoint requires authentication unless it is
 * explicitly registered as public. A request that is unauthenticated or
 * presents invalid authentication against a non-public endpoint is denied with
 * an authentication error and performs no state change — the guard runs before
 * any controller/service, so denial short-circuits the request lifecycle and
 * nothing downstream executes (R29.4).
 *
 * Public endpoints must be declared explicitly, which keeps the default
 * closed: forgetting to register an endpoint leaves it protected rather than
 * open. The registered set is also the documentation source for
 * "endpoints requiring no authentication" (R29.5).
 */
import { AppError, type ErrorCode } from "@streetstudio/shared";

/** How a request presented its credentials to the authentication stage. */
export type AuthStatus =
  /** Verified credentials resolved to a principal. */
  | { readonly kind: "authenticated"; readonly principal: unknown }
  /** No credentials were presented. */
  | { readonly kind: "unauthenticated" }
  /** Credentials were presented but failed verification. */
  | { readonly kind: "invalid" };

/** An endpoint identified by HTTP method and path template. */
export interface EndpointId {
  /** HTTP method, case-insensitive (e.g. "GET", "POST"). */
  readonly method: string;
  /** Route path or template (e.g. "/health", "/share/:token"). */
  readonly path: string;
}

/** A request as seen by the auth-required guard. */
export interface GuardedRequest extends EndpointId {
  /** The outcome of the authentication stage for this request. */
  readonly auth: AuthStatus;
}

/** The guard's decision for a request. */
export interface AuthGuardDecision {
  /** Whether the request may proceed to the controller. */
  readonly allowed: boolean;
  /** Whether the target endpoint is registered as public. */
  readonly public: boolean;
  /** When denied, the authentication error code to return. */
  readonly errorCode?: ErrorCode;
}

/** Normalize an endpoint into a stable, case-insensitive lookup key. */
function endpointKey(method: string, path: string): string {
  return `${method.trim().toUpperCase()} ${path.trim()}`;
}

/**
 * The registry of public (no-auth) endpoints. This is the single source of
 * truth for R29.5 documentation and the allowlist the guard consults.
 */
export class PublicEndpointRegistry {
  private readonly keys: ReadonlySet<string>;

  constructor(endpoints: readonly EndpointId[] = []) {
    this.keys = new Set(endpoints.map((e) => endpointKey(e.method, e.path)));
  }

  /** True iff the given endpoint is registered as public. */
  isPublic(method: string, path: string): boolean {
    return this.keys.has(endpointKey(method, path));
  }

  /** The registered public endpoints, for documentation generation (R29.5). */
  list(): EndpointId[] {
    return [...this.keys].map((key) => {
      const sep = key.indexOf(" ");
      return { method: key.slice(0, sep), path: key.slice(sep + 1) };
    });
  }
}

/**
 * Guards requests by requiring authentication on every endpoint that is not
 * registered as public.
 */
export class AuthRequiredGuard {
  private readonly publicEndpoints: PublicEndpointRegistry;

  constructor(publicEndpoints: PublicEndpointRegistry = new PublicEndpointRegistry()) {
    this.publicEndpoints = publicEndpoints;
  }

  /**
   * Evaluate `request` without throwing. A public endpoint is always allowed;
   * a non-public endpoint is allowed only when authentication succeeded. An
   * unauthenticated request is denied with `AUTHENTICATION_REQUIRED` and an
   * invalid one with `AUTHENTICATION_FAILED` — both authentication errors that
   * disclose nothing about the target (R29.4).
   */
  evaluate(request: GuardedRequest): AuthGuardDecision {
    const isPublic = this.publicEndpoints.isPublic(request.method, request.path);
    if (isPublic) {
      return { allowed: true, public: true };
    }
    switch (request.auth.kind) {
      case "authenticated":
        return { allowed: true, public: false };
      case "unauthenticated":
        return {
          allowed: false,
          public: false,
          errorCode: "AUTHENTICATION_REQUIRED",
        };
      case "invalid":
        return {
          allowed: false,
          public: false,
          errorCode: "AUTHENTICATION_FAILED",
        };
    }
  }

  /**
   * Enforce the guard for `request`. On denial, throws the authentication error
   * before any state-changing work runs (R29.4). On success, returns the
   * decision so the caller may read the resolved principal from the request.
   */
  enforce(request: GuardedRequest): AuthGuardDecision {
    const decision = this.evaluate(request);
    if (!decision.allowed) {
      throw new AppError(decision.errorCode ?? "AUTHENTICATION_REQUIRED");
    }
    return decision;
  }
}
