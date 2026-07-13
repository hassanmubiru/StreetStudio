/**
 * Typed StreetStudio SDK client.
 *
 * Provides typed client access to every public REST and WebSocket interface of
 * the API_Service, guaranteeing UI/API parity (Requirements 20.2). The client
 * consumes the shared wire DTO types from `@streetstudio/shared` directly so it
 * always reflects the same contract as the REST/WebSocket surfaces, and it
 * surfaces the shared error taxonomy uniformly on any non-2xx response.
 *
 * The client is intentionally dependency-light and boundary-clean: it depends
 * on `@streetstudio/shared` only and never hardcodes a network stack. All I/O
 * happens through an injectable {@link HttpTransport} (and an optional
 * {@link RealtimeTransport}), which keeps the client fully testable without a
 * real network and lets consumers wire the runtime's `fetch`, a WebSocket, or
 * any other transport of their choosing.
 */
import {
  AppError,
  isErrorCode,
  type ApiKeyDto,
  type ApiKeyRevealDto,
  type CommentDto,
  type ErrorCode,
  type ErrorDto,
  type FolderDto,
  type InvitationDto,
  type MemberDto,
  type MembershipDto,
  type MetricsDto,
  type NotificationDto,
  type NotificationPreferenceDto,
  type OrganizationDto,
  type ProjectDto,
  type ReactionDto,
  type ReactionTargetType,
  type RenditionDto,
  type RoleDto,
  type SessionDto,
  type ShareLinkDto,
  type SummaryDto,
  type TranscriptDto,
  type UploadSessionDto,
  type Uuid,
  type VideoDto,
  type WebhookDto,
} from "@streetstudio/shared";

/* --------------------------------------------------------------------------
 * Transport seam (HTTP)
 * ------------------------------------------------------------------------ */

/** HTTP methods used by the public REST surface. */
export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** A fully-constructed HTTP request produced by the client. */
export interface HttpRequest {
  readonly method: HttpMethod;
  /** Absolute request URL (base URL + path + query string). */
  readonly url: string;
  /** Request headers, including authorization and organization scoping. */
  readonly headers: Readonly<Record<string, string>>;
  /** Serialized JSON request body, when present. */
  readonly body?: string;
}

/** A raw HTTP response handed back to the client by a transport. */
export interface HttpResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  /** Raw response body text (parsed as JSON by the client when non-empty). */
  readonly body?: string;
}

/**
 * The single seam through which the client performs HTTP I/O. Implementations
 * may wrap `fetch`, a test double, a retrying transport, etc. The client never
 * imports a concrete network stack itself.
 */
export interface HttpTransport {
  send(request: HttpRequest): Promise<HttpResponse>;
}

/* --------------------------------------------------------------------------
 * Optional fetch adapter (no DOM dependency)
 * ------------------------------------------------------------------------ */

/** Minimal response shape the fetch adapter relies on. */
export interface FetchLikeResponse {
  readonly status: number;
  text(): Promise<string>;
  readonly headers?: { get(name: string): string | null };
}

/** Minimal `fetch`-compatible function signature (no DOM lib required). */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  }
) => Promise<FetchLikeResponse>;

/**
 * Adapt any `fetch`-like function into an {@link HttpTransport}. Consumers on a
 * runtime with a global `fetch` can pass it directly; the client also falls
 * back to `globalThis.fetch` when no transport is supplied.
 */
export function fetchTransport(fetchImpl: FetchLike): HttpTransport {
  return {
    async send(request: HttpRequest): Promise<HttpResponse> {
      const init: { method: string; headers: Record<string, string>; body?: string } = {
        method: request.method,
        headers: { ...request.headers },
      };
      if (request.body !== undefined) {
        init.body = request.body;
      }
      const res = await fetchImpl(request.url, init);
      const body = await res.text();
      return { status: res.status, body };
    },
  };
}

/* --------------------------------------------------------------------------
 * Realtime seam (WebSocket)
 * ------------------------------------------------------------------------ */

/** A realtime event delivered over the WebSocket surface. */
export interface RealtimeEvent {
  readonly type: string;
  readonly data: unknown;
}

/** Callbacks invoked by a realtime connection. */
export interface RealtimeHandlers {
  onEvent(event: RealtimeEvent): void;
  onError?(error: unknown): void;
  onClose?(): void;
}

/** A live realtime connection that can be closed by the caller. */
export interface RealtimeConnection {
  close(): void;
}

/**
 * Seam through which the client opens realtime (WebSocket) connections. Kept
 * optional and injectable so the client has no hard dependency on a WebSocket
 * implementation and stays testable.
 */
export interface RealtimeTransport {
  connect(url: string, handlers: RealtimeHandlers): RealtimeConnection;
}

/* --------------------------------------------------------------------------
 * Authentication
 * ------------------------------------------------------------------------ */

/**
 * Credentials attached to every request. A session bearer token authenticates
 * as a member; an API key authenticates automation. Both map onto the same
 * authorization rules the equivalent Web_Client request would receive.
 */
export type SdkAuth =
  | { readonly kind: "bearer"; readonly token: string }
  | { readonly kind: "apiKey"; readonly apiKey: string };

/* --------------------------------------------------------------------------
 * Client options
 * ------------------------------------------------------------------------ */

/**
 * Configuration for a {@link StreetStudioClient}.
 *
 * `baseUrl` and `organizationId` remain part of the public surface (backward
 * compatible with the original placeholder). `auth`, `transport`, and
 * `realtimeTransport` are additive and optional: when no transport is provided
 * the client falls back to the runtime's global `fetch`.
 */
export interface SdkClientOptions {
  /** Absolute base URL of the API_Service, e.g. `https://api.example.com`. */
  readonly baseUrl: string;
  /** Default organization scope applied to organization-scoped requests. */
  readonly organizationId?: Uuid;
  /** Credentials attached to outgoing requests. */
  readonly auth?: SdkAuth;
  /** Injectable HTTP transport. Defaults to a `globalThis.fetch` adapter. */
  readonly transport?: HttpTransport;
  /** Injectable realtime transport for WebSocket connections. */
  readonly realtimeTransport?: RealtimeTransport;
}
