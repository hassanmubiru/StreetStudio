/**
 * UUID identifier generation for persisted entities.
 *
 * Every StreetStudio entity uses a UUID primary key (see the Data Models
 * section of the design). Identifiers are generated application-side so a row's
 * identity is known before it is written, which keeps inserts single-round-trip
 * and lets callers wire up associations without a read-back.
 */
import { randomUUID } from "node:crypto";
import type { Uuid } from "@streetstudio/shared";

/** Canonical RFC-4122 UUID matcher (any version), case-insensitive. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Generate a fresh, random {@link Uuid} for a new entity. */
export function newUuid(): Uuid {
  return randomUUID();
}

/** True when `value` is a syntactically valid UUID string. */
export function isUuid(value: unknown): value is Uuid {
  return typeof value === "string" && UUID_RE.test(value);
}
