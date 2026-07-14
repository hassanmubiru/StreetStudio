/**
 * street.config.ts — StreetStudio composition root (template).
 *
 * This is where StreetStudio will assemble the StreetJS building blocks it
 * consumes as published packages (ADR-0011 / ADR-0012). It is intentionally a
 * documented template, NOT part of the build: the granular `@streetjs/*`
 * packages are not published yet, so the real imports are shown commented and
 * the config is a plain object today. When a `@streetjs/*` package ships,
 * uncomment its import and wire it here — the domain packages already sit behind
 * adapter seams, so nothing else changes.
 *
 * StreetStudio consumes StreetJS ONLY as published, versioned packages — no
 * path/link/workspace/git/url references and no framework internals
 * (enforced by `npm run streetjs:check`).
 */

// --- StreetJS building blocks (uncomment as each package is published) -------
// import { createApp } from "streetjs";
// import { auth } from "@streetjs/auth";
// import { postgres } from "@streetjs/postgres";
// import { redis } from "@streetjs/redis";
// import { websocket } from "@streetjs/websocket";
// import { storage } from "@streetjs/storage";
// import { jobs } from "@streetjs/jobs";
// import { events } from "@streetjs/events";
// import { rateLimit } from "@streetjs/rate-limit";
// import { otel } from "@streetjs/otel";
// import { logger } from "@streetjs/logger";
// import { cache } from "@streetjs/cache";

/** Intended StreetStudio ⇄ StreetJS composition (see docs/DECISIONS.md ADR-0012). */
export const streetConfig = {
  app: "streetstudio",
  /**
   * Framework capabilities StreetStudio consumes from StreetJS packages. Values
   * are the target package names; the wiring is added here once each is
   * published and StreetStudio upgrades to it (promotion-first, ADR-0011).
   */
  framework: {
    core: "streetjs",
    auth: "@streetjs/auth",
    database: "@streetjs/postgres",
    redis: "@streetjs/redis",
    cache: "@streetjs/cache",
    websocket: "@streetjs/websocket",
    events: "@streetjs/events",
    jobs: "@streetjs/jobs",
    storage: "@streetjs/storage",
    media: "@streetjs/media",
    rateLimit: "@streetjs/rate-limit",
    observability: "@streetjs/otel",
    logger: "@streetjs/logger",
    cli: "@streetjs/cli",
  },
  /** Product-specific domains that stay in StreetStudio (never promoted). */
  product: [
    "recording",
    "projects",
    "media",
    "player",
    "editor",
    "timeline",
    "comments",
    "search",
    "knowledge",
    "notifications",
    "analytics",
    "integrations",
  ],
} as const;

export default streetConfig;
