/**
 * Composition root for the Recordings API. Wires the real StreetJS `PgPool` into
 * the repository + service, registers the service in the DI container, and
 * returns a StreetJS app with the controller mounted. Product composition only —
 * no framework reimplementation.
 */
import "reflect-metadata";
import { streetApp, container, PgPool, JwtService, authMiddleware } from "streetjs";
import { RecordingRepository } from "../persistence/recording-repository.js";
import { RecordingService, type Clock } from "../application/recording-service.js";
import { RecordingsController } from "./recordings-controller.js";

/** The concrete app type returned by `streetApp` (exposes `.server`). */
type RecordingsApp = ReturnType<typeof streetApp>;

/** Options for {@link createRecordingsApp}. */
export interface RecordingsAppOptions {
  /**
   * JWT signing secret. A verified `Authorization: Bearer <token>` populates the
   * authenticated member (`ctx.user`, `sub` = member id). Required — the API
   * authenticates every request.
   */
  readonly jwtSecret: string;
  readonly port?: number;
  readonly host?: string;
  readonly clock?: Clock;
}

/**
 * Build the RecordingService over a live pool and register it so the controller
 * (instantiated by the framework) can resolve it. Returns the service for tests.
 */
export function registerRecordings(pool: PgPool, clock?: Clock): RecordingService {
  const service = new RecordingService(new RecordingRepository(pool), clock);
  container.register(RecordingService, service);
  return service;
}

/** Create a StreetJS app serving the Recordings API, backed by `pool`. */
export function createRecordingsApp(
  pool: PgPool,
  options?: { port?: number; host?: string; clock?: Clock },
): RecordingsApp {
  registerRecordings(pool, options?.clock);
  const app = streetApp({
    port: options?.port ?? 3000,
    host: options?.host ?? "0.0.0.0",
  });
  app.registerController(RecordingsController);
  return app;
}
