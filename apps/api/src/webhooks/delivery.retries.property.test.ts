import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { WebhookRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import {
  WebhookDeliveryWorker,
  MAX_RETRIES,
  type DeliveryRecorder,
  type PlatformEvent,
  type Sleeper,
  type WebhookDeliveryClient,
  type WebhookDeliveryOutcome,
  type WebhookDeliveryRequest,
} from "./delivery.js";
import type { Clock } from "../security/clock.js";
import type { WebhookStore } from "./webhook-service.js";

/**
 * Property 62: Webhook delivery retries are bounded with backoff.
 *
 * Feature: streetstudio, Property 62: Webhook delivery retries are bounded with
 * backoff
 *
 * Validates: Requirements 19.5, 19.6
 *
 * For any webhook delivery that does not receive a success response within the
 * timeout, delivery is retried at most 5 additional times (MAX_RETRIES + 1 = 6
 * total attempts) using non-decreasing exponential backoff intervals between
 * attempts. When a success response is received the worker stops early; when
 * every attempt fails the worker stops and records the delivery as failed
 * (exhausted). The injectable network, sleep, and clock seams are used with a
 * fake sleeper so no real waits occur.
 */

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

const ORG = "org-1" as Uuid;
const fixedClock: Clock = { nowMs: () => 0 };
const event: PlatformEvent = {
  organizationId: ORG,
  eventType: "video.ready",
  data: { a: 1 },
};

function subscription(): WebhookRecord {
  return {
    id: "sub-1" as Uuid,
    organizationId: ORG,
    eventType: "video.ready",
    url: "https://ex.com/hook",
    signingSecret: "secret",
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

/** Minimal single-subscription store; never deletes, so retries run to bound. */
function memoryStore(): WebhookStore {
  const row = subscription();
  return {
    async create(record) {
      return record;
    },
    async findById(organizationId, id) {
      return id === row.id && organizationId === row.organizationId
        ? row
        : null;
    },
    async listByEvent(organizationId, eventType) {
      return organizationId === row.organizationId &&
        eventType === row.eventType
        ? [row]
        : [];
    },
    async deleteById() {
      /* not exercised by this property */
    },
  };
}

/** A client that returns a scripted status per call and records requests. */
function scriptedClient(statuses: number[]): WebhookDeliveryClient & {
  requests: WebhookDeliveryRequest[];
} {
  const requests: WebhookDeliveryRequest[] = [];
  let i = 0;
  return {
    requests,
    async post(request) {
      requests.push(request);
      // On overflow, keep failing so the run never succeeds by accident.
      const statusCode = i < statuses.length ? statuses[i]! : 500;
      i++;
      return { statusCode };
    },
  };
}

/** A fake sleeper that records the backoff intervals requested (no real wait). */
function recordingSleeper(): Sleeper & { delays: number[] } {
  const delays: number[] = [];
  return {
    delays,
    async sleep(ms: number) {
      delays.push(ms);
    },
  };
}

function isSuccess(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

/** The zero-based index of the first success within the first 6 attempts. */
function firstSuccessIndex(statuses: number[]): number {
  const total = MAX_RETRIES + 1;
  for (let i = 0; i < total; i++) {
    const s = i < statuses.length ? statuses[i]! : 500;
    if (isSuccess(s)) return i;
  }
  return -1;
}

/* -------------------------------------------------------------------------
 * Property
 * ---------------------------------------------------------------------- */

describe("Property 62: Webhook delivery retries are bounded with backoff", () => {
  it("makes at most MAX_RETRIES+1 attempts, backs off non-decreasingly, stops early on success, and records exhausted failures", async () => {
    // Status codes across the whole HTTP range; 2xx counts as success.
    const statusArb = fc.integer({ min: 100, max: 599 });

    await fc.assert(
      fc.asyncProperty(
        fc.array(statusArb, { minLength: 0, maxLength: 12 }),
        async (statuses) => {
          const store = memoryStore();
          const client = scriptedClient(statuses);
          const sleeper = recordingSleeper();
          const recorded: WebhookDeliveryOutcome[] = [];
          const recorder: DeliveryRecorder = {
            record: (o) => void recorded.push(o),
          };
          const worker = new WebhookDeliveryWorker({
            store,
            client,
            sleeper,
            clock: fixedClock,
            recorder,
          });

          const [outcome] = await worker.deliver(event);
          expect(outcome).toBeDefined();
          const result = outcome!;

          const maxAttempts = MAX_RETRIES + 1; // 6

          // Bound: never more than 6 total attempts, and requests match attempts.
          expect(result.attempts).toBeGreaterThanOrEqual(1);
          expect(result.attempts).toBeLessThanOrEqual(maxAttempts);
          expect(client.requests).toHaveLength(result.attempts);

          // Backoff happens only *between* attempts, so exactly attempts-1 sleeps.
          expect(sleeper.delays).toHaveLength(result.attempts - 1);
          // Backoff intervals are non-decreasing and match backoffMs(index).
          for (let i = 0; i < sleeper.delays.length; i++) {
            expect(sleeper.delays[i]).toBe(worker.backoffMs(i));
            if (i > 0) {
              expect(sleeper.delays[i]!).toBeGreaterThanOrEqual(
                sleeper.delays[i - 1]!,
              );
            }
          }

          const successAt = firstSuccessIndex(statuses);
          if (successAt >= 0) {
            // Success stops early: exactly successAt+1 attempts, no more.
            expect(result.delivered).toBe(true);
            expect(result.stoppedReason).toBe("delivered");
            expect(result.attempts).toBe(successAt + 1);
            expect(recorded).toHaveLength(1);
            expect(recorded[0]).toBe(result);
          } else {
            // Every attempt failed: exhausted after exactly 6 attempts, recorded.
            expect(result.delivered).toBe(false);
            expect(result.stoppedReason).toBe("exhausted");
            expect(result.attempts).toBe(maxAttempts);
            expect(recorded).toHaveLength(1);
            expect(recorded[0]!.delivered).toBe(false);
            expect(recorded[0]!.stoppedReason).toBe("exhausted");
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
