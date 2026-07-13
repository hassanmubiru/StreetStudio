import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  RealtimeGateway,
  InMemoryTransport,
  InMemoryBackplane,
  ManualTimer,
  type RealtimeEvent,
} from "./realtime.js";

/**
 * Property 41: Events for disconnected members are discarded harmlessly.
 *
 * Feature: streetstudio, Property 41: Events for disconnected members are discarded harmlessly
 *
 * Validates: Requirements 13.7
 *
 * A real-time event that targets a Member who has no active connection is
 * discarded for that Member — no error is raised — and its discard never
 * disrupts delivery to the other, connected Members in the same audience
 * (R13.7).
 *
 * The gateway is exercised only through its public surface, as the design's
 * "test seams" prescribe: every Member records Workspace presence via
 * {@link RealtimeGateway.join} so a `workspace`-scoped emit resolves to all of
 * them, but only the "connected" Members hold a live connection. The
 * "disconnected" Members model the realistic R13.6 window — they connected and
 * joined, then their WebSocket dropped ({@link RealtimeGateway.disconnect}), so
 * presence is still recorded but no connection remains. A {@link ManualTimer}
 * that is never advanced keeps the pending presence-departure from firing, so
 * the disconnected Members stay in the audience while genuinely having no
 * active connection. Delivery is observed through the in-memory transport
 * double (no real WebSocket/Redis involved).
 */

/** The one connection each Member holds, derived from their id. */
function connOf(memberId: string): string {
  return `conn-${memberId}`;
}

/** workspace-event events delivered to a connection carrying our marker. */
function markedEvents(
  transport: InMemoryTransport,
  connectionId: string,
  marker: string,
): readonly RealtimeEvent[] {
  return transport
    .eventsFor(connectionId)
    .filter(
      (e) =>
        e.type === "workspace-event" &&
        typeof e.payload === "object" &&
        e.payload !== null &&
        (e.payload as { marker?: unknown }).marker === marker,
    );
}

/**
 * A scenario: a set of distinct Members, a per-Member "is connected" flag
 * (guaranteed to contain at least one connected and at least one disconnected
 * Member so the property is meaningful), the Workspace they all belong to, and
 * the marker carried by the emitted event.
 */
const scenario = fc
  .uniqueArray(fc.uuid(), { minLength: 2, maxLength: 12 })
  .chain((members) =>
    fc.record({
      members: fc.constant(members),
      connected: fc.array(fc.boolean(), {
        minLength: members.length,
        maxLength: members.length,
      }),
      workspaceId: fc.uuid(),
      marker: fc.uuid(),
    }),
  )
  // At least one connected and one disconnected Member: the discard must not
  // disrupt a real delivery to someone else.
  .filter(
    (s) => s.connected.some((c) => c) && s.connected.some((c) => !c),
  );

describe("Feature: streetstudio, Property 41: Events for disconnected members are discarded harmlessly", () => {
  it("discards an event for a Member with no active connection without disrupting delivery to connected Members", async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async (s) => {
        const transport = new InMemoryTransport();
        const backplane = new InMemoryBackplane();
        // A manual timer we never advance: dropped-connection presence-departure
        // stays pending, so disconnected Members keep Workspace presence (and
        // thus remain in the audience) while holding no active connection.
        const timer = new ManualTimer();
        const gateway = new RealtimeGateway({ transport, backplane, timer });
        await gateway.start();

        // Every Member connects and joins the Workspace (records presence).
        // The disconnected Members then drop their connection, modelling the
        // R13.6 window: presence recorded, no active connection.
        for (let i = 0; i < s.members.length; i++) {
          const memberId = s.members[i]!;
          gateway.connect(memberId, connOf(memberId));
          await gateway.join(memberId, s.workspaceId);
        }
        for (let i = 0; i < s.members.length; i++) {
          if (!s.connected[i]) {
            gateway.disconnect(connOf(s.members[i]!));
          }
        }

        // Emit a Workspace-scoped event to the whole Workspace. Its audience
        // resolves to every Member (connected and disconnected alike); the
        // disconnected ones must be discarded harmlessly.
        const payload = { marker: s.marker, body: "hello workspace" };
        await gateway.emit(
          { type: "workspace-event", payload },
          { scope: "workspace", workspaceId: s.workspaceId },
        );

        for (let i = 0; i < s.members.length; i++) {
          const memberId = s.members[i]!;
          const received = markedEvents(transport, connOf(memberId), s.marker);
          if (s.connected[i]) {
            // Connected Members receive the event exactly once: the discard for
            // the disconnected Members did not disrupt their delivery (R13.7).
            expect(received).toHaveLength(1);
            expect(received[0]!.payload).toEqual(payload);
          } else {
            // Disconnected Members receive nothing — the event is discarded for
            // them (R13.7).
            expect(received).toHaveLength(0);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
