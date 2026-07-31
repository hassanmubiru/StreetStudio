/**
 * A real S3-compatible {@link StorageDriver} for MinIO / Amazon S3.
 *
 * ── Composition-root / vendor-adapter decision ──────────────────────────────
 * The `@streetjs/storage` package ships only the zero-dependency `memory` and
 * `local` drivers; there is no bundled, wired S3 driver a consumer can select.
 * The concrete object-store adapter is therefore a composition-root concern —
 * exactly like the ffmpeg transcoder — so it lives here in `apps/api`, outside
 * every domain package, consistent with the pipeline's rule that
 * "concrete ffmpeg/vendor implementations live outside core". The core stays
 * vendor-free; only this composition root imports `@aws-sdk/client-s3`.
 *
 * This driver satisfies the full {@link StorageDriver} contract against a live
 * bucket using the AWS SDK v3 S3 client pointed at the MinIO endpoint with
 * `forcePathStyle: true`. Every mandatory primitive (`put`/`get`/`exists`/
 * `delete`/`stat`/`list`/`putStream`/`getStream`) issues a real S3 API call.
 * The optional capability slots (`multipart`/`resumable`/`versioning`/
 * `signedUrl`/`lifecycle`) are intentionally left `undefined`, so the storage
 * facade transparently simulates them over these primitives when needed.
 *
 * The typed {@link StorageObjectMetadata} field set is produced through the
 * shared {@link buildObjectMetadata} layer so the shape and defaults are
 * identical to the built-in drivers. The sha-256 checksum, access level, and
 * caller-supplied custom fields are round-tripped through S3 user metadata so a
 * subsequent `get`/`stat` reconstructs the same record.
 */
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { buildObjectMetadata } from "@streetjs/storage";
import type {
  MaybeObject,
  NodeReadable,
  StorageDriver,
} from "@streetjs/storage";
import type {
  ListOptions,
  StorageListItem,
  StorageObjectMetadata,
  WriteMetadata,
} from "@streetjs/storage";

/** Connection + bucket configuration for the S3-compatible endpoint. */
export interface S3StorageDriverConfig {
  /** S3 endpoint (e.g. `http://localhost:9000` for local MinIO). */
  readonly endpoint: string;
  /** AWS region (MinIO accepts any; `us-east-1` by convention). */
  readonly region: string;
  /** Access key id. */
  readonly accessKeyId: string;
  /** Secret access key. */
  readonly secretAccessKey: string;
  /** Target bucket that already exists. */
  readonly bucket: string;
  /**
   * Whether to address objects path-style (`endpoint/bucket/key`) rather than
   * virtual-host-style. Required for MinIO; defaults to `true`.
   */
  readonly forcePathStyle?: boolean;
  /** Optional stable driver name; defaults to `"s3"`. */
  readonly name?: string;
}

/** User-metadata keys used to round-trip the typed metadata through S3. */
const META_CHECKSUM = "sha256";
const META_ACCESS_LEVEL = "access-level";
const META_CREATED_AT = "created-at";
const META_CUSTOM = "custom";

/** Compute the lowercase sha-256 hex digest of `bytes`. */
function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** True when an S3 error indicates the object/key does not exist. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const e = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    e.name === "NotFound" ||
    e.name === "NoSuchKey" ||
    e.Code === "NoSuchKey" ||
    e.$metadata?.httpStatusCode === 404
  );
}

/** Drain a Node {@link Readable} into a single {@link Uint8Array}. */
async function readableToBytes(stream: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Buffer));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * A real S3-compatible {@link StorageDriver}. Every method issues an actual S3
 * API call against the configured bucket; there is no in-memory shortcut.
 */
export class S3StorageDriver implements StorageDriver {
  /** Stable driver name surfaced to the facade. */
  readonly name: string;

  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageDriverConfig) {
    this.name = config.name ?? "s3";
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? true,
    });
  }

  /**
   * Persist `bytes` under `key`. The sha-256 checksum, access level, creation
   * time, and custom fields are stored as S3 user metadata so a later `get`/
   * `stat` reconstructs the identical typed record. When overwriting, the
   * original `createdAt` is preserved via a preceding `stat`.
   */
  async put(
    key: string,
    bytes: Uint8Array,
    metadata: WriteMetadata,
  ): Promise<StorageObjectMetadata> {
    const stored = bytes.slice();
    const checksum = sha256Hex(stored);
    const now = Date.now();
    const existing = await this.stat(key);
    const createdAt = existing?.createdAt ?? now;
    const contentType = metadata.contentType ?? "application/octet-stream";

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: stored,
        ContentType: contentType,
        Metadata: this.encodeUserMetadata(metadata, checksum, createdAt),
      }),
    );

    return buildObjectMetadata({
      key,
      size: stored.byteLength,
      checksum,
      createdAt,
      updatedAt: now,
      write: metadata,
    });
  }

  /**
   * Read the object at `key`, returning a discriminated {@link MaybeObject} so
   * absence is reported rather than thrown.
   */
  async get(key: string): Promise<MaybeObject> {
    let output;
    try {
      output = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      if (isNotFound(error)) {
        return { found: false };
      }
      throw error;
    }
    if (!output.Body) {
      return { found: false };
    }
    const bytes = await (
      output.Body as { transformToByteArray(): Promise<Uint8Array> }
    ).transformToByteArray();
    const metadata = this.decodeMetadata(key, {
      size: output.ContentLength ?? bytes.byteLength,
      contentType: output.ContentType,
      etag: output.ETag,
      lastModified: output.LastModified?.getTime(),
      userMetadata: output.Metadata,
    });
    return { found: true, bytes, metadata };
  }

  /** Report whether an object is stored under `key`. */
  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  /** Delete the object at `key`; deleting a missing key is a no-op. */
  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /** Return metadata for `key` without its content, or `null` when absent. */
  async stat(key: string): Promise<StorageObjectMetadata | null> {
    try {
      const output = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return this.decodeMetadata(key, {
        size: output.ContentLength ?? 0,
        contentType: output.ContentType,
        etag: output.ETag,
        lastModified: output.LastModified?.getTime(),
        userMetadata: output.Metadata,
      });
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * List objects whose key begins with `prefix`, sorted by key. Honors optional
   * `limit`, `cursor` (exclusive resume point), and `delimiter` (collapse to
   * immediate children on `/`).
   */
  async list(prefix: string, options?: ListOptions): Promise<StorageListItem[]> {
    const items: StorageListItem[] = [];
    let continuationToken: string | undefined;
    const limit = options?.limit;
    const cursor = options?.cursor;

    do {
      const output = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ...(options?.delimiter === true ? { Delimiter: "/" } : {}),
          ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
        }),
      );
      for (const object of output.Contents ?? []) {
        if (object.Key === undefined) {
          continue;
        }
        if (cursor !== undefined && object.Key <= cursor) {
          continue;
        }
        items.push({
          key: object.Key,
          size: object.Size ?? 0,
          updatedAt: object.LastModified?.getTime() ?? 0,
        });
      }
      continuationToken = output.IsTruncated
        ? output.NextContinuationToken
        : undefined;
    } while (
      continuationToken !== undefined &&
      (limit === undefined || items.length < limit)
    );

    items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return limit === undefined ? items : items.slice(0, limit);
  }

  /**
   * Consume a Node {@link Readable} and persist the assembled bytes under `key`
   * with the same computed metadata as {@link put}.
   */
  async putStream(
    key: string,
    stream: NodeReadable,
    metadata: WriteMetadata,
  ): Promise<StorageObjectMetadata> {
    const bytes = await readableToBytes(stream as Readable);
    return this.put(key, bytes, metadata);
  }

  /** Return a Node {@link Readable} of the stored bytes at `key`. */
  async getStream(key: string): Promise<NodeReadable> {
    const output = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!output.Body) {
      throw new Error(`object not found: ${key}`);
    }
    return output.Body as Readable;
  }

  /** Close the underlying S3 client (releases sockets). */
  destroy(): void {
    this.client.destroy();
  }

  /* --------------------------- internals ------------------------------- */

  /** Encode the typed write metadata + checksum/createdAt into S3 user metadata. */
  private encodeUserMetadata(
    metadata: WriteMetadata,
    checksum: string,
    createdAt: number,
  ): Record<string, string> {
    const user: Record<string, string> = {
      [META_CHECKSUM]: checksum,
      [META_CREATED_AT]: String(createdAt),
    };
    if (metadata.accessLevel) {
      user[META_ACCESS_LEVEL] = metadata.accessLevel;
    }
    if (metadata.custom && Object.keys(metadata.custom).length > 0) {
      user[META_CUSTOM] = JSON.stringify(metadata.custom);
    }
    return user;
  }

  /** Rebuild the typed metadata field set from S3 attributes + user metadata. */
  private decodeMetadata(
    key: string,
    attrs: {
      size: number;
      contentType?: string | undefined;
      etag?: string | undefined;
      lastModified?: number | undefined;
      userMetadata?: Record<string, string> | undefined;
    },
  ): StorageObjectMetadata {
    const user = attrs.userMetadata ?? {};
    const checksum =
      user[META_CHECKSUM] ?? (attrs.etag ?? "").replace(/"/g, "");
    const createdRaw = user[META_CREATED_AT];
    const createdAt =
      createdRaw !== undefined && createdRaw !== ""
        ? Number(createdRaw)
        : attrs.lastModified ?? Date.now();
    const updatedAt = attrs.lastModified ?? createdAt;
    const accessLevel = user[META_ACCESS_LEVEL];
    const customRaw = user[META_CUSTOM];
    const write: WriteMetadata = {
      ...(attrs.contentType ? { contentType: attrs.contentType } : {}),
      ...(accessLevel
        ? { accessLevel: accessLevel as WriteMetadata["accessLevel"] }
        : {}),
      ...(customRaw
        ? { custom: JSON.parse(customRaw) as Record<string, unknown> }
        : {}),
    };
    return buildObjectMetadata({
      key,
      size: attrs.size,
      checksum,
      ...(attrs.etag ? { etag: attrs.etag.replace(/"/g, "") } : {}),
      createdAt,
      updatedAt,
      write,
    });
  }
}
