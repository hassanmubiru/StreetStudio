/**
 * REST controllers and the WebSocket gateway (Requirements 20.1, 20.4, 20.5).
 *
 * These types turn the operation catalog into two concrete request surfaces —
 * an HTTP {@link RestRouter} and a {@link WebSocketGateway} — that both funnel
 * every request through the shared {@link runLifecycle} pipeline. Neither
 * surface contains any authorization logic of its own: they resolve the matching
 * {@link OperationBinding} and delegate, so REST and WebSocket clients are held
 * to exactly the same lifecycle (rate limit → authenticate → validate → RBAC →
 * service → audit) as one another and as the Web_Client (R20.4).
 *
 * Routing is intentionally template-based: a request carries the route template
 * it matched (e.g. `/projects/:id`) plus extracted params, keeping this layer
 * free of a concrete HTTP framework. StreetJS supplies the real router and
 * WebSocket server at the composition root; here we model only the dispatch and
 * lifecycle binding so the surface is testable without a network.
 */
import { AppError } from "@streetstudio/shared";
import {
  runLifecycle,
  type ApiRequest,
  type LifecycleDeps,
  type OperationBinding,
} from "./lifecycle.js";
import { restKey, type PublicOperation } from "./operations.js";

/**
 * A method+path keyed collection of REST operation bindings that dispatches an
 * incoming request through the request lifecycle.
 */
export class RestRouter {
  private readonly routes = new Map<string, OperationBinding>();

  constructor(
    bindings: readonly OperationBinding[],
    private readonly deps: LifecycleDeps,
  ) {
    for (const binding of bindings) {
      const { operation } = binding;
      if (operation.channel !== "rest") {
        continue;
      }
      const key = restKey(operation.method ?? "GET", operation.path);
      if (this.routes.has(key)) {
        throw new AppError("CONFIGURATION_INVALID", {
          details: { reason: `Duplicate REST route: ${key}` },
        });
      }
      this.routes.set(key, binding);
    }
  }

  /** The route keys this router serves, for diagnostics and documentation. */
  routeKeys(): string[] {
    return [...this.routes.keys()].sort();
  }

  /** True when a binding exists for `method`/`path`. */
  hasRoute(method: string, path: string): boolean {
    return this.routes.has(restKey(method, path));
  }

  /**
   * Dispatch `request` to its bound operation through the lifecycle. Throws
   * `NOT_FOUND` when no route matches; otherwise returns the service result or
   * propagates the lifecycle's {@link AppError} on any denial.
   */
  async dispatch<Out = unknown>(request: ApiRequest): Promise<Out> {
    const binding = this.routes.get(restKey(request.method, request.path));
    if (!binding) {
      throw new AppError("NOT_FOUND");
    }
    return runLifecycle(binding, request, this.deps) as Promise<Out>;
  }
}

/** A live realtime connection produced by the gateway. */
export interface GatewayConnection {
  /** The operation (channel) this connection was opened against. */
  readonly operation: PublicOperation;
  /** Close the connection and release its resources. */
  close(): void;
}

/**
 * The WebSocket gateway. A connection handshake runs through the identical
 * lifecycle as a REST request — so opening a realtime channel is authenticated,
 * validated, and authorized exactly like the equivalent Web_Client action
 * (R20.4) — before a {@link GatewayConnection} is established.
 */
export class WebSocketGateway {
  private readonly channels = new Map<string, OperationBinding<GatewayConnection>>();

  constructor(
    bindings: readonly OperationBinding<GatewayConnection>[],
    private readonly deps: LifecycleDeps,
  ) {
    for (const binding of bindings) {
      if (binding.operation.channel !== "websocket") {
        continue;
      }
      this.channels.set(binding.operation.path, binding);
    }
  }

  /** The channel paths this gateway serves. */
  channelPaths(): string[] {
    return [...this.channels.keys()].sort();
  }

  /**
   * Open a realtime connection for `request`. Runs the full lifecycle
   * (authentication + authorization) before establishing the connection;
   * denials throw an {@link AppError} and open nothing (R20.5).
   */
  async connect(request: ApiRequest): Promise<GatewayConnection> {
    const binding = this.channels.get(request.path);
    if (!binding) {
      throw new AppError("NOT_FOUND");
    }
    return runLifecycle(binding, request, this.deps);
  }
}
