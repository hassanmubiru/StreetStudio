/**
 * @streetstudio/shared
 *
 * Public entry point for cross-cutting types, DTOs, errors, and constants.
 * This is the ONLY module other packages may import from. Internal modules
 * are not part of the public surface and must not be imported directly.
 */

/** Marker identifying the primary domain responsibility of this package. */
export const DOMAIN =
  "Cross-cutting types, DTOs, errors, and constants shared across all packages." as const;

/** Universally-unique identifier used for all persisted entities. */
export type Uuid = string;

/** ISO-8601 timestamp string. */
export type IsoTimestamp = string;
