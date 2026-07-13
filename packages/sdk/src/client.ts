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

/* --------------------------------------------------------------------------
 * Request payload / query types
 * ------------------------------------------------------------------------ */

/** A flat map of query-string parameters (undefined values are omitted). */
export type QueryParams = Readonly<
  Record<string, string | number | boolean | undefined>
>;

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
}
export interface LoginInput {
  readonly email: string;
  readonly password: string;
}
export interface CreateOrganizationInput {
  readonly name: string;
}
export interface UpdateOrganizationInput {
  readonly name?: string;
  readonly settings?: Record<string, unknown>;
}
export interface InviteMemberInput {
  readonly email: string;
  readonly roleId?: Uuid;
}
export interface CreateProjectInput {
  readonly name: string;
}
export interface UpdateProjectInput {
  readonly name: string;
}
export interface CreateFolderInput {
  readonly projectId: Uuid;
  readonly name: string;
  readonly parentFolderId?: Uuid;
}
export interface MoveFolderInput {
  readonly parentFolderId?: Uuid;
}
export interface UpdateVideoInput {
  readonly title?: string;
  readonly folderId?: Uuid;
}
export interface ListVideosQuery {
  readonly folderId?: Uuid;
  readonly limit?: number;
  readonly cursor?: string;
}
export interface CreateUploadInput {
  readonly title: string;
  readonly totalChunks: number;
  readonly folderId?: Uuid;
}
export interface CreateCommentInput {
  readonly body: string;
  readonly parentCommentId?: Uuid;
  readonly timestampSeconds?: number;
}
export interface ReactionInput {
  readonly targetType: ReactionTargetType;
  readonly targetId: Uuid;
  readonly type: string;
}
export interface SearchQuery {
  readonly q: string;
  readonly limit?: number;
  readonly cursor?: string;
}
export interface CreateShareLinkInput {
  readonly expiresAt?: string;
  readonly passcode?: string;
}
export interface ResolveShareLinkInput {
  readonly credential: string;
  readonly passcode?: string;
}
export interface ListNotificationsQuery {
  readonly unreadOnly?: boolean;
  readonly limit?: number;
}
export interface UpdateNotificationPreferenceInput {
  readonly eventType: string;
  readonly enabled: boolean;
}
export interface CreateWebhookInput {
  readonly eventType: string;
  readonly url: string;
}
export interface CreateApiKeyInput {
  readonly name: string;
  readonly permissions: readonly string[];
}
export interface MetricsQuery {
  readonly from?: string;
  readonly to?: string;
}

/** Playback manifest returned for a ready video. */
export interface PlaybackManifest {
  readonly videoId: Uuid;
  readonly renditions: readonly RenditionDto[];
}

/* --------------------------------------------------------------------------
 * Internal HTTP request helper
 * ------------------------------------------------------------------------ */

const NO_CONTENT = 204;

interface RequestOptions {
  readonly query?: QueryParams;
  readonly body?: unknown;
  /** Override the default (organization) scope header for this request. */
  readonly organizationId?: Uuid;
}

/**
 * Reconstruct an {@link AppError} from a serialized {@link ErrorDto}. The
 * stable machine-readable `code` is preserved so callers can branch on it; the
 * catalog message (non-disclosing) is used. Unknown codes fall back to a
 * generic validation failure while retaining the raw payload in `details`.
 */
function errorFromResponse(status: number, rawBody: string | undefined): AppError {
  let dto: Partial<ErrorDto> | undefined;
  if (rawBody) {
    try {
      dto = JSON.parse(rawBody) as Partial<ErrorDto>;
    } catch {
      dto = undefined;
    }
  }
  const code: ErrorCode =
    dto && isErrorCode(dto.code) ? dto.code : "VALIDATION_FAILED";
  const options: {
    details?: Record<string, unknown>;
    retryAfterSeconds?: number;
  } = {};
  if (dto?.details !== undefined) {
    options.details = dto.details;
  }
  if (dto?.retryAfterSeconds !== undefined) {
    options.retryAfterSeconds = dto.retryAfterSeconds;
  }
  // Retain the raw HTTP status when the body did not carry a known code.
  if (!dto || !isErrorCode(dto.code)) {
    options.details = { ...(options.details ?? {}), httpStatus: status };
  }
  return new AppError(code, options);
}

function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  let url = `${trimmedBase}${normalizedPath}`;
  if (query) {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }
      parts.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
      );
    }
    if (parts.length > 0) {
      url += `?${parts.join("&")}`;
    }
  }
  return url;
}

/**
 * Internal request executor shared by every resource group. Constructs the
 * request (method, path, headers incl. auth + org scope, JSON body), delegates
 * to the injected transport, and parses a typed response or throws an
 * {@link AppError} on any non-2xx status.
 */
class HttpClient {
  constructor(private readonly options: SdkClientOptions) {}

  private authHeaders(): Record<string, string> {
    const auth = this.options.auth;
    if (!auth) {
      return {};
    }
    if (auth.kind === "bearer") {
      return { Authorization: `Bearer ${auth.token}` };
    }
    return { "X-Api-Key": auth.apiKey };
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    opts: RequestOptions = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...this.authHeaders(),
    };
    const orgId = opts.organizationId ?? this.options.organizationId;
    if (orgId !== undefined) {
      headers["X-Organization-Id"] = orgId;
    }

    const req: {
      method: HttpMethod;
      url: string;
      headers: Record<string, string>;
      body?: string;
    } = {
      method,
      url: buildUrl(this.options.baseUrl, path, opts.query),
      headers,
    };
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      req.body = JSON.stringify(opts.body);
    }

    const transport = this.options.transport ?? defaultTransport();
    const res = await transport.send(req);

    if (res.status < 200 || res.status >= 300) {
      throw errorFromResponse(res.status, res.body);
    }
    if (res.status === NO_CONTENT || !res.body) {
      return undefined as T;
    }
    return JSON.parse(res.body) as T;
  }
}

/** Resolve the runtime's global `fetch` into a transport, or fail clearly. */
function defaultTransport(): HttpTransport {
  const maybeFetch = (globalThis as { fetch?: FetchLike }).fetch;
  if (typeof maybeFetch !== "function") {
    throw new AppError("CONFIGURATION_INVALID", {
      details: {
        reason:
          "No HTTP transport was provided and no global fetch is available.",
      },
    });
  }
  return fetchTransport(maybeFetch.bind(globalThis));
}
