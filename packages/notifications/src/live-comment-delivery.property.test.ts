import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  RealtimeGateway,
  InMemoryTransport,
  InMemoryBackplane,
  type RealtimeEvent,
} from "./realtime.js";

/**
 * Property 36: Live comment delivery to concurrent viewers.
 *
 * Feature: streetstudio, Property 36: Live comment delivery to concurrent viewers
 *
 * Validates: Requirements 11.6
 *
 * For any set of Members viewing a Video, when one Member posts a comment on
 * that Video the Realtime_Service emits the live-comment to every *other*
 * viewing Member — never the originating author, and never a Member who is not
 * viewing that Video (R11.6).
 *
 * The gateway is exercised only through its public surface: Members
 * {@link RealtimeGateway.connect} a WebSocket connection and
 * {@link RealtimeGateway.openVideo} the Video they are watching, then the author
 * posts a comment via {@link RealtimeGateway.emitLiveComment}. Delivery is
 * observed through the in-memory transport double, exactly as the design's
 * "test seams" prescribe (no real WebSocket/Redis involved). Members who are not
 * watching this Video are wired to a *different* Video so audience resolution is
 * exercised against genuinely-active-but-out-of-scope viewers.
 */

/** The one connection each Member holds, derived from their id. */
function connOf(memberId: string): string {
  return `conn-${memberId}`;
}

/** live-comment events delivered to a connection, in order. */
function liveComments(
  transport: InMemoryTransport,
  connectionId: string,
): readonly RealtimeEvent[] {
  return transport
    .eventsFor(connectionId)
    .filter((e) => e.type === "live-comment");
}

/**
 * A scenario: a set of distinct Members, which of them is the author, whether
 * each Member is viewing the target Video, and the comment being posted.
 */
const scenario = fc
  .uniqueArray(fc.uuid(), { minLength: 2, maxLength: 12 })
  .chain((members) =>
    fc.record({
      members: fc.constant(members),
      authorIndex: fc.nat({ max: members.length - 1 }),
      // Exactly one boolean per Member: are they viewing the target Video?
      viewingTarget: fc.array(fc.boolean(), {
        minLength: members.length,
        maxLength: members.length,
      }),
      videoId: fc.uuid(),
      otherVideoId: fc.uuid(),
      commentId: fc.uuid(),
      body: fc.string({ minLength: 1, maxLength: 200 }),
    }),
  )
  // Keep the two Videos distinct so "not viewing the target" is meaningful.
  .filter((s) => s.videoId !== s.otherVideoId);

describe("Feature: streetstudio, Property 36: Live comment delivery to concurrent viewers", () => {
  it("delivers a posted comment to every other viewing Member, excluding the author and non-viewers", async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async (s) => {
        const transport = new InMemoryTransport();
        const backplane = new InMemoryBackplane();
        const gateway = new RealtimeGateway({ transport, backplane });
        await gateway.start();

        const author = s.members[s.authorIndex];

        // Every Member connects; each opens either the target Video or, if not
        // a target viewer, a different Video (so they are active but out of
        // scope for this comment).
        s.members.forEach((memberId, i) => {
          gateway.connect(memberId, connOf(memberId));
          if (s.viewingTarget[i]) {
            gateway.openVideo(memberId, s.videoId);
          } else {
            gateway.openVideo(memberId, s.otherVideoId);
          }
        });

        // The author posts a comment on the target Video.
        const payload = { commentId: s.commentId, body: s.body, author };
        await gateway.emitLiveComment(s.videoId, payload, author);

        // The set of Members who SHOULD receive it: viewers of the target Video
        // other than the author.
        s.members.forEach((memberId, i) => {
          const received = liveComments(transport, connOf(memberId));
          const shouldReceive = s.viewingTarget[i] && memberId !== author;

          if (shouldReceive) {
            // Delivered exactly once, carrying the posted comment (R11.6).
            expect(received).toHaveLength(1);
            expect(received[0]!.payload).toEqual(payload);
          } else {
            // Author and non-viewers of this Video receive nothing.
            expect(received).toHaveLength(0);
          }
        });
      }),
      { numRuns: 200 },
    );
  });
});
