import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  RealtimeGateway,
  InMemoryTransport,
  InMemoryBackplane,
  ManualTimer,
  type RealtimeEvent,
  type RealtimeEventType,
} from "./realtime.js";

/**
 * Property 40: Presence and typing events target the correct audience.
 *
 * Feature: streetstudio, Property 40: Presence and typing events target the correct audience
 *
 * Validates: Requirements 13.1, 13.2, 13.3
 *
 * For any Workspace or Video audience, presence-join / presence-leave and
 * typing indicators are delivered to all *other* relevant connected Members and
 * never to the originating Member:
 *
 *  - presence-join reaches every other connected Member present in the same
 *    Workspace — never the joining Member, never a Member present only in a
 *    different Workspace (R13.1).
 *  - presence-leave reaches every other connected Member present in the same
 *    Workspace — never the leaving Member, never an out-of-scope Member (R13.3).
 *  - typing-start reaches every other Member viewing the same Video — never the
 *    typist, never a Member viewing only a different Video (R13.2).
 *
 * The gateway is exercised only through its public surface, exactly as the
 * design's "test seams" prescribe: every Member {@link RealtimeGateway.connect}s
 * a WebSocket connection, records Workspace presence via
 * {@link RealtimeGateway.join} and Video viewership via
 * {@link RealtimeGateway.openVideo}, and delivery is observed through the
 * in-memory transport double (no real WebSocket/Redis involved). Out-of-scope
 * Members are wired to a *different* Workspace / *different* Video so audience
 * resolution is exercised against genuinely-active-but-out-of-scope Members
 * rather than absent ones. A {@link ManualTimer} that is never advanced keeps
 * the 5s typing-stop inactivity timer from firing, so only the typing-start
 * emitted by the action under test is observed.
 */

/** The one connection each Member holds, derived from their id. */
function connOf(memberId: string): string {
  return `conn-${memberId}`;
}

/** Events of a given kind delivered to a connection, in order. */
function eventsOfType(
  transport: InMemoryTransport,
  connectionId: string,
  type: RealtimeEventType,
): readonly RealtimeEvent[] {
  return transport.eventsFor(connectionId).filter((e) => e.type === type);
}

/**
 * A scenario: a set of distinct Members and, for each, whether they are present
 * in the *target* Workspace (vs. a different one) and whether they are viewing
 * the *target* Video (vs. a different one), plus the originating Member. The
 * originator always participates in the target Workspace and target Video so
 * its own join / leave / typing actions have a well-defined audience.
 */
const scenario = fc
  .uniqueArray(fc.uuid(), { minLength: 2, maxLength: 12 })
  .chain((members) =>
    fc.record({
      members: fc.constant(members),
      originatorIndex: fc.nat({ max: members.length - 1 }),
      // One flag per Member: present in the target Workspace? (vs. another)
      inTargetWorkspace: fc.array(fc.boolean(), {
        minLength: members.length,
        maxLength: members.length,
      }),
      // One flag per Member: viewing the target Video? (vs. another)
      viewingTargetVideo: fc.array(fc.boolean(), {
        minLength: members.length,
        maxLength: members.length,
      }),
      workspaceId: fc.uuid(),
      otherWorkspaceId: fc.uuid(),
      videoId: fc.uuid(),
      otherVideoId: fc.uuid(),
    }),
  )
  // Keep the two Workspaces and the two Videos distinct so "out of scope" is
  // genuinely meaningful.
  .filter(
    (s) =>
      s.workspaceId !== s.otherWorkspaceId && s.videoId !== s.otherVideoId,
  );

describe("Feature: streetstudio, Property 40: Presence and typing events target the correct audience", () => {
  it("delivers presence-join, presence-leave, and typing to all other in-scope Members and never the originator or out-of-scope Members", async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async (s) => {
        const transport = new InMemoryTransport();
        const backplane = new InMemoryBackplane();
        // Never advanced: the typing-stop inactivity timer stays pending, so
        // only the typing-start under test is observed.
        const timer = new ManualTimer();
        const gateway = new RealtimeGateway({ transport, backplane, timer });
        await gateway.start();

        const originator = s.members[s.originatorIndex]!;

        // Every Member connects and records their presence/viewership. The
        // originator is forced into the target Workspace and target Video; every
        // other Member is placed in the target or a different scope per its
        // flags, so out-of-scope Members are active but genuinely elsewhere.
        // Setup joins are awaited so their deliveries settle *before* the
        // baseline snapshot below, leaving only the originator's action to be
        // measured as a delta.
        for (let i = 0; i < s.members.length; i++) {
          const memberId = s.members[i]!;
          const isOriginator = i === s.originatorIndex;
          gateway.connect(memberId, connOf(memberId));
          const inWorkspace = isOriginator || s.inTargetWorkspace[i]!;
          const viewingVideo = isOriginator || s.viewingTargetVideo[i]!;
          gateway.openVideo(
            memberId,
            viewingVideo ? s.videoId : s.otherVideoId,
          );
          // Non-originators record Workspace presence up front; the originator's
          // presence is established by the join action under test below.
          if (!isOriginator) {
            await gateway.join(
              memberId,
              inWorkspace ? s.workspaceId : s.otherWorkspaceId,
            );
          }
        }

        // Only the presence-join emitted by other Members' setup joins could
        // have reached anyone so far; assert on event *counts* per action by
        // measuring deltas around each originator action.
        const joinBefore = s.members.map((m) =>
          eventsOfType(transport, connOf(m), "presence-join").length,
        );

        // --- Action 1: the originator joins the target Workspace (R13.1). ---
        await gateway.join(originator, s.workspaceId);

        // --- Action 2: the originator starts typing on the target Video (R13.2). ---
        await gateway.startTyping(originator, s.videoId);

        // --- Action 3: the originator leaves the target Workspace (R13.3). ---
        await gateway.leave(originator, s.workspaceId);

        s.members.forEach((memberId, i) => {
          const isOriginator = i === s.originatorIndex;
          const conn = connOf(memberId);

          const inTargetWorkspace = isOriginator || s.inTargetWorkspace[i]!;
          const viewingTargetVideo = isOriginator || s.viewingTargetVideo[i]!;

          // presence-join from the originator's action: delta since before.
          const joinDelta =
            eventsOfType(transport, conn, "presence-join").length -
            joinBefore[i]!;
          const presenceLeave = eventsOfType(transport, conn, "presence-leave");
          const typingStart = eventsOfType(transport, conn, "typing-start");

          if (isOriginator) {
            // The originator never receives its own presence or typing events.
            expect(joinDelta).toBe(0);
            expect(presenceLeave).toHaveLength(0);
            expect(typingStart).toHaveLength(0);
            return;
          }

          // presence-join / presence-leave audience: other connected Members in
          // the same Workspace (R13.1, R13.3).
          if (inTargetWorkspace) {
            expect(joinDelta).toBe(1);
            expect(presenceLeave).toHaveLength(1);
            expect(presenceLeave[0]!.payload).toEqual({
              memberId: originator,
              workspaceId: s.workspaceId,
            });
          } else {
            // Present only in a different Workspace: out of scope.
            expect(joinDelta).toBe(0);
            expect(presenceLeave).toHaveLength(0);
          }

          // typing-start audience: other Members viewing the same Video (R13.2).
          if (viewingTargetVideo) {
            expect(typingStart).toHaveLength(1);
            expect(typingStart[0]!.payload).toEqual({
              memberId: originator,
              videoId: s.videoId,
            });
          } else {
            // Viewing only a different Video: out of scope.
            expect(typingStart).toHaveLength(0);
          }
        });
      }),
      { numRuns: 200 },
    );
  });
});
