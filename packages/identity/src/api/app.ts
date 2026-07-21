/**
 * Composition root for the Identity API. Wires the real `PgPool`-backed member
 * repository into the service and mounts the public auth controller. No auth
 * middleware — these endpoints establish authentication.
 */
import "reflect-metadata";
import { streetApp, container, PgPool } from "streetjs";
import { MemberRepository } from "../persistence/member-repository.js";
import { IdentityService, type Clock } from "../application/identity-service.js";
import { IdentityController } from "./identity-controller.js";

type IdentityApp = ReturnType<typeof streetApp>;

export interface IdentityAppOptions {
  readonly jwtSecret: string;
  readonly port?: number;
  readonly host?: string;
  readonly clock?: Clock;
}

/** Register the IdentityService so the controller can resolve it. */
export function registerIdentity(pool: PgPool, jwtSecret: string, clock?: Clock): IdentityService {
  const service = new IdentityService(new MemberRepository(pool), jwtSecret, clock);
  container.register(IdentityService, service);
  return service;
}

/** Create a StreetJS app serving the public Identity (auth) API. */
export function createIdentityApp(pool: PgPool, options: IdentityAppOptions): IdentityApp {
  registerIdentity(pool, options.jwtSecret, options.clock);
  const app = streetApp({ port: options.port ?? 3000, host: options.host ?? "0.0.0.0" });
  app.registerController(IdentityController);
  return app;
}
