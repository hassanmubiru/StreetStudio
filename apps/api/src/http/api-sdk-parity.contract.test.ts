import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { StreetStudioClient } from "@streetstudio/sdk";
import { PUBLIC_OPERATIONS, type PublicOperation } from "./operations.js";

/**
 * Property 64: Public API parity and SDK coverage.
 *
 * Feature: streetstudio, Property 64: Public API parity and SDK coverage — for
 * any Web_Client capability a corresponding public REST, WebSocket, or Webhook
 * operation exists, and for any public REST or WebSocket operation the SDK
 * exposes a client method for it.
 *
 * Validates: Requirements 20.1, 20.2
 *
 * The public operation catalog (`PUBLIC_OPERATIONS`) is the single source of
 * truth for every capability the API_Service exposes (R20.1: no Web_Client
 * capability is reachable exclusively through the Web_Client). The SDK
 * (`@streetstudio/sdk`) must expose a typed client method for every one of
 * those public REST/WebSocket operations (R20.2), and — to keep the surfaces
 * honest in both directions — must not expose a client method that has no
 * backing public operation.
 *
 * This is a contract/parity test: it derives the two surfaces mechanically and
 * proves one-for-one set equality between them, so any future drift (an API op
 * added without an SDK method, or an SDK method added without a backing op)
 * fails the build. It imports both surfaces directly — the direction is
 * apps/api → @streetstudio/sdk, which respects the package import boundary
 * (an application may depend on a package; a package never depends on an app).
 *
 * NOTE ON THE WEBSOCKET CHANNEL. Every REST capability in the catalog uses a
 * dotted `resource.method` id that mirrors the SDK resource-group method that
 * invokes it (e.g. `projects.create` ⇄ `client.projects.create`). The single
 * realtime (WebSocket) capability, `realtime.connect`, is exposed by the SDK
 * not as a resource-group method but as the client's own `connectRealtime`
 * method. That one deliberate, documented mapping is declared in
 * {@link WEBSOCKET_METHOD_BY_OP} rather than hidden in the derivation logic.
 */

/**
 * The SDK method that fulfils each non-REST (WebSocket) public operation. REST
 * operations are matched purely mechanically via resource groups; WebSocket
 * operations are surfaced through a dedicated client method, so the mapping is
 * declared explicitly here and asserted below.
 */
const WEBSOCKET_METHOD_BY_OP: Readonly<Record<string, keyof StreetStudioClient>> =
  {
    "realtime.connect": "connectRealtime",
  };

/** The set of public operation ids the API_Service catalog advertises. */
function apiOperationIds(
  operations: readonly PublicOperation[] = PUBLIC_OPERATIONS,
): ReadonlySet<string> {
  return new Set(operations.map((op) => op.id));
}

/**
 * Mechanically derive the set of operation ids the SDK client exposes.
 *
 * The client is instantiated and its own enumerable properties are inspected.
 * Every property whose value is an instance of a `*Resource` class is treated
 * as a resource group: the group's key becomes the operation prefix and each
 * method on its prototype becomes a `prefix.method` id (mirroring the catalog).
 * The WebSocket channel is added via the explicit {@link WEBSOCKET_METHOD_BY_OP}
 * mapping when the corresponding client method is present.
 */
function sdkOperationIds(): ReadonlySet<string> {
  const client = new StreetStudioClient({ baseUrl: "https://api.example.test" });
  const ids = new Set<string>();

  for (const [key, value] of Object.entries(client as Record<string, unknown>)) {
    if (value === null || typeof value !== "object") {
      continue;
    }
    const proto = Object.getPrototypeOf(value) as object | null;
    const ctorName = proto?.constructor?.name ?? "";
    if (!ctorName.endsWith("Resource")) {
      continue;
    }
    for (const method of Object.getOwnPropertyNames(proto)) {
      if (method === "constructor") {
        continue;
      }
      if (typeof (value as Record<string, unknown>)[method] !== "function") {
        continue;
      }
      ids.add(`${key}.${method}`);
    }
  }

  for (const [opId, clientMethod] of Object.entries(WEBSOCKET_METHOD_BY_OP)) {
    if (typeof (client as unknown as Record<string, unknown>)[clientMethod] === "function") {
      ids.add(opId);
    }
  }

  return ids;
}

describe("Property 64: Public API parity and SDK coverage", () => {
  const apiIds = apiOperationIds();
  const sdkIds = sdkOperationIds();

  it("derives a non-trivial set of operations from both surfaces", () => {
    // Guards against a silent regression where either derivation yields an
    // empty set, which would make the parity assertions vacuously pass.
    expect(apiIds.size).toBeGreaterThan(0);
    expect(sdkIds.size).toBeGreaterThan(0);
  });

  it("exposes an SDK client method for every public operation (R20.2)", () => {
    const missingFromSdk = [...apiIds].filter((id) => !sdkIds.has(id)).sort();
    expect(missingFromSdk).toEqual([]);
  });

  it("backs every SDK client method with a public operation (R20.1)", () => {
    const missingFromApi = [...sdkIds].filter((id) => !apiIds.has(id)).sort();
    expect(missingFromApi).toEqual([]);
  });

  it("proves one-for-one parity between the API catalog and the SDK", () => {
    expect([...sdkIds].sort()).toEqual([...apiIds].sort());
  });

  it("resolves the WebSocket channel through the declared client method", () => {
    const client = new StreetStudioClient({ baseUrl: "https://api.example.test" });
    for (const [opId, clientMethod] of Object.entries(WEBSOCKET_METHOD_BY_OP)) {
      expect(apiIds.has(opId)).toBe(true);
      expect(typeof (client as unknown as Record<string, unknown>)[clientMethod]).toBe(
        "function",
      );
    }
  });

  // Property (fast-check, >=100 runs): sampling in each direction proves that no
  // individual operation on either surface lacks a counterpart on the other.
  it("holds for any sampled operation on either surface", () => {
    const apiArb = fc.constantFrom(...apiIds);
    const sdkArb = fc.constantFrom(...sdkIds);

    // Forward: every public API operation is reachable via an SDK method.
    fc.assert(
      fc.property(apiArb, (id) => sdkIds.has(id)),
      { numRuns: 100 },
    );

    // Reverse: every SDK method is backed by a public API operation.
    fc.assert(
      fc.property(sdkArb, (id) => apiIds.has(id)),
      { numRuns: 100 },
    );
  });
});
