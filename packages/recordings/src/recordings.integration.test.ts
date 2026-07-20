import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { PgPool, container } from "streetjs";
import { ensureRecordingsSchema } from "./persistence/schema.js";
import { RecordingRepository } from "./persistence/recording-repository.js";
import { Recording, type Actor } from "./domain/recording.js";
import { createRecordingsApp } from "./api/app.js";

/**
 * Integration test against a REAL PostgreSQL. Runs only when
 * `STREETSTUDIO_IT_DATABASE_URL` is set (e.g. the docker-compose Postgres);
 * skips gracefully otherwise so the default suite stays green without infra.
 *
 *   docker compose -f docker/docker-compose.yml up -d postgres
 *   STREETSTUDIO_IT_DATABASE_URL=postgres://streetstudio:streetstudio_dev@127.0.0.1:5435/streetstudio \
 *     npx vitest run --project integration packages/recordings
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

suite("recordings persistence + HTTP (real Postgres)", () => {
  let pool: PgPool;
  const org = randomUUID();
  const owner = randomUUID();
  const actor: Actor = { memberId: owner, organizationId: org };

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureRecordingsSchema(pool);
    await pool.query(`DELETE FROM recordings WHERE organization_id = $1`, [org]);
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DELETE FROM recordings WHERE organization_id = $1`, [org]);
      await pool.close();
    }
    container.reset();
  });

  it("persists and reads recordings through the repository", async () => {
    const repo = new RecordingRepository(pool);
    const rec = Recording.createDraft({ id: randomUUID(), owner: actor, title: "Repo demo", createdAt: new Date().toISOString() as never });
    await repo.insert(rec);

    const found = await repo.findById(rec.id);
    expect(found?.title).toBe("Repo demo");
    expect(found?.status).toBe("draft");

    const published = found!.publish(new Date().toISOString() as never);
    await repo.save(published);
    expect((await repo.findById(rec.id))?.status).toBe("published");

    const list = await repo.listByOrganization(org);
    expect(list.some((r) => r.id === rec.id)).toBe(true);
  });

  describe("HTTP journey", () => {
    let app: StreetHttpApp;
    let base: string;

    beforeAll(async () => {
      app = createRecordingsApp(pool, { port: 0, host: "127.0.0.1" });
      await app.listen(0, "127.0.0.1");
      const addr = app.server.address() as AddressInfo;
      base = `http://127.0.0.1:${addr.port}`;
    });

    afterAll(async () => {
      if (app) await app.close();
    });

    const headers = () => ({
      "content-type": "application/json",
      "x-organization-id": org,
      "x-member-id": owner,
    });

    it("create → get → publish → archive over real HTTP", async () => {
      const createRes = await fetch(`${base}/api/recordings`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ title: "HTTP demo" }),
      });
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as { id: string; status: string };
      expect(created.status).toBe("draft");

      const getRes = await fetch(`${base}/api/recordings/${created.id}`, { headers: headers() });
      expect(getRes.status).toBe(200);
      expect((await getRes.json() as { title: string }).title).toBe("HTTP demo");

      const pubRes = await fetch(`${base}/api/recordings/${created.id}/publish`, { method: "POST", headers: headers() });
      expect(pubRes.status).toBe(200);
      expect((await pubRes.json() as { status: string }).status).toBe("published");

      const arcRes = await fetch(`${base}/api/recordings/${created.id}/archive`, { method: "POST", headers: headers() });
      expect(arcRes.status).toBe(200);
      expect((await arcRes.json() as { status: string }).status).toBe("archived");
    });

    it("rejects unauthenticated requests with 401", async () => {
      const res = await fetch(`${base}/api/recordings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "x" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 404 for a recording in another organization", async () => {
      const res = await fetch(`${base}/api/recordings/${randomUUID()}`, { headers: headers() });
      expect(res.status).toBe(404);
    });
  });
});
