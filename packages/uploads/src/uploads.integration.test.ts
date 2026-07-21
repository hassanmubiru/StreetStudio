import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PgPool, container, JwtService } from "streetjs";
import { createStorage, type Storage } from "@streetjs/storage";
import { ensureUploadsSchema } from "./persistence/schema.js";
import { createUploadsApp } from "./api/app.js";

/**
 * Integration test against REAL PostgreSQL + REAL object storage (local-file
 * driver). Runs only when `STREETSTUDIO_IT_DATABASE_URL` is set; skips otherwise.
 *
 *   docker compose -f docker/docker-compose.yml up -d postgres
 *   STREETSTUDIO_IT_DATABASE_URL=postgres://streetstudio:streetstudio_dev@127.0.0.1:5435/streetstudio \
 *     npx vitest run --project integration packages/uploads
 */
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

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

suite("uploads: sessions + real storage over HTTP", () => {
  const JWT_SECRET = "uploads-integration-secret-at-least-32-chars";
  const org = randomUUID();
  const owner = randomUUID();
  let pool: PgPool;
  let storage: Storage;
  let storageRoot: string;
  let app: ReturnType<typeof createUploadsApp>;
  let base: string;
  let token: string;

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureUploadsSchema(pool);
    await pool.query(`DELETE FROM upload_sessions WHERE organization_id = $1`, [org]);

    storageRoot = await mkdtemp(join(tmpdir(), "streetstudio-uploads-"));
    storage = createStorage({ provider: "local", root: storageRoot });

    token = new JwtService(JWT_SECRET).sign({ sub: owner, roles: [] });
    app = createUploadsApp(pool, storage, { jwtSecret: JWT_SECRET, port: 0, host: "127.0.0.1" });
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

  const headers = () => ({
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    "x-organization-id": org,
  });

  it("begins a session, uploads parts, completes, and assembles the real object", async () => {
    const objectKey = `videos/${randomUUID()}.bin`;
    const beginRes = await fetch(`${base}/api/uploads`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ objectKey, totalParts: 2, contentType: "text/plain" }),
    });
    expect(beginRes.status).toBe(201);
    const session = (await beginRes.json()) as { id: string; status: string };
    expect(session.status).toBe("pending");

    const p1 = await fetch(`${base}/api/uploads/${session.id}/parts/1`, {
      method: "PUT", headers: headers(), body: JSON.stringify({ data: b64("hello ") }),
    });
    expect(p1.status).toBe(200);
    const p2 = await fetch(`${base}/api/uploads/${session.id}/parts/2`, {
      method: "PUT", headers: headers(), body: JSON.stringify({ data: b64("world") }),
    });
    expect((await p2.json() as { receivedParts: number[] }).receivedParts).toEqual([1, 2]);

    const done = await fetch(`${base}/api/uploads/${session.id}/complete`, { method: "POST", headers: headers() });
    expect(done.status).toBe(200);
    const result = (await done.json()) as { session: { status: string }; object: { key: string; size: number } };
    expect(result.session.status).toBe("completed");
    expect(result.object.key).toBe(objectKey);
    expect(result.object.size).toBe("hello world".length);

    // The assembled object exists in real storage with the concatenated bytes.
    const stored = await storage.get(objectKey);
    expect(stored.found).toBe(true);
    expect(Buffer.from(stored.bytes!).toString("utf8")).toBe("hello world");
  });

  it("cannot complete before all parts arrive (400)", async () => {
    const beginRes = await fetch(`${base}/api/uploads`, {
      method: "POST", headers: headers(), body: JSON.stringify({ objectKey: `x/${randomUUID()}`, totalParts: 2 }),
    });
    const { id } = (await beginRes.json()) as { id: string };
    await fetch(`${base}/api/uploads/${id}/parts/1`, { method: "PUT", headers: headers(), body: JSON.stringify({ data: b64("only-one") }) });
    const done = await fetch(`${base}/api/uploads/${id}/complete`, { method: "POST", headers: headers() });
    expect(done.status).toBe(400);
  });

  it("aborts a session", async () => {
    const beginRes = await fetch(`${base}/api/uploads`, {
      method: "POST", headers: headers(), body: JSON.stringify({ objectKey: `x/${randomUUID()}`, totalParts: 2 }),
    });
    const { id } = (await beginRes.json()) as { id: string };
    await fetch(`${base}/api/uploads/${id}/parts/1`, { method: "PUT", headers: headers(), body: JSON.stringify({ data: b64("abc") }) });
    const abortRes = await fetch(`${base}/api/uploads/${id}/abort`, { method: "POST", headers: headers() });
    expect(abortRes.status).toBe(200);
    expect((await abortRes.json() as { status: string }).status).toBe("aborted");
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await fetch(`${base}/api/uploads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectKey: "x", totalParts: 1 }),
    });
    expect(res.status).toBe(401);
  });
});
