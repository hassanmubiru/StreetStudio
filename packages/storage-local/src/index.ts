/**
 * @streetstudio/storage-local
 *
 * Local filesystem {@link StorageProvider} delivered as an isolated plugin
 * (Requirement 9.2). It implements the storage contract from
 * `@streetstudio/media` (`put`/`get`/`signUploadTarget`/`healthCheck`/`id`) and
 * the {@link Plugin} contract from `@streetstudio/plugins` (type `"storage"`),
 * so it is discovered/loaded through the StreetJS plugin loader like any other
 * plugin. No provider is imported into platform core — the implementation lives
 * entirely inside this plugin package.
 *
 * This provider is fully functional: objects are persisted as files under a
 * configured base directory. Keys are sanitized so a write or read can never
 * escape the base directory.
 */
import {
  createReadStream,
  createWriteStream,
  constants as fsConstants,
} from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
  ObjectStream,
  PutResult,
  SignedTarget,
  StorageProvider,
} from "@streetstudio/media";
import type { Capability, Plugin, PluginContext } from "@streetstudio/plugins";

export const DOMAIN = "Local filesystem storage provider plugin." as const;

/** Stable identifier for the Local storage provider plugin. */
export const LOCAL_STORAGE_PLUGIN_ID = "streetstudio.storage.local";

/** Capability id registered by the Local storage plugin on activation. */
export const LOCAL_STORAGE_CAPABILITY_ID = "storage.local";

/** Default provider id when none is supplied. */
export const DEFAULT_LOCAL_PROVIDER_ID = "local";

/** Minimal injectable time source, so signed-target expiry is deterministic. */
export interface StorageClock {
  now(): Date;
}

const systemClock: StorageClock = { now: () => new Date() };

/** Configuration for the Local filesystem storage provider. */
export interface LocalStorageConfig {
  /** Stable provider identifier; recorded on write failures. */
  readonly id?: string;
  /** Absolute (or process-relative) base directory objects are stored under. */
  readonly baseDir: string;
  /** Time source for signed-target issue/expiry; defaults to the system clock. */
  readonly clock?: StorageClock;
}

/**
 * Reject keys that could escape the base directory. A valid key is a
 * forward-slash-delimited relative path with no `..` segments, no leading
 * separator, and no NUL bytes.
 */
function assertSafeKey(key: string): void {
  if (
    key.length === 0 ||
    key.includes("\0") ||
    key.startsWith("/") ||
    key.startsWith("\\") ||
    path.isAbsolute(key)
  ) {
    throw new Error(`invalid storage key: ${JSON.stringify(key)}`);
  }
  const segs = key.split(/[\\/]+/);
  if (segs.some((s) => s === "..")) {
    throw new Error(`storage key may not contain "..": ${JSON.stringify(key)}`);
  }
}

/** Resolve `key` to an absolute path guaranteed to live under `baseDir`. */
function resolveKey(baseDir: string, key: string): string {
  assertSafeKey(key);
  const root = path.resolve(baseDir);
  const full = path.resolve(root, key);
  const rel = path.relative(root, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`storage key escapes base directory: ${JSON.stringify(key)}`);
  }
  return full;
}

/** A filesystem-backed {@link StorageProvider}. */
export class LocalStorageProvider implements StorageProvider {
  readonly id: string;
  private readonly baseDir: string;
  private readonly clock: StorageClock;

  constructor(config: LocalStorageConfig) {
    this.id = config.id ?? DEFAULT_LOCAL_PROVIDER_ID;
    this.baseDir = config.baseDir;
    this.clock = config.clock ?? systemClock;
  }

  async put(key: string, data: ObjectStream): Promise<PutResult> {
    const full = resolveKey(this.baseDir, key);
    await mkdir(path.dirname(full), { recursive: true });
    // Readable.fromWeb consumes the web stream and pipes it to the file.
    await pipeline(Readable.fromWeb(data), createWriteStream(full));
    const info = await stat(full);
    return { key, sizeBytes: info.size };
  }

  async get(key: string): Promise<ObjectStream> {
    const full = resolveKey(this.baseDir, key);
    // Fail fast with a clear error if the object does not exist.
    await access(full, fsConstants.R_OK);
    return Readable.toWeb(createReadStream(full)) as unknown as ObjectStream;
  }

  async signUploadTarget(key: string, ttlSeconds: number): Promise<SignedTarget> {
    const full = resolveKey(this.baseDir, key);
    const issued = this.clock.now();
    const expires = new Date(issued.getTime() + ttlSeconds * 1000);
    return {
      key,
      providerId: this.id,
      // A file URL standing in for a signed direct-upload endpoint.
      url: `file://${full}`,
      method: "PUT",
      issuedAt: issued.toISOString(),
      expiresAt: expires.toISOString(),
      ttlSeconds,
    };
  }

  async healthCheck(): Promise<void> {
    // Ensure the base directory exists and is writable; this validates the
    // provider's configuration and connectivity on activation (R9.4).
    await mkdir(path.resolve(this.baseDir), { recursive: true });
    await access(path.resolve(this.baseDir), fsConstants.W_OK);
  }
}

/**
 * Wrap a {@link StorageProvider} as a Plugin_Manager plugin. The provider is
 * exposed verbatim as the capability value so the platform can route
 * persistence through it without knowing anything about the filesystem.
 */
export function createLocalStoragePlugin(config: LocalStorageConfig): Plugin {
  const provider = new LocalStorageProvider(config);
  return {
    id: LOCAL_STORAGE_PLUGIN_ID,
    type: "storage",
    activate(_context: PluginContext): Capability[] {
      return [
        {
          id: LOCAL_STORAGE_CAPABILITY_ID,
          kind: "storage",
          value: provider,
        },
      ];
    },
    deactivate(_context: PluginContext): void {
      // No long-lived resources to release for filesystem storage.
    },
  };
}

/**
 * A default Local storage plugin rooted at `./.streetstudio-storage`. Operators
 * typically construct their own via {@link createLocalStoragePlugin} with a
 * configured base directory.
 */
export const localStoragePlugin: Plugin = createLocalStoragePlugin({
  baseDir: path.resolve(process.cwd(), ".streetstudio-storage"),
});

export default localStoragePlugin;
