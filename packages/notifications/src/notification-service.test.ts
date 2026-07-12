import { describe, it, expect, beforeEach } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { IsoTimestamp, NotificationDto, Uuid } from "@streetstudio/shared";
import type {
  NotificationPreferenceRecord,
  NotificationRecord,
} from "@streetstudio/database";
import type { Clock } from "@streetstudio/auth";
import {
  NotificationService,
  type EventRef,
  type NotificationEmitter,
  type NotificationPreferenceStore,
  type NotificationStore,
} from "./notification-service.js";

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

/** A clock the test advances explicitly, so timestamps are deterministic. */
class FakeClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

class InMemoryNotificationStore implements NotificationStore {
  readonly byId = new Map<Uuid, NotificationRecord>();

  async insert(record: NotificationRecord): Promise<NotificationRecord> {
    this.byId.set(record.id, record);
    return record;
  }
  async findById(id: Uuid): Promise<NotificationRecord | null> {
    return this.byId.get(id) ?? null;
  }
  async listByMember(memberId: Uuid): Promise<NotificationRecord[]> {
    return [...this.byId.values()].filter((n) => n.memberId === memberId);
  }
  async save(record: NotificationRecord): Promise<NotificationRecord> {
    this.byId.set(record.id, record);
    return record;
  }
}

class InMemoryPreferenceStore implements NotificationPreferenceStore {
  readonly rows: NotificationPreferenceRecord[] = [];
  async listByMember(memberId: Uuid): Promise<NotificationPreferenceRecord[]> {
    return this.rows.filter((r) => r.memberId === memberId);
  }
}

class RecordingEmitter implements NotificationEmitter {
  readonly emitted: NotificationDto[] = [];
  async emit(notification: NotificationDto): Promise<void> {
    this.emitted.push(notification);
  }
}

const MEMBER: Uuid = "11111111-1111-1111-1111-111111111111";
const OTHER: Uuid = "22222222-2222-2222-2222-222222222222";
const SOURCE: Uuid = "33333333-3333-3333-3333-333333333333";

function makeService(overrides?: {
  ids?: Uuid[];
  clock?: Clock;
}): {
  service: NotificationService;
  notifications: InMemoryNotificationStore;
  preferences: InMemoryPreferenceStore;
  emitter: RecordingEmitter;
} {
  const notifications = new InMemoryNotificationStore();
  const preferences = new InMemoryPreferenceStore();
  const emitter = new RecordingEmitter();
  const ids = [...(overrides?.ids ?? [])];
  let counter = 0;
  const newId = (): Uuid =>
    (ids.shift() ??
      (`00000000-0000-0000-0000-${String(++counter).padStart(12, "0")}` as Uuid));
  const service = new NotificationService({
    notifications,
    preferences,
    emitter,
    clock: overrides?.clock,
    newId,
  });
  return { service, notifications, preferences, emitter };
}

/* -------------------------------------------------------------------------
 * create — R12.1, R12.4
 * ---------------------------------------------------------------------- */

describe("NotificationService.create", () => {
  const event: EventRef = { eventType: "comment-mention", sourceResourceId: SOURCE };

  it("records event type, source resource, and creation timestamp", async () => {
    const clock = new FakeClock(new Date("2024-01-01T00:00:00.000Z"));
    const { service, notifications } = makeService({ clock });

    const dto = await service.create(MEMBER, event);

    expect(dto).not.toBeNull();
    expect(dto?.memberId).toBe(MEMBER);
    expect(dto?.eventType).toBe("comment-mention");
    expect(dto?.sourceResourceId).toBe(SOURCE);
    expect(dto?.createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(dto?.readAt).toBeUndefined();
    expect(dto?.deliveredAt).toBeUndefined();
    // Persisted undelivered so it can be delivered later.
    const stored = notifications.byId.get(dto!.id);
    expect(stored?.deliveredAt).toBeNull();
  });

  it("does not create a notification for an event type the member disabled", async () => {
    const { service, preferences, notifications } = makeService();
    preferences.rows.push({
      memberId: MEMBER,
      eventType: "comment-mention",
      enabled: false,
    });

    const dto = await service.create(MEMBER, event);

    expect(dto).toBeNull();
    expect(notifications.byId.size).toBe(0);
  });

  it("creates for an event type the member explicitly enabled", async () => {
    const { service, preferences } = makeService();
    preferences.rows.push({
      memberId: MEMBER,
      eventType: "comment-mention",
      enabled: true,
    });

    const dto = await service.create(MEMBER, event);
    expect(dto).not.toBeNull();
  });

  it("creates for an unconfigured event type (opt-out default)", async () => {
    const { service } = makeService();
    const dto = await service.create(MEMBER, event);
    expect(dto).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * markRead — R12.3, R12.6
 * ---------------------------------------------------------------------- */

describe("NotificationService.markRead", () => {
  const event: EventRef = { eventType: "e", sourceResourceId: SOURCE };

  it("records a read timestamp on a notification the member owns", async () => {
    const clock = new FakeClock(new Date("2024-01-01T00:00:00.000Z"));
    const { service, notifications } = makeService({ clock });
    const created = await service.create(MEMBER, event);
    clock.advance(1000);

    await service.markRead(MEMBER, created!.id);

    expect(notifications.byId.get(created!.id)?.readAt).toBe(
      "2024-01-01T00:00:01.000Z",
    );
  });

  it("rejects a non-existent notification with NOT_FOUND", async () => {
    const { service } = makeService();
    await expect(service.markRead(MEMBER, SOURCE)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects a notification owned by another member and makes no change", async () => {
    const { service, notifications } = makeService();
    const created = await service.create(OTHER, event);

    await expect(service.markRead(MEMBER, created!.id)).rejects.toBeInstanceOf(
      AppError,
    );
    expect(notifications.byId.get(created!.id)?.readAt).toBeNull();
  });

  it("is idempotent: re-marking preserves the original read timestamp", async () => {
    const clock = new FakeClock(new Date("2024-01-01T00:00:00.000Z"));
    const { service, notifications } = makeService({ clock });
    const created = await service.create(MEMBER, event);
    await service.markRead(MEMBER, created!.id);
    const first = notifications.byId.get(created!.id)?.readAt;

    clock.advance(5000);
    await service.markRead(MEMBER, created!.id);

    expect(notifications.byId.get(created!.id)?.readAt).toBe(first);
  });
});

/* -------------------------------------------------------------------------
 * deliverPending — R12.5
 * ---------------------------------------------------------------------- */

describe("NotificationService.deliverPending", () => {
  it("delivers retained undelivered notifications and stamps them delivered", async () => {
    const clock = new FakeClock(new Date("2024-01-01T00:00:00.000Z"));
    const { service, notifications, emitter } = makeService({ clock });
    await service.create(MEMBER, { eventType: "a", sourceResourceId: SOURCE });
    clock.advance(1000);
    await service.create(MEMBER, { eventType: "b", sourceResourceId: SOURCE });

    clock.advance(1000);
    await service.deliverPending(MEMBER);

    // Both delivered, in creation order.
    expect(emitter.emitted.map((n) => n.eventType)).toEqual(["a", "b"]);
    for (const n of notifications.byId.values()) {
      expect(n.deliveredAt).toBe("2024-01-01T00:00:02.000Z");
    }
  });

  it("does not redeliver already-delivered notifications", async () => {
    const { service, emitter } = makeService();
    await service.create(MEMBER, { eventType: "a", sourceResourceId: SOURCE });
    await service.deliverPending(MEMBER);
    await service.deliverPending(MEMBER);

    expect(emitter.emitted).toHaveLength(1);
  });
});
