/**
 * @streetstudio/editor
 *
 * The browser editor model: non-destructive edit operations (trim, split,
 * merge, crop, speed, captions, annotations) expressed over a
 * `@streetstudio/timeline` `Timeline`. Pure model types; rendering/UI live in
 * the dashboard and `@streetstudio/ui`.
 */
import type { Seconds } from "@streetstudio/types";
import type { Timeline } from "@streetstudio/timeline";

export const DOMAIN =
  "Browser editor model: trim, split, merge, crop, speed, captions, and annotations over a timeline." as const;

/** A non-destructive edit operation applied to a timeline. */
export type EditOperation =
  | { readonly op: "trim"; readonly startSeconds: Seconds; readonly endSeconds: Seconds }
  | { readonly op: "split"; readonly atSeconds: Seconds }
  | { readonly op: "merge"; readonly clipIds: readonly string[] }
  | { readonly op: "crop"; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  | { readonly op: "speed"; readonly factor: number }
  | { readonly op: "caption"; readonly atSeconds: Seconds; readonly text: string }
  | { readonly op: "annotate"; readonly atSeconds: Seconds; readonly kind: "arrow" | "text" | "blur" | "zoom" };

/** An ordered edit list applied to a source timeline to produce the result. */
export interface EditSession {
  readonly source: Timeline;
  readonly operations: readonly EditOperation[];
}
