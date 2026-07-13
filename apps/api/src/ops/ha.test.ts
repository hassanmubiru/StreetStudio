import { describe, expect, it, vi } from "vitest";
import { AppError } from "@streetstudio/shared";
import {
  ConnectionLostError,
  DEFAULT_HA_RECONNECT_POLICY,
  HaConnectionManager,
  createHaConnectionManager,
  isConnectionLoss,
  type HaConnection,
  type HaConnectionState,
} from "./ha.js";

/** No-op sleep so backoff never delays the tests. */
const noSleep = () => Promise.resolve();

/**
 * An in-memory fake of a StreetJS HA connection. It hands out a client whose
 * behaviour is controlled by the test, and models topology healing: after
 * `reconnect()` succeeds, the client is swapped for a healthy one (mirroring
 * StreetJS routing to a newly-elected primary / healthy cluster node).
 */
interface FakeClient {
  query(): string;
}

class FakeHaConnection implements HaConnection<FakeClient> {
  readonly name: string;
  reconnectCalls = 0;
  private live: FakeClient;
  private readonly healthyClient: FakeClient;
  private readonly reconnectPlan: Array<"ok" | "fail">;
  private readonly healthy: boolean;

  constructor(opts: {
    name?: string;
    initial: FakeClient;
    reconnectsTo?: FakeClient;
    reconnectPlan?: Array<"ok" | "fail">;
    healthy?: boolean;
  }) {
    this.name = opts.name ?? "postgres";
    this.live = opts.initial;
    this.healthyClient = opts.reconnectsTo ?? opts.initial;
    this.reconnectPlan = opts.reconnectPlan ?? [];
    this.healthy = opts.healthy ?? true;
  }

  client(): FakeClient {
    return this.live;
  }

  reconnect(): Promise<void> {
    this.reconnectCalls += 1;
    const outcome = this.reconnectPlan.shift() ?? "ok";
    if (outcome === "fail") {
      return Promise.reject(new Error("failover in progress"));
    }
    this.live = this.healthyClient;
    return Promise.resolve();
  }

  healthCheck(): Promise<void> {
    return this.healthy ? Promise.resolve() : Promise.reject(new Error("down"));
  }
}

/** A client that loses the connection `failures` times, then succeeds. */
function flakyClient(failures: number, result = "ok"): FakeClient {
  let remaining = failures;
  return {
    query() {
      if (remaining > 0) {
        remaining -= 1;
        throw new ConnectionLostError();
      }
      return result;
    },
  };
}

describe("isConnectionLoss", () => {
  it("recognises ConnectionLostError and rejects everything else", () => {
    expect(isConnectionLoss(new ConnectionLostError())).toBe(true);
    expect(isConnectionLoss(new Error("boom"))).toBe(false);
    expect(isConnectionLoss("nope")).toBe(false);
    expect(isConnectionLoss(undefined)).toBe(false);
  });
});

describe("HaConnectionManager.run — happy path (R30.5)", () => {
  it("forwards to the current client and returns its result", async () => {
    const conn = new FakeHaConnection({ initial: { query: () => "rows" } });
    const manager = new HaConnectionManager(conn, { sleep: noSleep });

    await expect(manager.run((c) => c.query())).resolves.toBe("rows");
    expect(conn.reconnectCalls).toBe(0);
    expect(manager.currentState()).toBe("connected");
    expect(manager.reconnectionCount()).toBe(0);
  });

  it("propagates non-connection-loss errors without reconnecting", async () => {
    const conn = new FakeHaConnection({ initial: { query: () => "x" } });
    const manager = new HaConnectionManager(conn, { sleep: noSleep });

    await expect(
      manager.run(() => {
        throw new Error("syntax error");
      }),
    ).rejects.toThrow("syntax error");
    expect(conn.reconnectCalls).toBe(0);
    expect(manager.currentState()).toBe("connected");
  });
});

describe("HaConnectionManager.run — reconnect on node loss (R30.6)", () => {
  it("reconnects through the HA interface and resumes without restart", async () => {
    // The active client fails once with a connection loss; after reconnect the
    // connection routes to a healthy client that succeeds.
    const conn = new FakeHaConnection({
      initial: flakyClient(1),
      reconnectsTo: { query: () => "resumed" },
    });
    const states: HaConnectionState[] = [];
    const manager = new HaConnectionManager(conn, {
      sleep: noSleep,
      onStateChange: (s) => states.push(s),
    });

    await expect(manager.run((c) => c.query())).resolves.toBe("resumed");
    expect(conn.reconnectCalls).toBe(1);
    expect(manager.reconnectionCount()).toBe(1);
    // The same manager instance recovered — no restart — and ends connected.
    expect(manager.currentState()).toBe("connected");
    expect(states).toEqual(["reconnecting", "connected"]);
  });

  it("drives multiple bounded reconnects when several node losses occur", async () => {
    const conn = new FakeHaConnection({
      initial: flakyClient(3),
      // reconnect returns the same flaky client until its failures drain.
    });
    const manager = new HaConnectionManager(conn, { sleep: noSleep });

    await expect(manager.run((c) => c.query())).resolves.toBe("ok");
    expect(conn.reconnectCalls).toBe(3);
    expect(manager.reconnectionCount()).toBe(3);
    expect(manager.currentState()).toBe("connected");
  });

  it("keeps trying when a reconnect attempt itself fails, then resumes", async () => {
    // First reconnect fails (failover still settling), second succeeds.
    const conn = new FakeHaConnection({
      initial: flakyClient(2),
      reconnectsTo: { query: () => "healed" },
      reconnectPlan: ["fail", "ok"],
    });
    const manager = new HaConnectionManager(conn, { sleep: noSleep });

    await expect(manager.run((c) => c.query())).resolves.toBe("healed");
    // Two connection losses drove two reconnect cycles; one failed, one succeeded.
    expect(conn.reconnectCalls).toBe(2);
    expect(manager.reconnectionCount()).toBe(1);
    expect(manager.currentState()).toBe("connected");
  });
});

describe("HaConnectionManager.run — exhausted budget", () => {
  it("reports CAPABILITY_UNAVAILABLE after the bounded attempts are used up", async () => {
    const conn = new FakeHaConnection({ initial: flakyClient(Number.POSITIVE_INFINITY) });
    const manager = new HaConnectionManager(conn, {
      sleep: noSleep,
      policy: { maxReconnectAttempts: 2, backoffMs: [1, 2] },
    });

    const error = await manager.run((c) => c.query()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("CAPABILITY_UNAVAILABLE");
    expect((error as AppError).details).toMatchObject({
      dependency: "postgres",
      attempts: 2,
    });
    expect(conn.reconnectCalls).toBe(2);
    expect(manager.currentState()).toBe("unavailable");
  });

  it("fails fast with no reconnect when maxReconnectAttempts is 0", async () => {
    const conn = new FakeHaConnection({ initial: flakyClient(1) });
    const manager = new HaConnectionManager(conn, {
      sleep: noSleep,
      policy: { maxReconnectAttempts: 0, backoffMs: [] },
    });

    await expect(manager.run((c) => c.query())).rejects.toBeInstanceOf(AppError);
    expect(conn.reconnectCalls).toBe(0);
    expect(manager.currentState()).toBe("unavailable");
  });

  it("rejects an invalid policy at construction time", () => {
    const conn = new FakeHaConnection({ initial: { query: () => "x" } });
    expect(
      () =>
        new HaConnectionManager(conn, {
          policy: { maxReconnectAttempts: -1, backoffMs: [] },
        }),
    ).toThrow(RangeError);
  });
});

describe("HaConnectionManager — backoff and observability", () => {
  it("applies backoff before each reconnect, reusing the last entry", async () => {
    const conn = new FakeHaConnection({ initial: flakyClient(3) });
    const sleep = vi.fn(() => Promise.resolve());
    const reconnects: number[] = [];
    const manager = new HaConnectionManager(conn, {
      sleep,
      policy: { maxReconnectAttempts: 5, backoffMs: [10, 20] },
      onReconnect: (_dep, attempt) => reconnects.push(attempt),
    });

    await manager.run((c) => c.query());
    // Backoff for attempts 1,2,3 -> 10, 20, 20 (last entry reused).
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 20, 20]);
    expect(reconnects).toEqual([1, 2, 3]);
  });

  it("uses a custom connection-loss predicate", async () => {
    class DriverError extends Error {}
    const conn = new FakeHaConnection({
      initial: (() => {
        let first = true;
        return {
          query() {
            if (first) {
              first = false;
              throw new DriverError("ECONNRESET");
            }
            return "ok";
          },
        };
      })(),
    });
    const manager = new HaConnectionManager(conn, {
      sleep: noSleep,
      isConnectionLoss: (e) => e instanceof DriverError,
    });

    await expect(manager.run((c) => c.query())).resolves.toBe("ok");
    expect(conn.reconnectCalls).toBe(1);
  });
});

describe("HaConnectionManager.healthCheck", () => {
  it("delegates to the underlying HA connection", async () => {
    const up = new HaConnectionManager(
      new FakeHaConnection({ initial: { query: () => "x" }, healthy: true }),
    );
    const down = new HaConnectionManager(
      new FakeHaConnection({ initial: { query: () => "x" }, healthy: false }),
    );
    await expect(up.healthCheck()).resolves.toBeUndefined();
    await expect(down.healthCheck()).rejects.toThrow();
  });
});

describe("createHaConnectionManager", () => {
  it("constructs a manager for a Redis Cluster connection (R30.5)", async () => {
    const conn = new FakeHaConnection({ name: "redis", initial: { query: () => "PONG" } });
    const manager = createHaConnectionManager(conn, { sleep: noSleep });
    expect(manager.dependency).toBe("redis");
    await expect(manager.run((c) => c.query())).resolves.toBe("PONG");
  });

  it("exposes a default reconnect policy of 5 attempts", () => {
    expect(DEFAULT_HA_RECONNECT_POLICY.maxReconnectAttempts).toBe(5);
    expect(DEFAULT_HA_RECONNECT_POLICY.backoffMs).toHaveLength(5);
  });
});
