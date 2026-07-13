import assert from "node:assert";
import {
  RealtimeGateway,
  InMemoryTransport,
  InMemoryBackplane,
  ManualTimer,
  realtimeNotificationEmitter,
} from "./dist/index.js";

function typesOf(transport, connId) {
  return transport.eventsFor(connId).map((e) => e.type);
}

// --- Two nodes sharing one backplane (cross-node fan-out) ---
const backplane = new InMemoryBackplane();
const t1 = new InMemoryTransport();
const t2 = new InMemoryTransport();
const timer = new ManualTimer();
const nodeA = new RealtimeGateway({ transport: t1, backplane, timer });
const nodeB = new RealtimeGateway({ transport: t2, backplane, timer });
await nodeA.start();
await nodeB.start();

// alice on nodeA, bob on nodeB, both present in workspace W.
nodeA.connect("alice", "cA");
nodeB.connect("bob", "cB");
await nodeA.join("alice", "W"); // alice already present; bob not yet -> no delivery
await nodeB.join("bob", "W"); // bob joins -> alice (nodeA) should get presence-join, bob excluded

assert.deepEqual(typesOf(t1, "cA"), ["presence-join"], "alice sees bob join (cross-node)");
assert.deepEqual(typesOf(t2, "cB"), [], "bob never sees own presence-join");
console.log("ok: cross-node presence-join excludes originator");

// --- Live comment to concurrent video viewers, excluding author ---
nodeA.openVideo("alice", "V");
nodeB.openVideo("bob", "V");
await nodeB.emitLiveComment("V", { body: "hi" }, "bob");
assert.deepEqual(typesOf(t1, "cA").at(-1), "live-comment", "alice gets live comment");
assert.deepEqual(typesOf(t2, "cB"), [], "author bob excluded from live comment");
console.log("ok: live comment to concurrent viewers, author excluded");

// --- Typing start then auto-stop after inactivity window ---
const flush = () => new Promise((r) => setImmediate(r));
await nodeA.startTyping("alice", "V"); // bob should see typing-start
assert.equal(typesOf(t2, "cB").at(-1), "typing-start", "bob sees typing-start");
timer.advance(5000); // inactivity -> typing-stop (async, fire-and-forget)
await flush();
assert.equal(typesOf(t2, "cB").at(-1), "typing-stop", "bob sees typing-stop after 5s");
console.log("ok: typing start + auto-stop after 5s inactivity");

// --- Discard for member with no active connection (harmless) ---
const before = t2.eventsFor("cB").length;
await nodeA.emit({ type: "notification", payload: {} }, { scope: "member", memberId: "ghost" });
assert.equal(t2.eventsFor("cB").length, before, "no disruption delivering to disconnected member");
console.log("ok: event for disconnected member discarded harmlessly");

// --- Dropped connection -> presence-departure within 5s ---
nodeB.disconnect("cB"); // bob drops without leave
const aliceBefore = t1.eventsFor("cA").length;
timer.advance(5000);
assert.equal(typesOf(t1, "cA").at(-1), "presence-leave", "alice sees bob departure after drop");
assert.ok(t1.eventsFor("cA").length > aliceBefore);
console.log("ok: dropped connection emits presence-departure within 5s");

// --- Reconnect cancels pending departure ---
const timer2 = new ManualTimer();
const bp2 = new InMemoryBackplane();
const tt = new InMemoryTransport();
const node = new RealtimeGateway({ transport: tt, backplane: bp2, timer: timer2 });
await node.start();
node.connect("carol", "c1");
node.connect("dave", "d1");
await node.join("carol", "W2");
await node.join("dave", "W2");
node.disconnect("d1");
node.connect("dave", "d2"); // reconnect before timer fires
const carolBefore = tt.eventsFor("c1").length;
timer2.advance(5000);
assert.equal(tt.eventsFor("c1").length, carolBefore, "no departure after reconnect");
console.log("ok: reconnect cancels pending departure");

// --- Notification emitter bridge ---
const emitter = realtimeNotificationEmitter(node);
await emitter.emit({ id: "n1", memberId: "carol", eventType: "x", sourceResourceId: "s", createdAt: "t" });
assert.equal(tt.eventsFor("c1").at(-1).type, "notification", "notification delivered to member");
console.log("ok: notification emitter bridge delivers to member");

console.log("\nALL SANITY CHECKS PASSED");
