/**
 * Ambient type declaration for `ffprobe-static`, which ships no bundled types
 * and has no `@types/*` package. The module's default export is an object with
 * a single `path` property — the absolute path to the platform ffprobe binary
 * — which the composition root injects into the framework `MediaProcessor`
 * (ADR-0022 slice 4). Mirrors the shape of the installed package's `index.js`.
 */
declare module "ffprobe-static" {
  /** The default export: `{ path }` pointing at the bundled ffprobe binary. */
  const ffprobeStatic: {
    /** Absolute path to the platform-specific ffprobe executable. */
    readonly path: string;
  };
  export default ffprobeStatic;
}
