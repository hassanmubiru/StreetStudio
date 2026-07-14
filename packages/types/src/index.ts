/**
 * @streetstudio/types
 *
 * Product-level shared type aliases used across the StreetStudio client
 * packages (player, editor, timeline, ui). Framework/wire types live in
 * `@streetstudio/shared`; these are UI/product primitives with no runtime code
 * and no dependencies.
 */
export const DOMAIN =
  "Product-level shared type aliases used across StreetStudio client packages." as const;

/** A position on a recording's timeline, in seconds. */
export type Seconds = number;

/** The kind of a creator-placed marker (press `M` while recording). */
export type MarkerKind = "marker" | "api" | "bug" | "decision" | "todo";

/** A minimal reference to a domain entity by id. */
export interface EntityRef {
  readonly id: string;
}
