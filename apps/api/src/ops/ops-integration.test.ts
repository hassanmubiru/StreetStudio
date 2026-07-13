/**
 * Integration tests for the API_Service operational surface
 * (Requirements 30.2, 30.4, 30.5, 30.6).
 *
 * Where the pure-unit tests (startup.test.ts, health.test.ts, metrics.test.ts,
 * ha.test.ts) exercise each collaborator in isolation, these tests wire the
 * whole operational surface together end-to-end through its structural StreetJS
 * seams — configuration source, dependency activation, the health-check and
 * metrics interfaces, and the HA connection manager — and assert the composed
 * behaviour an operator actually observes:
 *
 *  (a) startup completes within the 60s budget on valid configuration and
 *      aborts naming every offending value on invalid configuration (R30.2/30.3);
 *  (b) the health endpoint reports passing only when every dependency probe is
 *      reachable, and failing as soon as one is not (R30.4);
 *  (c) metrics recorded while serving are published through the StreetJS metrics
 *      interface (R30.4);
 *  (d) the HA connection manager reconnects on PostgreSQL-primary / Redis-node
 *      loss and resumes serving without an operator restart (R30.5/30.6).
 *
 * Real PostgreSQL/Redis are not reachable in CI, so the wiring is exercised with
 * in-memory fakes behind the same seams the composition root adapts. A final
 * block opportunistically runs the health probe against real dependencies when
 * `STREETSTUDIO_IT_DATABASE_URL` / `STREETSTUDIO_IT_REDIS_URL` are supplied and
 * the endpoint is reachable, and skips gracefully otherwise.
 */
import { connect } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { objectConfigSource, StartupConfigError } from "@streetstudio/config";
import { AppError } from "@streetstudio/shared";
import { startApiService, type ActivateDependencies } from "./startup.js";
import {
  HealthChecker,
  exposeHealthCheck,
  probeFromHealthCheck,
  type DependencyProbe,
  type StreetHealthInterface,
} from "./health.js";
import {
  MetricsRegistry,
  exposeMetrics,
  type StreetMetricsInterface,
} from "./metrics.js";
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

/**
 * A composite in-memory StreetJS platform double implementing exactly the
 * health-check and metrics seams the ops surface depends on. Registered health
 * checks and reported metrics are captured for assertions, standing in for the
 * real StreetJS health/metrics endpoints.
 */
class FakeStreetPlatform implements StreetHealthInterface, StreetMetricsInterface {
  readonly healthChecks = new Map<string, () => Promise<boolean>>();
  readonly reportedCounters: Record<string, number> = {};
  readonly reportedGauges: Record<string, number> = {};

  registerHealthCheck(name: string, check: () => Promise<boolean>): void {
    this.healthChecks.set(name, check);
  }

  counter(name: string, value: number): void {
    this.reportedCounters[name] = value;
  }

  gauge(name: string, value: number): void {
    this.reportedGauges[name] = value;
  }

  /** Invoke a registered health check the way the platform endpoint would. */
  runHealthCheck(name: string): Promise<boolean> {
    const check = this.healthChecks.get(name);
    if (!check) {
      throw new Error(`no health check registered under "${name}"`);
    }
    return check();
  }
}

const fixedClock = { now: () => 1_000 };
const noSleep = () => Promise.resolve();

describe("ops integration — startup → health → metrics wiring (R30.2, R30.4)", () => {
  it("starts within the budget on valid config, then serves a passing health endpoint", async () => {
    const street = new FakeStreetPlatform();

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

    // With startup complete, wire the live probes into the StreetJS health seam.
    const checker = new HealthChecker(
      [
        probeFromHealthCheck("postgres", pgManager),
        probeFromHealthCheck("redis", redisManager),
      ],
      fixedClock,
    );
    exposeHealthCheck(street, checker, "api");

    // The registered endpoint reports healthy because every dependency is up.
    await expect(street.runHealthCheck("api")).resolves.toBe(true);
    const report = await checker.check();
    expect(report.status).toBe("passing");
    expect(report.dependencies.map((d) => d.name)).toEqual(["postgres", "redis"]);
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

  it("reports a failing health endpoint as soon as one dependency goes unreachable (R30.4)", async () => {
    const street = new FakeStreetPlatform();
    const postgres = new FakeHaConnection({
      name: "postgres",
      initial: { ping: () => "rows" },
    });
    const redis = new FakeHaConnection({
      name: "redis",
      initial: { ping: () => "PONG" },
    });
    const checker = new HealthChecker([
      probeFromHealthCheck("postgres", new HaConnectionManager(postgres, { sleep: noSleep })),
      probeFromHealthCheck("redis", new HaConnectionManager(redis, { sleep: noSleep })),
    ]);
    exposeHealthCheck(street, checker, "api");

    await expect(street.runHealthCheck("api")).resolves.toBe(true);

    // Redis drops out — the aggregate endpoint immediately flips to failing.
    redis.setReachable(false);
    await expect(street.runHealthCheck("api")).resolves.toBe(false);

    const report = await checker.check();
    expect(report.status).toBe("failing");
    expect(report.dependencies.find((d) => d.name === "redis")?.reachable).toBe(false);
    expect(report.dependencies.find((d) => d.name === "postgres")?.reachable).toBe(true);
  });

  it("publishes request/error/resource metrics through the StreetJS metrics seam (R30.4)", async () => {
    const street = new FakeStreetPlatform();
    const registry = new MetricsRegistry();

    // Simulate the host recording operational metrics while serving requests.
    registry.increment("http.requests", 42);
    registry.increment("http.errors", 3);
    registry.setGauge("db.connections", 7);

    const published = exposeMetrics(street, registry);

    expect(street.reportedCounters).toEqual({
      "http.requests": 42,
      "http.errors": 3,
    });
    expect(street.reportedGauges).toEqual({ "db.connections": 7 });
    expect(published).toEqual(registry.snapshot());
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

  it("reconnects a Redis Cluster node on loss and keeps the health probe healthy afterwards", async () => {
    const street = new FakeStreetPlatform();
    const redis = new FakeHaConnection({
      name: "redis",
      initial: flakyClient(1),
      reconnectsTo: { ping: () => "PONG" },
      reachable: false, // node is down until a reconnect heals the topology
    });
    const manager = createHaConnectionManager(redis, { sleep: noSleep });

    // Health is failing while the node is unreachable.
    const checker = new HealthChecker([probeFromHealthCheck("redis", manager)]);
    exposeHealthCheck(street, checker, "api");
    await expect(street.runHealthCheck("api")).resolves.toBe(false);

    // A served operation drives the reconnect, which heals the topology.
    await expect(manager.run((c) => c.ping())).resolves.toBe("PONG");
    expect(manager.reconnectionCount()).toBe(1);

    // Now the same probe reports healthy — the service resumed without restart.
    await expect(street.runHealthCheck("api")).resolves.toBe(true);
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

  it("reports the real dependency health through the StreetJS health seam when reachable", async (ctx) => {
    if (!dbUrl && !redisUrl) {
      ctx.skip();
      return;
    }

    const probes: DependencyProbe[] = [];
    if (dbUrl) {
      const { host, port } = hostPort(dbUrl, 5432);
      if (!(await tcpReachable(host, port))) {
        ctx.skip();
        return;
      }
      probes.push({ name: "postgres", check: async () => void (await tcpReachable(host, port)) });
    }
    if (redisUrl) {
      const { host, port } = hostPort(redisUrl, 6379);
      if (!(await tcpReachable(host, port))) {
        ctx.skip();
        return;
      }
      probes.push({ name: "redis", check: async () => void (await tcpReachable(host, port)) });
    }

    const street = new FakeStreetPlatform();
    const checker = new HealthChecker(probes);
    exposeHealthCheck(street, checker, "api");

    await expect(street.runHealthCheck("api")).resolves.toBe(true);
  });
});
