/**
 * Integration tests for the API_Service operational surface
 * (Requirements 30.2, 30.3, 30.5, 30.6).
 *
 * Where the pure-unit tests (startup.test.ts, ha.test.ts) exercise each
 * collaborator in isolation, these tests wire the operational surface together
 * end-to-end — configuration source, dependency activation, the framework
 * health-check registry, and the HA connection manager — and assert the
 * composed behaviour an operator actually observes:
 *
 *  (a) startup completes within the 60s budget on valid configuration and
 *      aborts naming every offending value on invalid configuration (R30.2/30.3);
 *  (b) the readiness endpoint reports `ok` only when every dependency probe is
 *      reachable, and `degraded` as soon as one is not (R30.4), using the
 *      published `streetjs` `HealthCheckRegistry` the runtime now serves;
 *  (c) the HA connection manager reconnects on PostgreSQL-primary / Redis-node
 *      loss and resumes serving without an operator restart (R30.5/30.6).
 *
 * Operational observability was migrated onto the framework's `MetricsRegistry`
 * + `HealthCheckRegistry` at the composition root (ADR-0022 slice 7), so the
 * former in-house `ops/{metrics,health}.ts` stand-ins (and their seam tests) are
 * retired; health here is exercised through the framework registry directly.
 *
 * Real PostgreSQL/Redis are not reachable in CI, so the wiring is exercised with
 * in-memory fakes behind the same seams the composition root adapts. A final
 * block opportunistically runs the readiness probe against real dependencies
 * when `STREETSTUDIO_IT_DATABASE_URL` / `STREETSTUDIO_IT_REDIS_URL` are supplied
 * and the endpoint is reachable, and skips gracefully otherwise.
 */
import { connect } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { HealthCheckRegistry } from "streetjs";
import { objectConfigSource, StartupConfigError } from "@streetstudio/config";
import { AppError } from "@streetstudio/shared";
import { startApiService, type ActivateDependencies } from "./startup.js";
import {
  ConnectionLostError,
  createHaConnectionManager,
  HaConnectionManager,
  type HaConnection,
} from "./ha.js";

/** A complete, valid configuration record for the default platform schema. */
function validConfigRecord(): Record<string, unknown> {
  return {
    instanceId: "11111111-1111-1111-1111-111111111111",
    "database.url": "postgres://user:pass@localhost:5432/streetstudio",
    "redis.url": "redis://localhost:6379",
    "auth.jwtSecret": "a".repeat(32),
    "http.port": 8080,
    "http.publicBaseUrl": "https://studio.example.com",
  };
}

/**
 * A single in-memory fake of a StreetJS-managed HA connection. It hands out a
 * live client whose per-call behaviour is scripted by the test and models
 * topology healing: after `reconnect()` the client is swapped for a healthy one
 * (mirroring StreetJS routing to a newly-elected primary / healthy node).
 */
interface FakeClient {
  ping(): string;
}

class FakeHaConnection implements HaConnection<FakeClient> {
  readonly name: string;
  reconnectCalls = 0;
  private live: FakeClient;
  private readonly healthyClient: FakeClient;
  private reachable: boolean;

  constructor(opts: {
    name: string;
    initial: FakeClient;
    reconnectsTo?: FakeClient;
    reachable?: boolean;
  }) {
    this.name = opts.name;
    this.live = opts.initial;
    this.healthyClient = opts.reconnectsTo ?? opts.initial;
    this.reachable = opts.reachable ?? true;
  }

  client(): FakeClient {
    return this.live;
  }

  reconnect(): Promise<void> {
    this.reconnectCalls += 1;
    this.live = this.healthyClient;
    this.reachable = true;
    return Promise.resolve();
  }

  healthCheck(): Promise<void> {
    return this.reachable
      ? Promise.resolve()
      : Promise.reject(new Error("unreachable"));
  }

  /** Flip liveness to model a dependency going down/up between health checks. */
  setReachable(value: boolean): void {
    this.reachable = value;
  }
}

/** A client that loses the connection `failures` times, then succeeds. */
function flakyClient(failures: number, result = "ok"): FakeClient {
  let remaining = failures;
  return {
    ping() {
      if (remaining > 0) {
        remaining -= 1;
        throw new ConnectionLostError();
      }
      return result;
    },
  };
}

const noSleep = () => Promise.resolve();

/**
 * Register a readiness check on the framework {@link HealthCheckRegistry} backed
 * by an HA manager's `healthCheck()` — `up` when the dependency is reachable,
 * `down` (with the failure reason) otherwise. This mirrors exactly what the
 * runtime composition root does for its `/health/ready` probe.
 */
function registerReadiness(
  registry: HealthCheckRegistry,
  name: string,
  manager: { healthCheck(): Promise<void> },
): void {
  registry.addCheck(
    name,
    async () => {
      try {
        await manager.healthCheck();
        return { status: "up" as const };
      } catch (error) {
        return {
          status: "down" as const,
          details: {
            reason: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    { type: "readiness" },
  );
}

describe("ops integration — startup → readiness wiring (R30.2, R30.4)", () => {
  it("starts within the budget on valid config, then serves a passing readiness endpoint", async () => {
    // Dependencies the composition root would connect during activation, each
    // reachable through its HA-managed connection.
    const postgres = new FakeHaConnection({
      name: "postgres",
      initial: { ping: () => "rows" },
    });
    const redis = new FakeHaConnection({
      name: "redis",
      initial: { ping: () => "PONG" },
    });

    const pgManager = createHaConnectionManager(postgres, { sleep: noSleep });
    const redisManager = createHaConnectionManager(redis, { sleep: noSleep });

    // Activation exercises each dependency once (proving it is connected) and
    // finishes well inside the deadline.
    const activate: ActivateDependencies = vi.fn(async () => {
      await pgManager.run((c) => c.ping());
      await redisManager.run((c) => c.ping());
    });

    // Deterministic clock: startup begins at 1_000 and finishes at 1_500 (500ms).
    const times = [1_000, 1_500];
    const clock = { now: vi.fn(() => times.shift() ?? 1_500) };

    const result = await startApiService({
      configSource: objectConfigSource(validConfigRecord()),
      clock,
      deadlineMs: 60_000,
      activate,
    });

    expect(activate).toHaveBeenCalledTimes(1);
    expect(result.config.httpPort).toBe(8080);
    expect(result.durationMs).toBe(500);
    expect(result.durationMs).toBeLessThanOrEqual(60_000);

    // With startup complete, wire the live probes into the framework registry.
    const registry = new HealthCheckRegistry();
    registerReadiness(registry, "postgres", pgManager);
    registerReadiness(registry, "redis", redisManager);

    // The readiness endpoint reports ok because every dependency is up.
    const report = await registry.runReadiness();
    expect(report.status).toBe("ok");
    expect(Object.keys(report.checks).sort()).toEqual(["postgres", "redis"]);
    expect(report.checks["postgres"]?.status).toBe("up");
    expect(report.checks["redis"]?.status).toBe("up");
  });

  it("aborts startup naming every offending value and never activates dependencies (R30.3)", async () => {
    const activate: ActivateDependencies = vi.fn(async () => {});
    const record = validConfigRecord();
    record["http.port"] = 999_999; // out of range → invalid
    delete record["redis.url"]; // → missing

    const error = await startApiService({
      configSource: objectConfigSource(record),
      activate,
    }).catch((e: unknown) => e as StartupConfigError);

    expect(error).toBeInstanceOf(StartupConfigError);
    const named = error.issues.map((i) => i.name);
    expect(named).toEqual(expect.arrayContaining(["http.port", "redis.url"]));
    for (const name of named) {
      expect(error.message).toContain(name);
    }
    // Startup aborted before touching any dependency → no requests served.
    expect(activate).not.toHaveBeenCalled();
  });

  it("reports a degraded readiness endpoint as soon as one dependency goes unreachable (R30.4)", async () => {
    const postgres = new FakeHaConnection({
      name: "postgres",
      initial: { ping: () => "rows" },
    });
    const redis = new FakeHaConnection({
      name: "redis",
      initial: { ping: () => "PONG" },
    });
    const registry = new HealthCheckRegistry();
    registerReadiness(registry, "postgres", new HaConnectionManager(postgres, { sleep: noSleep }));
    registerReadiness(registry, "redis", new HaConnectionManager(redis, { sleep: noSleep }));

    expect((await registry.runReadiness()).status).toBe("ok");

    // Redis drops out — the aggregate endpoint immediately flips to degraded.
    redis.setReachable(false);
    const report = await registry.runReadiness();
    expect(report.status).toBe("degraded");
    expect(report.checks["redis"]?.status).toBe("down");
    expect(report.checks["postgres"]?.status).toBe("up");
  });
});

describe("ops integration — HA reconnection resumes without restart (R30.5, R30.6)", () => {
  it("reconnects PostgreSQL HA on primary loss and resumes the same operation", async () => {
    // The primary drops the connection once; after StreetJS HA elects a new
    // primary the operation succeeds against the freshly-routed client.
    const postgres = new FakeHaConnection({
      name: "postgres",
      initial: flakyClient(1),
      reconnectsTo: { ping: () => "resumed-on-new-primary" },
    });
    const manager = createHaConnectionManager(postgres, { sleep: noSleep });

    await expect(manager.run((c) => c.ping())).resolves.toBe("resumed-on-new-primary");
    // Same manager instance recovered — no operator restart — and ends connected.
    expect(postgres.reconnectCalls).toBe(1);
    expect(manager.reconnectionCount()).toBe(1);
    expect(manager.currentState()).toBe("connected");
  });

  it("reconnects a Redis Cluster node on loss and keeps the readiness probe healthy afterwards", async () => {
    const redis = new FakeHaConnection({
      name: "redis",
      initial: flakyClient(1),
      reconnectsTo: { ping: () => "PONG" },
      reachable: false, // node is down until a reconnect heals the topology
    });
    const manager = createHaConnectionManager(redis, { sleep: noSleep });

    // Readiness is degraded while the node is unreachable.
    const registry = new HealthCheckRegistry();
    registerReadiness(registry, "redis", manager);
    expect((await registry.runReadiness()).status).toBe("degraded");

    // A served operation drives the reconnect, which heals the topology.
    await expect(manager.run((c) => c.ping())).resolves.toBe("PONG");
    expect(manager.reconnectionCount()).toBe(1);

    // Now the same probe reports ok — the service resumed without restart.
    expect((await registry.runReadiness()).status).toBe("ok");
  });

  it("surfaces CAPABILITY_UNAVAILABLE when reconnection cannot restore the connection", async () => {
    const postgres = new FakeHaConnection({
      name: "postgres",
      initial: flakyClient(Number.POSITIVE_INFINITY),
    });
    const manager = createHaConnectionManager(postgres, {
      sleep: noSleep,
      policy: { maxReconnectAttempts: 2, backoffMs: [1, 2] },
    });

    const error = await manager.run((c) => c.ping()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("CAPABILITY_UNAVAILABLE");
    expect((error as AppError).details).toMatchObject({ dependency: "postgres", attempts: 2 });
    expect(manager.currentState()).toBe("unavailable");
  });
});

/**
 * Attempt a TCP connection to `host:port`, resolving true when reachable and
 * false otherwise (including on timeout). Used to gate the real-dependency
 * checks so they run only where a live endpoint is actually present.
 */
function tcpReachable(host: string, port: number, timeoutMs = 1_000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    let settled = false;
    const done = (reachable: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/** Parse a `scheme://host:port/...` connection string into host+port. */
function hostPort(url: string, defaultPort: number): { host: string; port: number } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "localhost",
      port: parsed.port ? Number.parseInt(parsed.port, 10) : defaultPort,
    };
  } catch {
    return { host: "localhost", port: defaultPort };
  }
}

/**
 * Real-dependency integration: only meaningful where a live PostgreSQL/Redis is
 * reachable. Supply `STREETSTUDIO_IT_DATABASE_URL` / `STREETSTUDIO_IT_REDIS_URL`
 * to opt in; the test still skips gracefully when the endpoint is unreachable so
 * the suite stays green in environments without real dependencies.
 */
describe("ops integration — real dependencies (reachability-gated) (R30.4, R30.5)", () => {
  const dbUrl = process.env["STREETSTUDIO_IT_DATABASE_URL"];
  const redisUrl = process.env["STREETSTUDIO_IT_REDIS_URL"];

  it("reports the real dependency readiness through the framework registry when reachable", async (ctx) => {
    if (!dbUrl && !redisUrl) {
      ctx.skip();
      return;
    }

    const registry = new HealthCheckRegistry();
    if (dbUrl) {
      const { host, port } = hostPort(dbUrl, 5432);
      if (!(await tcpReachable(host, port))) {
        ctx.skip();
        return;
      }
      registry.addCheck(
        "postgres",
        async () =>
          (await tcpReachable(host, port))
            ? { status: "up" as const }
            : { status: "down" as const },
        { type: "readiness" },
      );
    }
    if (redisUrl) {
      const { host, port } = hostPort(redisUrl, 6379);
      if (!(await tcpReachable(host, port))) {
        ctx.skip();
        return;
      }
      registry.addCheck(
        "redis",
        async () =>
          (await tcpReachable(host, port))
            ? { status: "up" as const }
            : { status: "down" as const },
        { type: "readiness" },
      );
    }

    expect((await registry.runReadiness()).status).toBe("ok");
  });
});
