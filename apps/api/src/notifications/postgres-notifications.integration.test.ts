import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PgPool } from "streetjs";
import { newUuid } from "@streetstudio/database";
import type { MemberRecord } from "@streetstudio/database";
import type { NotificationDto } from "@streetstudio/shared";
import type { NotificationEmitter } from "@streetstudio/notifications";
import {
  assemblePostgresRepositories,
  ensureCanonicalSchema,
} from "../persistence/postgres-database.js";
import { assemblePostgresNotifications } from "./postgres-notifications.js";

/**
 * Store-of-record repoint (ADR-0021, step 3): the real `NotificationService`
 * running on the **canonical repository layer** (canonical singular,
 * FK-constrained `notification`/`notification_preference` tables) rather than the
 * standalone direct-`PgPool` adapter — proving the domain's production default
 * works end-to-end on the store of record. Runs when
 * `STREETSTUDIO_IT_DATABASE_URL` is set; skips otherwise.
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

const iso = () => new Date().toISOString() as MemberRecord["createdAt"];

suite("NotificationService on the canonical repository layer", () => {
  let pool: PgPool;
  const memberId = newUuid();
  const source = newUuid();
  const delivered: NotificationDto[] = [];
  const emitter: NotificationEmitter = {
    async emit(n): Promise<void> {
      delivered.push(n);
    },
  };

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureCanonicalSchema(pool);
    // The canonical notification/notification_preference tables FK member(id).
    await assemblePostgresRepositories(pool).members.insert({
      id: memberId,
      email: `notif-${memberId}@example.com`,
      passwordHash: null,
      createdAt: iso(),
    });
  });

  afterAll(async () => {
    if (pool) {
      // Deleting the member cascades its notifications and preferences.
      await pool.query(`DELETE FROM member WHERE id = $1`, [memberId]).catch(() => {});
      await pool.close();
    }
  });

  it("creates, respects preferences, checks ownership, and delivers exactly once", async () => {
    const repos = assemblePostgresRepositories(pool);
    const svc = assemblePostgresNotifications(pool, emitter);

    // A muted event type is suppressed (R12.4).
    await repos.notificationPreferences.upsert({
      memberId,
      eventType: "muted-event",
      enabled: false,
    });
    expect(await svc.create(memberId, { eventType: "muted-event", sourceResourceId: source })).toBeNull();

    // A normal event is created and persisted in the canonical `notification` table (R12.1).
    const dto = await svc.create(memberId, { eventType: "comment-mention", sourceResourceId: source });
    expect(dto).not.toBeNull();
    expect((await repos.notifications.findById(dto!.id))?.memberId).toBe(memberId);
    expect((await repos.notifications.findById(dto!.id))?.deliveredAt).toBeNull();

    // Ownership-checked mark-read (R12.3, R12.6).
    await expect(svc.markRead(newUuid(), dto!.id)).rejects.toBeTruthy();
    expect((await repos.notifications.findById(dto!.id))?.readAt).toBeNull();
    await svc.markRead(memberId, dto!.id);
    expect((await repos.notifications.findById(dto!.id))?.readAt).not.toBeNull();

    // Deliver-pending emits each undelivered notification exactly once (R12.5).
    delivered.length = 0;
    await svc.deliverPending(memberId);
    const mine = (await repos.notifications.list()).filter((n) => n.memberId === memberId);
    expect(mine.every((n) => n.deliveredAt !== null)).toBe(true);
    expect(delivered.length).toBe(mine.length);

    delivered.length = 0;
    await svc.deliverPending(memberId);
    expect(delivered.length).toBe(0);
  });
});
