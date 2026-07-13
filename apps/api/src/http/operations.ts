/**
 * Public API operation catalog (Requirements 20.1, 20.4).
 *
 * This is the single source of truth for every capability the API_Service
 * exposes. Each entry names a Web_Client capability and the public interface
 * that reaches it — a REST route, a WebSocket channel, or a Webhook event — so
 * the API-first parity guarantee (R20.1: "no Web_Client capability is
 * accessible exclusively through the Web_Client") is expressed as data rather
 * than scattered across controllers. The catalog deliberately mirrors, one for
 * one, the resource methods the SDK exposes in `@streetstudio/sdk`, which lets
 * the parity contract test (task 37.3) diff the two surfaces directly.
 *
 * Each operation also declares the authorization it requires as a single
 * {@link AuthzPolicy}. Because the composition root applies this same policy no
 * matter which channel or client issued the request, a public API request is
 * always subject to the identical authorization as the equivalent Web_Client
 * request (R20.4). The RBAC action strings are the tokens a Role must grant.
 */
import type { Action } from "@streetstudio/auth";

/** HTTP methods used by the public REST surface. */
export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** The kind of public interface an operation is reachable through. */
export type ChannelKind = "rest" | "websocket" | "webhook";

/**
 * The authorization an operation requires, applied uniformly regardless of the
 * channel or client (R20.4):
 *
 *  - `public`: reachable with no authentication (explicitly allow-listed).
 *  - `authenticated`: any authenticated principal; the resource is scoped to
 *    the principal itself (e.g. the caller's own notifications/session).
 *  - `rbac`: an authenticated principal whose Role in the owning Organization
 *    grants {@link AuthzPolicy.action}; evaluated deny-by-default.
 */
export type AuthzPolicy =
  | { readonly kind: "public" }
  | { readonly kind: "authenticated" }
  | { readonly kind: "rbac"; readonly action: Action; readonly resourceType?: string };

/** A single public capability exposed by the API_Service. */
export interface PublicOperation {
  /**
   * Stable operation id, dotted `resource.method`. Matches the SDK resource
   * method that invokes it so parity can be checked mechanically (R20.1).
   */
  readonly id: string;
  /** The channel the operation is reachable through. */
  readonly channel: ChannelKind;
  /** HTTP method for REST operations; omitted for websocket/webhook channels. */
  readonly method?: HttpMethod;
  /** Route template (REST), channel path (websocket), or event name (webhook). */
  readonly path: string;
  /** The authorization required to invoke the operation. */
  readonly authz: AuthzPolicy;
}

const rbac = (action: Action, resourceType?: string): AuthzPolicy =>
  resourceType === undefined
    ? { kind: "rbac", action }
    : { kind: "rbac", action, resourceType };

const PUBLIC: AuthzPolicy = { kind: "public" };
const AUTHENTICATED: AuthzPolicy = { kind: "authenticated" };

/**
 * The complete catalog of public operations. Ordered by resource for
 * readability; ordering is not significant.
 */
export const PUBLIC_OPERATIONS: readonly PublicOperation[] = [
  // --- Authentication & current session ---------------------------------
  { id: "auth.register", channel: "rest", method: "POST", path: "/auth/register", authz: PUBLIC },
  { id: "auth.login", channel: "rest", method: "POST", path: "/auth/login", authz: PUBLIC },
  { id: "auth.logout", channel: "rest", method: "POST", path: "/auth/logout", authz: AUTHENTICATED },
  { id: "auth.currentMember", channel: "rest", method: "GET", path: "/auth/me", authz: AUTHENTICATED },

  // --- Organizations, membership, roles, invitations --------------------
  { id: "organizations.create", channel: "rest", method: "POST", path: "/organizations", authz: AUTHENTICATED },
  { id: "organizations.list", channel: "rest", method: "GET", path: "/organizations", authz: AUTHENTICATED },
  { id: "organizations.get", channel: "rest", method: "GET", path: "/organizations/:id", authz: rbac("org:read", "organization") },
  { id: "organizations.update", channel: "rest", method: "PATCH", path: "/organizations/:id", authz: rbac("org:update", "organization") },
  { id: "organizations.listMembers", channel: "rest", method: "GET", path: "/organizations/:id/members", authz: rbac("org:read_members", "organization") },
  { id: "organizations.listRoles", channel: "rest", method: "GET", path: "/organizations/:id/roles", authz: rbac("org:read_roles", "organization") },
  { id: "organizations.invite", channel: "rest", method: "POST", path: "/organizations/:id/invitations", authz: rbac("org:invite", "organization") },

  // --- Projects ----------------------------------------------------------
  { id: "projects.create", channel: "rest", method: "POST", path: "/projects", authz: rbac("project:create", "project") },
  { id: "projects.list", channel: "rest", method: "GET", path: "/projects", authz: rbac("project:read", "project") },
  { id: "projects.get", channel: "rest", method: "GET", path: "/projects/:id", authz: rbac("project:read", "project") },
  { id: "projects.update", channel: "rest", method: "PATCH", path: "/projects/:id", authz: rbac("project:update", "project") },
  { id: "projects.delete", channel: "rest", method: "DELETE", path: "/projects/:id", authz: rbac("project:delete", "project") },

  // --- Folders -----------------------------------------------------------
  { id: "folders.create", channel: "rest", method: "POST", path: "/folders", authz: rbac("folder:create", "folder") },
  { id: "folders.get", channel: "rest", method: "GET", path: "/folders/:id", authz: rbac("folder:read", "folder") },
  { id: "folders.listByProject", channel: "rest", method: "GET", path: "/folders", authz: rbac("folder:read", "folder") },
  { id: "folders.move", channel: "rest", method: "PATCH", path: "/folders/:id", authz: rbac("folder:update", "folder") },
  { id: "folders.delete", channel: "rest", method: "DELETE", path: "/folders/:id", authz: rbac("folder:delete", "folder") },

  // --- Videos ------------------------------------------------------------
  { id: "videos.list", channel: "rest", method: "GET", path: "/videos", authz: rbac("video:read", "video") },
  { id: "videos.get", channel: "rest", method: "GET", path: "/videos/:id", authz: rbac("video:read", "video") },
  { id: "videos.update", channel: "rest", method: "PATCH", path: "/videos/:id", authz: rbac("video:update", "video") },
  { id: "videos.delete", channel: "rest", method: "DELETE", path: "/videos/:id", authz: rbac("video:delete", "video") },
  { id: "videos.transcript", channel: "rest", method: "GET", path: "/videos/:id/transcript", authz: rbac("video:read", "video") },
  { id: "videos.summary", channel: "rest", method: "GET", path: "/videos/:id/summary", authz: rbac("video:read", "video") },

  // --- Chunked uploads ---------------------------------------------------
  { id: "uploads.create", channel: "rest", method: "POST", path: "/uploads", authz: rbac("upload:create", "upload") },
  { id: "uploads.get", channel: "rest", method: "GET", path: "/uploads/:id", authz: rbac("upload:read", "upload") },
  { id: "uploads.complete", channel: "rest", method: "POST", path: "/uploads/:id/complete", authz: rbac("upload:write", "upload") },
  { id: "uploads.abort", channel: "rest", method: "POST", path: "/uploads/:id/abort", authz: rbac("upload:write", "upload") },

  // --- Comments & reactions ---------------------------------------------
  { id: "comments.list", channel: "rest", method: "GET", path: "/videos/:videoId/comments", authz: rbac("comment:read", "comment") },
  { id: "comments.create", channel: "rest", method: "POST", path: "/videos/:videoId/comments", authz: rbac("comment:create", "comment") },
  { id: "comments.delete", channel: "rest", method: "DELETE", path: "/comments/:id", authz: rbac("comment:delete", "comment") },
  { id: "comments.react", channel: "rest", method: "POST", path: "/reactions", authz: rbac("reaction:create", "reaction") },
  { id: "comments.unreact", channel: "rest", method: "DELETE", path: "/reactions", authz: rbac("reaction:delete", "reaction") },

  // --- Playback & views --------------------------------------------------
  { id: "playback.manifest", channel: "rest", method: "GET", path: "/videos/:videoId/playback", authz: rbac("video:read", "video") },
  { id: "playback.recordView", channel: "rest", method: "POST", path: "/videos/:videoId/views", authz: rbac("video:view", "video") },

  // --- Search ------------------------------------------------------------
  { id: "search.videos", channel: "rest", method: "GET", path: "/search/videos", authz: rbac("video:read", "video") },

  // --- Sharing -----------------------------------------------------------
  { id: "sharing.create", channel: "rest", method: "POST", path: "/videos/:videoId/share-links", authz: rbac("share:create", "share") },
  { id: "sharing.get", channel: "rest", method: "GET", path: "/share-links/:id", authz: rbac("share:read", "share") },
  { id: "sharing.revoke", channel: "rest", method: "DELETE", path: "/share-links/:id", authz: rbac("share:revoke", "share") },
  // Resolving a shared video uses a public credential and carries no org scope.
  { id: "sharing.resolve", channel: "rest", method: "POST", path: "/shared/resolve", authz: PUBLIC },

  // --- Notifications & preferences (personal scope) ----------------------
  { id: "notifications.list", channel: "rest", method: "GET", path: "/notifications", authz: AUTHENTICATED },
  { id: "notifications.markRead", channel: "rest", method: "POST", path: "/notifications/:id/read", authz: AUTHENTICATED },
  { id: "notifications.listPreferences", channel: "rest", method: "GET", path: "/notifications/preferences", authz: AUTHENTICATED },
  { id: "notifications.updatePreference", channel: "rest", method: "PUT", path: "/notifications/preferences", authz: AUTHENTICATED },

  // --- Outbound webhook subscriptions ------------------------------------
  { id: "webhooks.create", channel: "rest", method: "POST", path: "/webhooks", authz: rbac("webhook:create", "webhook") },
  { id: "webhooks.list", channel: "rest", method: "GET", path: "/webhooks", authz: rbac("webhook:read", "webhook") },
  { id: "webhooks.delete", channel: "rest", method: "DELETE", path: "/webhooks/:id", authz: rbac("webhook:delete", "webhook") },

  // --- API keys ----------------------------------------------------------
  { id: "apiKeys.create", channel: "rest", method: "POST", path: "/api-keys", authz: rbac("apikey:create", "apikey") },
  { id: "apiKeys.list", channel: "rest", method: "GET", path: "/api-keys", authz: rbac("apikey:read", "apikey") },
  { id: "apiKeys.revoke", channel: "rest", method: "DELETE", path: "/api-keys/:id", authz: rbac("apikey:revoke", "apikey") },

  // --- Analytics ---------------------------------------------------------
  { id: "analytics.metrics", channel: "rest", method: "GET", path: "/analytics/metrics", authz: rbac("analytics:read", "analytics") },

  // --- Realtime (WebSocket) ---------------------------------------------
  // Server-pushed events (comments, processing status, notifications) are
  // delivered over a single authenticated realtime channel.
  { id: "realtime.connect", channel: "websocket", path: "/realtime", authz: AUTHENTICATED },
] as const;

/** A stable lookup key for a REST operation, `METHOD path`, case-normalized. */
export function restKey(method: string, path: string): string {
  return `${method.trim().toUpperCase()} ${path.trim()}`;
}

/** Index the catalog by operation id. */
export function operationsById(
  operations: readonly PublicOperation[] = PUBLIC_OPERATIONS,
): ReadonlyMap<string, PublicOperation> {
  const map = new Map<string, PublicOperation>();
  for (const op of operations) {
    if (map.has(op.id)) {
      throw new Error(`Duplicate public operation id: ${op.id}`);
    }
    map.set(op.id, op);
  }
  return map;
}

/** The REST operations only, useful when building the HTTP router. */
export function restOperations(
  operations: readonly PublicOperation[] = PUBLIC_OPERATIONS,
): readonly PublicOperation[] {
  return operations.filter((op) => op.channel === "rest");
}
