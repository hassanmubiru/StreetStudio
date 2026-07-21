/**
 * Composition root for the Playback API. Wires a real object `Storage` and the
 * uploads repository (over a real `PgPool`) into the service, applies JWT auth,
 * and mounts the controller.
 */
import "reflect-metadata";
import { streetApp, container, PgPool } from "streetjs";
import { jwtAuth } from "@streetstudio/identity";
import type { Storage } from "@streetjs/storage";
import { UploadSessionRepository } from "@streetstudio/uploads";
import { PlaybackService } from "../application/playback-service.js";
import { PlaybackController } from "./playback-controller.js";

type PlaybackApp = ReturnType<typeof streetApp>;

export interface PlaybackAppOptions {
  readonly jwtSecret: string;
  readonly port?: number;
  readonly host?: string;
}

/** Register the PlaybackService so the controller can resolve it. */
export function registerPlayback(pool: PgPool, storage: Storage): PlaybackService {
  const service = new PlaybackService(storage, new UploadSessionRepository(pool));
  container.register(PlaybackService, service);
  return service;
}

/** Create a StreetJS app serving the Playback API, backed by `pool` + `storage`. */
export function createPlaybackApp(
  pool: PgPool,
  storage: Storage,
  options: PlaybackAppOptions,
): PlaybackApp {
  registerPlayback(pool, storage);
  const app = streetApp({ port: options.port ?? 3000, host: options.host ?? "0.0.0.0" });
  app.use(jwtAuth(options.jwtSecret));
  app.registerController(PlaybackController);
  return app;
}
