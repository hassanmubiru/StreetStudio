import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { WebhookRecord } from "@streetstudio/database";
import type { AuthContext } from "@streetstudio/auth";
import type { Uuid } from "@streetstudio/shared";
import {
  WebhookDeliveryWorker,
  type PlatformEvent,
  type Sleeper,
  type WebhookDeliveryClient,
  type WebhookDeliveryRequest,
} from "./delivery.js";
import {
  WebhookService,
  DEFAULT_SUPPORTED_EVENT_TYPES,
  type WebhookStore,
} from "./webhook-service.js";
import type { Clock } from "../security/clock.js";

/**
 * Property 63: Deleting a webhook stops deliveries.
 *
 * Feature: streetstudio, Property 63: Deleting a webhook stops deliveries
 *
 * Validates: Requirements 19.7
 *
 * For any deleted webhook subscription, no further events are delivered to its
 * endpoint. Concretely: once a subscription is removed via
 * {@link WebhookService.delete} — either before delivery begins or between
 * retry attempts — the {@link WebhookDeliveryWorker}, which re-reads the
 * subscription from the shared {@link WebhookStore} before every attempt, makes
 * no further delivery attempts to that endpoint and reports a `"deleted"` stop
 * reason. The delivery is never marked delivered, and the number of attempts
 * made to the endpoint equals the number made before the deletion (zero if the
 * subscription was deleted before delivery started).
 */

/* -------------------------------------------------------------------------
 * Test doubles (mirroring the shared in-memory store/client/sleeper doubles
 * used by delivery.test.ts and webhook-service.test.ts).
 * ---------------------------------------------------------------------- */

const MEMBER = "member-1" as Uuid;
const fixedClock: Clock = {
  nowMs: () => Date.parse("2024-01-01T00:00:00.000Z"),
};

/** Shared in-memory subscription store so deletes are visible to the worker. */
function memoryStore(): WebhookStore & { rows: Map<string, WebhookRecord> } {
  const rows = new Map<string, WebhookRecord>();
  return {
    rows,
    async create(record) {
      rows.set(record.id, record);
      return record;
    },
    async findById(organizationId, id) {
      const row = rows.get(id);
      return row && row.organizationId === organizationId ? row : null;
    },
    async listByEvent(organizationId, eventType) {
      return [...rows.values()].filter(
        (r) => r.organizationId === organizationId && r.eventType === eventType,
      );
    },
    async deleteById(_organizationId, id) {
      rows.delete(id);
    },
  };
}

/**
 * A client that records every request and always reports a failure status, so
 * delivery keeps retrying until it is stopped by a deletion (or exhaustion).
 */
function failingClient(): WebhookDeliveryClient & {
  requests: WebhookDeliveryRequest[];
} {
  const requests: WebhookDeliveryRequest[] = [];
  return {
    requests,
    async post(request) {
      requests.push(request);
      return { statusCode: 500 };
    },
  };
}

/** Backoff waits are irrelevant here; make them instant. */
const noSleep: Sleeper = { sleep: async () => {} };

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

const MAX_RETRIES = 5; // worker default: 1 initial + 5 retries = 6 attempts.

// Deletion point, expressed as the number of delivery attempts allowed before
// the subscription is deleted:
//   0        -> delete before delivery begins (no attempt should ever be made)
//   1..5     -> delete during the backoff that follows the Nth failed attempt,
//               so the (N+1)th attempt observes the deletion and stops.
const deleteAfterAttempts = fc.integer({ min: 0, max: MAX_RETRIES });

const eventType = fc.constantFrom(...DEFAULT_SUPPORTED_EVENT_TYPES);

const orgId = fc
  .integer({ min: 1, max: 9999 })
  .map((n) => `org-${n}` as Uuid);

const endpointUrl = fc
  .webUrl({ validSchemes: ["https"], withQueryParameters: true })
  .filter((u) => u.length <= 2048);

/* -------------------------------------------------------------------------
 * Property 63
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 63: Deleting a webhook stops deliveries", () => {
  it("makes no further attempts to a deleted subscription's endpoint and reports a 'deleted' stop reason", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgId,
        eventType,
        endpointUrl,
        deleteAfterAttempts,
        async (organizationId, type, url, deleteAt) => {
          const store = memoryStore();
          const ctx: AuthContext = { memberId: MEMBER, organizationId };

          // Register a real subscription through the service, using the shared
          // store so deletion is visible to the worker's pre-attempt re-read.
          const service = new WebhookService({
            store,
            clock: fixedClock,
            newId: (): Uuid => "sub-1" as Uuid,
            generateSecret: () => "secret-xyz",
          });
          const dto = await service.register(ctx, type, url);

          const client = failingClient();

          // The sleeper runs during backoff, after each failed attempt. Once
          // the recorded request count reaches the chosen threshold, delete the
          // subscription so the very next pre-attempt re-read stops delivery.
          let deleted = false;
          const sleeper: Sleeper = {
            async sleep() {
              if (
                deleteAt >= 1 &&
                !deleted &&
                client.requests.length >= deleteAt
              ) {
                deleted = true;
                await service.delete(ctx, dto.id);
              }
            },
          };

          // For the "delete before delivery begins" case, remove it up front.
          if (deleteAt === 0) {
            await service.delete(ctx, dto.id);
          }

          const worker = new WebhookDeliveryWorker({
            store,
            client,
            sleeper,
            clock: fixedClock,
          });
          const event: PlatformEvent = {
            organizationId,
            eventType: type,
            data: { a: 1 },
          };

          const [outcome] = await worker.deliver(event);

          // The subscription must actually be gone from the shared store.
          expect(store.rows.has(dto.id)).toBe(false);

          // Delivery stopped because the subscription was deleted; it was never
          // marked delivered.
          expect(outcome).toBeDefined();
          expect(outcome?.delivered).toBe(false);
          expect(outcome?.stoppedReason).toBe("deleted");
          expect(outcome?.subscriptionId).toBe(dto.id);

          // No attempt is ever made after the deletion: the endpoint receives
          // exactly the attempts that happened before it, and no more.
          expect(client.requests.length).toBe(deleteAt);
          expect(outcome?.attempts).toBe(deleteAt);
          // Every recorded request targeted this subscription's endpoint.
          for (const req of client.requests) {
            expect(req.url).toBe(url);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
