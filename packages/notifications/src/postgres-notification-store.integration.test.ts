import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PgPool } from "streetjs";
import type { NotificationDto } from "@streetstudio/shared";
import {
  NotificationService,
  type NotificationEmitter,
} from "./notification-service.js";
import {
  ensureNotificationsSchema,
  postgresNotificationStore,
  postgresNotificationPreferenceStore,
} from "./postgres-notification-store.js";

/**
 * De-seam (ADR-0020 pattern): the real {@link NotificationService} running on
 * the real PostgreSQL notification + preference stores — creation, ownership-
 * checked mark-read, and offline-then-reconnect delivery on real infrastructure.
 * Runs when `STREETSTUDIO_IT_DATABASE_URL` is set; skips otherwise.
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

suite("NotificationService on real Postgres store", () => {
  let pool: PgPool;
  let svc: NotificationService;
  const delivered: NotificationDto[] = [];
  const emitter: NotificationEmitter = {
    async emit(n): Promise<void> {
      delivered.push(n);
    },
  };

  const member = randomUUID();
  const otherMember = randomUUID();
  const source = randomUUID();

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureNotificationsSchema(pool);
    for (const m of [member, otherMember]) {
      await pool.query(`DELETE FROM notifications WHERE member_id = $1`, [m]).catch(() => {});
      await pool.query(`DELETE FROM notification_preferences WHERE member_id = $1`, [m]).catch(() => {});
    }
    // The member has explicitly disabled one event type (R12.4).
    await pool.query(
      `INSERT INTO notification_preferences (member_id, event_type, enabled) VALUES ($1, 'muted-event', false)`,
      [member],
    );

    svc = new NotificationService({
      notifications: postgresNotificationStore(pool),
      preferences: postgresNotificationPreferenceStore(pool),
      emitter,
    });
  });

  afterAll(async () => {
    if (pool) {
      for (const m of [member, otherMember]) {
        await pool.query(`DELETE FROM notifications WHERE member_id = $1`, [m]).catch(() => {});
        await pool.query(`DELETE FROM notification_preferences WHERE member_id = $1`, [m]).catch(() => {});
      }
      await pool.close();
    }
  });

  it("creates a notification recording its fields, and respects a disabled preference (R12.1, R12.4)", async () => {
    const dto = await svc.create(member, { eventType: "comment-mention", sourceResourceId: source });
    expect(dto).not.toBeNull();
    expect(dto?.eventType).toBe("comment-mention");
    expect(dto?.sourceResourceId).toBe(source);

    const store = postgresNotificationStore(pool);
    const persisted = await store.findById(dto!.id);
    expect(persisted?.memberId).toBe(member);
    expect(persisted?.deliveredAt).toBeNull();

    // A muted event type produces no notification.
    const suppressed = await svc.create(member, { eventType: "muted-event", sourceResourceId: source });
    expect(suppressed).toBeNull();
  });

  it("marks read only for the owner, rejecting others with no change (R12.3, R12.6)", async () => {
    const dto = await svc.create(member, { eventType: "share-added", sourceResourceId: source });
    const store = postgresNotificationStore(pool);

    // A non-owner cannot mark it read.
    await expect(svc.markRead(otherMember, dto!.id)).rejects.toBeTruthy();
    expect((await store.findById(dto!.id))?.readAt).toBeNull();

    // The owner can.
    await svc.markRead(member, dto!.id);
    expect((await store.findById(dto!.id))?.readAt).not.toBeNull();
  });

  it("delivers pending notifications on reconnect and stamps them delivered (R12.5)", async () => {
    delivered.length = 0;
    await svc.deliverPending(member);

    const store = postgresNotificationStore(pool);
    const all = await store.listByMember(member);
    // Every notification for the member is now delivered exactly once.
    expect(all.every((n) => n.deliveredAt !== null)).toBe(true);
    expect(delivered.length).toBe(all.length);

    // A second call delivers nothing further (idempotent).
    delivered.length = 0;
    await svc.deliverPending(member);
    expect(delivered.length).toBe(0);
  });
});
