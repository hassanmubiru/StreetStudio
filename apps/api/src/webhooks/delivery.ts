/**
 * Signed webhook delivery worker (Requirements 19.3, 19.4, 19.5, 19.6).
 *
 * When a subscribed event occurs, the worker delivers a signed payload
 * containing the event type and event data to every matching registered
 * endpoint. Each delivery:
 *
 *  - carries an HMAC-SHA256 signature over the exact payload bytes so the
 *    receiver can verify authenticity and integrity (R19.4);
 *  - targets the endpoint within the 30-second budget — delivery is attempted
 *    immediately with a per-attempt 10-second response timeout (R19.3, R19.5);
 *  - on a non-success response, timeout, or transport error, is retried up to 5
 *    additional times (6 attempts total) using non-decreasing exponential
 *    backoff intervals (R19.5);
 *  - once all retries are exhausted without a success response, stops retrying
 *    and is recorded as failed (R19.6).
 *
 * Deletion awareness (R19.7): the worker re-reads the subscription from the
 * shared {@link WebhookStore} before every attempt. A subscription deleted via
 * {@link WebhookService.delete} therefore stops receiving deliveries on the very
 * next attempt, well within the 60-second bound.
 *
 * The network and time are behind narrow, injectable seams
 * ({@link WebhookDeliveryClient}, {@link Sleeper}, {@link Clock}) so delivery is
 * fully testable without a real network or wall-clock waits.
 */
import type { WebhookRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import { systemClock, type Clock } from "../security/clock.js";
import { SIGNATURE_HEADER, signPayload } from "./signature.js";
import type { WebhookStore } from "./webhook-service.js";

/** Per-attempt response timeout, in milliseconds (R19.5: 10 seconds). */
export const RESPONSE_TIMEOUT_MS = 10_000;

/** Maximum number of additional retries after the first attempt (R19.5). */
export const MAX_RETRIES = 5;

/** Base backoff interval, in milliseconds, doubled on each retry. */
export const DEFAULT_BASE_BACKOFF_MS = 1_000;

/** An event to be delivered to matching webhook subscriptions. */
export interface PlatformEvent {
  /** The organization whose subscriptions should receive this event. */
  readonly organizationId: Uuid;
  /** The kind of event; matched against subscription event types (R19.3). */
  readonly eventType: string;
  /** The event body delivered to the endpoint (R19.3). */
  readonly data: unknown;
  /** Stable event id, used for idempotency/tracing when present. */
  readonly id?: Uuid;
}

/** A single outbound delivery request handed to the {@link WebhookDeliveryClient}. */
export interface WebhookDeliveryRequest {
  /** Destination endpoint URL (a validated HTTPS URL). */
  readonly url: string;
  /** The exact payload bytes to send. */
  readonly body: string;
  /** Headers to send, including the signature header. */
  readonly headers: Readonly<Record<string, string>>;
  /** Response timeout, in milliseconds; the client MUST NOT wait longer. */
  readonly timeoutMs: number;
}

/** The client's report of a single delivery attempt. */
export interface WebhookDeliveryResponse {
  /** HTTP status code returned by the endpoint. */
  readonly statusCode: number;
}

/**
 * The HTTP delivery seam. Implementations POST `request.body` to `request.url`
 * and resolve with the response, honoring `request.timeoutMs`. A timeout or
 * transport failure MAY be reported either by rejecting or by resolving with a
 * non-2xx status; both are treated as a failed attempt.
 */
export interface WebhookDeliveryClient {
  post(request: WebhookDeliveryRequest): Promise<WebhookDeliveryResponse>;
}

/** Sleep seam, so backoff waits are deterministic (and instant) under test. */
export interface Sleeper {
  sleep(ms: number): Promise<void>;
}

/** Default {@link Sleeper} backed by `setTimeout`. */
export const realSleeper: Sleeper = {
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
};

/** The terminal result of delivering an event to one subscription. */
export interface WebhookDeliveryOutcome {
  /** The subscription the event was delivered to. */
  readonly subscriptionId: Uuid;
  /** The event type delivered. */
  readonly eventType: string;
  /** Whether a success response was received. */
  readonly delivered: boolean;
  /** Number of attempts made (1 = succeeded/failed on first try, up to 6). */
  readonly attempts: number;
  /** Why delivery stopped: success, exhausted retries, or the sub was deleted. */
  readonly stoppedReason: "delivered" | "exhausted" | "deleted";
}

/**
 * Recorder seam for delivery outcomes (R19.6: record failed deliveries).
 * Defaults to a no-op; production wiring persists attempts to a store.
 */
export interface DeliveryRecorder {
  record(outcome: WebhookDeliveryOutcome): Promise<void> | void;
}

/** Dependencies required to construct a {@link WebhookDeliveryWorker}. */
export interface WebhookDeliveryWorkerDeps {
  /** Subscription store, shared with {@link WebhookService} (R19.7). */
  readonly store: WebhookStore;
  /** HTTP delivery client seam. */
  readonly client: WebhookDeliveryClient;
  /** Sleep seam for backoff; defaults to {@link realSleeper}. */
  readonly sleeper?: Sleeper;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
  /** Outcome recorder; defaults to a no-op. */
  readonly recorder?: DeliveryRecorder;
  /** Per-attempt response timeout in ms; defaults to {@link RESPONSE_TIMEOUT_MS}. */
  readonly responseTimeoutMs?: number;
  /** Base backoff in ms; defaults to {@link DEFAULT_BASE_BACKOFF_MS}. */
  readonly baseBackoffMs?: number;
  /** Maximum additional retries; defaults to {@link MAX_RETRIES}. */
  readonly maxRetries?: number;
}

/** A success response is any 2xx status code. */
function isSuccess(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

export class WebhookDeliveryWorker {
  private readonly store: WebhookStore;
  private readonly client: WebhookDeliveryClient;
  private readonly sleeper: Sleeper;
  private readonly clock: Clock;
  private readonly recorder: DeliveryRecorder | undefined;
  private readonly responseTimeoutMs: number;
  private readonly baseBackoffMs: number;
  private readonly maxRetries: number;

  constructor(deps: WebhookDeliveryWorkerDeps) {
    this.store = deps.store;
    this.client = deps.client;
    this.sleeper = deps.sleeper ?? realSleeper;
    this.clock = deps.clock ?? systemClock;
    this.recorder = deps.recorder;
    this.responseTimeoutMs = deps.responseTimeoutMs ?? RESPONSE_TIMEOUT_MS;
    this.baseBackoffMs = deps.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
    this.maxRetries = deps.maxRetries ?? MAX_RETRIES;
  }

  /**
   * The non-decreasing exponential backoff interval, in milliseconds, before
   * the retry with (zero-based) index `retryIndex`. Exposed for tests and
   * scheduler wiring.
   */
  backoffMs(retryIndex: number): number {
    return this.baseBackoffMs * 2 ** retryIndex;
  }

  /**
   * Deliver `event` to every subscription registered for its event type in the
   * event's organization, returning one {@link WebhookDeliveryOutcome} per
   * subscription. Subscriptions are read from the store, so any deleted before
   * delivery are not contacted (R19.7).
   */
  async deliver(event: PlatformEvent): Promise<WebhookDeliveryOutcome[]> {
    const subscriptions = await this.store.listByEvent(
      event.organizationId,
      event.eventType,
    );
    const outcomes: WebhookDeliveryOutcome[] = [];
    for (const subscription of subscriptions) {
      outcomes.push(await this.deliverToSubscription(subscription, event));
    }
    return outcomes;
  }

  /* -------------------------- internals -------------------------------- */

  private async deliverToSubscription(
    subscription: WebhookRecord,
    event: PlatformEvent,
  ): Promise<WebhookDeliveryOutcome> {
    const body = this.serialize(subscription, event);
    const signature = signPayload(subscription.signingSecret, body);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      [SIGNATURE_HEADER]: signature,
    };

    // 1 initial attempt plus up to `maxRetries` retries.
    const totalAttempts = this.maxRetries + 1;
    let attempts = 0;

    for (let attempt = 0; attempt < totalAttempts; attempt++) {
      // Re-read before each attempt so a deletion stops delivery (R19.7).
      const live = await this.store.findById(
        subscription.organizationId,
        subscription.id,
      );
      if (!live) {
        return this.finish({
          subscriptionId: subscription.id,
          eventType: event.eventType,
          delivered: false,
          attempts,
          stoppedReason: "deleted",
        });
      }

      attempts++;
      if (await this.attemptDelivery({ url: live.url, body, headers })) {
        return this.finish({
          subscriptionId: subscription.id,
          eventType: event.eventType,
          delivered: true,
          attempts,
          stoppedReason: "delivered",
        });
      }

      // Wait the (non-decreasing) backoff before the next retry, if any.
      if (attempt < totalAttempts - 1) {
        await this.sleeper.sleep(this.backoffMs(attempt));
      }
    }

    return this.finish({
      subscriptionId: subscription.id,
      eventType: event.eventType,
      delivered: false,
      attempts,
      stoppedReason: "exhausted",
    });
  }

  /** Perform a single delivery attempt; true iff a 2xx response was received. */
  private async attemptDelivery(
    request: Omit<WebhookDeliveryRequest, "timeoutMs">,
  ): Promise<boolean> {
    try {
      const response = await this.client.post({
        ...request,
        timeoutMs: this.responseTimeoutMs,
      });
      return isSuccess(response.statusCode);
    } catch {
      // Timeout or transport error — treated as a failed attempt (R19.5).
      return false;
    }
  }

  /** The canonical, signed payload for a delivery (R19.3, R19.4). */
  private serialize(
    subscription: WebhookRecord,
    event: PlatformEvent,
  ): string {
    return JSON.stringify({
      id: event.id,
      subscriptionId: subscription.id,
      eventType: event.eventType,
      data: event.data,
      deliveredAt: new Date(this.clock.nowMs()).toISOString(),
    });
  }

  private async finish(
    outcome: WebhookDeliveryOutcome,
  ): Promise<WebhookDeliveryOutcome> {
    if (this.recorder) {
      await this.recorder.record(outcome);
    }
    return outcome;
  }
}
