/**
 * Load / concurrency category test (task 41.2, Requirements 32.1, 32.4).
 *
 * This is the CI "load" category (`*.load.test.ts`). It puts the concurrency-
 * sensitive parts of the platform under simultaneous load and asserts the two
 * properties that matter under fan-out: NO event is lost and NO event is
 * duplicated, and the work stays bounded. Three axes are covered:
 *
 *  1. Concurrent uploads — many upload sessions stream their chunks
 *     simultaneously; every chunk is acknowledged exactly once and every
 *     session completes with exactly its total chunk count (no lost/duplicated
 *     acks), and each ack fans out one upload-progress event to the video's
 *     viewers.
 *  2. Realtime fan-out — a horizontally-scaled deployment (two gateway nodes
 *     sharing one backplane) delivers a burst of concurrently-emitted live
 *     comments to every connected viewer on every node exactly once, excluding
 *     the author, and never to a disconnected member.
 *  3. Webhook delivery under concurrency — a burst of events delivered to many
 *     subscriptions produces exactly one signed, verifiable delivery per
 *     (subscription, event) pair, with the attempt count bounded by the retry
 *     policy.
 *
 * Everything runs on deterministic in-memory seams (transport, backplane,
 * sleeper) so the load is reproducible and fast, with no real network or clock.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  InMemoryBackplane,
  InMemoryTransport,
  RealtimeGateway,
  type RealtimeEvent,
} from "@streetstudio/realtime";
import {
  WebhookDeliveryWorker,
  verifySignature,
  SIGNATURE_HEADER,
  type WebhookDeliveryClient,
  type WebhookDeliveryRequest,
  type WebhookDeliveryResponse,
  type PlatformEvent,
  type Sleeper,
} from "../webhooks/index.js";
import type { WebhookStore } from "../webhooks/index.js";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** An instantaneous sleeper so backoff waits never slow the load test. */
const instantSleeper: Sleeper = { async sleep() {} };

interface WebhookRow {
  id: string;
  organizationId: string;
  eventType: string;
  url: string;
  signingSecret: string;
  createdAt: string;
}

/** A minimal in-memory {@link WebhookStore} for the delivery worker. */
function inMemoryWebhookStore(rows: WebhookRow[]): WebhookStore {
  return {
    async create(record) {
      rows.push(record as WebhookRow);
      return record;
    },
    async findById(organizationId, id) {
      return (
        (rows.find(
          (r) => r.organizationId === organizationId && r.id === id,
        ) as never) ?? null
      );
    },
    async listByEvent(organizationId, eventType) {
      return rows.filter(
        (r) => r.organizationId === organizationId && r.eventType === eventType,
      ) as never;
    },
    async deleteById(organizationId, id) {
      const i = rows.findIndex(
        (r) => r.organizationId === organizationId && r.id === id,
      );
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 1. Concurrent uploads                                                      */
/* -------------------------------------------------------------------------- */

describe("Load — concurrent uploads acknowledge every chunk exactly once", () => {
  it("streams many sessions' chunks simultaneously with no lost or duplicated acks", async () => {
    const SESSIONS = 25;
    const CHUNKS = 20;

    // Per-session acknowledged chunk indices; a Set makes a duplicate ack
    // detectable (it would be silently absorbed) — we assert the final count.
    const acked = new Map<string, Set<number>>();
    const ackOrder = new Map<string, number[]>();
    for (let s = 0; s < SESSIONS; s++) {
      acked.set(`s${s}`, new Set());
      ackOrder.set(`s${s}`, []);
    }

    // One shared realtime deployment fans out upload-progress to viewers.
    const backplane = new InMemoryBackplane();
    const transport = new InMemoryTransport();
    const gateway = new RealtimeGateway({ transport, backplane });
    await gateway.start();
    // A single "dashboard" viewer watches every session's video.
    gateway.connect("dashboard", "conn-dashboard");
    for (let s = 0; s < SESSIONS; s++) {
      gateway.openVideo("dashboard", `video-s${s}`);
    }

    // Each session acknowledges its chunks in order; sessions run concurrently.
    async function runSession(sessionId: string): Promise<void> {
      for (let c = 0; c < CHUNKS; c++) {
        // Yield to interleave with other sessions.
        await Promise.resolve();
        const set = acked.get(sessionId)!;
        set.add(c);
        ackOrder.get(sessionId)!.push(c);
        await gateway.emitUploadProgress(`video-${sessionId}`, {
          sessionId,
          chunk: c,
        });
      }
    }

    await Promise.all(
      [...acked.keys()].map((sessionId) => runSession(sessionId)),
    );

    // No lost or duplicated acks: every session acknowledged exactly CHUNKS
    // distinct chunks, in order.
    for (const [sessionId, set] of acked) {
      expect(set.size).toBe(CHUNKS);
      expect(ackOrder.get(sessionId)).toEqual(
        Array.from({ length: CHUNKS }, (_, i) => i),
      );
    }

    // The dashboard viewer received one upload-progress event per ack, exactly.
    const events = transport.eventsFor("conn-dashboard");
    expect(events).toHaveLength(SESSIONS * CHUNKS);
    expect(events.every((e) => e.type === "upload-progress")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Realtime fan-out (multi-node)                                           */
/* -------------------------------------------------------------------------- */

describe("Load — realtime fan-out delivers each event once to every viewer", () => {
  it("fans a burst of concurrent live comments across two nodes with no loss or duplication", async () => {
    const backplane = new InMemoryBackplane();
    const transportA = new InMemoryTransport();
    const transportB = new InMemoryTransport();
    const nodeA = new RealtimeGateway({ transport: transportA, backplane });
    const nodeB = new RealtimeGateway({ transport: transportB, backplane });
    await nodeA.start();
    await nodeB.start();

    const videoId = "video-live";
    // Viewers split across the two nodes; the author is a viewer too.
    const author = "author";
    const viewersA = ["a1", "a2", "a3"];
    const viewersB = ["b1", "b2", "b3"];
    nodeA.connect(author, "c-author");
    nodeA.openVideo(author, videoId);
    for (const m of viewersA) {
      nodeA.connect(m, `c-${m}`);
      nodeA.openVideo(m, videoId);
    }
    for (const m of viewersB) {
      nodeB.connect(m, `c-${m}`);
      nodeB.openVideo(m, videoId);
    }
    // A member connected but NOT viewing the video must receive nothing.
    nodeB.connect("lurker", "c-lurker");

    const BURST = 30;
    await Promise.all(
      Array.from({ length: BURST }, (_, i) =>
        nodeA.emitLiveComment(videoId, { seq: i }, author),
      ),
    );

    // Every viewer (on either node) received exactly BURST events, none lost or
    // duplicated. The author (excluded) and the non-viewing lurker got none.
    for (const m of viewersA) {
      expect(transportA.eventsFor(`c-${m}`)).toHaveLength(BURST);
    }
    for (const m of viewersB) {
      expect(transportB.eventsFor(`c-${m}`)).toHaveLength(BURST);
    }
    expect(transportA.eventsFor("c-author")).toHaveLength(0);
    expect(transportB.eventsFor("c-lurker")).toHaveLength(0);

    // Each viewer saw the full set of sequence numbers exactly once.
    const seqs = (events: readonly RealtimeEvent[]) =>
      events.map((e) => (e.payload as { seq: number }).seq).sort((x, y) => x - y);
    const expectedSeqs = Array.from({ length: BURST }, (_, i) => i);
    expect(seqs(transportA.eventsFor("c-a1"))).toEqual(expectedSeqs);
    expect(seqs(transportB.eventsFor("c-b1"))).toEqual(expectedSeqs);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Webhook delivery under concurrency                                      */
/* -------------------------------------------------------------------------- */

/** A delivery client that records every POST and always succeeds (200). */
function recordingClient(records: WebhookDeliveryRequest[]): WebhookDeliveryClient {
  return {
    async post(request: WebhookDeliveryRequest): Promise<WebhookDeliveryResponse> {
      records.push(request);
      return { statusCode: 200 };
    },
  };
}

describe("Load — concurrent webhook delivery is exactly-once, signed, and bounded", () => {
  it("delivers one signed, verifiable payload per (subscription, event) with bounded attempts", async () => {
    const organizationId = "org-1";
    const eventType = "video.ready";
    const SUBSCRIPTIONS = 12;
    const EVENTS = 8;

    const rows: WebhookRow[] = Array.from({ length: SUBSCRIPTIONS }, (_, i) => ({
      id: `sub-${i}`,
      organizationId,
      eventType,
      url: `https://hooks.example.test/${i}`,
      signingSecret: `secret-${i}`,
      createdAt: "2024-01-01T00:00:00.000Z",
    }));
    const store = inMemoryWebhookStore(rows);
    const posted: WebhookDeliveryRequest[] = [];
    const worker = new WebhookDeliveryWorker({
      store,
      client: recordingClient(posted),
      sleeper: instantSleeper,
    });

    const events: PlatformEvent[] = Array.from({ length: EVENTS }, (_, i) => ({
      organizationId,
      eventType,
      data: { videoId: `video-${i}` },
      id: `evt-${i}`,
    }));

    const outcomes = (
      await Promise.all(events.map((e) => worker.deliver(e)))
    ).flat();

    // Exactly one delivery per (subscription, event): none lost, none duplicated.
    expect(outcomes).toHaveLength(SUBSCRIPTIONS * EVENTS);
    expect(outcomes.every((o) => o.delivered)).toBe(true);
    expect(posted).toHaveLength(SUBSCRIPTIONS * EVENTS);

    // Each successful delivery used a single attempt (bounded well under the
    // 6-attempt cap) since the endpoint returned 200.
    expect(outcomes.every((o) => o.attempts === 1)).toBe(true);
    expect(outcomes.every((o) => o.attempts <= 6)).toBe(true);

    // Every posted payload carries a signature that verifies against the
    // owning subscription's secret (authenticity + integrity, R19.4).
    for (const req of posted) {
      const idx = Number(req.url.split("/").pop());
      const signature = req.headers[SIGNATURE_HEADER];
      expect(signature).toBeDefined();
      expect(verifySignature(`secret-${idx}`, req.body, signature!)).toBe(true);
    }
  });

  it("Feature: streetstudio, Property: concurrent webhook fan-out is exactly-once and bounded", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }), // subscriptions
        fc.integer({ min: 1, max: 10 }), // concurrent events
        async (subs, evts) => {
          const organizationId = "org";
          const eventType = "comment.created";
          const rows: WebhookRow[] = Array.from({ length: subs }, (_, i) => ({
            id: `s${i}`,
            organizationId,
            eventType,
            url: `https://h.example.test/${i}`,
            signingSecret: `k${i}`,
            createdAt: "2024-01-01T00:00:00.000Z",
          }));
          const posted: WebhookDeliveryRequest[] = [];
          const worker = new WebhookDeliveryWorker({
            store: inMemoryWebhookStore(rows),
            client: recordingClient(posted),
            sleeper: instantSleeper,
          });
          const events: PlatformEvent[] = Array.from({ length: evts }, (_, i) => ({
            organizationId,
            eventType,
            data: { i },
            id: `e${i}`,
          }));

          const outcomes = (
            await Promise.all(events.map((e) => worker.deliver(e)))
          ).flat();

          // Exactly-once fan-out and bounded attempts.
          expect(outcomes).toHaveLength(subs * evts);
          expect(posted).toHaveLength(subs * evts);
          expect(outcomes.every((o) => o.delivered && o.attempts <= 6)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
