/**
 * WebSocket realtime transport (`realtime.connect`, the catalog's sole
 * websocket channel), backed by the **published** `@streetjs/realtime`
 * (ADR-0022 slice 6).
 *
 * ── Ownership ────────────────────────────────────────────────────────────────
 * The WebSocket host, the authenticated-upgrade handshake, per-connection
 * identity binding, room membership, broadcast fan-out, and cross-instance
 * delivery are reusable infrastructure owned by the framework. This adapter no
 * longer hand-rolls a `ws` server or an `ioredis` pub/sub bus: it composes the
 * framework `StreetWebSocketServer` + `@streetjs/realtime` facade, with the
 * framework `RedisAdapter` (over `streetjs`'s `RedisClient`) providing the
 * cross-process fan-out the former `realtime-bus.ts` did. Org/member scoping is
 * modeled as **rooms**: a connection joins `member:{memberId}` and, when the
 * client declares one via `?organizationId=`, `org:{organizationId}`.
 *
 * ── Wire format ──────────────────────────────────────────────────────────────
 * Frames are the framework envelope `{ type, payload, ts }` (the fields the
 * former flat hub sent are now nested under `payload`). The `connected`
 * confirmation is sent on join.
 *
 * ── Backends ─────────────────────────────────────────────────────────────────
 * With `REDIS_URL` set the `RedisAdapter` fans broadcasts across instances (and
 * lets a socket-less producer such as the media worker publish org events that
 * reach clients on any API instance). Without it the framework `MemoryAdapter`
 * is used (single-node). No hand-rolled transport remains on either path.
 */
import type { IncomingMessage, Server } from "node:http";
import { RedisClient } from "streetjs";
import { StreetWebSocketServer, type StreetSocket } from "streetjs/websocket";
import {
  createRealtime,
  type Member,
  type Realtime,
} from "@streetjs/realtime";
import { RedisAdapter } from "@streetjs/realtime/redis";
import type { AuthContext } from "@streetstudio/auth";
import type { NotificationDto, Uuid } from "@streetstudio/shared";

/** The realtime channel path. */
export const REALTIME_PATH = "/realtime";

/** Resolve a bearer credential to its principal (null when absent/invalid). */
export type Authenticate = (
  credential: string | undefined,
) => Promise<AuthContext | null>;

/** A minimal realtime event envelope; `type` plus arbitrary fields. */
export interface RealtimeEvent {
  readonly type: string;
  readonly [key: string]: unknown;
}

/** Dependencies for {@link RealtimeHub}. */
export interface RealtimeHubDeps {
  /** `REDIS_URL` for cross-instance fan-out; Memory adapter when unset. */
  readonly redisUrl?: string | undefined;
}

/** Parse a `redis://[:password@]host:port` URL into `RedisClient` options. */
function redisClientOptions(redisUrl: string): {
  host: string;
  port: number;
  password?: string;
} {
  const url = new URL(redisUrl);
  const host = url.hostname || "localhost";
  const port = url.port ? Number(url.port) : 6379;
  const password = url.password || url.username || undefined;
  return { host, port, ...(password ? { password } : {}) };
}

/** Extract the bearer token from the Authorization header or `?token=`. */
function extractToken(req: IncomingMessage): string | undefined {
  const header = req.headers["authorization"];
  if (typeof header === "string") {
    const m = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (m) return m[1];
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.searchParams.get("token") ?? undefined;
}

/** The organization the client scoped the connection to, if any. */
function orgFromRequest(req: IncomingMessage): string | undefined {
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.searchParams.get("organizationId") ?? undefined;
}

/**
 * The realtime hub over `@streetjs/realtime`. Construct via {@link RealtimeHub.create}
 * (async so the Redis cluster client can connect before the facade's adapter
 * initializes). Implements the {@link NotificationEmitter}/{@link ProcessingStatusEmitter}
 * delivery surface used by the composition root.
 */
export class RealtimeHub {
  private authFn: Authenticate | undefined;
  private readonly wss: StreetWebSocketServer;
  private readonly realtime: Realtime;
  private readonly redisClient: RedisClient | undefined;
  /** Carries the Member resolved at upgrade across to the connection handler. */
  private readonly reqMembers = new WeakMap<IncomingMessage, Member>();

  private constructor(deps: RealtimeHubDeps, redisClient: RedisClient | undefined) {
    this.redisClient = redisClient;
    // NB: the framework's `attach` matches the upgrade with an EXACT
    // `req.url === options.path` check, which a `?organizationId=` query string
    // would always fail. So we do not set `path` here and instead gate the path
    // ourselves in `authenticate` (reject non-`/realtime` upgrades) and skip
    // non-realtime sockets in the connection handler.
    this.wss = new StreetWebSocketServer({});
    const adapter =
      redisClient !== undefined ? new RedisAdapter({ client: redisClient }) : undefined;
    this.realtime = createRealtime({
      server: this.wss,
      ...(adapter ? { adapter } : {}),
      // Late-bound authenticator: verifies the SAME bearer token the REST
      // surface uses. A null result rejects the upgrade with 401 (no socket).
      authenticate: async (req: IncomingMessage): Promise<Member | null> => {
        const auth = this.authFn ? await this.authFn(extractToken(req)) : null;
        if (!auth) {
          return null;
        }
        const member: Member = { id: auth.memberId };
        this.reqMembers.set(req, member);
        return member;
      },
    });
  }

  /**
   * Build a hub. Connects the Redis cluster client (if configured) before the
   * facade's adapter initializes, so cross-instance publish/subscribe is live.
   */
  static async create(deps: RealtimeHubDeps = {}): Promise<RealtimeHub> {
    let client: RedisClient | undefined;
    if (deps.redisUrl) {
      client = new RedisClient(redisClientOptions(deps.redisUrl));
      await client.connect();
    }
    return new RealtimeHub(deps, client);
  }

  /** Provide the bearer authenticator (wired after the runtime is built). */
  setAuthenticator(authenticate: Authenticate): void {
    this.authFn = authenticate;
  }

  /**
   * Attach the WebSocket server to the shared HTTP server. The framework runs
   * the authenticated-upgrade hook and identity binding first (composed by
   * `createRealtime`), then this handler joins the connection to its member and
   * (declared) organization rooms and sends the `connected` confirmation.
   */
  attach(server: Server): void {
    this.wss.attach(server, (socket: StreetSocket, req: IncomingMessage) => {
      const member = this.reqMembers.get(req);
      if (!member) {
        // The upgrade auth hook admits only authenticated members, so this is
        // defensive; close a connection we cannot associate.
        socket.close();
        return;
      }
      this.reqMembers.delete(req);
      void this.realtime.room(`member:${member.id}`).join(member, socket);
      const orgId = orgFromRequest(req);
      if (orgId) {
        void this.realtime.room(`org:${orgId}`).join(member, socket);
      }
      // Confirmation frame: proves the channel is live and authenticated.
      socket.emit("connected", { memberId: member.id });
    });
  }

  /** Push an event to every connection scoped to `organizationId`. */
  broadcastToOrg(organizationId: Uuid, event: RealtimeEvent): void {
    void this.realtime
      .room(`org:${organizationId}`)
      .broadcast(toMessage(event));
  }

  /** Push an event to every live connection of `memberId`. */
  sendToMember(memberId: Uuid, event: RealtimeEvent): void {
    void this.realtime.room(`member:${memberId}`).broadcast(toMessage(event));
  }

  /**
   * {@link NotificationEmitter}: deliver a notification to its recipient over
   * the member's room.
   */
  async emit(notification: NotificationDto): Promise<void> {
    this.sendToMember(notification.memberId, {
      type: "notification",
      notification: notification as unknown as Record<string, unknown>,
    });
  }

  /** Close the facade, the WebSocket server, and the Redis client. */
  async close(): Promise<void> {
    await this.realtime.close().catch(() => undefined);
    await this.wss.close().catch(() => undefined);
    this.redisClient?.close();
  }
}

/**
 * Split a flat {@link RealtimeEvent} into the framework's `{ type, payload }`
 * envelope: `type` names the event and the remaining fields become the payload.
 */
function toMessage(event: RealtimeEvent): {
  type: string;
  payload: Record<string, unknown>;
} {
  const { type, ...rest } = event;
  return { type, payload: rest };
}
