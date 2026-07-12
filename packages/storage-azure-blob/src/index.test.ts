import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import type { ObjectStream } from "@streetstudio/media";
import type { PluginContext } from "@streetstudio/plugins";
import azureBlobStoragePlugin, {
  AzureBlobStorageProvider,
  AZURE_BLOB_STORAGE_PLUGIN_ID,
  AZURE_BLOB_STORAGE_CAPABILITY_ID,
  createAzureBlobStorageProvider,
  createAzureBlobStoragePlugin,
  type AzureBlobClient,
} from "./index.js";

function streamFrom(bytes: Uint8Array): ObjectStream {
  return Readable.toWeb(Readable.from(Buffer.from(bytes))) as unknown as ObjectStream;
}

function fakeClient(): AzureBlobClient {
  const store = new Map<string, Uint8Array>();
  return {
    async uploadBlob({ blob, body }) {
      const chunks: Buffer[] = [];
      for await (const chunk of Readable.fromWeb(body)) chunks.push(Buffer.from(chunk as Uint8Array));
      const bytes = new Uint8Array(Buffer.concat(chunks));
      store.set(blob, bytes);
      return { sizeBytes: bytes.length };
    },
    async downloadBlob({ blob }) {
      return streamFrom(store.get(blob) ?? new Uint8Array());
    },
    async generateSasUpload({ blob, expiresInSeconds }) {
      return { url: `https://acct.blob.core.windows.net/c/${blob}?se=${expiresInSeconds}` };
    },
    async ping() {},
  };
}

const context: PluginContext = { pluginId: AZURE_BLOB_STORAGE_PLUGIN_ID, core: {} };

describe("azure blob storage plugin", () => {
  it("implements the storage plugin contract (R9.2)", () => {
    expect(azureBlobStoragePlugin.id).toBe(AZURE_BLOB_STORAGE_PLUGIN_ID);
    expect(azureBlobStoragePlugin.type).toBe("storage");
  });

  it("registers a StorageProvider capability", () => {
    const plugin = createAzureBlobStoragePlugin({ container: "c", client: fakeClient() });
    const caps = plugin.activate(context);
    const list = Array.isArray(caps) ? caps : [];
    expect(list[0]?.id).toBe(AZURE_BLOB_STORAGE_CAPABILITY_ID);
    expect(list[0]?.kind).toBe("storage");
  });
});

describe("AzureBlobStorageProvider", () => {
  it("round-trips bytes through the injected client", async () => {
    const provider = createAzureBlobStorageProvider({ container: "c", client: fakeClient() });
    await provider.healthCheck();
    await provider.put("k", streamFrom(new Uint8Array([7, 7, 7])));
    const chunks: Buffer[] = [];
    for await (const chunk of Readable.fromWeb(await provider.get("k"))) chunks.push(Buffer.from(chunk as Uint8Array));
    expect([...new Uint8Array(Buffer.concat(chunks))]).toEqual([7, 7, 7]);
  });

  it("fails health check when no client is configured (R9.4)", async () => {
    const provider = new AzureBlobStorageProvider({ container: "c" });
    await expect(provider.healthCheck()).rejects.toThrow();
  });
});
