/**
 * @streetstudio/storage-conformance
 *
 * The shared Storage_Provider conformance harness. It enumerates every provider
 * plugin (Local, S3, R2, Azure Blob, GCS, MinIO) as a set of
 * {@link ProviderUnderTest}s and, for each, produces a live
 * {@link StorageProvider} the contract properties can exercise:
 *
 *  - Property 27 (storage round-trip preserves object bytes, R9.1)
 *  - Property 29 (signed upload credentials have bounded, secure expiry, R9.6)
 *
 * Per the design's Testing Strategy ("a shared conformance suite runs the
 * round-trip and signed-target properties against every provider plugin,
 * executed against real backends where reachable in CI and against MinIO/local
 * otherwise"), the harness supports two execution modes:
 *
 *  - **local/in-memory (default)** — the Local provider writes to a temp
 *    directory and the S3-family / Azure / GCS providers run against in-memory
 *    fakes of their injectable client seams. This path is deterministic and
 *    requires no external services, so the suite passes anywhere.
 *  - **real backends (opt-in)** — when the relevant `STREETSTUDIO_CONFORMANCE_*`
 *    environment variables are set AND a concrete client for that backend has
 *    been registered via {@link registerRealBackendClient}, the harness targets
 *    the real backend instead. Vendor SDKs are never imported here (the storage
 *    packages take injectable client seams), so wiring a real backend is a host
 *    concern; absent that wiring the harness falls back to the local path.
 *
 * This package imports each provider package through its public entry point and
 * is a leaf in the dependency graph (nothing imports it), so it introduces no
 * cycle and no boundary violation.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ReadableStream } from "node:stream/web";
import type {
  ObjectStream,
  PutResult,
  SignedTarget,
  StorageProvider,
} from "@streetstudio/media";
import {
  LocalStorageProvider,
  createLocalStoragePlugin,
} from "@streetstudio/storage-local";
import {
  S3StyleStorageProvider,
  createS3StoragePlugin,
  type S3StyleClient,
  type S3PresignedUpload,
  type S3PutResult,
} from "@streetstudio/storage-s3";
import { createR2StoragePlugin } from "@streetstudio/storage-r2";
import { createMinioStoragePlugin } from "@streetstudio/storage-minio";
import {
  AzureBlobStorageProvider,
  createAzureBlobStoragePlugin,
  type AzureBlobClient,
  type AzureBlobUploadResult,
  type AzureSasUpload,
} from "@streetstudio/storage-azure-blob";
import {
  GcsStorageProvider,
  createGcsStoragePlugin,
  type GcsClient,
  type GcsWriteResult,
  type GcsSignedUpload,
} from "@streetstudio/storage-gcs";
import type { Plugin } from "@streetstudio/plugins";

export const DOMAIN = "Shared storage-provider conformance suite." as const;

/** Minimal injectable time source shared with the provider `clock` seams. */
export interface ConformanceClock {
  now(): Date;
}

/** A concrete, ready-to-exercise provider plus its teardown hook. */
export interface ProviderInstance {
  /** The provider under the {@link StorageProvider} contract. */
  readonly provider: StorageProvider;
  /**
   * The same provider expressed as a Plugin_Manager plugin, so the suite can
   * also assert plugin-shape conformance (type `"storage"`).
   */
  readonly plugin: Plugin;
  /** Release any resources acquired to build the instance (temp dirs, etc). */
  cleanup(): Promise<void>;
}

/** How a provider under test was backed for this run. */
export type BackendMode = "local" | "in-memory" | "real";

/** One provider plugin enrolled in the conformance suite. */
export interface ProviderUnderTest {
  /** Human-readable provider name used in test descriptions. */
  readonly name: string;
  /** The backend the harness resolved for this provider. */
  readonly backend: BackendMode;
  /**
   * Build a fresh, isolated provider instance. `clock`, when supplied, is
   * injected into the provider so signed-target issuance is deterministic.
   */
  create(clock?: ConformanceClock): Promise<ProviderInstance>;
}

/* -------------------------------------------------------------------------
 * Stream helpers — ObjectStream is a real ReadableStream<Uint8Array>.
 * ---------------------------------------------------------------------- */

/** Build an {@link ObjectStream} from `bytes`, optionally in several chunks. */
export function streamFromBytes(bytes: Uint8Array, chunkSize = 0): ObjectStream {
  const size = chunkSize > 0 ? chunkSize : Math.max(1, bytes.length);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + size, bytes.length);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  }) as ObjectStream;
}

/** Fully drain an {@link ObjectStream} into a single contiguous byte array. */
export async function drain(stream: ObjectStream): Promise<Uint8Array> {
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

/* -------------------------------------------------------------------------
 * In-memory client seams for the S3-family / Azure / GCS providers.
 *
 * Each faithfully persists bytes on write and replays them on read, so the
 * round-trip property genuinely exercises the provider adapter. Signed-target
 * generation returns a syntactically valid URL; the provider itself stamps the
 * authoritative issuedAt/expiresAt window the router enforces.
 * ---------------------------------------------------------------------- */

/** An in-memory {@link S3StyleClient} used by the S3 / R2 / MinIO providers. */
export class InMemoryS3Client implements S3StyleClient {
  private readonly store = new Map<string, Uint8Array>();
  private readonly endpoint: string;

  constructor(endpoint = "https://s3.local") {
    this.endpoint = endpoint;
  }

  async putObject(params: {
    readonly bucket: string;
    readonly key: string;
    readonly body: ObjectStream;
  }): Promise<S3PutResult> {
    const bytes = await drain(params.body);
    this.store.set(`${params.bucket}/${params.key}`, bytes.slice());
    return { etag: `"${bytes.length.toString(16)}"`, sizeBytes: bytes.length };
  }

  async getObject(params: {
    readonly bucket: string;
    readonly key: string;
  }): Promise<ObjectStream> {
    const found = this.store.get(`${params.bucket}/${params.key}`);
    if (found === undefined) {
      throw new Error(`no object for ${params.bucket}/${params.key}`);
    }
    return streamFromBytes(found);
  }

  async presignPut(params: {
    readonly bucket: string;
    readonly key: string;
    readonly expiresInSeconds: number;
  }): Promise<S3PresignedUpload> {
    return {
      url: `${this.endpoint}/${params.bucket}/${encodeURIComponent(
        params.key,
      )}?X-Amz-Expires=${params.expiresInSeconds}`,
      method: "PUT",
    };
  }

  async ping(): Promise<void> {
    /* always reachable */
  }
}

/** An in-memory {@link AzureBlobClient}. */
export class InMemoryAzureClient implements AzureBlobClient {
  private readonly store = new Map<string, Uint8Array>();

  async uploadBlob(params: {
    readonly container: string;
    readonly blob: string;
    readonly body: ObjectStream;
  }): Promise<AzureBlobUploadResult> {
    const bytes = await drain(params.body);
    this.store.set(`${params.container}/${params.blob}`, bytes.slice());
    return { etag: `"${bytes.length.toString(16)}"`, sizeBytes: bytes.length };
  }

  async downloadBlob(params: {
    readonly container: string;
    readonly blob: string;
  }): Promise<ObjectStream> {
    const found = this.store.get(`${params.container}/${params.blob}`);
    if (found === undefined) {
      throw new Error(`no blob for ${params.container}/${params.blob}`);
    }
    return streamFromBytes(found);
  }

  async generateSasUpload(params: {
    readonly container: string;
    readonly blob: string;
    readonly expiresInSeconds: number;
  }): Promise<AzureSasUpload> {
    return {
      url: `https://azure.local/${params.container}/${encodeURIComponent(
        params.blob,
      )}?sig=fake&se=${params.expiresInSeconds}`,
      method: "PUT",
    };
  }

  async ping(): Promise<void> {
    /* always reachable */
  }
}

/** An in-memory {@link GcsClient}. */
export class InMemoryGcsClient implements GcsClient {
  private readonly store = new Map<string, Uint8Array>();

  async saveObject(params: {
    readonly bucket: string;
    readonly object: string;
    readonly body: ObjectStream;
  }): Promise<GcsWriteResult> {
    const bytes = await drain(params.body);
    this.store.set(`${params.bucket}/${params.object}`, bytes.slice());
    return { generation: `${bytes.length}`, sizeBytes: bytes.length };
  }

  async readObject(params: {
    readonly bucket: string;
    readonly object: string;
  }): Promise<ObjectStream> {
    const found = this.store.get(`${params.bucket}/${params.object}`);
    if (found === undefined) {
      throw new Error(`no object for ${params.bucket}/${params.object}`);
    }
    return streamFromBytes(found);
  }

  async getSignedUploadUrl(params: {
    readonly bucket: string;
    readonly object: string;
    readonly expiresInSeconds: number;
  }): Promise<GcsSignedUpload> {
    return {
      url: `https://gcs.local/${params.bucket}/${encodeURIComponent(
        params.object,
      )}?X-Goog-Expires=${params.expiresInSeconds}`,
      method: "PUT",
    };
  }

  async ping(): Promise<void> {
    /* always reachable */
  }
}

/* -------------------------------------------------------------------------
 * Real-backend seam.
 *
 * Vendor SDKs are not imported by this workspace, so a "real" backend can only
 * be exercised when a host registers a concrete client for it. Absent a
 * registration (the default here), the harness uses the local/in-memory path.
 * ---------------------------------------------------------------------- */

/** Registry of concrete clients keyed by provider name, when targeting real backends. */
export interface RealBackendClients {
  s3?: S3StyleClient;
  r2?: S3StyleClient;
  minio?: S3StyleClient;
  azure?: AzureBlobClient;
  gcs?: GcsClient;
}

const realClients: RealBackendClients = {};

/**
 * Register a concrete client for a provider so the conformance suite targets a
 * real backend for it (used in CI where the backend is reachable, R32.4).
 */
export function registerRealBackendClient<K extends keyof RealBackendClients>(
  provider: K,
  client: NonNullable<RealBackendClients[K]>,
): void {
  realClients[provider] = client;
}

/** Clear all registered real-backend clients (test isolation helper). */
export function clearRealBackendClients(): void {
  for (const key of Object.keys(realClients) as (keyof RealBackendClients)[]) {
    delete realClients[key];
  }
}

/** Read an env flag; returns true only for an explicit truthy value. */
function envEnabled(name: string): boolean {
  const raw = process.env[name];
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Whether the operator asked to run against real backends. Defaults to false so
 * the suite runs deterministically against local/in-memory backends here.
 */
export function realBackendsRequested(): boolean {
  return envEnabled("STREETSTUDIO_CONFORMANCE_REAL_BACKENDS");
}

/* -------------------------------------------------------------------------
 * Provider-under-test construction.
 * ---------------------------------------------------------------------- */

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "ss-conformance-"));
  tempDirs.push(dir);
  return dir;
}

/** Remove every temp directory the harness created (call in test teardown). */
export async function cleanupTempDirs(): Promise<void> {
  await Promise.all(
    tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
}

/**
 * For a given provider name, decide whether to use its registered real client
 * or fall back to an in-memory fake, and report the resolved backend mode.
 */
function resolveClientBackend<T>(
  registered: T | undefined,
): { client: T | undefined; backend: BackendMode } {
  if (realBackendsRequested() && registered !== undefined) {
    return { client: registered, backend: "real" };
  }
  return { client: undefined, backend: "in-memory" };
}

/** Build the full set of providers enrolled in the conformance suite. */
export function conformanceTargets(): ProviderUnderTest[] {
  const s3 = resolveClientBackend(realClients.s3);
  const r2 = resolveClientBackend(realClients.r2);
  const minio = resolveClientBackend(realClients.minio);
  const azure = resolveClientBackend(realClients.azure);
  const gcs = resolveClientBackend(realClients.gcs);

  return [
    {
      name: "Local",
      // The Local provider is always exercised against a real filesystem dir.
      backend: "local",
      async create(clock?: ConformanceClock): Promise<ProviderInstance> {
        const baseDir = await makeTempDir();
        const config = clock ? { baseDir, clock } : { baseDir };
        const provider = new LocalStorageProvider(config);
        await provider.healthCheck();
        return {
          provider,
          plugin: createLocalStoragePlugin(config),
          async cleanup() {
            await rm(baseDir, { recursive: true, force: true });
          },
        };
      },
    },
    {
      name: "S3",
      backend: s3.backend,
      async create(clock?: ConformanceClock): Promise<ProviderInstance> {
        const client = s3.client ?? new InMemoryS3Client();
        const config = { bucket: "conformance", client, ...(clock ? { clock } : {}) };
        const provider = new S3StyleStorageProvider(config, "s3");
        await provider.healthCheck();
        return {
          provider,
          plugin: createS3StoragePlugin(config),
          async cleanup() {
            /* nothing to release */
          },
        };
      },
    },
    {
      name: "R2",
      backend: r2.backend,
      async create(clock?: ConformanceClock): Promise<ProviderInstance> {
        const client = r2.client ?? new InMemoryS3Client("https://r2.local");
        const config = {
          bucket: "conformance",
          endpoint: "https://account.r2.cloudflarestorage.com",
          client,
          ...(clock ? { clock } : {}),
        };
        const provider = new S3StyleStorageProvider(config, "r2");
        await provider.healthCheck();
        return {
          provider,
          plugin: createR2StoragePlugin(config),
          async cleanup() {
            /* nothing to release */
          },
        };
      },
    },
    {
      name: "MinIO",
      backend: minio.backend,
      async create(clock?: ConformanceClock): Promise<ProviderInstance> {
        const client = minio.client ?? new InMemoryS3Client("http://minio.local:9000");
        const config = {
          bucket: "conformance",
          endpoint: "http://minio.local:9000",
          client,
          ...(clock ? { clock } : {}),
        };
        const provider = new S3StyleStorageProvider(config, "minio");
        await provider.healthCheck();
        return {
          provider,
          plugin: createMinioStoragePlugin(config),
          async cleanup() {
            /* nothing to release */
          },
        };
      },
    },
    {
      name: "Azure Blob",
      backend: azure.backend,
      async create(clock?: ConformanceClock): Promise<ProviderInstance> {
        const client = azure.client ?? new InMemoryAzureClient();
        const config = {
          container: "conformance",
          client,
          ...(clock ? { clock } : {}),
        };
        const provider = new AzureBlobStorageProvider(config);
        await provider.healthCheck();
        return {
          provider,
          plugin: createAzureBlobStoragePlugin(config),
          async cleanup() {
            /* nothing to release */
          },
        };
      },
    },
    {
      name: "GCS",
      backend: gcs.backend,
      async create(clock?: ConformanceClock): Promise<ProviderInstance> {
        const client = gcs.client ?? new InMemoryGcsClient();
        const config = {
          bucket: "conformance",
          client,
          ...(clock ? { clock } : {}),
        };
        const provider = new GcsStorageProvider(config);
        await provider.healthCheck();
        return {
          provider,
          plugin: createGcsStoragePlugin(config),
          async cleanup() {
            /* nothing to release */
          },
        };
      },
    },
  ];
}

/** Re-exported so tests can build byte payloads without importing node:stream. */
export type { ObjectStream, PutResult, SignedTarget, StorageProvider };
