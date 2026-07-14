/**
 * Editor model types: the non-destructive edit operations expressed over a
 * {@link Timeline}. Pure data; the reducer lives in `apply.ts`.
 */
import type { Seconds } from "@streetstudio/types";
import type { Timeline } from "@streetstudio/timeline";

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

/**
 * Operations that change the timeline's *structure* (clips/duration/markers).
 * The remaining operations (`crop`, `caption`, `annotate`) are non-structural
 * overlays resolved at render time and pass the timeline through unchanged.
 */
export const STRUCTURAL_OPS: ReadonlySet<EditOperation["op"]> = new Set([
  "trim",
  "split",
  "merge",
  "speed",
]);
