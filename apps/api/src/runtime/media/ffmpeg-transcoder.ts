/**
 * A concrete {@link Transcoder} implemented with the real ffmpeg binary from
 * `ffmpeg-static`.
 *
 * ── Composition-root / vendor-adapter decision ──────────────────────────────
 * `packages/processing` deliberately keeps the {@link Transcoder} seam abstract:
 * "concrete ffmpeg/vendor implementations live outside core and are wired in by
 * the worker composition root". This adapter is that concrete implementation,
 * so it lives here in `apps/api` (the composition root), next to the S3 driver,
 * and is the only place that spawns ffmpeg. The core pipeline stays free of any
 * vendor/media coupling.
 *
 * {@link FfmpegTranscoder.transcode} performs real work end-to-end:
 *  1. Downloads the source object from storage to a temp file.
 *  2. Spawns the ffmpeg-static binary to produce (a) one thumbnail JPEG at ~1s,
 *     (b) a preview clip clamped to 3–10s, and (c) three ABR renditions
 *     (1080p/720p/480p, real bitrates), each as MP4.
 *  3. Uploads every output to storage under deterministic keys and returns the
 *     object keys + bitrates.
 *
 * Any ffmpeg invocation that exits non-zero rejects the returned promise, which
 * the {@link MediaPipeline} treats as a failed attempt (retried within its
 * bounded budget, then recorded as `failed` with the source retained).
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StorageDriver } from "@streetjs/storage";
import {
  MAX_PREVIEW_SECONDS,
  MIN_PREVIEW_SECONDS,
  type TranscodeOutput,
  type TranscodeRendition,
  type TranscodeSource,
  type Transcoder,
} from "@streetstudio/processing";

/** Record of a single ffmpeg invocation, surfaced for evidence/logging. */
export interface FfmpegInvocation {
  /** Short label of the output being produced (e.g. `thumbnail`, `720p`). */
  readonly label: string;
  /** The full argument vector passed to ffmpeg. */
  readonly args: readonly string[];
  /** The process exit code (0 = success). */
  readonly exitCode: number;
}

/** Dependencies for {@link FfmpegTranscoder}. */
export interface FfmpegTranscoderDeps {
  /** Storage driver used to read the source and write derivatives. */
  readonly storage: StorageDriver;
  /** Absolute path to the ffmpeg binary (e.g. from `ffmpeg-static`). */
  readonly ffmpegPath: string;
  /** Storage key prefix for derivatives; defaults to `derivatives`. */
  readonly keyPrefix?: string;
  /** Optional hook invoked after each ffmpeg run, for evidence/telemetry. */
  readonly onInvocation?: (invocation: FfmpegInvocation) => void;
}

/** One rendition's encode profile: label, scaled height, and target bitrate. */
interface RenditionProfile {
  readonly quality: string;
  readonly height: number;
  readonly bitrate: number;
}

/**
 * The three adaptive-bitrate rendition profiles (R8.4 requires ≥3). Real,
 * distinct bitrates spanning 1080p → 480p.
 */
const RENDITION_PROFILES: readonly RenditionProfile[] = [
  { quality: "1080p", height: 1080, bitrate: 5_000_000 },
  { quality: "720p", height: 720, bitrate: 2_800_000 },
  { quality: "480p", height: 480, bitrate: 1_400_000 },
];

/**
 * Clamp the preview length to the pipeline's permitted 3–10 second window
 * (R8.3), based on the (integer floor of the) source duration.
 */
export function clampPreviewSeconds(durationSeconds: number): number {
  const floored = Math.floor(
    Number.isFinite(durationSeconds) ? durationSeconds : 0,
  );
  return Math.min(MAX_PREVIEW_SECONDS, Math.max(MIN_PREVIEW_SECONDS, floored));
}

/** A concrete ffmpeg-backed {@link Transcoder}. */
export class FfmpegTranscoder implements Transcoder {
  private readonly storage: StorageDriver;
  private readonly ffmpegPath: string;
  private readonly keyPrefix: string;
  private readonly onInvocation:
    | ((invocation: FfmpegInvocation) => void)
    | undefined;

  constructor(deps: FfmpegTranscoderDeps) {
    this.storage = deps.storage;
    this.ffmpegPath = deps.ffmpegPath;
    this.keyPrefix = deps.keyPrefix ?? "derivatives";
    this.onInvocation = deps.onInvocation;
  }

  /** Produce a thumbnail, preview, and three ABR renditions from the source. */
  async transcode(source: TranscodeSource): Promise<TranscodeOutput> {
    if (!source.sourceObjectKey) {
      throw new Error("transcode: source has no sourceObjectKey");
    }

    const workDir = await mkdtemp(join(tmpdir(), "streetstudio-transcode-"));
    try {
      // 1. Download the source to a local temp file.
      const fetched = await this.storage.get(source.sourceObjectKey);
      if (!fetched.found) {
        throw new Error(
          `transcode: source object not found: ${source.sourceObjectKey}`,
        );
      }
      const sourcePath = join(workDir, "source.mp4");
      await writeFile(sourcePath, fetched.bytes);

      const base = `${this.keyPrefix}/${source.videoId}`;
      const previewSeconds = clampPreviewSeconds(source.durationSeconds);
      // Seek the thumbnail to ~1s, but never past the clip for very short input.
      const thumbSeek = source.durationSeconds > 1 ? 1 : 0;

      // 2a. Thumbnail — a single JPEG frame.
      const thumbnailPath = join(workDir, "thumbnail.jpg");
      await this.runFfmpeg("thumbnail", [
        "-y",
        "-ss",
        String(thumbSeek),
        "-i",
        sourcePath,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        thumbnailPath,
      ]);

      // 2b. Preview — a 3–10s clip with real re-encode (video + audio).
      const previewPath = join(workDir, "preview.mp4");
      await this.runFfmpeg("preview", [
        "-y",
        "-i",
        sourcePath,
        "-t",
        String(previewSeconds),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        previewPath,
      ]);

      // 2c. Three ABR renditions at descending resolutions/bitrates.
      const renditionOutputs: { profile: RenditionProfile; path: string }[] =
        [];
      for (const profile of RENDITION_PROFILES) {
        const outPath = join(workDir, `${profile.quality}.mp4`);
        await this.runFfmpeg(profile.quality, [
          "-y",
          "-i",
          sourcePath,
          // scale=-2:H keeps the aspect ratio and forces even width.
          "-vf",
          `scale=-2:${profile.height}`,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-b:v",
          String(profile.bitrate),
          "-maxrate",
          String(profile.bitrate),
          "-bufsize",
          String(profile.bitrate * 2),
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          outPath,
        ]);
        renditionOutputs.push({ profile, path: outPath });
      }

      // 3. Upload every derivative under deterministic keys.
      const thumbnailKey = `${base}/thumbnail.jpg`;
      const previewKey = `${base}/preview.mp4`;
      await this.uploadFile(thumbnailKey, thumbnailPath, "image/jpeg");
      await this.uploadFile(previewKey, previewPath, "video/mp4");

      const renditions: TranscodeRendition[] = [];
      for (const { profile, path } of renditionOutputs) {
        const key = `${base}/${profile.quality}.mp4`;
        await this.uploadFile(key, path, "video/mp4");
        renditions.push({
          quality: profile.quality,
          objectKey: key,
          bitrate: profile.bitrate,
        });
      }

      return {
        thumbnail: { objectKey: thumbnailKey },
        preview: { objectKey: previewKey, durationSeconds: previewSeconds },
        renditions,
      };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  /* --------------------------- internals ------------------------------- */

  /** Read a produced file and upload it to storage under `key`. */
  private async uploadFile(
    key: string,
    path: string,
    contentType: string,
  ): Promise<void> {
    const bytes = await readFile(path);
    await this.storage.put(key, new Uint8Array(bytes), { contentType });
  }

  /**
   * Spawn ffmpeg with `args`, resolving on exit code 0 and rejecting otherwise.
   * The invocation (args + exit code) is reported through `onInvocation` for
   * evidence, and ffmpeg's stderr tail is attached to the rejection.
   */
  private runFfmpeg(label: string, args: readonly string[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(this.ffmpegPath, args as string[], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => reject(error));
      child.on("close", (code) => {
        const exitCode = code ?? -1;
        this.onInvocation?.({ label, args, exitCode });
        if (exitCode === 0) {
          resolve();
          return;
        }
        reject(
          new Error(
            `ffmpeg(${label}) exited with code ${exitCode}: ${stderr
              .split("\n")
              .slice(-8)
              .join("\n")}`,
          ),
        );
      });
    });
  }
}
