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
 * Property 37: Notification creation records required fields and respects
 * preferences.
 *
 * Feature: streetstudio, Property 37: Notification creation records required fields and respects preferences
 *
 * Validates: Requirements 12.1, 12.4
 *
 * For any event targeting a Member, `create` records the event type, the source
 * resource, and a creation timestamp for that Member (R12.1); and it honors the
 * Member's preferences per event type — an event type the Member has explicitly
 * DISABLED produces no notification, while an enabled or unconfigured event type
 * produces one (R12.4).
 */

/* -------------------------------------------------------------------------
 * Test doubles — a controllable clock and in-memory ports, so behavior is
 * deterministic and no real persistence/transport is involved.
 * ---------------------------------------------------------------------- */

/** A clock fixed at a caller-chosen instant, so timestamps are deterministic. */
class FakeClock implements Clock {
  constructor(private readonly current: Date) {}
  now(): Date {
    return this.current;
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

class RecordingEmitter implements NotificationEmitter {
  readonly emitted: NotificationDto[] = [];
  async emit(notification: NotificationDto): Promise<void> {
    this.emitted.push(notification);
  }
}

const MEMBER: Uuid = "11111111-1111-1111-1111-111111111111";

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

/** A small pool of event-type names so preferences and events overlap often. */
const eventType = fc.constantFrom(
  "comment-mention",
  "processing-complete",
  "upload-progress",
  "share-viewed",
  "reaction-added",
);

const eventRef: fc.Arbitrary<EventRef> = fc.record({
  eventType,
  sourceResourceId: fc.uuid() as fc.Arbitrary<Uuid>,
});

/**
 * A set of preference rows for MEMBER: at most one row per event type (matching
 * the (member_id, event_type) key), each independently enabled or disabled.
 */
const preferenceRows: fc.Arbitrary<NotificationPreferenceRecord[]> = fc
  .uniqueArray(fc.tuple(eventType, fc.boolean()), {
    selector: ([type]) => type,
    maxLength: 5,
  })
  .map((pairs) =>
    pairs.map(([type, enabled]) => ({
      memberId: MEMBER,
      eventType: type,
      enabled,
    })),
  );

/** An ISO instant, generated from a bounded epoch range for readable dates. */
const instant = fc
  .integer({ min: 0, max: 4_102_444_800_000 }) // 1970 .. 2100
  .map((ms) => new Date(ms));

describe("Feature: streetstudio, Property 37: Notification creation records required fields and respects preferences", () => {
  it("records required fields for enabled events and suppresses disabled ones", async () => {
    await fc.assert(
      fc.asyncProperty(
        eventRef,
        preferenceRows,
        instant,
        async (event, rows, when) => {
          const notifications = new InMemoryNotificationStore();
          const preferences = new InMemoryPreferenceStore(rows);
          const emitter = new RecordingEmitter();
          const service = new NotificationService({
            notifications,
            preferences,
            emitter,
            clock: new FakeClock(when),
          });

          const pref = rows.find((r) => r.eventType === event.eventType);
          const disabled = pref !== undefined && pref.enabled === false;
          const expectedCreatedAt = when.toISOString();

          const dto = await service.create(MEMBER, event);

          if (disabled) {
            // R12.4: an explicitly disabled event type yields no notification,
            // and nothing is persisted.
            expect(dto).toBeNull();
            expect(notifications.byId.size).toBe(0);
          } else {
            // R12.4: an enabled or unconfigured event type yields a notification.
            expect(dto).not.toBeNull();
            // R12.1: the notification records the event type, the source
            // resource, the targeted Member, and a creation timestamp.
            expect(dto?.memberId).toBe(MEMBER);
            expect(dto?.eventType).toBe(event.eventType);
            expect(dto?.sourceResourceId).toBe(event.sourceResourceId);
            expect(dto?.createdAt).toBe(expectedCreatedAt);
            // Exactly one notification is persisted, matching the returned DTO.
            expect(notifications.byId.size).toBe(1);
            const stored = notifications.byId.get(dto!.id);
            expect(stored).toBeDefined();
            expect(stored?.memberId).toBe(MEMBER);
            expect(stored?.eventType).toBe(event.eventType);
            expect(stored?.sourceResourceId).toBe(event.sourceResourceId);
            expect(stored?.createdAt).toBe(expectedCreatedAt);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
