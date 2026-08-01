/**
 * A concrete {@link Transcoder} backed by the **published** `@streetjs/media`
 * processor (ADR-0022 slice 4).
 *
 * ── Ownership ────────────────────────────────────────────────────────────────
 * Media processing — ffmpeg/ffprobe argument construction, transcoding,
 * thumbnail extraction, HLS, probing — is reusable infrastructure owned by the
 * framework (`@streetjs/media`). This adapter no longer spawns ffmpeg or builds
 * ffmpeg arguments itself; it drives the framework's {@link MediaProcessor} over
 * a {@link NodeCommandRunner}. The product retains only what is genuinely its
 * own concern: the ABR/preview/thumbnail **recipe** (which renditions, preview
 * length, thumbnail time), the deterministic storage **key layout**, and the
 * storage get/put glue over the framework {@link StorageDriver}.
 *
 * The ffmpeg/ffprobe **binaries** are supplied by the composition root
 * (`ffmpeg-static` / `ffprobe-static`) — the framework's injectable-runner
 * extension point, exactly analogous to providing the AWS SDK to the framework
 * storage driver. No ffmpeg process is spawned in product code.
 *
 * {@link FfmpegTranscoder.transcode}:
 *  1. Downloads the source object from storage to a temp file.
 *  2. Uses {@link MediaProcessor} to produce one thumbnail JPEG (~1s), a preview
 *     clip clamped to 3–10s, and three ABR renditions (1080p/720p/480p).
 *  3. Uploads every output to storage under deterministic keys and returns the
 *     object keys + bitrates. A failed operation throws, which the
 *     {@link MediaPipeline} treats as a failed attempt (bounded retry, then
 *     `failed` with the source retained).
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MediaProcessor, NodeCommandRunner } from "@streetjs/media";
import type { StorageDriver } from "@streetjs/storage";
import {
  MAX_PREVIEW_SECONDS,
  MIN_PREVIEW_SECONDS,
  type TranscodeOutput,
  type TranscodeRendition,
  type TranscodeSource,
  type Transcoder,
} from "@streetstudio/processing";

/** Record of a single media operation, surfaced for evidence/logging. */
export interface FfmpegInvocation {
  /** Short label of the output being produced (e.g. `thumbnail`, `720p`). */
  readonly label: string;
  /** The full argument vector the framework passed to ffmpeg. */
  readonly args: readonly string[];
  /** The process exit code (0 on success; failures throw before this fires). */
  readonly exitCode: number;
}

/** Dependencies for {@link FfmpegTranscoder}. */
export interface FfmpegTranscoderDeps {
  /** Storage driver used to read the source and write derivatives. */
  readonly storage: StorageDriver;
  /** Absolute path to the ffmpeg binary (e.g. from `ffmpeg-static`). */
  readonly ffmpegPath: string;
  /** Absolute path to the ffprobe binary (e.g. from `ffprobe-static`). */
  readonly ffprobePath: string;
  /** Storage key prefix for derivatives; defaults to `derivatives`. */
  readonly keyPrefix?: string;
  /** Optional hook invoked after each media op, for evidence/telemetry. */
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

/** ffmpeg bitrate string (e.g. `5000k`) for a bits-per-second value. */
function kbps(bitsPerSecond: number): string {
  return `${Math.round(bitsPerSecond / 1000)}k`;
}

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

/** A concrete {@link Transcoder} driving the framework {@link MediaProcessor}. */
export class FfmpegTranscoder implements Transcoder {
  private readonly storage: StorageDriver;
  private readonly processor: MediaProcessor;
  private readonly keyPrefix: string;
  private readonly onInvocation:
    | ((invocation: FfmpegInvocation) => void)
    | undefined;

  constructor(deps: FfmpegTranscoderDeps) {
    this.storage = deps.storage;
    this.processor = new MediaProcessor({
      ffmpegPath: deps.ffmpegPath,
      ffprobePath: deps.ffprobePath,
      runner: new NodeCommandRunner(),
    });
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
      if (!fetched.found || !fetched.bytes) {
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

      // 2a. Thumbnail — a single JPEG frame (framework ffmpeg).
      const thumbnailPath = join(workDir, "thumbnail.jpg");
      this.report(
        "thumbnail",
        await this.processor.thumbnail(sourcePath, thumbnailPath, {
          atSeconds: thumbSeek,
        }),
      );

      // 2b. Preview — a 3–10s re-encoded clip (video + audio).
      const previewPath = join(workDir, "preview.mp4");
      this.report(
        "preview",
        await this.processor.transcode(sourcePath, previewPath, {
          videoCodec: "libx264",
          audioCodec: "aac",
          preset: "veryfast",
          extraArgs: ["-t", String(previewSeconds), "-movflags", "+faststart"],
        }),
      );

      // 2c. Three ABR renditions at descending resolutions/bitrates.
      const renditionOutputs: { profile: RenditionProfile; path: string }[] =
        [];
      for (const profile of RENDITION_PROFILES) {
        const outPath = join(workDir, `${profile.quality}.mp4`);
        this.report(
          profile.quality,
          await this.processor.transcode(sourcePath, outPath, {
            videoCodec: "libx264",
            audioCodec: "aac",
            preset: "veryfast",
            height: profile.height,
            videoBitrate: kbps(profile.bitrate),
            extraArgs: [
              "-maxrate",
              kbps(profile.bitrate),
              "-bufsize",
              kbps(profile.bitrate * 2),
              "-movflags",
              "+faststart",
            ],
          }),
        );
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

  /**
   * Probe the integer-second duration of a stored media object via the
   * framework's ffprobe wrapper. Returns 0 when it cannot be determined
   * (best-effort; never throws).
   */
  async probeDurationSeconds(objectKey: string): Promise<number> {
    const fetched = await this.storage.get(objectKey);
    if (!fetched.found || !fetched.bytes) {
      return 0;
    }
    const workDir = await mkdtemp(join(tmpdir(), "streetstudio-probe-"));
    try {
      const path = join(workDir, "probe.bin");
      await writeFile(path, fetched.bytes);
      const info = await this.processor.probe(path);
      const duration = info.duration;
      return Number.isFinite(duration) ? Math.floor(duration) : 0;
    } catch {
      return 0;
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  /* --------------------------- internals ------------------------------- */

  /** Surface a completed media operation through the evidence hook. */
  private report(label: string, result: { args: string[] }): void {
    this.onInvocation?.({ label, args: result.args, exitCode: 0 });
  }

  /** Read a produced file and upload it to storage under `key`. */
  private async uploadFile(
    key: string,
    path: string,
    contentType: string,
  ): Promise<void> {
    const bytes = await readFile(path);
    await this.storage.put(key, new Uint8Array(bytes), { contentType });
  }
}
