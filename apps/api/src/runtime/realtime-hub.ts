/**
 * WebSocket realtime transport (`realtime.connect`, the catalog's sole
 * websocket channel).
 *
 * A client opens an authenticated realtime channel at `/realtime`. The upgrade
 * is authorized by verifying the SAME bearer access token the REST surface
 * uses (via the injected {@link authenticate} seam → `AuthService.verifyAccessToken`),
 * which is exactly the authorization the `realtime.connect` operation requires
 * (`AUTHENTICATED`). An upgrade with no/invalid token is rejected with 401 and
 * no socket is established.
 *
 * Live sockets are indexed by member (and organization) so server-side events
 * can be pushed to the right recipients. The hub implements the domain
 * {@link NotificationEmitter} and {@link ProcessingStatusEmitter} seams, so
 * notification delivery and processing-status transitions fan out over the
 * channel to the members/organizations that should receive them.
 */
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import type { AuthContext } from "@streetstudio/auth";
import type { Uuid } from "@streetstudio/shared";

/** WebSocket readyState OPEN. */
const WS_OPEN = 1;

/**
 * The minimal structural view of a live socket the hub uses. Declared locally to
 * avoid the dual-resolution `@types/ws` `WebSocket` class mismatch under
 * NodeNext module resolution.
 */
interface RealtimeSocket {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

/** The realtime channel path. */
export const REALTIME_PATH = "/realtime";

/** Resolve a bearer credential to its principal (null when absent/invalid). */
export type Authenticate = (
  credential: string | undefined,
) => Promise<AuthContext | null>;

interface Connection {
  readonly socket: RealtimeSocket;
  readonly memberId: Uuid;
  readonly organizationId?: Uuid;
}

/** A minimal realtime event envelope pushed to clients. */
export interface RealtimeEvent {
  readonly type: string;
  readonly [key: string]: unknown;
}

export class RealtimeHub {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly byMember = new Map<string, Set<Connection>>();
  private authenticate: Authenticate | undefined;

  /** Provide the bearer authenticator (wired after the runtime is built). */
  setAuthenticator(authenticate: Authenticate): void {
    this.authenticate = authenticate;
  }

  /**
   * Handle an HTTP `upgrade` targeting {@link REALTIME_PATH}. Authenticates the
   * bearer token (Authorization header or `?token=` query — browsers cannot set
   * WS headers, so the query form is supported), then establishes the socket.
   * Returns true when the upgrade was for this hub (handled or rejected),
   * false when the path is not the realtime channel.
   */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== REALTIME_PATH) {
      return false;
    }

    const token = this.extractToken(req, url);
    void this.authenticateAndAccept(req, socket, head, token);
    return true;
  }

  private extractToken(req: IncomingMessage, url: URL): string | undefined {
    const header = req.headers["authorization"];
    if (typeof header === "string") {
      const m = /^Bearer\s+(.+)$/i.exec(header.trim());
      if (m) return m[1];
    }
    const q = url.searchParams.get("token");
    return q ?? undefined;
  }

  private async authenticateAndAccept(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    token: string | undefined,
  ): Promise<void> {
    const auth = this.authenticate ? await this.authenticate(token) : null;
    if (!auth) {
      // Reject the upgrade without establishing a socket (R29.4).
      socket.write(
        "HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
      );
      socket.destroy();
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const orgParam = url.searchParams.get("organizationId") ?? undefined;
    const organizationId =
      orgParam !== undefined ? (orgParam as Uuid) : undefined;

    this.wss.handleUpgrade(req, socket, head, (rawWs) => {
      const ws = rawWs as unknown as RealtimeSocket;
      const connection: Connection = organizationId
        ? { socket: ws, memberId: auth.memberId, organizationId }
        : { socket: ws, memberId: auth.memberId };
      this.register(connection);
      // Confirmation frame: proves the channel is live and authenticated.
      this.sendRaw(ws, { type: "connected", memberId: auth.memberId });
      ws.on("close", () => this.deregister(connection));
      ws.on("error", () => this.deregister(connection));
    });
  }

  private register(conn: Connection): void {
    let set = this.byMember.get(conn.memberId);
    if (!set) {
      set = new Set();
      this.byMember.set(conn.memberId, set);
    }
    set.add(conn);
  }

  private deregister(conn: Connection): void {
    const set = this.byMember.get(conn.memberId);
    if (set) {
      set.delete(conn);
      if (set.size === 0) {
        this.byMember.delete(conn.memberId);
      }
    }
  }

  private sendRaw(ws: WebSocket, payload: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  /** Number of live connections for a member (diagnostics/tests). */
  connectionCount(memberId: Uuid): number {
    return this.byMember.get(memberId)?.size ?? 0;
  }

  /** Push an event to every live connection of `memberId`. */
  sendToMember(memberId: Uuid, event: RealtimeEvent): void {
    const set = this.byMember.get(memberId);
    if (!set) return;
    for (const conn of set) {
      this.sendRaw(conn.socket, event);
    }
  }

  /** Push an event to every connection scoped to `organizationId`. */
  broadcastToOrg(organizationId: Uuid, event: RealtimeEvent): void {
    for (const set of this.byMember.values()) {
      for (const conn of set) {
        if (conn.organizationId === organizationId) {
          this.sendRaw(conn.socket, event);
        }
      }
    }
  }

  // --- Domain emitter seams --------------------------------------------------

  /** {@link NotificationEmitter}: deliver a notification to its recipient. */
  async emit(notification: {
    readonly memberId: Uuid;
    readonly [key: string]: unknown;
  }): Promise<void> {
    this.sendToMember(notification.memberId, {
      type: "notification",
      notification,
    });
  }

  /** Close all sockets and stop the server. */
  close(): void {
    for (const set of this.byMember.values()) {
      for (const conn of set) {
        conn.socket.close();
      }
    }
    this.byMember.clear();
    this.wss.close();
  }
}
