import { describe, it, expect } from "vitest";
import {
  RealtimeGateway,
  InMemoryTransport,
  InMemoryBackplane,
  ManualTimer,
  type RealtimeEvent,
  type RealtimeEventType,
} from "./realtime.js";

/**
 * Unit tests for the two time-dependent behaviours of the Realtime_Service
 * gateway, exercised through its public surface with the in-memory transport,
 * in-memory backplane, and a deterministic {@link ManualTimer} — exactly the
 * "test seams" the design prescribes (no real WebSocket/Redis/clock involved).
 *
 * Covered:
 *  - R13.5: after a Member starts typing, 5 seconds of inactivity emits a
 *    typing-stopped indicator to the other Members viewing the same Video.
 *  - R13.6: when a Member's WebSocket connection is dropped without an explicit
 *    leave, a presence-departure event is emitted for that Member to the other
 *    connected Members in the Workspace within 5 seconds.
 *
 * Time only advances when {@link ManualTimer.advance} is called, so the tests
 * can assert precisely on the boundary (nothing fires before the window
 * elapses; the event fires exactly when it does).
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

describe("RealtimeGateway typing-stop inactivity timer (R13.5)", () => {
  it("emits typing-stop to other Video viewers after 5s of inactivity", async () => {
    const transport = new InMemoryTransport();
    const backplane = new InMemoryBackplane();
    const timer = new ManualTimer();
    const gateway = new RealtimeGateway({ transport, backplane, timer });
    await gateway.start();

    const typist = "member-typist";
    const viewer = "member-viewer";
    const videoId = "video-1";

    gateway.connect(typist, connOf(typist));
    gateway.connect(viewer, connOf(viewer));
    gateway.openVideo(typist, videoId);
    gateway.openVideo(viewer, videoId);

    await gateway.startTyping(typist, videoId);

    // typing-start reached the other viewer; typing-stop has not fired yet.
    expect(eventsOfType(transport, connOf(viewer), "typing-start")).toHaveLength(
      1,
    );
    expect(eventsOfType(transport, connOf(viewer), "typing-stop")).toHaveLength(
      0,
    );

    // Just short of the 5s window: still no typing-stop.
    timer.advance(4999);
    expect(eventsOfType(transport, connOf(viewer), "typing-stop")).toHaveLength(
      0,
    );

    // Reaching 5s of inactivity fires the typing-stopped indicator (R13.5).
    timer.advance(1);
    const stop = eventsOfType(transport, connOf(viewer), "typing-stop");
    expect(stop).toHaveLength(1);
    expect(stop[0]!.payload).toEqual({ memberId: typist, videoId });
  });

  it("never delivers typing-stop back to the typist", async () => {
    const transport = new InMemoryTransport();
    const backplane = new InMemoryBackplane();
    const timer = new ManualTimer();
    const gateway = new RealtimeGateway({ transport, backplane, timer });
    await gateway.start();

    const typist = "member-typist";
    const viewer = "member-viewer";
    const videoId = "video-1";

    gateway.connect(typist, connOf(typist));
    gateway.connect(viewer, connOf(viewer));
    gateway.openVideo(typist, videoId);
    gateway.openVideo(viewer, videoId);

    await gateway.startTyping(typist, videoId);
    timer.advance(5000);

    // The typist is excluded from its own typing indicators (R13.2/R13.5).
    expect(eventsOfType(transport, connOf(typist), "typing-stop")).toHaveLength(
      0,
    );
    expect(eventsOfType(transport, connOf(viewer), "typing-stop")).toHaveLength(
      1,
    );
  });

  it("re-arms the inactivity timer on repeated typing so early elapse does not emit typing-stop", async () => {
    const transport = new InMemoryTransport();
    const backplane = new InMemoryBackplane();
    const timer = new ManualTimer();
    const gateway = new RealtimeGateway({ transport, backplane, timer });
    await gateway.start();

    const typist = "member-typist";
    const viewer = "member-viewer";
    const videoId = "video-1";

    gateway.connect(typist, connOf(typist));
    gateway.connect(viewer, connOf(viewer));
    gateway.openVideo(typist, videoId);
    gateway.openVideo(viewer, videoId);

    await gateway.startTyping(typist, videoId);
    timer.advance(3000);

    // Continued activity re-arms the 5s window; no typing-start echo, no stop.
    await gateway.startTyping(typist, videoId);
    expect(eventsOfType(transport, connOf(viewer), "typing-start")).toHaveLength(
      1,
    );
    timer.advance(3000); // 6s since first signal, but only 3s since the last

    expect(eventsOfType(transport, connOf(viewer), "typing-stop")).toHaveLength(
      0,
    );

    // A further 2s reaches the full 5s of inactivity from the re-arm point.
    timer.advance(2000);
    expect(eventsOfType(transport, connOf(viewer), "typing-stop")).toHaveLength(
      1,
    );
  });
});

describe("RealtimeGateway dropped-connection presence-departure (R13.6)", () => {
  it("emits presence-departure to other Workspace Members within 5s of a dropped connection", async () => {
    const transport = new InMemoryTransport();
    const backplane = new InMemoryBackplane();
    const timer = new ManualTimer();
    const gateway = new RealtimeGateway({ transport, backplane, timer });
    await gateway.start();

    const dropper = "member-dropper";
    const observer = "member-observer";
    const workspaceId = "workspace-1";

    gateway.connect(dropper, connOf(dropper));
    gateway.connect(observer, connOf(observer));
    await gateway.join(dropper, workspaceId);
    await gateway.join(observer, workspaceId);

    // Baseline: the observer saw the dropper's join, and no departure yet.
    const departuresBefore = eventsOfType(
      transport,
      connOf(observer),
      "presence-leave",
    ).length;

    // The dropper's WebSocket drops without an explicit leave.
    gateway.disconnect(connOf(dropper));

    // Just short of 5s: no presence-departure yet.
    timer.advance(4999);
    expect(
      eventsOfType(transport, connOf(observer), "presence-leave").length -
        departuresBefore,
    ).toBe(0);

    // Reaching 5s fires the presence-departure to the other connected Member.
    timer.advance(1);
    const departures = eventsOfType(
      transport,
      connOf(observer),
      "presence-leave",
    );
    expect(departures.length - departuresBefore).toBe(1);
    const latest = departures[departures.length - 1]!;
    expect(latest.payload).toEqual({ memberId: dropper, workspaceId });
  });

  it("does not emit presence-departure if the Member reconnects before 5s", async () => {
    const transport = new InMemoryTransport();
    const backplane = new InMemoryBackplane();
    const timer = new ManualTimer();
    const gateway = new RealtimeGateway({ transport, backplane, timer });
    await gateway.start();

    const dropper = "member-dropper";
    const observer = "member-observer";
    const workspaceId = "workspace-1";

    gateway.connect(dropper, connOf(dropper));
    gateway.connect(observer, connOf(observer));
    await gateway.join(dropper, workspaceId);
    await gateway.join(observer, workspaceId);

    const departuresBefore = eventsOfType(
      transport,
      connOf(observer),
      "presence-leave",
    ).length;

    gateway.disconnect(connOf(dropper));
    timer.advance(3000);

    // Reconnect (new connection) cancels the pending departure.
    gateway.connect(dropper, `${connOf(dropper)}-b`);
    timer.advance(5000);

    expect(
      eventsOfType(transport, connOf(observer), "presence-leave").length -
        departuresBefore,
    ).toBe(0);
  });

  it("does not emit presence-departure to the dropped Member itself", async () => {
    const transport = new InMemoryTransport();
    const backplane = new InMemoryBackplane();
    const timer = new ManualTimer();
    const gateway = new RealtimeGateway({ transport, backplane, timer });
    await gateway.start();

    const dropper = "member-dropper";
    const observer = "member-observer";
    const workspaceId = "workspace-1";

    gateway.connect(dropper, connOf(dropper));
    gateway.connect(observer, connOf(observer));
    await gateway.join(dropper, workspaceId);
    await gateway.join(observer, workspaceId);

    gateway.disconnect(connOf(dropper));
    timer.advance(5000);

    // The departure targets the *other* Members; the dropper's own (now dead)
    // connection is excluded, and the observer receives it (R13.6).
    expect(
      eventsOfType(transport, connOf(dropper), "presence-leave"),
    ).toHaveLength(0);
    expect(
      eventsOfType(transport, connOf(observer), "presence-leave"),
    ).toHaveLength(1);
  });
});
