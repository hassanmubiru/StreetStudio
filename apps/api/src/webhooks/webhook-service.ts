/**
 * Webhook subscription service (Requirements 19.1, 19.2, 19.7).
 *
 * Owns the lifecycle of outbound webhook subscriptions described in the
 * design's "Webhooks" section:
 *
 *  - {@link WebhookService.register} stores a subscription only for a supported
 *    event type with a well-formed HTTPS endpoint URL of at most 2,048
 *    characters, and returns a confirmation identifying the created
 *    subscription. Any unsupported event type, malformed URL, or non-HTTPS URL
 *    is rejected with a validation error and no subscription is stored (R19.1,
 *    R19.2).
 *  - {@link WebhookService.delete} removes a subscription so the delivery worker
 *    stops delivering events to that endpoint. Because the worker re-reads the
 *    subscription from the same store before every attempt, deletion takes
 *    effect well within the 60-second bound (R19.7).
 *
 * Both operations are permission-gated through the injectable
 * {@link WebhookAuthorizer}; a caller lacking webhook-management permission is
 * denied with `AUTHORIZATION_DENIED` and nothing is created or removed.
 *
 * Extension seams (narrow and injectable so no concrete vendor is hardcoded):
 *  - {@link WebhookStore} — persistence port, defaulted to a repository adapter
 *    over `@streetstudio/database` (see {@link repositoryWebhookStore}).
 *  - {@link WebhookAuthorizer} — the permission-check seam.
 *  - {@link Clock} — time source for the creation timestamp.
 *  - `newId` / `generateSecret` — id and signing-secret generators.
 *
 * The subscription's `signingSecret` is generated here and never returned in
 * the {@link WebhookDto} confirmation, matching the DTO contract that the secret
 * is never serialized.
 */
import { randomBytes } from "node:crypto";
import { newUuid } from "@streetstudio/database";
import type { Repositories, WebhookRecord } from "@streetstudio/database";
import { AppError } from "@streetstudio/shared";
import type { AuthContext } from "@streetstudio/auth";
import type { Uuid, WebhookDto } from "@streetstudio/shared";
import { systemClock, type Clock } from "../security/clock.js";

/** Maximum permitted webhook endpoint URL length, in characters (R19.1). */
export const MAX_WEBHOOK_URL_LENGTH = 2048;

/** Number of random bytes in a generated signing secret (256 bits). */
const SIGNING_SECRET_BYTES = 32;

/**
 * The default set of supported webhook event types (R19.2). Registration for
 * an event type outside this set is rejected. The set is injectable so a
 * deployment can extend it without changing this module.
 */
export const DEFAULT_SUPPORTED_EVENT_TYPES: readonly string[] = [
  "video.created",
  "video.ready",
  "video.failed",
  "comment.created",
  "comment.mention",
  "member.invited",
  "member.joined",
  "share.created",
  "share.accessed",
] as const;

/**
 * Persistence port for webhook subscriptions. Narrow by design: the service
 * creates and removes subscriptions and reads one by id; the delivery worker
 * additionally lists subscriptions by event type.
 */
export interface WebhookStore {
  /** Persist a new subscription record and return it. */
  create(record: WebhookRecord): Promise<WebhookRecord>;
  /** Find a subscription by id, scoped to its organization, or null. */
  findById(organizationId: Uuid, id: Uuid): Promise<WebhookRecord | null>;
  /** List every subscription in the organization for a given event type. */
  listByEvent(
    organizationId: Uuid,
    eventType: string,
  ): Promise<WebhookRecord[]>;
  /** Remove a subscription by id, scoped to its organization. */
  deleteById(organizationId: Uuid, id: Uuid): Promise<void>;
}

/**
 * Permission-check seam for webhook management (R19.1, R19.7). RBAC implements
 * this against the deny-by-default evaluator; this module only depends on the
 * narrow question "may this actor manage webhooks in this org?".
 */
export interface WebhookAuthorizer {
  /** True iff `actor` may register/delete webhooks within `organizationId`. */
  canManageWebhooks(actor: Uuid, organizationId: Uuid): Promise<boolean>;
}

/** Dependencies required to construct a {@link WebhookService}. */
export interface WebhookServiceDeps {
  /** Subscription persistence port. */
  readonly store: WebhookStore;
  /**
   * Permission-check seam. When omitted, management operations are permitted
   * (suitable for trusted/system callers and tests); production wiring supplies
   * the RBAC-backed authorizer.
   */
  readonly authorizer?: WebhookAuthorizer;
  /** Supported event types; defaults to {@link DEFAULT_SUPPORTED_EVENT_TYPES}. */
  readonly supportedEventTypes?: Iterable<string>;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
  /** UUID generator; defaults to the database id generator. */
  readonly newId?: () => Uuid;
  /** Signing-secret generator; defaults to a 256-bit CSPRNG token. */
  readonly generateSecret?: () => string;
}

/** Generate a URL-safe, 256-bit random signing secret. */
function defaultGenerateSecret(): string {
  return randomBytes(SIGNING_SECRET_BYTES).toString("base64url");
}

/**
 * Validate that `url` is a well-formed absolute HTTPS URL of at most
 * {@link MAX_WEBHOOK_URL_LENGTH} characters (R19.1, R19.2). Returns true only
 * for input that is safe to store and later deliver to.
 */
export function isValidWebhookUrl(url: string): boolean {
  if (typeof url !== "string" || url.length === 0) {
    return false;
  }
  if (url.length > MAX_WEBHOOK_URL_LENGTH) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "https:";
}

export class WebhookService {
  private readonly store: WebhookStore;
  private readonly authorizer: WebhookAuthorizer | undefined;
  private readonly supportedEventTypes: ReadonlySet<string>;
  private readonly clock: Clock;
  private readonly newId: () => Uuid;
  private readonly generateSecret: () => string;

  constructor(deps: WebhookServiceDeps) {
    this.store = deps.store;
    this.authorizer = deps.authorizer;
    this.supportedEventTypes = new Set(
      deps.supportedEventTypes ?? DEFAULT_SUPPORTED_EVENT_TYPES,
    );
    this.clock = deps.clock ?? systemClock;
    this.newId = deps.newId ?? newUuid;
    this.generateSecret = deps.generateSecret ?? defaultGenerateSecret;
  }

  /** The supported event types this service will accept registrations for. */
  supportedTypes(): string[] {
    return [...this.supportedEventTypes];
  }

  /**
   * Register a webhook for `eventType` delivering to `url` on behalf of `ctx`.
   *
   * Stored if and only if the caller is authorized, the event type is
   * supported, and the URL is a well-formed HTTPS URL of at most 2,048
   * characters; otherwise it is rejected with a validation/authorization error
   * and no subscription is stored (R19.1, R19.2). Returns the confirmation
   * {@link WebhookDto}, which identifies the created subscription and never
   * includes the signing secret.
   */
  async register(
    ctx: AuthContext,
    eventType: string,
    url: string,
  ): Promise<WebhookDto> {
    const organizationId = this.requireOrganization(ctx);
    await this.requireManagePermission(ctx.memberId, organizationId);

    if (!this.supportedEventTypes.has(eventType)) {
      throw new AppError("VALIDATION_FAILED", {
        details: { reason: "unsupported webhook event type" },
      });
    }
    if (!isValidWebhookUrl(url)) {
      throw new AppError("VALIDATION_FAILED", {
        details: { reason: "webhook URL must be HTTPS and <= 2048 characters" },
      });
    }

    const record: WebhookRecord = {
      id: this.newId(),
      organizationId,
      eventType,
      url,
      signingSecret: this.generateSecret(),
      createdAt: new Date(this.clock.nowMs()).toISOString(),
    };
    const created = await this.store.create(record);
    return toWebhookDto(created);
  }

  /**
   * Delete the subscription `subId` on behalf of `ctx`, stopping further
   * deliveries to its endpoint (R19.7). Requires webhook-management permission;
   * a caller without it is denied and nothing is removed. An unknown
   * subscription is reported as `NOT_FOUND`.
   */
  async delete(ctx: AuthContext, subId: Uuid): Promise<void> {
    const organizationId = this.requireOrganization(ctx);
    await this.requireManagePermission(ctx.memberId, organizationId);

    const record = await this.store.findById(organizationId, subId);
    if (!record) {
      throw new AppError("NOT_FOUND");
    }
    await this.store.deleteById(organizationId, subId);
  }

  /* -------------------------- internals -------------------------------- */

  private requireOrganization(ctx: AuthContext): Uuid {
    if (!ctx.organizationId) {
      throw new AppError("AUTHORIZATION_DENIED");
    }
    return ctx.organizationId;
  }

  private async requireManagePermission(
    actor: Uuid,
    organizationId: Uuid,
  ): Promise<void> {
    if (!this.authorizer) return;
    const allowed = await this.authorizer.canManageWebhooks(
      actor,
      organizationId,
    );
    if (!allowed) {
      throw new AppError("AUTHORIZATION_DENIED");
    }
  }
}

/* ---------------------------- helpers ---------------------------------- */

/** Project a record onto its DTO (never includes the signing secret). */
export function toWebhookDto(record: WebhookRecord): WebhookDto {
  return {
    id: record.id,
    organizationId: record.organizationId,
    eventType: record.eventType,
    url: record.url,
    createdAt: record.createdAt,
  };
}

/**
 * Default {@link WebhookStore} backed by the tenant-scoped webhook repository.
 * `listByEvent` filters the organization's subscriptions by event type, since
 * the repository exposes organization-scoped listing.
 */
export function repositoryWebhookStore(
  repositories: Pick<Repositories, "webhooks">,
): WebhookStore {
  const { webhooks } = repositories;
  return {
    create(record: WebhookRecord): Promise<WebhookRecord> {
      return webhooks.insert(record);
    },
    findById(organizationId: Uuid, id: Uuid): Promise<WebhookRecord | null> {
      return webhooks.findById(organizationId, id);
    },
    async listByEvent(
      organizationId: Uuid,
      eventType: string,
    ): Promise<WebhookRecord[]> {
      const all = await webhooks.listByOrganization(organizationId);
      return all.filter((w) => w.eventType === eventType);
    },
    deleteById(organizationId: Uuid, id: Uuid): Promise<void> {
      return webhooks.deleteById(organizationId, id);
    },
  };
}
