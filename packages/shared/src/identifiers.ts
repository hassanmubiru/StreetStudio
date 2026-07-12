/**
 * Cross-cutting scalar type aliases used throughout StreetStudio.
 *
 * Internal module: consumers must import these through the package entry point
 * (`@streetstudio/shared`), never directly.
 */

/** Universally-unique identifier used for all persisted entities. */
export type Uuid = string;

/** ISO-8601 timestamp string (e.g. "2024-01-01T00:00:00.000Z"). */
export type IsoTimestamp = string;
