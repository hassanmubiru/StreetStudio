/**
 * Composition root for the Uploads API. Wires the real StreetJS `PgPool` and a
 * real object `Storage` into the service, registers it, applies JWT auth, and
 * mounts the controller. Product composition only.
 */
import "reflect-metadata";
import { streetApp, container, PgPool } from "streetjs";
import { jwtAuth } from "@streetstudio/identity";
import type { Storage } from "@streetjs/storage";
import { UploadSessionRepository } from "../persistence/upload-session-repository.js";
import { UploadService, type Clock } from "../application/upload-service.js";
import { UploadsController } from "./uploads-controller.js";

type UploadsApp = ReturnType<typeof streetApp>;

export interface UploadsAppOptions {
  readonly jwtSecret: string;
  readonly port?: number;
  readonly host?: string;
  readonly clock?: Clock;
  /** Larger default body limit so base64 part payloads fit. */
  readonly maxBodyBytes?: number;
}

/** Register the UploadService (pool + storage) so the controller can resolve it. */
export function registerUploads(pool: PgPool, storage: Storage, clock?: Clock): UploadService {
  const service = new UploadService(new UploadSessionRepository(pool), storage, clock);
  container.register(UploadService, service);
  return service;
}

/** Create a StreetJS app serving the Uploads API, backed by `pool` + `storage`. */
export function createUploadsApp(
  pool: PgPool,
  storage: Storage,
  options: UploadsAppOptions,
): UploadsApp {
  registerUploads(pool, storage, options.clock);
  const app = streetApp({
    port: options.port ?? 3000,
    host: options.host ?? "0.0.0.0",
    maxBodyBytes: options.maxBodyBytes ?? 16 * 1024 * 1024,
  });
  app.use(authMiddleware(new JwtService(options.jwtSecret)));
  app.registerController(UploadsController);
  return app;
}
