/**
 * @streetstudio/shared/testing
 *
 * Test-only entry point re-exporting the shared `fast-check` generators. This
 * is kept separate from the package's runtime entry point so `fast-check` is
 * never pulled into production code.
 */

export * from "./generators.js";
