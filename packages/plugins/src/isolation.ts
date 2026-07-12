/**
 * Plugin isolation: builds the read-only, guarded execution context handed to
 * each plugin.
 *
 * A plugin must run in an isolated context that has no write access to platform
 * core code (R21.6). Any attempt to mutate the exposed core surface is denied
 * and recorded, identifying the offending plugin (R21.7). We enforce this with
 * a deeply-guarded {@link Proxy}: reads pass through (nested objects are wrapped
 * on access so writes cannot reach them either), while every `set`,
 * `deleteProperty`, and `defineProperty` is intercepted, recorded via a sink,
 * and rejected.
 *
 * Internal module: import through the package entry point (`@streetstudio/plugins`).
 */
import type {
  CoreModificationAttempt,
  CoreMutationOperation,
  CoreSurface,
  PluginContext,
} from "./types.js";

/** Sink invoked with each denied core-modification attempt. */
export type AttemptSink = (attempt: CoreModificationAttempt) => void;

/** Current ISO timestamp; isolated for testability. */
function now(): string {
  return new Date().toISOString();
}

/**
 * Record a denied mutation attempt against the sink. Never throws so that a
 * faulty sink cannot become a covert write channel.
 */
function record(
  sink: AttemptSink,
  pluginId: string,
  property: PropertyKey,
  operation: CoreMutationOperation
): void {
  try {
    sink({
      pluginId,
      property: String(property),
      operation,
      at: now(),
    });
  } catch {
    // A misbehaving sink must not affect isolation semantics.
  }
}

/**
 * Wrap a value in a deny-write proxy when it is a non-null object or function;
 * primitives are returned as-is (they are immutable). Nested objects returned
 * from reads are wrapped on access so a plugin cannot mutate them either.
 */
function guard(
  value: unknown,
  pluginId: string,
  sink: AttemptSink,
  path: string
): unknown {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value;
  }

  return new Proxy(value as object, {
    get(target, prop, receiver) {
      const child = Reflect.get(target, prop, receiver);
      const childPath = path === "" ? String(prop) : `${path}.${String(prop)}`;
      return guard(child, pluginId, sink, childPath);
    },
    set(_target, prop, _newValue) {
      const childPath = path === "" ? String(prop) : `${path}.${String(prop)}`;
      record(sink, pluginId, childPath, "set");
      // Deny the write: the trap never forwards to the target, so core is left
      // unchanged. We report success (return true) so the denial is silent and
      // does not crash the plugin; the attempt is already recorded (R21.6, R21.7).
      return true;
    },
    deleteProperty(_target, prop) {
      const childPath = path === "" ? String(prop) : `${path}.${String(prop)}`;
      record(sink, pluginId, childPath, "delete");
      // Deny the delete without forwarding to the target.
      return true;
    },
    defineProperty(_target, prop, _descriptor) {
      const childPath = path === "" ? String(prop) : `${path}.${String(prop)}`;
      record(sink, pluginId, childPath, "defineProperty");
      // Deny the (re)definition without forwarding to the target.
      return true;
    },
    setPrototypeOf() {
      record(sink, pluginId, "[[Prototype]]", "set");
      // Deny the prototype change without forwarding to the target.
      return true;
    },
  });
}

/**
 * Build a guarded, read-only view of `core` for the given plugin. Reads succeed;
 * any mutation is denied and recorded via `sink` (R21.6, R21.7).
 */
export function guardCore(
  core: Record<string, unknown>,
  pluginId: string,
  sink: AttemptSink
): CoreSurface {
  return guard(core, pluginId, sink, "") as CoreSurface;
}

/**
 * Create the isolated {@link PluginContext} for a plugin. The context exposes
 * only the plugin's identity and a guarded, read-only view of core; there is no
 * path through it to write platform core code (R21.6).
 */
export function createPluginContext(
  pluginId: string,
  core: Record<string, unknown>,
  sink: AttemptSink
): PluginContext {
  return Object.freeze({
    pluginId,
    core: guardCore(core, pluginId, sink),
  });
}
