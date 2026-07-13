import { describe, expect, it } from "vitest";
import {
  PUBLIC_OPERATIONS,
  operationsById,
  restKey,
  restOperations,
  type PublicOperation,
} from "./operations.js";

describe("PUBLIC_OPERATIONS catalog", () => {
  it("has unique, dotted resource.method ids", () => {
    const ids = PUBLIC_OPERATIONS.map((op) => op.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-zA-Z]+\.[a-zA-Z]+$/);
    }
  });

  it("gives every REST operation a method and a rooted path", () => {
    for (const op of restOperations()) {
      expect(op.method).toBeDefined();
      expect(op.path.startsWith("/")).toBe(true);
    }
  });

  it("indexes by id and rejects duplicates", () => {
    const byId = operationsById();
    expect(byId.get("projects.create")?.method).toBe("POST");
    const dup: PublicOperation[] = [
      { id: "x.y", channel: "rest", method: "GET", path: "/x", authz: { kind: "public" } },
      { id: "x.y", channel: "rest", method: "POST", path: "/y", authz: { kind: "public" } },
    ];
    expect(() => operationsById(dup)).toThrow(/Duplicate/);
  });

  it("declares an authorization policy for every operation", () => {
    for (const op of PUBLIC_OPERATIONS) {
      expect(["public", "authenticated", "rbac"]).toContain(op.authz.kind);
      if (op.authz.kind === "rbac") {
        expect(op.authz.action.length).toBeGreaterThan(0);
      }
    }
  });

  it("exposes a WebSocket realtime channel", () => {
    const ws = PUBLIC_OPERATIONS.filter((op) => op.channel === "websocket");
    expect(ws.map((op) => op.id)).toContain("realtime.connect");
  });

  it("normalizes REST keys case-insensitively by method", () => {
    expect(restKey("get", "/videos")).toBe("GET /videos");
    expect(restKey("Post", " /videos ")).toBe("POST /videos");
  });

  it("marks only explicitly-public endpoints as public", () => {
    const publicIds = PUBLIC_OPERATIONS.filter((op) => op.authz.kind === "public").map(
      (op) => op.id,
    );
    // Auth bootstrap + public share resolution are the only no-auth endpoints.
    expect(publicIds.sort()).toEqual(
      ["auth.login", "auth.register", "sharing.resolve"].sort(),
    );
  });
});
