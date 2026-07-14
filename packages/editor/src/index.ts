/**
 * @streetstudio/editor
 *
 * The browser editor model: non-destructive edit operations (trim, split,
 * merge, crop, speed, captions, annotations) expressed over a
 * `@streetstudio/timeline` `Timeline`, plus the pure reducer that applies them.
 * Rendering/UI live in the dashboard and `@streetstudio/ui`.
 */
export const DOMAIN =
  "Browser editor model: trim, split, merge, crop, speed, captions, and annotations over a timeline." as const;

export type { EditOperation, EditSession } from "./model.js";
export { STRUCTURAL_OPS } from "./model.js";
export { applyEdit, applyEdits } from "./apply.js";
