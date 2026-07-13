import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { NotificationDto, Uuid } from "@streetstudio/shared";
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

/**
 * Property 38: Notification delivery online and after reconnect.
 *
 * Feature: streetstudio, Property 38: Notification delivery online and after reconnect
 *
 * Validates: Requirements 12.2, 12.5
 *
 * For any new notification: while the recipient is connected, a newly created
 * notification is delivered (emitted) to them (R12.2); while the recipient is
 * not connected, the notification is retained undelivered and then delivered on
 * the next `deliverPending` — the reconnect path (R12.5). Delivery is
 * exactly-once: across the whole session every notification is emitted once and
 * only once.
 *
 * Connection state is modelled through the {@link NotificationEmitter} seam,
 * exactly as the design prescribes: `create` never touches the wire, and
 * delivery to a connected Member is the Realtime_Service gateway pushing the
 * Member's pending notifications (modelled here by invoking `deliverPending`
 * while the Member is connected). An offline Member simply has no such push, so
 * their notifications accumulate undelivered until a `deliverPending` runs on a
 * later connection.
 */

/* -------------------------------------------------------------------------
 * Test doubles — a controllable clock and in-memory ports, so behavior is
 * deterministic and no real persistence/transport is involved.
 * ---------------------------------------------------------------------- */

/** A clock the test advances explicitly, so timestamps are monotonic. */
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
  constructor(private readonly rows: NotificationPreferenceRecord[]) {}
  async listByMember(memberId: Uuid): Promise<NotificationPreferenceRecord[]> {
    return this.rows.filter((r) => r.memberId === memberId);
  }
}

/** Records every emitted notification, in delivery order — the "wire". */
class RecordingEmitter implements NotificationEmitter {
  readonly emitted: NotificationDto[] = [];
  async emit(notification: NotificationDto): Promise<void> {
    this.emitted.push(notification);
  }
  has(id: Uuid): boolean {
    return this.emitted.some((n) => n.id === id);
  }
}

const MEMBER: Uuid = "11111111-1111-1111-1111-111111111111";

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

/** A small pool of event-type names; none are disabled, so all create. */
const eventType = fc.constantFrom(
  "comment-mention",
  "processing-complete",
  "upload-progress",
  "share-viewed",
  "reaction-added",
);

/**
 * One step in a Member's session: an event that targets them, and whether the
 * Member is connected at the moment it is created. A connected step delivers
 * the Member's pending notifications (the realtime push); a disconnected step
 * does not.
 */
const step: fc.Arbitrary<{ connected: boolean; event: EventRef }> = fc.record({
  connected: fc.boolean(),
  event: fc.record({
    eventType,
    sourceResourceId: fc.uuid() as fc.Arbitrary<Uuid>,
  }),
});

/** A whole session: a sequence of create/connection steps (incl. all-offline). */
const session = fc.array(step, { minLength: 1, maxLength: 20 });

describe("Feature: streetstudio, Property 38: Notification delivery online and after reconnect", () => {
  it("delivers to connected recipients and retains-then-delivers for offline ones, exactly once", async () => {
    await fc.assert(
      fc.asyncProperty(session, async (steps) => {
        const notifications = new InMemoryNotificationStore();
        // No preferences configured, so every event produces a notification.
        const preferences = new InMemoryPreferenceStore([]);
        const emitter = new RecordingEmitter();
        const clock = new FakeClock(new Date("2024-01-01T00:00:00.000Z"));
        const service = new NotificationService({
          notifications,
          preferences,
          emitter,
          clock,
        });

        const createdIds: Uuid[] = [];

        for (const { connected, event } of steps) {
          const dto = await service.create(MEMBER, event);
          // `create` alone never delivers — it only records the notification.
          expect(dto).not.toBeNull();
          expect(emitter.has(dto!.id)).toBe(false);
          expect(notifications.byId.get(dto!.id)?.deliveredAt).toBeNull();
          createdIds.push(dto!.id);

          // Distinct, monotonic creation timestamps for realistic ordering.
          clock.advance(1000);

          if (connected) {
            // R12.2: while the Member is connected, the realtime gateway pushes
            // their pending notifications; the just-created one is delivered.
            await service.deliverPending(MEMBER);
            expect(emitter.has(dto!.id)).toBe(true);
            expect(notifications.byId.get(dto!.id)?.deliveredAt).not.toBeNull();
          } else {
            // R12.5: while the Member is not connected, the notification is
            // retained undelivered (no emission, no delivery timestamp).
            expect(emitter.has(dto!.id)).toBe(false);
            expect(notifications.byId.get(dto!.id)?.deliveredAt).toBeNull();
          }
        }

        // Reconnect: deliver everything still pending (R12.5). Idempotent for
        // notifications already delivered while the Member was connected.
        await service.deliverPending(MEMBER);

        // Every created notification is now delivered.
        for (const id of createdIds) {
          expect(emitter.has(id)).toBe(true);
          expect(notifications.byId.get(id)?.deliveredAt).not.toBeNull();
        }

        // Exactly-once delivery: the emitted set equals the created set with no
        // duplicates — nothing delivered twice, nothing dropped.
        const emittedIds = emitter.emitted.map((n) => n.id);
        expect(emittedIds.length).toBe(createdIds.length);
        expect(new Set(emittedIds).size).toBe(emittedIds.length);
        expect(new Set(emittedIds)).toEqual(new Set(createdIds));
      }),
      { numRuns: 200 },
    );
  });
});
