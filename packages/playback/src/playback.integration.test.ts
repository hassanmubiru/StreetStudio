import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PgPool, container, JwtService } from "streetjs";
import { createStorage, type Storage } from "@streetjs/storage";
import {
  UploadService,
  UploadSessionRepository,
  ensureUploadsSchema,
  type Actor,
} from "@streetstudio/uploads";
import { createPlaybackApp } from "./api/app.js";

const DATABASE_URL = process.env["STREETSTUDIO_IT_DATABASE_URL"];
const suite = DATABASE_URL ? describe : describe.skip;

function poolOptions(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || "5432"),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    maxConnections: 4,
  };
}

suite("playback: authorized streaming of a completed upload (real infra)", () => {
  const JWT_SECRET = "playback-integration-secret-at-least-32-chars";
  const org = randomUUID();
  const owner = randomUUID();
  const actor: Actor = { memberId: owner, organizationId: org };
  const CONTENT = "0123456789abcdef"; // 16 bytes
  const objectKey = `videos/${randomUUID()}.bin`;

  let pool: PgPool;
  let storage: Storage;
  let storageRoot: string;
  let app: ReturnType<typeof createPlaybackApp>;
  let base: string;
  let token: string;

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureUploadsSchema(pool);
    await pool.query(`DELETE FROM upload_sessions WHERE organization_id = $1`, [org]);

    storageRoot = await mkdtemp(join(tmpdir(), "streetstudio-playback-"));
    storage = createStorage({ provider: "local", root: storageRoot });

    // Create a real completed upload (real bytes assembled into `objectKey`).
    const uploads = new UploadService(new UploadSessionRepository(pool), storage);
    const session = await uploads.begin(actor, { id: randomUUID(), objectKey, totalParts: 1, contentType: "text/plain" });
    await uploads.uploadPart(actor, session.id, 1, new Uint8Array(Buffer.from(CONTENT, "utf8")));
    await uploads.complete(actor, session.id);

    token = new JwtService(JWT_SECRET).sign({ sub: owner, roles: [] });
    app = createPlaybackApp(pool, storage, { jwtSecret: JWT_SECRET, port: 0, host: "127.0.0.1" });
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (storage) await storage.close();
    if (pool) {
      await pool.query(`DELETE FROM upload_sessions WHERE organization_id = $1`, [org]);
      await pool.close();
    }
    container.reset();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });

  const auth = () => ({ authorization: `Bearer ${token}`, "x-organization-id": org });
  const url = () => `${base}/api/playback?key=${encodeURIComponent(objectKey)}`;

  it("streams the full object (200) with the stored content type", async () => {
    const res = await fetch(url(), { headers: auth() });
    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe(CONTENT);
  });

  it("serves a partial range (206) with Content-Range", async () => {
    const res = await fetch(url(), { headers: { ...auth(), range: "bytes=0-3" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 0-3/${CONTENT.length}`);
    expect(await res.text()).toBe("0123");
  });

  it("serves a suffix range (206)", async () => {
    const res = await fetch(url(), { headers: { ...auth(), range: "bytes=-4" } });
    expect(res.status).toBe(206);
    expect(await res.text()).toBe("cdef");
  });

  it("returns 416 for an unsatisfiable range", async () => {
    const res = await fetch(url(), { headers: { ...auth(), range: "bytes=1000-2000" } });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe(`bytes */${CONTENT.length}`);
  });

  it("returns 404 for another organization", async () => {
    const otherToken = new JwtService(JWT_SECRET).sign({ sub: randomUUID(), roles: [] });
    const res = await fetch(url(), { headers: { authorization: `Bearer ${otherToken}`, "x-organization-id": randomUUID() } });
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await fetch(url(), {});
    expect(res.status).toBe(401);
  });
});
