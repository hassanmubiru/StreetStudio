/**
 * Dashboard session: client-side state and credential/scope management around
 * the public `@streetstudio/sdk` client.
 *
 * The dashboard talks to the API **only** through the SDK. This session layer
 * adds the stateful concerns a UI needs — which credentials are attached, which
 * organization is the active scope, and rebuilding the underlying client when
 * either changes — without any UI framework and without touching the backend.
 *
 * Note on authentication: the current public surface returns a `SessionDto`
 * (session record) from `auth.login`, not a bearer token string, so credentials
 * are supplied to the session by the caller — an existing bearer token or an
 * organization-scoped API key. Surfacing a login bearer token is a backend/spec
 * concern and is intentionally out of scope here (see the governing rule in
 * IMPLEMENTATION-PLAN.md).
 */
import {
  StreetStudioClient,
  type HttpTransport,
  type RealtimeTransport,
  type SdkAuth,
} from "@streetstudio/sdk";
import type { MemberDto, Uuid } from "@streetstudio/shared";

/** Construction options for a {@link DashboardSession}. */
export interface DashboardSessionOptions {
  /** Absolute base URL of the API_Service. */
  readonly baseUrl: string;
  /** Injectable HTTP transport (defaults to the SDK's global-`fetch` adapter). */
  readonly transport?: HttpTransport;
  /** Injectable realtime transport for WebSocket connections. */
  readonly realtimeTransport?: RealtimeTransport;
  /** Credentials to start with, if already known (e.g. a restored session). */
  readonly auth?: SdkAuth;
  /** Initial active organization scope. */
  readonly organizationId?: Uuid;
}

/**
 * Stateful wrapper over {@link StreetStudioClient}. Rebuilds the underlying
 * client whenever credentials or the active organization change, since those
 * are construction-time options on the SDK client.
 */
export class DashboardSession {
  private readonly baseUrl: string;
  private readonly transport?: HttpTransport;
  private readonly realtimeTransport?: RealtimeTransport;
  private auth?: SdkAuth;
  private orgId?: Uuid;
  private currentClient: StreetStudioClient;

  constructor(options: DashboardSessionOptions) {
    this.baseUrl = options.baseUrl;
    this.transport = options.transport;
    this.realtimeTransport = options.realtimeTransport;
    this.auth = options.auth;
    this.orgId = options.organizationId;
    this.currentClient = this.build();
  }

  private build(): StreetStudioClient {
    return new StreetStudioClient({
      baseUrl: this.baseUrl,
      ...(this.transport ? { transport: this.transport } : {}),
      ...(this.realtimeTransport ? { realtimeTransport: this.realtimeTransport } : {}),
      ...(this.auth ? { auth: this.auth } : {}),
      ...(this.orgId ? { organizationId: this.orgId } : {}),
    });
  }

  /** The underlying SDK client with the current credentials/scope applied. */
  get api(): StreetStudioClient {
    return this.currentClient;
  }

  /** Whether credentials are currently attached. */
  get isAuthenticated(): boolean {
    return this.auth !== undefined;
  }

  /** The active organization scope, if any. */
  get organizationId(): Uuid | undefined {
    return this.orgId;
  }

  /** Attach a member session bearer token and rebuild the client. */
  useBearerToken(token: string): void {
    this.auth = { kind: "bearer", token };
    this.currentClient = this.build();
  }

  /** Attach an organization-scoped API key and rebuild the client. */
  useApiKey(apiKey: string): void {
    this.auth = { kind: "apiKey", apiKey };
    this.currentClient = this.build();
  }

  /** Set the active organization scope and rebuild the client. */
  selectOrganization(organizationId: Uuid): void {
    this.orgId = organizationId;
    this.currentClient = this.build();
  }

  /** Clear the active organization scope. */
  clearOrganization(): void {
    this.orgId = undefined;
    this.currentClient = this.build();
  }

  /** Register a new member (public endpoint; no credentials required). */
  register(email: string, password: string): Promise<MemberDto> {
    return this.currentClient.auth.register({ email, password });
  }

  /** The currently authenticated member. */
  currentMember(): Promise<MemberDto> {
    return this.currentClient.auth.currentMember();
  }

  /**
   * Sign out: best-effort server-side session invalidation, then drop local
   * credentials and organization scope regardless of the server outcome.
   */
  async signOut(): Promise<void> {
    if (this.auth?.kind === "bearer") {
      try {
        await this.currentClient.auth.logout();
      } catch {
        // Clear local state even if the server call fails.
      }
    }
    this.auth = undefined;
    this.orgId = undefined;
    this.currentClient = this.build();
  }
}
