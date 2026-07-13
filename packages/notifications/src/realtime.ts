/**
 * Realtime_Service gateway (`packages/notifications`).
 *
 * Implements the design's "Realtime_Service" section and Requirement 13 (plus
 * the realtime delivery clauses of Requirements 11 and 12): a WebSocket gateway
 * that fans out real-time events to connected Members with a Redis pub/sub
 * backplane for cross-node delivery.
 *
 *  - {@link RealtimeGateway.join} / {@link RealtimeGateway.leave} record a
 *    Member's presence in a Workspace and emit presence-join / presence-leave
 *    to every other connected Member in that Workspace — never the originator —
 *    well within the 2s budget (R13.1, R13.3).
 *  - {@link RealtimeGateway.emit} publishes an event addressed to an
 *    {@link Audience}; delivery to locally-connected Members happens through the
 *    backplane subscription so an event produced on one node reaches
 *    subscribers connected to any node (R13.4). Live comments reach concurrent
 *    Video viewers this way (R11.6); notifications reach connected Members
 *    (R12.2).
 *  - {@link RealtimeGateway.startTyping} emits typing-start on activity and arms
 *    a 5s inactivity timer; {@link RealtimeGateway.stopTyping} (or the timer
 *    firing) emits typing-stop to the other Members viewing the same Video
 *    (R13.2, R13.5).
 *  - {@link RealtimeGateway.disconnect} handles a dropped WebSocket connection:
 *    when a Member has no remaining connection it schedules a presence-departure
 *    that fires within 5s unless the Member reconnects first (R13.6).
 *  - A real-time event addressed to a Member with no active connection is simply
 *    not delivered to that Member; a delivery failure to one connection never
 *    prevents delivery to the others (R13.7).
 *
 * StreetJS is an optional peer, so the gateway depends only on the narrow
 * structural seams {@link RealtimeTransport} (send to a WebSocket connection),
 * {@link RealtimeBackplane} (Redis pub/sub), {@link Timer}, and the injected
 * {@link Clock}. The composition root (`apps/api`) adapts the concrete StreetJS
 * WebSocket hub and Redis pub/sub client with {@link streetWebSocketTransport}
 * and {@link streetRedisBackplane}; tests wire the in-memory
 * {@link InMemoryTransport}, {@link InMemoryBackplane}, and {@link ManualTimer}.
 * This mirrors the dependency-injection/adapter pattern used by
 * `@streetstudio/database` for PostgreSQL access, keeping the dependency graph
 * acyclic.
 */
import { systemClock, type Clock } from "@streetstudio/auth";
import type { NotificationDto } from "@streetstudio/shared";
import type { NotificationEmitter } from "./notification-service.js";

/** Realtime event kinds delivered over the WebSocket gateway (R13.4). */
export type RealtimeEventType =
  | "upload-progress"
  | "processing-status"
  | "live-comment"
  | "notification"
  | "presence-join"
  | "presence-leave"
  | "typing-start"
  | "typing-stop"
  | "workspace-event";

/**
 * A single real-time event. `type` names the kind of event (R13.4) and
 * `payload` carries the event-specific body delivered to the client. The
 * payload must be JSON-serializable because it crosses the Redis backplane.
 */
export interface RealtimeEvent {
  /** The kind of event. */
  readonly type: RealtimeEventType;
  /** Event-specific body delivered to subscribing clients. */
  readonly payload?: unknown;
}

/**
 * Describes which Members an event is delivered to. `excludeMemberId` omits a
 * single Member from the resolved set — used to keep presence and typing events
 * from echoing back to the originating Member (R13.1, R13.2, R13.3).
 *
 *  - `workspace`: every Member currently present in the Workspace.
 *  - `video`: every Member currently viewing the Video.
 *  - `member`: a single Member (their own connections only).
 */
export type Audience =
  | {
      readonly scope: "workspace";
      readonly workspaceId: string;
      readonly excludeMemberId?: string;
    }
  | {
      readonly scope: "video";
      readonly videoId: string;
      readonly excludeMemberId?: string;
    }
  | { readonly scope: "member"; readonly memberId: string };

/**
 * The transport seam: send one event to one WebSocket connection. The concrete
 * implementation is the StreetJS WebSocket hub, adapted by
 * {@link streetWebSocketTransport}; tests use {@link InMemoryTransport}.
 */
export interface RealtimeTransport {
  /** Deliver an event to the identified connection. */
  send(connectionId: string, event: RealtimeEvent): void | Promise<void>;
}

/**
 * The cross-node fan-out seam: a Redis-style pub/sub backplane. The gateway
 * publishes every emitted event to a single channel and delivers to its local
 * connections from the subscription callback, so an event produced on any node
 * reaches subscribers connected to any node. Adapted from the concrete StreetJS
 * Redis client by {@link streetRedisBackplane}; tests use
 * {@link InMemoryBackplane}.
 */
export interface RealtimeBackplane {
  /** Publish a serialized message to a channel. */
  publish(channel: string, message: string): void | Promise<void>;
  /** Register a handler invoked for every message published to a channel. */
  subscribe(
    channel: string,
    handler: (message: string) => void | Promise<void>,
  ): void | Promise<void>;
}

/** Opaque handle returned by {@link Timer.schedule}. */
export type TimerHandle = unknown;

/**
 * A schedulable timer seam. Typing-stop after inactivity (R13.5) and
 * presence-departure after a dropped connection (R13.6) are time-dependent, so
 * the timer is injected rather than reaching for the ambient `setTimeout`.
 * Tests provide a deterministic {@link ManualTimer}; production wires
 * {@link systemTimer}.
 */
export interface Timer {
  /** Schedule `callback` to run after `delayMs`, returning a cancel handle. */
  schedule(delayMs: number, callback: () => void): TimerHandle;
  /** Cancel a previously scheduled callback; a no-op if it already fired. */
  cancel(handle: TimerHandle): void;
}

/** The default timer, backed by the host `setTimeout`/`clearTimeout`. */
export const systemTimer: Timer = {
  schedule(delayMs, callback) {
    return setTimeout(callback, delayMs);
  },
  cancel(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

/** Dependencies required to construct a {@link RealtimeGateway}. */
export interface RealtimeGatewayDeps {
  /** WebSocket transport seam. */
  readonly transport: RealtimeTransport;
  /** Redis pub/sub backplane seam for cross-node fan-out. */
  readonly backplane: RealtimeBackplane;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
  /** Timer seam; defaults to {@link systemTimer}. */
  readonly timer?: Timer;
  /** Backplane channel; defaults to `"streetstudio:realtime"`. */
  readonly channel?: string;
  /** Typing inactivity window in ms before typing-stop; defaults to 5000 (R13.5). */
  readonly typingInactivityMs?: number;
  /** Departure delay in ms after a dropped connection; defaults to 5000 (R13.6). */
  readonly dropDepartureMs?: number;
}

const DEFAULT_CHANNEL = "streetstudio:realtime";
const DEFAULT_TYPING_INACTIVITY_MS = 5000;
const DEFAULT_DROP_DEPARTURE_MS = 5000;

/** Wire envelope published to the backplane: the event plus its audience. */
interface RealtimeEnvelope {
  readonly event: RealtimeEvent;
  readonly audience: Audience;
}

/**
 * The Realtime_Service gateway. See the module docstring for the requirement
 * mapping. A single gateway instance represents one API node; multiple
 * instances sharing a {@link RealtimeBackplane} model a horizontally-scaled
 * deployment.
 *
 * Delivery always flows through the backplane: {@link emit} publishes an
 * envelope, and every node (including the publisher) delivers to its own local
 * connections from the subscription callback. Presence is tracked per node
 * against the connections that node owns, so audience resolution on the
 * receiving node naturally targets only Members connected there.
 */
export class RealtimeGateway {
  private readonly transport: RealtimeTransport;
  private readonly backplane: RealtimeBackplane;
  private readonly clock: Clock;
  private readonly timer: Timer;
  private readonly channel: string;
  private readonly typingInactivityMs: number;
  private readonly dropDepartureMs: number;

  /** connectionId -> memberId for every connection this node owns. */
  private readonly connectionMember = new Map<string, string>();
  /** memberId -> set of that Member's connectionIds on this node. */
  private readonly connectionsByMember = new Map<string, Set<string>>();
  /** memberId -> set of Workspaces the Member is present in (R13.1). */
  private readonly memberWorkspaces = new Map<string, Set<string>>();
  /** memberId -> set of Videos the Member is currently viewing (R11.6, R13.2). */
  private readonly memberVideos = new Map<string, Set<string>>();
  /** `${memberId}::${videoId}` -> the pending typing-stop timer (R13.5). */
  private readonly typingTimers = new Map<string, TimerHandle>();
  /** memberId -> the pending dropped-connection departure timer (R13.6). */
  private readonly departureTimers = new Map<string, TimerHandle>();

  private started = false;

  constructor(deps: RealtimeGatewayDeps) {
    this.transport = deps.transport;
    this.backplane = deps.backplane;
    this.clock = deps.clock ?? systemClock;
    this.timer = deps.timer ?? systemTimer;
    this.channel = deps.channel ?? DEFAULT_CHANNEL;
    this.typingInactivityMs =
      deps.typingInactivityMs ?? DEFAULT_TYPING_INACTIVITY_MS;
    this.dropDepartureMs = deps.dropDepartureMs ?? DEFAULT_DROP_DEPARTURE_MS;
  }

  /**
   * Subscribe to the backplane channel so this node begins receiving fan-out.
   * Must be awaited once before events are emitted; idempotent.
   */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    await this.backplane.subscribe(this.channel, (message) =>
      this.deliverLocal(message),
    );
  }

  /* ----------------------- connection lifecycle ------------------------ */

  /**
   * Register a WebSocket connection for a Member on this node. A Member may hold
   * several connections (multiple tabs/devices); each is tracked. Registering a
   * connection cancels any pending dropped-connection departure for the Member,
   * since they are connected again (R13.6).
   */
  connect(memberId: string, connectionId: string): void {
    this.connectionMember.set(connectionId, memberId);
    const existing = this.connectionsByMember.get(memberId);
    if (existing) {
      existing.add(connectionId);
    } else {
      this.connectionsByMember.set(memberId, new Set([connectionId]));
    }
    this.cancelDeparture(memberId);
  }

  /**
   * Handle a dropped WebSocket connection (no explicit leave). When the Member
   * has no remaining connection on this node, a presence-departure is scheduled
   * to fire within {@link dropDepartureMs} (default 5s) unless the Member
   * reconnects first (R13.6). An explicit {@link leave} should be used for a
   * clean departure.
   */
  disconnect(connectionId: string): void {
    const memberId = this.connectionMember.get(connectionId);
    if (memberId === undefined) {
      return;
    }
    this.connectionMember.delete(connectionId);
    const connections = this.connectionsByMember.get(memberId);
    if (connections) {
      connections.delete(connectionId);
      if (connections.size === 0) {
        this.connectionsByMember.delete(memberId);
      }
    }
    if (!this.connectionsByMember.has(memberId)) {
      this.scheduleDeparture(memberId);
    }
  }

  /* ----------------------------- presence ------------------------------ */

  /**
   * Record that `memberId` has joined `workspaceId` and emit a presence-join to
   * every other connected Member in that Workspace, excluding the joining
   * Member (R13.1).
   */
  async join(memberId: string, workspaceId: string): Promise<void> {
    this.cancelDeparture(memberId);
    this.addToSet(this.memberWorkspaces, memberId, workspaceId);
    await this.emit(
      { type: "presence-join", payload: { memberId, workspaceId } },
      { scope: "workspace", workspaceId, excludeMemberId: memberId },
    );
  }

  /**
   * Record that `memberId` has left `workspaceId` and emit a presence-leave to
   * every other connected Member in that Workspace, excluding the leaving
   * Member (R13.3).
   */
  async leave(memberId: string, workspaceId: string): Promise<void> {
    this.removeFromSet(this.memberWorkspaces, memberId, workspaceId);
    await this.emit(
      { type: "presence-leave", payload: { memberId, workspaceId } },
      { scope: "workspace", workspaceId, excludeMemberId: memberId },
    );
  }

  /**
   * Record that `memberId` has begun viewing `videoId`. Video viewership is the
   * audience for live comments (R11.6) and typing indicators (R13.2).
   */
  openVideo(memberId: string, videoId: string): void {
    this.addToSet(this.memberVideos, memberId, videoId);
  }

  /** Record that `memberId` has stopped viewing `videoId`. */
  closeVideo(memberId: string, videoId: string): void {
    this.removeFromSet(this.memberVideos, memberId, videoId);
  }

  /* ------------------------------ typing ------------------------------- */

  /**
   * Signal that `memberId` is typing a comment on `videoId`: emit a typing-start
   * to the other Members viewing the same Video (R13.2) and arm the inactivity
   * timer so typing-stop fires after {@link typingInactivityMs} of silence
   * (R13.5). Repeated activity re-arms the timer.
   */
  async startTyping(memberId: string, videoId: string): Promise<void> {
    const key = typingKey(memberId, videoId);
    const pending = this.typingTimers.get(key);
    const firstSignal = pending === undefined;
    if (pending !== undefined) {
      this.timer.cancel(pending);
    }
    this.typingTimers.set(
      key,
      this.timer.schedule(this.typingInactivityMs, () => {
        void this.stopTyping(memberId, videoId);
      }),
    );
    if (firstSignal) {
      await this.emit(
        { type: "typing-start", payload: { memberId, videoId } },
        { scope: "video", videoId, excludeMemberId: memberId },
      );
    }
  }

  /**
   * Signal that `memberId` has stopped typing on `videoId`: cancel the
   * inactivity timer and emit a typing-stop to the other Members viewing the
   * same Video (R13.5). A no-op when the Member was not typing, so it is safe to
   * call on both explicit stop and timer expiry.
   */
  async stopTyping(memberId: string, videoId: string): Promise<void> {
    const key = typingKey(memberId, videoId);
    const pending = this.typingTimers.get(key);
    if (pending === undefined) {
      return;
    }
    this.timer.cancel(pending);
    this.typingTimers.delete(key);
    await this.emit(
      { type: "typing-stop", payload: { memberId, videoId } },
      { scope: "video", videoId, excludeMemberId: memberId },
    );
  }

  /* ------------------------------- emit -------------------------------- */

  /**
   * Publish `event` to `audience`. The event is written to the backplane and
   * delivered to local connections from the subscription callback on every node
   * (R13.4), so it reaches subscribers wherever they are connected. Events for a
   * Member with no active connection are discarded on delivery without
   * disrupting others (R13.7).
   */
  async emit(event: RealtimeEvent, audience: Audience): Promise<void> {
    const envelope: RealtimeEnvelope = { event, audience };
    await this.backplane.publish(this.channel, JSON.stringify(envelope));
  }

  /** Emit an upload-progress event to a Video's viewers (R13.4). */
  async emitUploadProgress(videoId: string, payload: unknown): Promise<void> {
    await this.emit(
      { type: "upload-progress", payload },
      { scope: "video", videoId },
    );
  }

  /** Emit a processing-status event to a Video's viewers (R13.4). */
  async emitProcessingStatus(videoId: string, payload: unknown): Promise<void> {
    await this.emit(
      { type: "processing-status", payload },
      { scope: "video", videoId },
    );
  }

  /**
   * Emit a new comment to the concurrent viewers of a Video, excluding its
   * author, so a viewing Member sees it within 2s (R11.6).
   */
  async emitLiveComment(
    videoId: string,
    payload: unknown,
    authorMemberId?: string,
  ): Promise<void> {
    const audience: Audience =
      authorMemberId === undefined
        ? { scope: "video", videoId }
        : { scope: "video", videoId, excludeMemberId: authorMemberId };
    await this.emit({ type: "live-comment", payload }, audience);
  }

  /* ---------------------------- internals ------------------------------ */

  /**
   * Deliver a backplane message to this node's local connections. Resolves the
   * audience against local presence/viewership, then sends the event to each
   * targeted Member's connections. A Member with no local connection receives
   * nothing (the event is discarded for them), and a failure delivering to one
   * connection is isolated so the others still receive the event (R13.7).
   */
  private async deliverLocal(message: string): Promise<void> {
    const { event, audience } = JSON.parse(message) as RealtimeEnvelope;
    const exclude =
      audience.scope === "member" ? undefined : audience.excludeMemberId;
    for (const memberId of this.resolveAudience(audience)) {
      if (memberId === exclude) {
        continue;
      }
      const connections = this.connectionsByMember.get(memberId);
      if (!connections) {
        continue; // no active connection: discard for this Member (R13.7)
      }
      for (const connectionId of connections) {
        try {
          await this.transport.send(connectionId, event);
        } catch {
          // Isolate a per-connection failure so other Members are unaffected.
        }
      }
    }
  }

  /** Resolve an audience to the set of local Member ids it targets. */
  private resolveAudience(audience: Audience): Set<string> {
    switch (audience.scope) {
      case "workspace":
        return this.membersWith(this.memberWorkspaces, audience.workspaceId);
      case "video":
        return this.membersWith(this.memberVideos, audience.videoId);
      case "member":
        return new Set([audience.memberId]);
    }
  }

  /** Every Member whose membership set contains `value`. */
  private membersWith(
    index: Map<string, Set<string>>,
    value: string,
  ): Set<string> {
    const members = new Set<string>();
    for (const [memberId, values] of index) {
      if (values.has(value)) {
        members.add(memberId);
      }
    }
    return members;
  }

  /** Schedule the dropped-connection presence-departure (R13.6). */
  private scheduleDeparture(memberId: string): void {
    this.cancelDeparture(memberId);
    this.departureTimers.set(
      memberId,
      this.timer.schedule(this.dropDepartureMs, () => {
        void this.fireDeparture(memberId);
      }),
    );
  }

  /**
   * Emit presence-departure for a Member who dropped and did not reconnect,
   * across every Workspace they were present in, then clear their presence and
   * viewership state (R13.6).
   */
  private async fireDeparture(memberId: string): Promise<void> {
    this.departureTimers.delete(memberId);
    if (this.connectionsByMember.has(memberId)) {
      return; // reconnected before the timer fired
    }
    const workspaces = this.memberWorkspaces.get(memberId);
    if (workspaces) {
      for (const workspaceId of [...workspaces]) {
        await this.emit(
          { type: "presence-leave", payload: { memberId, workspaceId } },
          { scope: "workspace", workspaceId, excludeMemberId: memberId },
        );
      }
    }
    this.memberWorkspaces.delete(memberId);
    this.memberVideos.delete(memberId);
  }

  private cancelDeparture(memberId: string): void {
    const pending = this.departureTimers.get(memberId);
    if (pending !== undefined) {
      this.timer.cancel(pending);
      this.departureTimers.delete(memberId);
    }
  }

  private addToSet(
    index: Map<string, Set<string>>,
    key: string,
    value: string,
  ): void {
    const existing = index.get(key);
    if (existing) {
      existing.add(value);
    } else {
      index.set(key, new Set([value]));
    }
  }

  private removeFromSet(
    index: Map<string, Set<string>>,
    key: string,
    value: string,
  ): void {
    const existing = index.get(key);
    if (!existing) {
      return;
    }
    existing.delete(value);
    if (existing.size === 0) {
      index.delete(key);
    }
  }
}

function typingKey(memberId: string, videoId: string): string {
  return `${memberId}::${videoId}`;
}

/* ------------------------- notification bridge ------------------------- */

/**
 * Adapt a {@link RealtimeGateway} into the {@link NotificationEmitter} seam
 * consumed by the NotificationService (task 21.1), delivering each notification
 * to its recipient's own connections within 2s (R12.2).
 */
export function realtimeNotificationEmitter(
  gateway: RealtimeGateway,
): NotificationEmitter {
  return {
    async emit(notification: NotificationDto): Promise<void> {
      await gateway.emit(
        { type: "notification", payload: notification },
        { scope: "member", memberId: notification.memberId },
      );
    },
  };
}

/* --------------------------- StreetJS adapters ------------------------- */

/**
 * Minimal structural view of the StreetJS WebSocket hub: send a serialized
 * message to a connection. The concrete hub is obtained by the composition root
 * through the StreetJS public entry point and adapted with
 * {@link streetWebSocketTransport}. Kept narrow so this package carries no hard
 * dependency on the optional `@streetjs/core` peer.
 */
export interface StreetWebSocketHub {
  /** Send serialized data to the identified WebSocket connection. */
  sendTo(connectionId: string, data: string): void | Promise<void>;
}

/** Adapt a StreetJS WebSocket hub into a {@link RealtimeTransport}. */
export function streetWebSocketTransport(
  hub: StreetWebSocketHub,
): RealtimeTransport {
  return {
    send(connectionId, event) {
      return hub.sendTo(connectionId, JSON.stringify(event));
    },
  };
}

/**
 * Minimal structural view of the StreetJS Redis pub/sub client used for the
 * cross-node backplane. Adapted with {@link streetRedisBackplane} by the
 * composition root.
 */
export interface StreetRedisPubSub {
  /** Publish a message to a channel. */
  publish(channel: string, message: string): void | Promise<void>;
  /** Subscribe to a channel, invoking `listener` for each message. */
  subscribe(
    channel: string,
    listener: (message: string) => void | Promise<void>,
  ): void | Promise<void>;
}

/** Adapt a StreetJS Redis pub/sub client into a {@link RealtimeBackplane}. */
export function streetRedisBackplane(
  pubsub: StreetRedisPubSub,
): RealtimeBackplane {
  return {
    publish: (channel, message) => pubsub.publish(channel, message),
    subscribe: (channel, handler) => pubsub.subscribe(channel, handler),
  };
}

/* ------------------------------ test seams ----------------------------- */

/**
 * An in-memory {@link RealtimeTransport} that records every delivered event per
 * connection, for tests and local composition. Not for production use.
 */
export class InMemoryTransport implements RealtimeTransport {
  /** connectionId -> events delivered to it, in order. */
  readonly delivered = new Map<string, RealtimeEvent[]>();

  send(connectionId: string, event: RealtimeEvent): void {
    const existing = this.delivered.get(connectionId);
    if (existing) {
      existing.push(event);
    } else {
      this.delivered.set(connectionId, [event]);
    }
  }

  /** Events delivered to a connection so far. */
  eventsFor(connectionId: string): readonly RealtimeEvent[] {
    return this.delivered.get(connectionId) ?? [];
  }
}

/**
 * An in-memory {@link RealtimeBackplane} that invokes every subscriber
 * synchronously on publish. Sharing one instance across multiple
 * {@link RealtimeGateway} instances models a Redis-backed multi-node
 * deployment; each gateway subscribes and receives every published message.
 * Not for production use.
 */
export class InMemoryBackplane implements RealtimeBackplane {
  private readonly handlers = new Map<
    string,
    Set<(message: string) => void | Promise<void>>
  >();

  async publish(channel: string, message: string): Promise<void> {
    const handlers = this.handlers.get(channel);
    if (!handlers) {
      return;
    }
    for (const handler of [...handlers]) {
      await handler(message);
    }
  }

  subscribe(
    channel: string,
    handler: (message: string) => void | Promise<void>,
  ): void {
    const existing = this.handlers.get(channel);
    if (existing) {
      existing.add(handler);
    } else {
      this.handlers.set(channel, new Set([handler]));
    }
  }
}

/**
 * A deterministic {@link Timer} for tests: scheduled callbacks fire only when
 * {@link ManualTimer.advance} moves virtual time past their due point. Callbacks
 * due at the same instant fire in schedule order. Not for production use.
 */
export class ManualTimer implements Timer {
  private now = 0;
  private seq = 0;
  private readonly scheduled = new Map<
    number,
    { readonly at: number; readonly seq: number; readonly callback: () => void }
  >();

  schedule(delayMs: number, callback: () => void): TimerHandle {
    const id = ++this.seq;
    this.scheduled.set(id, { at: this.now + delayMs, seq: id, callback });
    return id;
  }

  cancel(handle: TimerHandle): void {
    this.scheduled.delete(handle as number);
  }

  /** Advance virtual time by `ms`, firing every callback that becomes due. */
  advance(ms: number): void {
    this.now += ms;
    const due = [...this.scheduled.entries()]
      .filter(([, entry]) => entry.at <= this.now)
      .sort((a, b) => a[1].seq - b[1].seq);
    for (const [id, entry] of due) {
      this.scheduled.delete(id);
      entry.callback();
    }
  }
}
