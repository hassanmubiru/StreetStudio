import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import type { ObjectStream } from "@streetstudio/media";
import type { PluginContext } from "@streetstudio/plugins";
import type { S3StyleClient } from "@streetstudio/storage-s3";
import minioStoragePlugin, {
  MINIO_STORAGE_PLUGIN_ID,
  MINIO_STORAGE_CAPABILITY_ID,
  createMinioStorageProvider,
  createMinioStoragePlugin,
} from "./index.js";

function streamFrom(bytes: Uint8Array): ObjectStream {
  return Readable.toWeb(Readable.from(Buffer.from(bytes))) as unknown as ObjectStream;
}

function fakeClient(): S3StyleClient {
  const store = new Map<string, Uint8Array>();
  return {
    async putObject({ key, body }) {
      const chunks: Buffer[] = [];
      for await (const chunk of Readable.fromWeb(body)) chunks.push(Buffer.from(chunk as Uint8Array));
      const bytes = new Uint8Array(Buffer.concat(chunks));
      store.set(key, bytes);
      return { sizeBytes: bytes.length };
    },
    async getObject({ key }) {
      return streamFrom(store.get(key) ?? new Uint8Array());
    },
    async presignPut({ key, expiresInSeconds }) {
      return { url: `https://minio.internal:9000/${key}?exp=${expiresInSeconds}` };
    },
    async ping() {},
  };
}

const context: PluginContext = { pluginId: MINIO_STORAGE_PLUGIN_ID, core: {} };

describe("minio storage plugin", () => {
  it("implements the storage plugin contract (R9.2)", () => {
    expect(minioStoragePlugin.id).toBe(MINIO_STORAGE_PLUGIN_ID);
    expect(minioStoragePlugin.type).toBe("storage");
  });

  it("registers a StorageProvider capability whose provider id is minio", () => {
    const plugin = createMinioStoragePlugin({
      bucket: "b",
      endpoint: "https://minio.internal:9000",
      client: fakeClient(),
    });
    const caps = plugin.activate(context);
    const list = Array.isArray(caps) ? caps : [];
    expect(list[0]?.id).toBe(MINIO_STORAGE_CAPABILITY_ID);
    expect((list[0]?.value as { id: string }).id).toBe("minio");
  });

  it("round-trips bytes through the injected S3-compatible client", async () => {
    const provider = createMinioStorageProvider({
      bucket: "b",
      endpoint: "https://minio.internal:9000",
      client: fakeClient(),
    });
    await provider.healthCheck();
    await provider.put("k", streamFrom(new Uint8Array([3, 4, 5])));
    const chunks: Buffer[] = [];
    for await (const chunk of Readable.fromWeb(await provider.get("k"))) chunks.push(Buffer.from(chunk as Uint8Array));
    expect([...new Uint8Array(Buffer.concat(chunks))]).toEqual([3, 4, 5]);
  });
});
