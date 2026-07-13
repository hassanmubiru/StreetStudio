import { describe, it, expect, afterAll } from "vitest";
import fc from "fast-check";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { ObjectStream } from "@streetstudio/storage";
import type { PluginContext } from "@streetstudio/plugins";
import localStoragePlugin, {
  LocalStorageProvider,
  LOCAL_STORAGE_PLUGIN_ID,
  LOCAL_STORAGE_CAPABILITY_ID,
  createLocalStoragePlugin,
  type StorageClock,
} from "./index.js";

const tempDirs: string[] = [];

async function makeProvider(clock?: StorageClock): Promise<LocalStorageProvider> {
  const dir = await mkdtemp(path.join(tmpdir(), "ss-local-"));
  tempDirs.push(dir);
  return new LocalStorageProvider(clock ? { baseDir: dir, clock } : { baseDir: dir });
}

function streamFrom(bytes: Uint8Array): ObjectStream {
  return Readable.toWeb(Readable.from(Buffer.from(bytes))) as unknown as ObjectStream;
}

async function collect(stream: ObjectStream): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of Readable.fromWeb(stream)) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

afterAll(async () => {
  await Promise.all(tempDirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe("localStoragePlugin", () => {
  const context: PluginContext = { pluginId: LOCAL_STORAGE_PLUGIN_ID, core: {} };

  it("implements the plugin contract as a storage plugin (R9.2)", () => {
    expect(localStoragePlugin.id).toBe(LOCAL_STORAGE_PLUGIN_ID);
    expect(localStoragePlugin.type).toBe("storage");
    expect(typeof localStoragePlugin.activate).toBe("function");
    expect(typeof localStoragePlugin.deactivate).toBe("function");
  });

  it("registers the storage capability exposing a StorageProvider", () => {
    const caps = localStoragePlugin.activate(context);
    const list = Array.isArray(caps) ? caps : [];
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(LOCAL_STORAGE_CAPABILITY_ID);
    expect(list[0]?.kind).toBe("storage");
    const provider = list[0]?.value as { put: unknown; get: unknown; id: string };
    expect(typeof provider.put).toBe("function");
    expect(typeof provider.get).toBe("function");
    expect(() => localStoragePlugin.deactivate(context)).not.toThrow();
  });
});

describe("LocalStorageProvider", () => {
  it("round-trips object bytes through put/get", async () => {
    const provider = await makeProvider();
    await provider.healthCheck();
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const putResult = await provider.put("folder/object.bin", streamFrom(data));
    expect(putResult.key).toBe("folder/object.bin");
    expect(putResult.sizeBytes).toBe(5);
    const readBack = await collect(await provider.get("folder/object.bin"));
    expect([...readBack]).toEqual([...data]);
  });

  it("issues signed targets with the requested validity window", async () => {
    const fixed = new Date("2024-01-01T00:00:00.000Z");
    const provider = await makeProvider({ now: () => fixed });
    const target = await provider.signUploadTarget("k", 900);
    expect(target.ttlSeconds).toBe(900);
    expect(target.issuedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(target.expiresAt).toBe("2024-01-01T00:15:00.000Z");
    expect(target.providerId).toBe(provider.id);
  });

  it("rejects keys that escape the base directory", async () => {
    const provider = await makeProvider();
    await expect(provider.put("../escape", streamFrom(new Uint8Array([1])))).rejects.toThrow();
    await expect(provider.get("/etc/passwd")).rejects.toThrow();
  });

  // Property: storage round-trip preserves object bytes (aligns with Property 27).
  it("preserves bytes for arbitrary payloads and safe keys", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ maxLength: 4096 }),
        fc.array(fc.stringMatching(/^[a-z0-9_-]{1,12}$/), { minLength: 1, maxLength: 4 }),
        async (bytes, segments) => {
          const provider = await makeProvider();
          const key = segments.join("/");
          await provider.put(key, streamFrom(bytes));
          const readBack = await collect(await provider.get(key));
          expect([...readBack]).toEqual([...bytes]);
        },
      ),
      { numRuns: 50 },
    );
  });
});
