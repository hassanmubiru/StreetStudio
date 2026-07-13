/**
 * API_Service high-availability operation (Requirements 30.5, 30.6).
 *
 * When high availability is configured, the API_Service operates against
 * PostgreSQL high availability and Redis Cluster **through the StreetJS
 * interfaces** (R30.5), and — when the active PostgreSQL primary or a Redis
 * Cluster node becomes unreachable — reconnects through the StreetJS HA
 * interfaces and resumes serving requests **without requiring an operator
 * restart** (R30.6).
 *
 * StreetJS owns the actual topology awareness (primary election, cluster slot
 * routing, failover). This module models only the thin host-side behaviour that
 * StreetStudio must own: detecting a connection-loss error surfaced by an
 * operation, driving a bounded reconnect through the HA interface, and
 * transparently resuming the in-flight work so callers never observe a restart.
 *
 * Every StreetJS touchpoint is a narrow structural adapter seam
 * ({@link HaConnection}) so the manager is exercised with in-memory fakes and
 * no real database, Redis, network, or clock. The concrete PostgreSQL-HA and
 * Redis-Cluster adapters (which wrap the `@streetjs/core` public HA interfaces)
 * supply the seam at composition time.
 */
import { AppError } from "@streetstudio/shared";

/**
 * The lifecycle state of an HA-backed connection:
 *  - `"connected"`: the current primary/node is reachable and serving.
 *  - `"reconnecting"`: a loss was detected and reconnection is in progress.
 *  - `"unavailable"`: the bounded reconnect budget was exhausted.
 */
export type HaConnectionState = "connected" | "reconnecting" | "unavailable";

/**
 * A narrow structural view of a StreetJS-managed HA connection — either
 * PostgreSQL high availability or a Redis Cluster (R30.5). The composition root
 * adapts the concrete `@streetjs/core` HA object to this seam; tests supply an
 * in-memory fake.
 *
 * @typeParam Client the live client handle the operation runs against (e.g. a
 *   PostgreSQL pool/session or a Redis cluster client), routed by StreetJS HA to
 *   the current primary / a healthy cluster node.
 */
export interface HaConnection<Client> {
  /** Human-readable dependency name reported in errors (e.g. `"postgres"`). */
  readonly name: string;
  /**
   * The current live client, routed by StreetJS HA to the active primary / a
   * healthy cluster node. Called immediately before each operation attempt so a
   * retry after {@link HaConnection.reconnect} uses the freshly-routed client.
   */
  client(): Client;
  /**
   * Re-establish the connection through the StreetJS HA failover interface.
   * Resolves once a new primary has been elected / the cluster topology has
   * healed and a healthy node is available; rejects when reconnection could not
   * (yet) be completed.
   */
  reconnect(): Promise<void>;
  /** Liveness probe; resolves when reachable, rejects when not. */
  healthCheck(): Promise<void>;
}

/** A PostgreSQL high-availability connection seam (R30.5, R30.6). */
export type PostgresHaConnection<Client> = HaConnection<Client>;
/** A Redis Cluster connection seam (R30.5, R30.6). */
export type RedisClusterConnection<Client> = HaConnection<Client>;

/**
 * Error marking a lost connection to the active primary / a cluster node. The
 * default {@link isConnectionLoss} predicate recognises this class; adapters
 * may instead supply their own predicate to classify driver-specific errors.
 */
export class ConnectionLostError extends Error {
  constructor(
    message = "connection to the active primary/node was lost",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ConnectionLostError";
  }
}

/** Classifies whether a thrown value represents a lost HA connection. */
export type ConnectionLossPredicate = (error: unknown) => boolean;

/** Default predicate: only {@link ConnectionLostError} counts as a loss. */
export const isConnectionLoss: ConnectionLossPredicate = (error) =>
  error instanceof ConnectionLostError;

/** Injectable delay so reconnect backoff is deterministic in tests. */
export type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    (timer as { unref?: () => void }).unref?.();
  });

/**
 * Bounds the reconnect behaviour so a persistently-unreachable dependency fails
 * fast rather than retrying forever.
 */
export interface HaReconnectPolicy {
  /**
   * Maximum number of reconnect cycles a single operation may drive before the
   * manager gives up and reports the dependency unavailable. Must be ≥ 0.
   */
  readonly maxReconnectAttempts: number;
  /**
   * Backoff delay (ms) before each reconnect attempt, indexed by attempt. When
   * more attempts occur than entries, the last entry is reused. An empty array
   * means no delay.
   */
  readonly backoffMs: readonly number[];
}

/** Default HA reconnect policy: 5 bounded attempts with exponential backoff. */
export const DEFAULT_HA_RECONNECT_POLICY: HaReconnectPolicy = Object.freeze({
  maxReconnectAttempts: 5,
  backoffMs: Object.freeze([100, 250, 500, 1000, 2000]),
});

/** Inputs to {@link HaConnectionManager}. */
export interface HaConnectionManagerOptions {
  /** Reconnect bounds; defaults to {@link DEFAULT_HA_RECONNECT_POLICY}. */
  readonly policy?: HaReconnectPolicy;
  /** Loss classifier; defaults to {@link isConnectionLoss}. */
  readonly isConnectionLoss?: ConnectionLossPredicate;
  /** Delay source; defaults to a real `setTimeout`-based sleep. */
  readonly sleep?: Sleep;
  /** Observability hook fired whenever the connection state changes. */
  readonly onStateChange?: (state: HaConnectionState, dependency: string) => void;
  /** Observability hook fired after each successful reconnect. */
  readonly onReconnect?: (dependency: string, attempt: number) => void;
}

/**
 * Wraps an HA {@link HaConnection} and runs operations against it with
 * transparent, bounded reconnection.
 *
 * On a normal operation the manager simply forwards to the current client. When
 * an operation fails with a connection-loss error, the manager transitions to
 * `"reconnecting"`, drives {@link HaConnection.reconnect} through the StreetJS
 * HA interface with bounded backoff, and then **retries the same operation**
 * against the freshly-routed client — so the caller resumes without an operator
 * restart (R30.6). Only when the reconnect budget is exhausted does it
 * transition to `"unavailable"` and throw a `CAPABILITY_UNAVAILABLE`
 * {@link AppError} (reusing the shared taxonomy — no new error code).
 */
export class HaConnectionManager<Client> {
  private readonly connection: HaConnection<Client>;
  private readonly policy: HaReconnectPolicy;
  private readonly loss: ConnectionLossPredicate;
  private readonly sleep: Sleep;
  private readonly onStateChange?: (state: HaConnectionState, dependency: string) => void;
  private readonly onReconnect?: (dependency: string, attempt: number) => void;

  private state: HaConnectionState = "connected";
  private reconnectTotal = 0;

  constructor(connection: HaConnection<Client>, options: HaConnectionManagerOptions = {}) {
    const policy = options.policy ?? DEFAULT_HA_RECONNECT_POLICY;
    if (!Number.isInteger(policy.maxReconnectAttempts) || policy.maxReconnectAttempts < 0) {
      throw new RangeError(
        `maxReconnectAttempts must be a non-negative integer: ${policy.maxReconnectAttempts}`,
      );
    }
    this.connection = connection;
    this.policy = policy;
    this.loss = options.isConnectionLoss ?? isConnectionLoss;
    this.sleep = options.sleep ?? realSleep;
    this.onStateChange = options.onStateChange;
    this.onReconnect = options.onReconnect;
  }

  /** The dependency name this manager operates. */
  get dependency(): string {
    return this.connection.name;
  }

  /** The current connection lifecycle state. */
  currentState(): HaConnectionState {
    return this.state;
  }

  /** Total number of successful reconnects across this manager's lifetime. */
  reconnectionCount(): number {
    return this.reconnectTotal;
  }

  /**
   * Delegate liveness to the underlying HA connection so this manager can back
   * a health probe directly (mirrors the storage `healthCheck` connectivity
   * seam consumed by the health checker).
   */
  healthCheck(): Promise<void> {
    return this.connection.healthCheck();
  }

  /**
   * Run `operation` against the current HA client, reconnecting transparently
   * on connection loss and resuming without an operator restart (R30.6).
   *
   * Non-connection-loss errors propagate unchanged. When the bounded reconnect
   * budget is exhausted the dependency is reported unavailable.
   *
   * @throws AppError `CAPABILITY_UNAVAILABLE` when reconnection cannot restore
   *   the connection within the policy's attempt budget.
   */
  async run<T>(operation: (client: Client) => Promise<T> | T): Promise<T> {
    let reconnectsUsed = 0;
    for (;;) {
      try {
        const result = await operation(this.connection.client());
        this.transition("connected");
        return result;
      } catch (error) {
        if (!this.loss(error)) {
          throw error;
        }
        if (reconnectsUsed >= this.policy.maxReconnectAttempts) {
          this.transition("unavailable");
          throw this.unavailable(error, reconnectsUsed);
        }
        reconnectsUsed += 1;
        await this.reconnectOnce(reconnectsUsed);
        // Loop: retry the operation against the freshly-routed client.
      }
    }
  }

  /** Backoff delay (ms) for the given 1-based attempt number. */
  private backoffFor(attempt: number): number {
    const { backoffMs } = this.policy;
    if (backoffMs.length === 0) {
      return 0;
    }
    const index = Math.min(attempt - 1, backoffMs.length - 1);
    return backoffMs[index] ?? 0;
  }

  /**
   * Perform one reconnect cycle: wait the backoff, then ask the StreetJS HA
   * interface to re-establish the connection. A failed reconnect is swallowed
   * here; the caller's loop will re-run the operation, observe the persistent
   * loss, and count another attempt until the budget is exhausted.
   */
  private async reconnectOnce(attempt: number): Promise<void> {
    this.transition("reconnecting");
    await this.sleep(this.backoffFor(attempt));
    try {
      await this.connection.reconnect();
      this.reconnectTotal += 1;
      this.onReconnect?.(this.connection.name, attempt);
    } catch {
      // Reconnect attempt did not succeed; remain in "reconnecting" and let the
      // bounded loop drive the next attempt (or fail with CAPABILITY_UNAVAILABLE).
    }
  }

  /** Move to `next`, notifying the observer only on an actual change. */
  private transition(next: HaConnectionState): void {
    if (this.state === next) {
      return;
    }
    this.state = next;
    this.onStateChange?.(next, this.connection.name);
  }

  /** Build the non-disclosing unavailability error for an exhausted budget. */
  private unavailable(cause: unknown, attempts: number): AppError {
    return new AppError("CAPABILITY_UNAVAILABLE", {
      cause,
      details: {
        dependency: this.connection.name,
        reason: "HA reconnection did not restore the connection",
        attempts,
      },
    });
  }
}

/**
 * Construct a {@link HaConnectionManager} for a StreetJS HA connection. Thin
 * factory that documents the two supported HA topologies (PostgreSQL HA and
 * Redis Cluster, R30.5) at the call site while sharing one reconnection engine.
 */
export function createHaConnectionManager<Client>(
  connection: HaConnection<Client>,
  options: HaConnectionManagerOptions = {},
): HaConnectionManager<Client> {
  return new HaConnectionManager(connection, options);
}
