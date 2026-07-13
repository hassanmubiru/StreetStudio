/**
 * Analytics Service.
 *
 * Owns view-event recording and organization-scoped aggregation described in
 * the design's "Analytics" section and Requirement 28. Every query is scoped to
 * a single Organization, so analytics never include data from other
 * organizations (R28.3).
 *
 *  - {@link AnalyticsService.recordView} records a view event scoped to the
 *    Organization that OWNS the viewed Video, capturing the Video identifier,
 *    the Member identifier, and the event timestamp (R28.1). The owning
 *    organization is resolved from the Video rather than trusted from the
 *    caller, so a recorded view can never be attributed to another tenant.
 *  - {@link AnalyticsService.aggregate} is Administrator-only: it is served only
 *    to an actor the {@link AnalyticsAuthorizer} accepts, and only for a
 *    well-formed time range whose end does not precede its start. A
 *    non-Administrator request is denied with `AUTHORIZATION_DENIED` and a
 *    malformed/invalid range is rejected with `VALIDATION_FAILED`; in both cases
 *    no analytics data is returned (R28.4, R28.5). On success it returns
 *    {@link Metrics} — total view count, distinct viewer count, and total watch
 *    duration — computed strictly over the requesting Organization's events
 *    within the range (R28.2, R28.3).
 *
 * Persistence and authorization are reached only through narrow ports
 * ({@link ViewEventStore}, {@link VideoOrganizationResolver},
 * {@link AnalyticsAuthorizer}), which keep the service decoupled from the
 * concrete database and RBAC layers and trivially unit-testable with in-memory
 * fakes. The default persistence adapters ({@link repositoryViewEventStore},
 * {@link repositoryVideoOrganizationResolver}) are backed by the tenant-scoped
 * repositories exposed by `@streetstudio/database`; the authorization port is
 * bridged to the RBAC evaluator by the composition root via
 * {@link permissionAnalyticsAuthorizer}, so `@streetstudio/analytics` depends
 * only on `@streetstudio/database` (plus `@streetstudio/shared`) and the package
 * dependency graph stays acyclic.
 */
import { newUuid } from "@streetstudio/database";
import type { Repositories, ViewEventRecord } from "@streetstudio/database";
import { AppError } from "@streetstudio/shared";
import type { IsoTimestamp, Uuid } from "@streetstudio/shared";

/** Aggregate playback metrics for an organization time range. */
export interface Metrics {
  readonly totalViews: number;
  readonly distinctViewers: number;
  readonly totalWatchDuration: number;
}

/**
 * A closed time window for an analytics query. Both bounds are inclusive; a
 * range is well-formed only when both are valid dates and `end` does not
 * precede `start` (R28.5).
 */
export interface TimeRange {
  readonly start: Date;
  readonly end: Date;
}

/**
 * The authenticated principal requesting analytics. Structurally a subset of
 * the auth package's `AuthContext`, so callers may pass an `AuthContext`
 * directly without coupling this package to `@streetstudio/auth`.
 */
export interface AnalyticsActor {
  readonly memberId: Uuid;
  /** Organization scope, when the context has been bound to one. */
  readonly organizationId?: Uuid;
}

/**
 * Persistence port for view events. Deliberately narrow: the service appends a
 * view event and reads the events owned by a single organization. Both
 * operations are organization-scoped, so no query can reach across tenants.
 */
export interface ViewEventStore {
  /** Append a fully-populated view event. */
  record(event: ViewEventRecord): Promise<void>;
  /** Every view event owned by `organizationId`. */
  listByOrganization(
    organizationId: Uuid,
  ): Promise<readonly ViewEventRecord[]>;
}

/**
 * Resolves the Organization that OWNS a Video. Used by
 * {@link AnalyticsService.recordView} to scope a recorded view to the video's
 * owning organization rather than trusting a caller-supplied organization.
 */
export interface VideoOrganizationResolver {
  /** The owning organization of `videoId`, or null when the video is absent. */
  organizationOf(videoId: Uuid): Promise<Uuid | null>;
}

/**
 * Authorization port for analytics reads. Deny-by-default: returns `true` only
 * when `actor` is permitted to read analytics for `orgId` (Administrator-only,
 * R28.4).
 */
export interface AnalyticsAuthorizer {
  /** Whether `actor` may read analytics for `orgId`. */
  isAdministrator(actor: AnalyticsActor, orgId: Uuid): Promise<boolean>;
}

/** Dependencies required to construct an {@link AnalyticsService}. */
export interface AnalyticsServiceDeps {
  /** View-event persistence port. */
  readonly store: ViewEventStore;
  /** Resolves a video's owning organization for view scoping. */
  readonly videos: VideoOrganizationResolver;
  /** Administrator-only gate for aggregation reads. */
  readonly authorizer: AnalyticsAuthorizer;
}

/**
 * View-event recording and organization-scoped aggregation. See the module doc
 * for the exact semantics of {@link AnalyticsService.recordView} and
 * {@link AnalyticsService.aggregate}.
 */
export class AnalyticsService {
  private readonly store: ViewEventStore;
  private readonly videos: VideoOrganizationResolver;
  private readonly authorizer: AnalyticsAuthorizer;

  constructor(deps: AnalyticsServiceDeps) {
    this.store = deps.store;
    this.videos = deps.videos;
    this.authorizer = deps.authorizer;
  }

  /**
   * Record a view of `videoId` by `memberId` at `at`, scoped to the
   * Organization that owns the Video (R28.1). The owning organization is
   * resolved from the Video, so a view is never attributed to another tenant;
   * a view of an unknown Video is rejected with `NOT_FOUND` and nothing is
   * recorded. A malformed timestamp is rejected with `VALIDATION_FAILED`.
   */
  async recordView(
    memberId: Uuid,
    videoId: Uuid,
    at: Date,
  ): Promise<void> {
    if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
      throw new AppError("VALIDATION_FAILED");
    }

    const organizationId = await this.videos.organizationOf(videoId);
    if (!organizationId) {
      throw new AppError("NOT_FOUND");
    }

    const event: ViewEventRecord = {
      id: newUuid(),
      organizationId,
      videoId,
      memberId,
      at: at.toISOString() as IsoTimestamp,
    };
    await this.store.record(event);
  }

  /**
   * Aggregate playback {@link Metrics} for `orgId` over `range`.
   *
   * Administrator-only and range-validated. The authorization gate is checked
   * first: an actor the {@link AnalyticsAuthorizer} rejects is denied with
   * `AUTHORIZATION_DENIED` and no analytics are read or returned (R28.4). A
   * malformed range, or one whose `end` precedes its `start`, is then rejected
   * with `VALIDATION_FAILED` and no analytics are returned (R28.5). Otherwise
   * the metrics are computed strictly over the events owned by `orgId` whose
   * timestamp falls within the inclusive range, so data from other
   * organizations is never included (R28.2, R28.3).
   */
  async aggregate(
    actor: AnalyticsActor,
    orgId: Uuid,
    range: TimeRange,
  ): Promise<Metrics> {
    // R28.4 — Administrator-only gate, evaluated before any data is read so a
    // non-Administrator receives no analytics and cannot probe range validity.
    const permitted = await this.authorizer.isAdministrator(actor, orgId);
    if (!permitted) {
      throw new AppError("AUTHORIZATION_DENIED");
    }

    // R28.5 — reject malformed ranges and ranges whose end precedes start.
    if (!isValidRange(range)) {
      throw new AppError("VALIDATION_FAILED");
    }

    // R28.2 / R28.3 — read is organization-scoped, so only this org's events
    // are ever considered; other organizations' data cannot leak in.
    const events = await this.store.listByOrganization(orgId);
    const startMs = range.start.getTime();
    const endMs = range.end.getTime();

    let totalViews = 0;
    let totalWatchDuration = 0;
    const viewers = new Set<Uuid>();
    for (const event of events) {
      const at = Date.parse(event.at);
      if (Number.isNaN(at) || at < startMs || at > endMs) {
        continue;
      }
      totalViews += 1;
      viewers.add(event.memberId);
      totalWatchDuration += watchDurationOf(event);
    }

    return {
      totalViews,
      distinctViewers: viewers.size,
      totalWatchDuration,
    };
  }
}

/**
 * The per-view watch duration (seconds) that contributes to
 * {@link Metrics.totalWatchDuration}.
 *
 * The current ViewEvent model (see `ViewEventRecord`) captures a view
 * occurrence — video, member, and timestamp — without a per-view duration, so
 * there is no watch time to sum and this contributes 0. The aggregation reads
 * the contribution per event (rather than assuming 0 globally) so total watch
 * duration is computed correctly once the event model records durations.
 */
function watchDurationOf(event: ViewEventRecord): number {
  const candidate = (event as { watchDuration?: unknown }).watchDuration;
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : 0;
}

/** True when `range` has two valid dates and `end` does not precede `start`. */
function isValidRange(range: TimeRange): boolean {
  if (!(range.start instanceof Date) || !(range.end instanceof Date)) {
    return false;
  }
  const start = range.start.getTime();
  const end = range.end.getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return false;
  }
  return end >= start;
}

/* --------------------------------------------------------------------------
 * Default adapters
 * ------------------------------------------------------------------------ */

/**
 * Default {@link ViewEventStore} backed by the tenant-scoped view-event
 * repository. The repository constrains every read to a single organization,
 * reinforcing the no-cross-organization guarantee at the storage boundary.
 */
export function repositoryViewEventStore(
  repositories: Pick<Repositories, "viewEvents">,
): ViewEventStore {
  const { viewEvents } = repositories;
  return {
    async record(event: ViewEventRecord): Promise<void> {
      await viewEvents.insert(event);
    },
    listByOrganization(
      organizationId: Uuid,
    ): Promise<readonly ViewEventRecord[]> {
      return viewEvents.listByOrganization(organizationId);
    },
  };
}

/**
 * Default {@link VideoOrganizationResolver} backed by the video repository. It
 * resolves a video by its globally-unique id and exposes only its owning
 * organization, so the caller can scope a recorded view to that organization.
 */
export function repositoryVideoOrganizationResolver(
  repositories: Pick<Repositories, "videos">,
): VideoOrganizationResolver {
  const { videos } = repositories;
  return {
    async organizationOf(videoId: Uuid): Promise<Uuid | null> {
      const video = await videos.findByIdUnscoped(videoId);
      return video ? video.organizationId : null;
    },
  };
}

/* --------------------------------------------------------------------------
 * Authorization bridge
 * ------------------------------------------------------------------------ */

/** The permission a Role must grant to read Organization analytics. */
export const ANALYTICS_READ_PERMISSION = "analytics:read" as const;

/**
 * A deny-by-default permission check, structurally compatible with the RBAC
 * evaluator's `AccessControl.can` from `@streetstudio/auth`. Declaring it here
 * lets the composition root bridge RBAC into {@link AnalyticsAuthorizer}
 * without this package depending on `@streetstudio/auth`.
 */
export interface AnalyticsPermissionCheck {
  can(
    actor: AnalyticsActor,
    action: string,
    resource: { readonly organizationId: Uuid },
  ): Promise<boolean>;
}

/**
 * Adapt a deny-by-default permission check (e.g. the RBAC evaluator) into an
 * {@link AnalyticsAuthorizer}. Analytics reads are gated on `action` (default
 * {@link ANALYTICS_READ_PERMISSION}), which only an Administrator Role grants,
 * evaluated in the target organization's owning scope (R28.4).
 */
export function permissionAnalyticsAuthorizer(
  access: AnalyticsPermissionCheck,
  action: string = ANALYTICS_READ_PERMISSION,
): AnalyticsAuthorizer {
  return {
    isAdministrator(actor: AnalyticsActor, orgId: Uuid): Promise<boolean> {
      return access.can(actor, action, { organizationId: orgId });
    },
  };
}
