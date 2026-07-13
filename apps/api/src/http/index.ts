/**
 * HTTP surface of the API_Service (Requirements 20.1, 20.4, 20.5).
 *
 * Assembles the domain services into the public request surfaces:
 *
 *  - {@link PUBLIC_OPERATIONS}: the catalog of every capability the service
 *    exposes, mirroring the SDK/Web_Client so nothing is UI-only (R20.1).
 *  - {@link runLifecycle}: the shared request pipeline (rate limit →
 *    authenticate → validate → RBAC → service → audit) that guarantees a denied
 *    request performs no state change (R20.5).
 *  - {@link RestRouter} / {@link WebSocketGateway}: the REST and realtime
 *    surfaces, both funnelling through the same lifecycle so every channel
 *    enforces the same authorization as the equivalent Web_Client request
 *    (R20.4).
 *  - {@link createApiService}: the composition root that wires all of the above
 *    through the StreetJS DI {@link ServiceContainer} seam.
 */
export {
  PUBLIC_OPERATIONS,
  operationsById,
  restOperations,
  restKey,
} from "./operations.js";
export type {
  AuthzPolicy,
  ChannelKind,
  HttpMethod,
  PublicOperation,
} from "./operations.js";

export { runLifecycle } from "./lifecycle.js";
export type {
  ApiRequest,
  AuditEvent,
  AuditOutcome,
  AuditSink,
  Authenticator,
  LifecycleDeps,
  OperationBinding,
  RequestContext,
  RequestValidator,
  ServiceInvocation,
} from "./lifecycle.js";

export { RestRouter, WebSocketGateway } from "./controllers.js";
export type { GatewayConnection } from "./controllers.js";

export {
  MapServiceContainer,
  containerHandlerResolver,
  createApiService,
} from "./composition-root.js";
export type {
  ApiService,
  ApiServiceConfig,
  HandlerResolver,
  ServiceContainer,
} from "./composition-root.js";
