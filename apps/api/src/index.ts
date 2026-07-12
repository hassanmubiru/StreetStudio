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
