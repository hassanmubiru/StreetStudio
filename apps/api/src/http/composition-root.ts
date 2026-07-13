/**
 * API_Service composition root (Requirements 20.1, 20.4, 20.5).
 *
 * This is where the standalone pieces become a running host: the domain
 * services (auth, organizations, media, processing, notifications, plugins,
 * analytics, webhooks) are resolved through StreetJS dependency injection and
 * bound to the public operation catalog, producing a {@link RestRouter} and a
 * {@link WebSocketGateway} that both enforce the shared request lifecycle.
 *
 * Wiring is deliberately generic. Rather than hand-coding one controller per
 * endpoint, the composition root iterates the catalog and, for each operation,
 * resolves its service handler from the DI container and attaches the
 * operation's declared authorization policy. Two consequences follow directly:
 *
 *  - Every catalog entry — i.e. every Web_Client capability — gets a public
 *    REST/WebSocket/Webhook binding, so nothing is UI-only (R20.1).
 *  - The same {@link AuthzPolicy} drives authorization on every channel, so a
 *    public API request is authorized identically to the equivalent Web_Client
 *    request, and a request lacking the required grant is denied with no state
 *    change and an authorization error (R20.4, R20.5).
 *
 * StreetJS is reached only through the {@link ServiceContainer} adapter seam
 * (backed by `@streetjs/core` DI in production), never by importing framework
 * internals — keeping this host boundary-clean.
 */
import { AppError } from "@streetstudio/shared";
import type { AccessControl } from "@streetstudio/auth";
import { AuthRequiredGuard, PublicEndpointRegistry } from "../security/auth-required.js";
import { RateLimiter } from "../security/rate-limiter.js";
import {
  RestRouter,
  WebSocketGateway,
  type GatewayConnection,
} from "./controllers.js";
import type {
  ApiRequest,
  Authenticator,
  AuditSink,
  LifecycleDeps,
  OperationBinding,
  RequestContext,
  RequestValidator,
  ServiceInvocation,
} from "./lifecycle.js";
import {
  PUBLIC_OPERATIONS,
  type HttpMethod,
  type PublicOperation,
} from "./operations.js";

/**
 * Structural adapter over the StreetJS DI container. The composition root
 * resolves domain-service handlers through this seam and never touches the
 * framework's internals, satisfying the import-boundary rules.
 */
export interface ServiceContainer {
  /** Resolve a registered value/handler by its token. */
  resolve<T>(token: string): T;
  /** True when a token is registered (used to detect wiring gaps). */
  has(token: string): boolean;
}

/**
 * A minimal in-memory {@link ServiceContainer}. Production deployments back the
 * same interface with the StreetJS container; this default keeps the host fully
 * testable and usable in single-process/self-hosted setups.
 */
export class MapServiceContainer implements ServiceContainer {
  private readonly values = new Map<string, unknown>();

  /** Register `value` under `token`, replacing any prior registration. */
  register<T>(token: string, value: T): this {
    this.values.set(token, value);
    return this;
  }

  has(token: string): boolean {
    return this.values.has(token);
  }

  resolve<T>(token: string): T {
    if (!this.values.has(token)) {
      throw new AppError("CONFIGURATION_INVALID", {
        details: { reason: `No service registered for token: ${token}` },
      });
    }
    return this.values.get(token) as T;
  }
}

/** Resolves the service handler that fulfills a given operation id. */
export interface HandlerResolver {
  resolve(operationId: string): ServiceInvocation;
}

/**
 * A {@link HandlerResolver} that resolves each operation's handler from a
 * {@link ServiceContainer} using the operation id as the token. This is the
 * DI bridge: domain services register their operation handlers under their
 * operation ids when the container is composed.
 */
export function containerHandlerResolver(
  container: ServiceContainer,
): HandlerResolver {
  return {
    resolve(operationId: string): ServiceInvocation {
      return container.resolve<ServiceInvocation>(operationId);
    },
  };
}

/** HTTP methods that mutate state and are therefore audited on success. */
const MUTATING_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>([
  "POST",
  "PATCH",
  "PUT",
  "DELETE",
]);

function isMutating(operation: PublicOperation): boolean {
  return operation.method !== undefined && MUTATING_METHODS.has(operation.method);
}

/** Configuration for {@link createApiService}. */
export interface ApiServiceConfig {
  /** StreetJS DI container adapter holding the domain services. */
  readonly container: ServiceContainer;
  /**
   * Resolves operation handlers. Defaults to a {@link containerHandlerResolver}
   * over {@link ApiServiceConfig.container}.
   */
  readonly handlers?: HandlerResolver;
  /** Per-client rate limiter. Defaults to the security default (100/60s). */
  readonly rateLimiter?: RateLimiter;
  /** Resolves presented credentials into an auth status. */
  readonly authenticator: Authenticator;
  /** Deny-by-default RBAC evaluator (from `@streetstudio/auth`). */
  readonly accessControl: AccessControl;
  /** Append-only audit sink. */
  readonly auditSink: AuditSink;
  /** Optional cross-cutting request validator. */
  readonly validator?: RequestValidator;
  /** Operation catalog to host. Defaults to {@link PUBLIC_OPERATIONS}. */
  readonly operations?: readonly PublicOperation[];
}

/** The assembled API_Service: its request surfaces and supporting registries. */
export interface ApiService {
  /** REST controllers keyed by method + route template. */
  readonly router: RestRouter;
  /** WebSocket gateway for realtime channels. */
  readonly gateway: WebSocketGateway;
  /** The public (no-auth) endpoint registry, also the R29.5 documentation set. */
  readonly publicEndpoints: PublicEndpointRegistry;
  /** The hosted operation catalog. */
  readonly operations: readonly PublicOperation[];
}

/** Build the auth-required registry from the public operations in the catalog. */
function buildPublicRegistry(
  operations: readonly PublicOperation[],
): PublicEndpointRegistry {
  const publicEndpoints = operations
    .filter((op) => op.authz.kind === "public" && op.channel === "rest")
    .map((op) => ({ method: op.method ?? "GET", path: op.path }));
  return new PublicEndpointRegistry(publicEndpoints);
}

/**
 * Assemble the API_Service host: resolve every catalog operation's handler
 * through DI, bind it to the shared request lifecycle, and expose the REST
 * router and WebSocket gateway. Any operation whose handler is missing from the
 * container fails fast at composition time, so a wiring gap can never silently
 * leave a capability unreachable (protecting the R20.1 parity guarantee).
 */
export function createApiService(config: ApiServiceConfig): ApiService {
  const operations = config.operations ?? PUBLIC_OPERATIONS;
  const handlers = config.handlers ?? containerHandlerResolver(config.container);
  const rateLimiter = config.rateLimiter ?? new RateLimiter();
  const publicEndpoints = buildPublicRegistry(operations);
  const authGuard = new AuthRequiredGuard(publicEndpoints);

  const lifecycleDeps: LifecycleDeps = {
    rateLimiter,
    authenticator: config.authenticator,
    authGuard,
    accessControl: config.accessControl,
    auditSink: config.auditSink,
    ...(config.validator ? { validator: config.validator } : {}),
  };

  const restBindings: OperationBinding[] = [];
  const wsBindings: OperationBinding<GatewayConnection>[] = [];

  for (const operation of operations) {
    const handle = handlers.resolve(operation.id);
    const binding: OperationBinding = {
      operation,
      handle,
      auditable: isMutating(operation),
    };
    if (operation.channel === "websocket") {
      wsBindings.push(
        binding as OperationBinding<GatewayConnection> & {
          handle: (
            request: ApiRequest,
            context: RequestContext,
          ) => Promise<GatewayConnection>;
        },
      );
    } else {
      restBindings.push(binding);
    }
  }

  return {
    router: new RestRouter(restBindings, lifecycleDeps),
    gateway: new WebSocketGateway(wsBindings, lifecycleDeps),
    publicEndpoints,
    operations,
  };
}
