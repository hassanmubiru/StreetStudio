import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import type { ObjectStream } from "@streetstudio/media";
import type { PluginContext } from "@streetstudio/plugins";
import s3StoragePlugin, {
  S3StyleStorageProvider,
  S3_STORAGE_PLUGIN_ID,
  S3_STORAGE_CAPABILITY_ID,
  createS3StoragePlugin,
  createS3StorageProvider,
  type S3StyleClient,
} from "./index.js";

function streamFrom(bytes: Uint8Array): ObjectStream {
  return Readable.toWeb(Readable.from(Buffer.from(bytes))) as unknown as ObjectStream;
}

/** An in-memory S3-compatible client seam for structural sanity checks. */
function fakeClient(overrides: Partial<S3StyleClient> = {}): S3StyleClient {
  const store = new Map<string, Uint8Array>();
  return {
    async putObject({ key, body }) {
      const chunks: Buffer[] = [];
      for await (const chunk of Readable.fromWeb(body)) {
        chunks.push(Buffer.from(chunk as Uint8Array));
      }
      const bytes = new Uint8Array(Buffer.concat(chunks));
      store.set(key, bytes);
      return { etag: `"${key}"`, sizeBytes: bytes.length };
    },
    async getObject({ key }) {
      return streamFrom(store.get(key) ?? new Uint8Array());
    },
    async presignPut({ key, expiresInSeconds }) {
      return {
        url: `https://bucket.example.com/${key}?exp=${expiresInSeconds}`,
        method: "PUT",
        headers: { "x-amz-acl": "private" },
      };
    },
    async ping() {
      /* reachable */
    },
    ...overrides,
  };
}

const context: PluginContext = { pluginId: S3_STORAGE_PLUGIN_ID, core: {} };

describe("s3 storage plugin", () => {
  it("implements the storage plugin contract (R9.2)", () => {
    expect(s3StoragePlugin.id).toBe(S3_STORAGE_PLUGIN_ID);
    expect(s3StoragePlugin.type).toBe("storage");
  });

  it("registers a StorageProvider capability", () => {
    const plugin = createS3StoragePlugin({ bucket: "b", client: fakeClient() });
    const caps = plugin.activate(context);
    const list = Array.isArray(caps) ? caps : [];
    expect(list[0]?.id).toBe(S3_STORAGE_CAPABILITY_ID);
    expect(list[0]?.kind).toBe("storage");
  });
});

describe("S3StyleStorageProvider", () => {
  it("round-trips bytes through the injected client", async () => {
    const provider = createS3StorageProvider({ bucket: "b", client: fakeClient() });
    await provider.healthCheck();
    const data = new Uint8Array([9, 8, 7]);
    const put = await provider.put("k1", streamFrom(data));
    expect(put.key).toBe("k1");
    expect(put.sizeBytes).toBe(3);
    const chunks: Buffer[] = [];
    for await (const chunk of Readable.fromWeb(await provider.get("k1"))) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    expect([...new Uint8Array(Buffer.concat(chunks))]).toEqual([...data]);
  });

  it("signs upload targets with a validity window from the injected clock", async () => {
    const fixed = new Date("2024-06-01T12:00:00.000Z");
    const provider = createS3StorageProvider({
      bucket: "b",
      client: fakeClient(),
      clock: { now: () => fixed },
    });
    const target = await provider.signUploadTarget("obj", 600);
    expect(target.ttlSeconds).toBe(600);
    expect(target.issuedAt).toBe("2024-06-01T12:00:00.000Z");
    expect(target.expiresAt).toBe("2024-06-01T12:10:00.000Z");
    expect(target.url).toContain("obj");
    expect(target.method).toBe("PUT");
  });

  it("fails health check when no client is configured (R9.4)", async () => {
    const provider = createS3StorageProvider({ bucket: "b" });
    await expect(provider.healthCheck()).rejects.toThrow();
  });
});
