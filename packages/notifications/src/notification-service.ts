/**
 * NotificationService (`packages/notifications`).
 *
 * Implements the design's "Notifications" section and Requirement 12: creating
 * notifications for events that target a Member, marking them read under an
 * ownership check, and delivering notifications that were retained while the
 * Member was offline.
 *
 *  - {@link NotificationService.create} records a notification for a Member —
 *    capturing the event type, the source resource, and a creation timestamp —
 *    while respecting the Member's notification preferences: an event type the
 *    Member has explicitly disabled produces no notification (R12.1, R12.4).
 *  - {@link NotificationService.markRead} sets a read timestamp on a
 *    notification, but only when the notification belongs to the requesting
 *    Member; a notification that does not exist or belongs to another Member is
 *    rejected with `NOT_FOUND` and no notification's read status changes
 *    (R12.3, R12.6).
 *  - {@link NotificationService.deliverPending} delivers every notification that
 *    was retained undelivered for a Member — the offline-then-reconnect path —
 *    emitting each through the injected realtime seam and recording a delivery
 *    timestamp so it is delivered exactly once (R12.5).
 *
 * Persistence is reached only through the narrow {@link NotificationStore} and
 * {@link NotificationPreferenceStore} ports, so the service is decoupled from
 * the concrete database layer and unit-testable with in-memory fakes. The
 * default adapters ({@link repositoryNotificationStore},
 * {@link repositoryNotificationPreferenceStore}) are backed by the Notification
 * and NotificationPreference repositories exposed by `@streetstudio/database`.
 *
 * Because the Notification repository exposes no in-place update, a read or
 * delivery timestamp is recorded by deleting and re-inserting the record with
 * the new field, preserving its id and every other field (the same soft-update
 * pattern used by the RBAC, API-key, and content stores).
 *
 * Delivery to *connected* Members within 2s (R12.2) is the responsibility of
 * the Realtime_Service gateway (task 22); this service touches the wire only
 * through the injectable {@link NotificationEmitter} seam, which that gateway
 * will implement.
 */
import { newUuid } from "@streetstudio/database";
import type {
  NotificationPreferenceRecord,
  NotificationRecord,
  Repositories,
} from "@streetstudio/database";
import { systemClock, toIsoTimestamp, type Clock } from "@streetstudio/auth";
import { AppError } from "@streetstudio/shared";
import type { IsoTimestamp, NotificationDto, Uuid } from "@streetstudio/shared";

/**
 * A reference to the event that triggered a notification. `eventType` names the
 * kind of event (e.g. `comment-mention`, `processing-complete`) and
 * `sourceResourceId` identifies the resource the event concerns (R12.1).
 */
export interface EventRef {
  /** The kind of event, matched against the Member's preferences (R12.4). */
  readonly eventType: string;
  /** The resource the event concerns, recorded on the notification (R12.1). */
  readonly sourceResourceId: Uuid;
}

/**
 * The realtime delivery seam. `deliverPending` pushes each retained
 * notification through this port; the Realtime_Service gateway (task 22)
 * provides the WebSocket-backed implementation. Kept narrow so this service
 * never depends on the transport.
 */
export interface NotificationEmitter {
  /** Deliver a single notification to its recipient. */
  emit(notification: NotificationDto): Promise<void>;
}

/**
 * Persistence port for notifications. Deliberately narrow: the service inserts
 * new notifications, resolves one by id to perform the ownership check, lists a
 * Member's notifications to find the undelivered ones, and records a read or
 * delivery timestamp via {@link NotificationStore.save}.
 */
export interface NotificationStore {
  /** Persist a new notification and return it. */
  insert(record: NotificationRecord): Promise<NotificationRecord>;
  /** Find a notification by id, or null when none exists. */
  findById(id: Uuid): Promise<NotificationRecord | null>;
  /** List every notification for a Member. */
  listByMember(memberId: Uuid): Promise<NotificationRecord[]>;
  /**
   * Persist an updated notification record in place (same id), used to record a
   * read or delivery timestamp.
   */
  save(record: NotificationRecord): Promise<NotificationRecord>;
}

/** Read access to a Member's notification preferences (R12.4). */
export interface NotificationPreferenceStore {
  /** List every configured preference for a Member. */
  listByMember(memberId: Uuid): Promise<NotificationPreferenceRecord[]>;
}

/** Dependencies required to construct a {@link NotificationService}. */
export interface NotificationServiceDeps {
  /** Notification persistence port. */
  readonly notifications: NotificationStore;
  /** Notification-preference persistence port. */
  readonly preferences: NotificationPreferenceStore;
  /** Realtime delivery seam (Realtime_Service gateway, task 22). */
  readonly emitter: NotificationEmitter;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
  /** UUID generator; defaults to the database id generator. */
  readonly newId?: () => Uuid;
}

export class NotificationService {
  private readonly notifications: NotificationStore;
  private readonly preferences: NotificationPreferenceStore;
  private readonly emitter: NotificationEmitter;
  private readonly clock: Clock;
  private readonly newId: () => Uuid;

  constructor(deps: NotificationServiceDeps) {
    this.notifications = deps.notifications;
    this.preferences = deps.preferences;
    this.emitter = deps.emitter;
    this.clock = deps.clock ?? systemClock;
    this.newId = deps.newId ?? newUuid;
  }

  /**
   * Create a notification for `memberId` from an event, recording the event
   * type, the source resource, and a creation timestamp (R12.1).
   *
   * The Member's preferences are honored per event type: a preference row with
   * `enabled: false` for the event type suppresses the notification and this
   * returns `null` (R12.4). An event type the Member has not configured is
   * treated as enabled, preserving the default-create behavior of R12.1
   * (preferences are opt-out per event type). A newly created notification is
   * left undelivered (`deliveredAt: null`) so it is picked up either by the
   * realtime gateway while the Member is connected (R12.2, task 22) or by
   * {@link deliverPending} on the Member's next connection (R12.5).
   */
  async create(
    memberId: Uuid,
    event: EventRef,
  ): Promise<NotificationDto | null> {
    if (!(await this.isEventEnabled(memberId, event.eventType))) {
      return null;
    }

    const record: NotificationRecord = {
      id: this.newId(),
      memberId,
      eventType: event.eventType,
      sourceResourceId: event.sourceResourceId,
      createdAt: this.nowIso(),
      readAt: null,
      deliveredAt: null,
    };
    const created = await this.notifications.insert(record);
    return toNotificationDto(created);
  }

  /**
   * Mark the notification `notificationId` as read on behalf of `memberId`,
   * recording a read timestamp and retaining the notification (R12.3).
   *
   * The request is honored only when the notification exists and belongs to the
   * requesting Member. A notification that does not exist, or that belongs to
   * another Member, is rejected with `NOT_FOUND` and no notification's read
   * status changes; `NOT_FOUND` avoids disclosing whether the notification
   * exists (R12.6). Re-marking an already-read notification is idempotent: the
   * original read timestamp is preserved.
   */
  async markRead(memberId: Uuid, notificationId: Uuid): Promise<void> {
    const notification = await this.notifications.findById(notificationId);
    if (!notification || notification.memberId !== memberId) {
      throw new AppError("NOT_FOUND");
    }
    if (notification.readAt !== null) {
      return;
    }
    await this.notifications.save({
      ...notification,
      readAt: this.nowIso(),
    });
  }

  /**
   * Deliver every notification retained undelivered for `memberId` — the path
   * taken when a previously offline Member reconnects (R12.5). Notifications
   * are delivered in creation order; each is emitted through the realtime seam
   * and then stamped `deliveredAt` so it is delivered exactly once. A
   * notification already marked delivered is left untouched.
   */
  async deliverPending(memberId: Uuid): Promise<void> {
    const all = await this.notifications.listByMember(memberId);
    const pending = all
      .filter((n) => n.deliveredAt === null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    for (const notification of pending) {
      const delivered: NotificationRecord = {
        ...notification,
        deliveredAt: this.nowIso(),
      };
      await this.emitter.emit(toNotificationDto(delivered));
      await this.notifications.save(delivered);
    }
  }

  /* -------------------------- internals -------------------------------- */

  /**
   * Decide whether an event type should produce a notification for a Member.
   * Preferences are opt-out per event type: only an explicit `enabled: false`
   * row suppresses creation; an unconfigured event type defaults to enabled
   * (R12.1, R12.4).
   */
  private async isEventEnabled(
    memberId: Uuid,
    eventType: string,
  ): Promise<boolean> {
    const prefs = await this.preferences.listByMember(memberId);
    const pref = prefs.find((p) => p.eventType === eventType);
    return pref ? pref.enabled : true;
  }

  private nowIso(): IsoTimestamp {
    return toIsoTimestamp(this.clock.now());
  }
}

/** Map a persisted notification record to its public DTO. */
export function toNotificationDto(record: NotificationRecord): NotificationDto {
  const dto: NotificationDto = {
    id: record.id,
    memberId: record.memberId,
    eventType: record.eventType,
    sourceResourceId: record.sourceResourceId,
    createdAt: record.createdAt,
  };
  if (record.readAt !== null) {
    dto.readAt = record.readAt;
  }
  if (record.deliveredAt !== null) {
    dto.deliveredAt = record.deliveredAt;
  }
  return dto;
}

/**
 * A {@link NotificationStore} backed by the Notification repository.
 *
 * The repository is id-keyed and global (notifications are addressed by their
 * own id, not tenant-scoped), exposing insert / findById / list / deleteById
 * but no in-place update. {@link NotificationStore.listByMember} filters the
 * global list by recipient, and {@link NotificationStore.save} records a
 * timestamp change by deleting and re-inserting the record under the same id,
 * preserving every other field (the soft-update pattern used across the
 * codebase).
 */
export function repositoryNotificationStore(
  repositories: Pick<Repositories, "notifications">,
): NotificationStore {
  const { notifications } = repositories;
  return {
    insert: (record) => notifications.insert(record),
    findById: (id) => notifications.findById(id),
    async listByMember(memberId) {
      const all = await notifications.list();
      return all.filter((n) => n.memberId === memberId);
    },
    async save(record) {
      await notifications.deleteById(record.id);
      await notifications.insert(record);
      return record;
    },
  };
}

/**
 * A {@link NotificationPreferenceStore} backed by the NotificationPreference
 * repository, which lists a Member's per-event-type preferences directly.
 */
export function repositoryNotificationPreferenceStore(
  repositories: Pick<Repositories, "notificationPreferences">,
): NotificationPreferenceStore {
  const { notificationPreferences } = repositories;
  return {
    listByMember: (memberId) => notificationPreferences.listByMember(memberId),
  };
}
