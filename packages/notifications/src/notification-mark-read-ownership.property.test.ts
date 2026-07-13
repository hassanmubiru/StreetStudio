import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { NotificationDto, Uuid } from "@streetstudio/shared";
import type {
  NotificationPreferenceRecord,
  NotificationRecord,
} from "@streetstudio/database";
import type { Clock } from "@streetstudio/auth";
import {
  NotificationService,
  type NotificationEmitter,
  type NotificationPreferenceStore,
  type NotificationStore,
} from "./notification-service.js";

/**
 * Property 39: Marking notifications read is ownership-checked.
 *
 * Feature: streetstudio, Property 39: Marking notifications read is ownership-checked
 *
 * Validates: Requirements 12.3, 12.6
 *
 * For any collection of notifications spread across several Members, `markRead`
 * succeeds only for a notification owned by the requesting Member — it records a
 * read timestamp (read status) and retains the notification, leaving every other
 * notification untouched (R12.3). A request to mark a notification that does not
 * exist, or that belongs to a different Member, is rejected with a `NOT_FOUND`
 * `AppError`, and no notification's read status changes at all (R12.6).
 */

/* -------------------------------------------------------------------------
 * Test doubles — a fixed clock and in-memory ports so behavior is
 * deterministic and no real persistence/transport is involved.
 * ---------------------------------------------------------------------- */

/** A clock fixed at a caller-chosen instant, so read timestamps are deterministic. */
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
  async listByMember(): Promise<NotificationPreferenceRecord[]> {
    return [];
  }
}

class RecordingEmitter implements NotificationEmitter {
  async emit(_notification: NotificationDto): Promise<void> {}
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

/** A small pool of Members so ownership overlaps and mismatches occur often. */
const memberId = fc.constantFrom<Uuid>(
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
  "33333333-3333-3333-3333-333333333333",
);

const eventType = fc.constantFrom(
  "comment-mention",
  "processing-complete",
  "share-viewed",
);

/** A stored notification, some already read, owned by one of the pool Members. */
const notificationRecord: fc.Arbitrary<NotificationRecord> = fc.record({
  id: fc.uuid() as fc.Arbitrary<Uuid>,
  memberId,
  eventType,
  sourceResourceId: fc.uuid() as fc.Arbitrary<Uuid>,
  createdAt: fc
    .integer({ min: 0, max: 4_102_444_800_000 })
    .map((ms) => new Date(ms).toISOString()),
  readAt: fc.option(
    fc.integer({ min: 0, max: 4_102_444_800_000 }).map((ms) => new Date(ms).toISOString()),
    { nil: null },
  ),
  deliveredAt: fc.constant(null),
}) as fc.Arbitrary<NotificationRecord>;

/** A set of notifications with unique ids (the store is keyed by id). */
const notificationSet: fc.Arbitrary<NotificationRecord[]> = fc.uniqueArray(
  notificationRecord,
  { selector: (n) => n.id, maxLength: 8 },
);

const READ_AT: Uuid = "44444444-4444-4444-4444-444444444444"; // fixed instant marker

const clockInstant = new Date("2024-06-01T12:00:00.000Z");

function snapshotReadStatus(
  store: InMemoryNotificationStore,
): Map<Uuid, string | null> {
  const snap = new Map<Uuid, string | null>();
  for (const [id, n] of store.byId) snap.set(id, n.readAt);
  return snap;
}

describe("Feature: streetstudio, Property 39: Marking notifications read is ownership-checked", () => {
  it("marks read only owner-owned notifications; rejects missing/foreign with no state change", async () => {
    await fc.assert(
      fc.asyncProperty(
        notificationSet,
        memberId,
        // Choose the target: an index into the set, or a wholly unknown id.
        fc.oneof(
          fc.nat({ max: 32 }).map((i) => ({ kind: "existing" as const, i })),
          (fc.uuid() as fc.Arbitrary<Uuid>).map((id) => ({
            kind: "unknown" as const,
            id,
          })),
        ),
        async (records, requester, target) => {
          const notifications = new InMemoryNotificationStore();
          for (const r of records) {
            await notifications.insert({ ...r });
          }
          const service = new NotificationService({
            notifications,
            preferences: new InMemoryPreferenceStore(),
            emitter: new RecordingEmitter(),
            clock: new FakeClock(clockInstant),
          });

          // Resolve the target id and whether it is owned by the requester.
          let targetId: Uuid;
          let targetRecord: NotificationRecord | undefined;
          if (target.kind === "existing" && records.length > 0) {
            targetRecord = records[target.i % records.length];
            targetId = targetRecord.id;
          } else if (target.kind === "unknown") {
            // Ensure it truly does not collide with a stored id.
            targetId = notifications.byId.has(target.id)
              ? (`${target.id}-x` as Uuid)
              : target.id;
          } else {
            // Empty set + "existing" target: fall back to an unknown id.
            targetId = READ_AT;
          }

          const before = snapshotReadStatus(notifications);
          const owned =
            targetRecord !== undefined && targetRecord.memberId === requester;

          if (owned) {
            // R12.3: marking an owned notification succeeds, recording a read
            // timestamp and retaining the notification.
            await service.markRead(requester, targetId);

            const after = notifications.byId.get(targetId);
            expect(after).toBeDefined();
            // Retained (still present) with the same identity/fields.
            expect(after?.id).toBe(targetId);
            expect(after?.memberId).toBe(requester);
            // Read status is set: if it was unread it now carries the clock's
            // timestamp; an already-read notification keeps its original stamp.
            const priorReadAt = before.get(targetId) ?? null;
            if (priorReadAt === null) {
              expect(after?.readAt).toBe(clockInstant.toISOString());
            } else {
              expect(after?.readAt).toBe(priorReadAt);
            }
            expect(after?.readAt).not.toBeNull();

            // No OTHER notification's read status changed.
            for (const [id, readAt] of before) {
              if (id === targetId) continue;
              expect(notifications.byId.get(id)?.readAt ?? null).toBe(readAt);
            }
          } else {
            // R12.6: a missing or foreign-owned notification is rejected with
            // NOT_FOUND, and NO notification's read status changes.
            await expect(service.markRead(requester, targetId)).rejects.toBeInstanceOf(
              AppError,
            );
            await expect(
              service.markRead(requester, targetId),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });

            const after = snapshotReadStatus(notifications);
            expect(after.size).toBe(before.size);
            for (const [id, readAt] of before) {
              expect(after.get(id) ?? null).toBe(readAt);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
