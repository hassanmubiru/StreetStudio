/**
 * Dashboard edit-session controller: a client-side, undo/redo-capable wrapper
 * around the pure `@streetstudio/editor` reducer. It records an ordered list of
 * non-destructive {@link EditOperation}s over a source {@link Timeline} and
 * recomputes the resulting timeline via `applyEdits`. Entirely client-side —
 * there is no backend edit surface; edits are applied to a caller-supplied
 * source timeline (e.g. built from a recording).
 */
import type { Timeline } from "@streetstudio/timeline";
import type { EditOperation } from "@streetstudio/editor";
import { applyEdits } from "@streetstudio/editor";

/**
 * Holds a source timeline and an ordered operation list, with undo/redo. All
 * mutators return `this` for chaining; the source timeline is never mutated.
 */
export class EditSessionController {
  private ops: EditOperation[] = [];
  /** Operations removed by undo, available to redo (most-recent last). */
  private redoStack: EditOperation[] = [];

  constructor(private readonly source: Timeline) {}

  /** The operations applied so far, in order. */
  get operations(): readonly EditOperation[] {
    return this.ops;
  }

  /** Whether there is an operation to undo. */
  get canUndo(): boolean {
    return this.ops.length > 0;
  }

  /** Whether there is a previously-undone operation to redo. */
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * The resulting timeline after folding every recorded operation over the
   * source. Recomputed on demand from the pure reducer, so it always reflects
   * the current operation list.
   */
  get result(): Timeline {
    return applyEdits({ source: this.source, operations: this.ops });
  }

  /**
   * Append an operation. Validates it immediately by folding the new list
   * through the reducer; if the operation is invalid (e.g. an out-of-range
   * trim) the reducer throws and the operation is not recorded. A successful
   * apply clears the redo stack (a new branch of history).
   */
  apply(op: EditOperation): this {
    const next = [...this.ops, op];
    // Validate by attempting to fold; throws on an invalid operation.
    applyEdits({ source: this.source, operations: next });
    this.ops = next;
    this.redoStack = [];
    return this;
  }

  /** Undo the most recent operation, moving it onto the redo stack. */
  undo(): this {
    const last = this.ops.pop();
    if (last !== undefined) {
      this.redoStack.push(last);
    }
    return this;
  }

  /** Re-apply the most recently undone operation. */
  redo(): this {
    const op = this.redoStack.pop();
    if (op !== undefined) {
      this.ops.push(op);
    }
    return this;
  }

  /** Clear all operations and history, returning to the source timeline. */
  reset(): this {
    this.ops = [];
    this.redoStack = [];
    return this;
  }
}
