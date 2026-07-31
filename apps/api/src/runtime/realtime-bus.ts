/**
 * Cross-process realtime bus (Redis pub/sub).
 *
 * The {@link RealtimeHub} fans server events out to the WebSocket clients
 * connected to *one* process. In a distributed deployment the producer of an
 * event (e.g. the media {@link MediaWorker} transcoding in a separate process,
 * or a second API instance) is not the process holding the client's socket, so
 * events must cross the process boundary. This bus carries org-scoped realtime
 * events over a Redis pub/sub channel:
 *
 *   producer  → bus.publish(orgId, event)  → Redis channel
 *   Redis     → every subscribed API instance's bus.onMessage
 *             → hub.broadcastToOrg(orgId, event) → local sockets
 *
 * Publishing and receiving both go through Redis, so an event is delivered
 * exactly once to each connected client regardless of which process produced it
 * and how many API instances are running. When no `REDIS_URL` is configured the
 * factory returns {@link NullRealtimeBus}; callers then fall back to a direct
 * in-process broadcast (single-node behavior), so realtime works with or
 * without Redis.
 */
import { Redis } from "ioredis";
import type { Uuid } from "@streetstudio/shared";
import type { RealtimeEvent } from "./realtime-hub.js";

/** The Redis channel realtime events are published on. */
export const REALTIME_CHANNEL = "streetstudio:realtime";

/** An org-scoped realtime message as it travels over the bus. */
interface BusMessage {
  readonly organizationId: Uuid;
  readonly event: RealtimeEvent;
}

/** A cross-process realtime bus. */
export interface RealtimeBus {
  /** True when events actually cross the process boundary (Redis-backed). */
  readonly distributed: boolean;
  /** Publish an org-scoped event to every subscriber (including this process). */
  publish(organizationId: Uuid, event: RealtimeEvent): void;
  /** Register a handler invoked for every received event. */
  onMessage(handler: (organizationId: Uuid, event: RealtimeEvent) => void): void;
  /** Release connections. */
  close(): Promise<void>;
}

/** A no-op bus used when no Redis is configured (single-node fallback). */
export class NullRealtimeBus implements RealtimeBus {
  readonly distributed = false;
  publish(): void {
    /* no shared bus; callers broadcast in-process instead */
  }
  onMessage(): void {
    /* nothing to receive */
  }
  async close(): Promise<void> {
    /* nothing to release */
  }
}

/** A Redis pub/sub-backed {@link RealtimeBus}. */
export class RedisRealtimeBus implements RealtimeBus {
  readonly distributed = true;
  private readonly pub: Redis;
  private readonly sub: Redis;
  private handler: ((organizationId: Uuid, event: RealtimeEvent) => void) | null =
    null;
  private subscribed = false;

  constructor(redisUrl: string) {
    // Separate connections: a Redis connection in subscriber mode cannot issue
    // publish/other commands, so the publisher needs its own connection.
    this.pub = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: null });
    this.sub = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: null });
    // Isolate connection errors so a transient Redis blip never crashes the
    // process; realtime is best-effort (the authoritative status is in the DB).
    this.pub.on("error", (err) => this.logError("pub", err));
    this.sub.on("error", (err) => this.logError("sub", err));
    this.sub.on("message", (_channel, payload) => this.dispatch(payload));
  }

  private logError(role: string, err: unknown): void {
    // eslint-disable-next-line no-console
    console.error(
      `[realtime-bus] ${role} connection error:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  private dispatch(payload: string): void {
    if (!this.handler) return;
    try {
      const message = JSON.parse(payload) as BusMessage;
      if (message && typeof message.organizationId === "string" && message.event) {
        this.handler(message.organizationId, message.event);
      }
    } catch {
      /* ignore malformed frames */
    }
  }

  publish(organizationId: Uuid, event: RealtimeEvent): void {
    const message: BusMessage = { organizationId, event };
    // Fire-and-forget; a publish failure must not abort the caller's work.
    void this.pub.publish(REALTIME_CHANNEL, JSON.stringify(message)).catch((err) =>
      this.logError("publish", err),
    );
  }

  onMessage(handler: (organizationId: Uuid, event: RealtimeEvent) => void): void {
    this.handler = handler;
    if (!this.subscribed) {
      this.subscribed = true;
      void this.sub.subscribe(REALTIME_CHANNEL).catch((err) =>
        this.logError("subscribe", err),
      );
    }
  }

  async close(): Promise<void> {
    try {
      this.pub.disconnect();
    } catch {
      /* best-effort */
    }
    try {
      this.sub.disconnect();
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Build a realtime bus from an optional `REDIS_URL`. Returns a Redis-backed bus
 * when a URL is present, otherwise a {@link NullRealtimeBus} (single-node
 * fallback — callers broadcast in-process).
 */
export function createRealtimeBus(redisUrl: string | undefined): RealtimeBus {
  if (redisUrl && redisUrl.trim().length > 0) {
    return new RedisRealtimeBus(redisUrl);
  }
  return new NullRealtimeBus();
}
