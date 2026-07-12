import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import type { ObjectStream } from "@streetstudio/media";
import type { PluginContext } from "@streetstudio/plugins";
import type { S3StyleClient } from "@streetstudio/storage-s3";
import r2StoragePlugin, {
  R2_STORAGE_PLUGIN_ID,
  R2_STORAGE_CAPABILITY_ID,
  createR2StorageProvider,
  createR2StoragePlugin,
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
      return { url: `https://acct.r2.cloudflarestorage.com/${key}?exp=${expiresInSeconds}` };
    },
    async ping() {},
  };
}

const context: PluginContext = { pluginId: R2_STORAGE_PLUGIN_ID, core: {} };

describe("r2 storage plugin", () => {
  it("implements the storage plugin contract (R9.2)", () => {
    expect(r2StoragePlugin.id).toBe(R2_STORAGE_PLUGIN_ID);
    expect(r2StoragePlugin.type).toBe("storage");
  });

  it("registers a StorageProvider capability whose provider id is r2", () => {
    const plugin = createR2StoragePlugin({
      bucket: "b",
      endpoint: "https://acct.r2.cloudflarestorage.com",
      client: fakeClient(),
    });
    const caps = plugin.activate(context);
    const list = Array.isArray(caps) ? caps : [];
    expect(list[0]?.id).toBe(R2_STORAGE_CAPABILITY_ID);
    expect((list[0]?.value as { id: string }).id).toBe("r2");
  });

  it("round-trips bytes through the injected S3-compatible client", async () => {
    const provider = createR2StorageProvider({
      bucket: "b",
      endpoint: "https://acct.r2.cloudflarestorage.com",
      client: fakeClient(),
    });
    await provider.healthCheck();
    await provider.put("k", streamFrom(new Uint8Array([1, 2])));
    const chunks: Buffer[] = [];
    for await (const chunk of Readable.fromWeb(await provider.get("k"))) chunks.push(Buffer.from(chunk as Uint8Array));
    expect([...new Uint8Array(Buffer.concat(chunks))]).toEqual([1, 2]);
  });
});
