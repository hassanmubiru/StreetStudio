import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import type { ObjectStream } from "@streetstudio/media";
import type { PluginContext } from "@streetstudio/plugins";
import gcsStoragePlugin, {
  GcsStorageProvider,
  GCS_STORAGE_PLUGIN_ID,
  GCS_STORAGE_CAPABILITY_ID,
  createGcsStorageProvider,
  createGcsStoragePlugin,
  type GcsClient,
} from "./index.js";

function streamFrom(bytes: Uint8Array): ObjectStream {
  return Readable.toWeb(Readable.from(Buffer.from(bytes))) as unknown as ObjectStream;
}

function fakeClient(): GcsClient {
  const store = new Map<string, Uint8Array>();
  return {
    async saveObject({ object, body }) {
      const chunks: Buffer[] = [];
      for await (const chunk of Readable.fromWeb(body)) chunks.push(Buffer.from(chunk as Uint8Array));
      const bytes = new Uint8Array(Buffer.concat(chunks));
      store.set(object, bytes);
      return { sizeBytes: bytes.length };
    },
    async readObject({ object }) {
      return streamFrom(store.get(object) ?? new Uint8Array());
    },
    async getSignedUploadUrl({ object, expiresInSeconds }) {
      return { url: `https://storage.googleapis.com/b/${object}?exp=${expiresInSeconds}` };
    },
    async ping() {},
  };
}

const context: PluginContext = { pluginId: GCS_STORAGE_PLUGIN_ID, core: {} };

describe("gcs storage plugin", () => {
  it("implements the storage plugin contract (R9.2)", () => {
    expect(gcsStoragePlugin.id).toBe(GCS_STORAGE_PLUGIN_ID);
    expect(gcsStoragePlugin.type).toBe("storage");
  });

  it("registers a StorageProvider capability", () => {
    const plugin = createGcsStoragePlugin({ bucket: "b", client: fakeClient() });
    const caps = plugin.activate(context);
    const list = Array.isArray(caps) ? caps : [];
    expect(list[0]?.id).toBe(GCS_STORAGE_CAPABILITY_ID);
    expect(list[0]?.kind).toBe("storage");
  });
});

describe("GcsStorageProvider", () => {
  it("round-trips bytes through the injected client", async () => {
    const provider = createGcsStorageProvider({ bucket: "b", client: fakeClient() });
    await provider.healthCheck();
    await provider.put("k", streamFrom(new Uint8Array([2, 4, 6, 8])));
    const chunks: Buffer[] = [];
    for await (const chunk of Readable.fromWeb(await provider.get("k"))) chunks.push(Buffer.from(chunk as Uint8Array));
    expect([...new Uint8Array(Buffer.concat(chunks))]).toEqual([2, 4, 6, 8]);
  });

  it("fails health check when no client is configured (R9.4)", async () => {
    const provider = new GcsStorageProvider({ bucket: "b" });
    await expect(provider.healthCheck()).rejects.toThrow();
  });
});
