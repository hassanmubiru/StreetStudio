/**
 * @streetstudio/api
 *
 * API_Service entry point: hosts REST controllers, the WebSocket gateway, and
 * webhook delivery on a StreetJS HTTP application. Concrete wiring is added in
 * later tasks; this scaffold verifies the monorepo build graph.
 */
import { DOMAIN as SHARED_DOMAIN } from "@streetstudio/shared";
import { DOMAIN as CONFIG_DOMAIN } from "@streetstudio/config";
import { DOMAIN as DATABASE_DOMAIN } from "@streetstudio/database";
import { DOMAIN as AUTH_DOMAIN } from "@streetstudio/auth";
import { DOMAIN as MEDIA_DOMAIN } from "@streetstudio/media";
import { DOMAIN as PROCESSING_DOMAIN } from "@streetstudio/processing";
import { DOMAIN as NOTIFICATIONS_DOMAIN } from "@streetstudio/notifications";
import { DOMAIN as PLUGINS_DOMAIN } from "@streetstudio/plugins";
import { DOMAIN as ANALYTICS_DOMAIN } from "@streetstudio/analytics";

export const DOMAIN =
  "API_Service: REST, WebSocket, and Webhook host built on StreetJS." as const;

/**
 * Security middleware and defaults (Requirement 29): per-client rate limiting,
 * auth-required-by-default endpoint guarding, and StreetJS-backed encrypted
 * secret storage. Exposed through the API entry point for composition-root
 * wiring into the request lifecycle.
 */
export * from "./security/index.js";

/**
 * Webhooks (Requirement 19): register/delete outbound subscriptions with
 * HTTPS-only, ≤2048-character URL validation and supported-event-type checking,
 * plus signed worker delivery with a 10s per-attempt timeout, bounded retries
 * with exponential backoff, and deletion that stops further delivery. Exposed
 * through the API entry point for composition-root wiring.
 */
export * from "./webhooks/index.js";

/**
 * HTTP surface (Requirement 20): the public operation catalog, the shared
 * request lifecycle (rate limit → authenticate → validate → RBAC → service →
 * audit), the REST controllers and WebSocket gateway, and the composition root
 * that wires every domain service through the StreetJS DI seam. Every
 * Web_Client capability is exposed through a public REST/WebSocket/Webhook
 * interface enforcing the same authorization as the equivalent Web_Client
 * request (R20.1, R20.4, R20.5). Exposed through the API entry point for
 * composition-root wiring.
 */
export * from "./http/index.js";

/** Domains wired into the API service, proving cross-package resolution. */
export const WIRED_DOMAINS = [
  SHARED_DOMAIN,
  CONFIG_DOMAIN,
  DATABASE_DOMAIN,
  AUTH_DOMAIN,
  MEDIA_DOMAIN,
  PROCESSING_DOMAIN,
  NOTIFICATIONS_DOMAIN,
  PLUGINS_DOMAIN,
  ANALYTICS_DOMAIN
] as const;
