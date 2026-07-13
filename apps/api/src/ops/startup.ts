/**
 * API_Service startup sequencing (Requirements 30.2, 30.3).
 *
 * Startup does two things, in order:
 *
 *  1. Validates the required configuration through the `@streetstudio/config`
 *     loader. When any required value is missing or invalid, the loader throws
 *     a {@link StartupConfigError} whose message names EVERY offending value;
 *     startup aborts and the caller (the composition root) must refrain from
 *     serving requests (R30.3). Configuration validation reuses the shared
 *     `CONFIGURATION_INVALID` taxonomy — no new error codes are introduced.
 *
 *  2. Activates dependencies (connecting to PostgreSQL/Redis/storage, warming
 *     caches, etc.) behind an injectable seam, bounded by a startup deadline.
 *     When the operator's configuration is valid, activation is expected to
 *     complete — and the health check to report passing — within 60 seconds
 *     (R30.2). Exceeding the deadline aborts startup with a capability-
 *     unavailable error rather than serving a half-initialised service.
 *
 * Every collaborator (config source, clock, activation) is injected, so the
 * whole sequence is exercised with in-memory fakes and no real network.
 */
import { AppError } from "@streetstudio/shared";
import {
  loadPlatformConfig,
  type ConfigSource,
  type PlatformConfig,
} from "@streetstudio/config";

/** The R30.2 startup budget: startup must complete within 60 seconds. */
export const DEFAULT_STARTUP_DEADLINE_MS = 60_000;

/** Injectable time source so startup timing is deterministic in tests. */
export interface StartupClock {
  /** Current time in epoch milliseconds. */
  now(): number;
}

const systemClock: StartupClock = { now: () => Date.now() };

/**
 * Dependency activation step, run after configuration validates. Receives the
 * validated {@link PlatformConfig} and should resolve once every required
 * dependency is connected and ready. Kept as a seam so the composition root
 * supplies the concrete PostgreSQL/Redis/storage wiring while tests inject
 * fakes. Defaults to a no-op.
 */
export type ActivateDependencies = (config: PlatformConfig) => Promise<void>;

/** Inputs to {@link startApiService}. */
export interface StartupOptions {
  /** Source of configuration values (adapts the StreetJS config interface). */
  readonly configSource: ConfigSource;
  /**
   * Maximum time startup may take once configuration is valid, in
   * milliseconds. Defaults to {@link DEFAULT_STARTUP_DEADLINE_MS} (60s, R30.2).
   */
  readonly deadlineMs?: number;
  /** Time source; defaults to the system clock. */
  readonly clock?: StartupClock;
  /** Dependency activation; defaults to a no-op. */
  readonly activate?: ActivateDependencies;
}

/** The outcome of a successful startup. */
export interface StartupResult {
  /** The fully-validated platform configuration. */
  readonly config: PlatformConfig;
  /** Epoch milliseconds at which startup began. */
  readonly startedAt: number;
  /** Wall-clock milliseconds startup took (config validation + activation). */
  readonly durationMs: number;
}

/**
 * Run `work` but reject with a capability-unavailable error if it has not
 * settled within `deadlineMs`. The timer is unref'd so it never keeps the
 * process alive on its own.
 */
function withinDeadline<T>(work: Promise<T>, deadlineMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(
        new AppError("CAPABILITY_UNAVAILABLE", {
          details: {
            reason: `Startup did not complete within ${deadlineMs}ms`,
            deadlineMs,
          },
        }),
      );
    }, deadlineMs);
    // Node's Timeout exposes unref; guard for non-Node runtimes.
    (timer as { unref?: () => void }).unref?.();

    work.then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (reason: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(reason);
      },
    );
  });
}

/**
 * Start the API_Service: validate required configuration, then activate
 * dependencies within the startup deadline.
 *
 * @throws StartupConfigError when any required configuration value is missing
 *   or invalid — the message names every offending value and the caller must
 *   not serve requests (R30.3).
 * @throws AppError `CAPABILITY_UNAVAILABLE` when activation exceeds the deadline
 *   (R30.2), or whatever the activation step itself throws.
 */
export async function startApiService(
  options: StartupOptions,
): Promise<StartupResult> {
  const clock = options.clock ?? systemClock;
  const deadlineMs = options.deadlineMs ?? DEFAULT_STARTUP_DEADLINE_MS;
  const activate = options.activate ?? (async (): Promise<void> => {});

  const startedAt = clock.now();

  // 1. Validate configuration; abort (throw) naming every offending value.
  //    This runs before any dependency activation so an invalid deployment
  //    fails fast without opening connections (R30.3).
  const config = loadPlatformConfig(options.configSource);

  // 2. Activate dependencies within the startup budget (R30.2).
  await withinDeadline(activate(config), deadlineMs);

  const durationMs = clock.now() - startedAt;
  return { config, startedAt, durationMs };
}
