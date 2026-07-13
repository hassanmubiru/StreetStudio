import { describe, expect, it } from "vitest";
import type { WebhookRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import {
  WebhookDeliveryWorker,
  type PlatformEvent,
  type Sleeper,
  type WebhookDeliveryClient,
  type WebhookDeliveryRequest,
} from "./delivery.js";
import { verifySignature } from "./signature.js";
import type { WebhookStore } from "./webhook-service.js";

const ORG = "org-1" as Uuid;

function subscription(overrides: Partial<WebhookRecord> = {}): WebhookRecord {
  return {
    id: "sub-1" as Uuid,
    organizationId: ORG,
    eventType: "video.ready",
    url: "https://ex.com/hook",
    signingSecret: "secret",
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** In-memory store seeded with subscriptions; supports deletion mid-run. */
function memoryStore(initial: WebhookRecord[]): WebhookStore & {
  rows: Map<string, WebhookRecord>;
} {
  const rows = new Map(initial.map((r) => [r.id, r] as const));
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

const noSleep: Sleeper = { sleep: async () => {} };
const clock = { nowMs: () => 0 };
const event: PlatformEvent = { organizationId: ORG, eventType: "video.ready", data: { a: 1 } };

/** A client that records requests and returns a scripted status per call. */
function scriptedClient(statuses: number[]): WebhookDeliveryClient & {
  requests: WebhookDeliveryRequest[];
} {
  const requests: WebhookDeliveryRequest[] = [];
  let i = 0;
  return {
    requests,
    async post(request) {
      requests.push(request);
      const statusCode = statuses[Math.min(i, statuses.length - 1)] ?? 500;
      i++;
      return { statusCode };
    },
  };
}

describe("WebhookDeliveryWorker.deliver", () => {
  it("delivers a signed payload on the first success and stops", async () => {
    const store = memoryStore([subscription()]);
    const client = scriptedClient([200]);
    const worker = new WebhookDeliveryWorker({ store, client, sleeper: noSleep, clock });

    const [outcome] = await worker.deliver(event);

    expect(outcome?.delivered).toBe(true);
    expect(outcome?.attempts).toBe(1);
    expect(client.requests).toHaveLength(1);
    const req = client.requests[0]!;
    expect(req.timeoutMs).toBe(10_000);
    const signature = req.headers["X-StreetStudio-Signature"]!;
    expect(verifySignature("secret", req.body, signature)).toBe(true);
    expect(verifySignature("wrong", req.body, signature)).toBe(false);
  });

  it("retries at most 5 additional times then records failure", async () => {
    const store = memoryStore([subscription()]);
    const client = scriptedClient([500]);
    const recorded: unknown[] = [];
    const worker = new WebhookDeliveryWorker({
      store,
      client,
      sleeper: noSleep,
      clock,
      recorder: { record: (o) => void recorded.push(o) },
    });

    const [outcome] = await worker.deliver(event);

    expect(outcome?.delivered).toBe(false);
    expect(outcome?.attempts).toBe(6); // 1 initial + 5 retries
    expect(outcome?.stoppedReason).toBe("exhausted");
    expect(client.requests).toHaveLength(6);
    expect(recorded).toHaveLength(1);
  });

  it("uses non-decreasing exponential backoff", () => {
    const worker = new WebhookDeliveryWorker({
      store: memoryStore([]),
      client: scriptedClient([200]),
      sleeper: noSleep,
      clock,
    });
    const delays = [0, 1, 2, 3, 4].map((i) => worker.backoffMs(i));
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeGreaterThanOrEqual(delays[i - 1]!);
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it("treats a client rejection (timeout) as a failed attempt", async () => {
    const store = memoryStore([subscription()]);
    let calls = 0;
    const client: WebhookDeliveryClient = {
      async post() {
        calls++;
        if (calls === 1) throw new Error("timeout");
        return { statusCode: 200 };
      },
    };
    const worker = new WebhookDeliveryWorker({ store, client, sleeper: noSleep, clock });

    const [outcome] = await worker.deliver(event);
    expect(outcome?.delivered).toBe(true);
    expect(outcome?.attempts).toBe(2);
  });

  it("stops delivering once the subscription is deleted", async () => {
    const store = memoryStore([subscription()]);
    // Client fails, and the sleeper deletes the subscription during backoff.
    const client = scriptedClient([500]);
    const sleeper: Sleeper = {
      async sleep() {
        store.rows.delete("sub-1");
      },
    };
    const worker = new WebhookDeliveryWorker({ store, client, sleeper, clock });

    const [outcome] = await worker.deliver(event);
    expect(outcome?.delivered).toBe(false);
    expect(outcome?.stoppedReason).toBe("deleted");
    // One failed attempt, then deletion is observed before the second attempt.
    expect(client.requests).toHaveLength(1);
  });
});
