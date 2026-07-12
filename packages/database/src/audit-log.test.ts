import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
import { InMemorySqlClient } from "./testing.js";
import { auditImmutableClient, createAuditLog, toAuditTimestamp } from "./audit-log.js";
import { newUuid } from "./ids.js";

/**
 * Inline unit sanity checks for the Audit Log service. The numbered
 * correctness properties (54–56) are covered by separate property-test tasks.
 */

describe("AuditLog.append", () => {
  it("records actor, action, target, org, and a UTC ms-precision timestamp", async () => {
    const client = new InMemorySqlClient();
    const log = createAuditLog(client);
    const orgId = newUuid();
    const actor = newUuid();
    const targetId = newUuid();
    const at = new Date("2024-05-06T07:08:09.123Z");

    await log.append({ actor, action: "authentication", targetId, orgId, at });

    const [entry] = await log.query(orgId);
    expect(entry?.actorId).toBe(actor);
    expect(entry?.action).toBe("authentication");
    expect(entry?.targetId).toBe(targetId);
    expect(entry?.organizationId).toBe(orgId);
    // UTC, exactly millisecond precision.
    expect(entry?.at).toBe("2024-05-06T07:08:09.123Z");
    expect(entry?.at).toMatch(/\.\d{3}Z$/);
  });

  it("defaults the timestamp to the current UTC instant", async () => {
    const log = createAuditLog(new InMemorySqlClient());
    const orgId = newUuid();
    const before = Date.now();
    await log.append({ actor: newUuid(), action: "administrative_action", targetId: newUuid(), orgId });
    const after = Date.now();

    const [entry] = await log.query(orgId);
    const recorded = Date.parse(entry?.at ?? "");
    expect(recorded).toBeGreaterThanOrEqual(before);
    expect(recorded).toBeLessThanOrEqual(after);
  });
});

describe("AuditLog.query", () => {
  it("returns entries newest-first, scoped to the organization", async () => {
    const log = createAuditLog(new InMemorySqlClient());
    const orgA = newUuid();
    const orgB = newUuid();

    await log.append({ actor: newUuid(), action: "a1", targetId: newUuid(), orgId: orgA, at: new Date("2024-01-01T00:00:00.000Z") });
    await log.append({ actor: newUuid(), action: "a3", targetId: newUuid(), orgId: orgA, at: new Date("2024-03-01T00:00:00.000Z") });
    await log.append({ actor: newUuid(), action: "a2", targetId: newUuid(), orgId: orgA, at: new Date("2024-02-01T00:00:00.000Z") });
    await log.append({ actor: newUuid(), action: "b1", targetId: newUuid(), orgId: orgB, at: new Date("2024-06-01T00:00:00.000Z") });

    const entries = await log.query(orgA);
    expect(entries.map((e) => e.action)).toEqual(["a3", "a2", "a1"]);
    // No entry from the other organization leaks in.
    expect(entries.every((e) => e.organizationId === orgA)).toBe(true);
  });

  it("returns an empty list for an organization with no entries", async () => {
    const log = createAuditLog(new InMemorySqlClient());
    expect(await log.query(newUuid())).toEqual([]);
  });
});

describe("audit immutability at the storage layer", () => {
  it("rejects UPDATE and DELETE against the audit table with a conflict error", async () => {
    const client = new InMemorySqlClient();
    const log = createAuditLog(client);
    const orgId = newUuid();
    await log.append({ actor: newUuid(), action: "authentication", targetId: newUuid(), orgId });

    // The guarded client used by the service must refuse mutations. Reach the
    // same guard the repository uses via a fresh service over the same client.
    const guardedProbe = createAuditLog(client);
    // Appends still work through the service; there is simply no mutation path.
    await expect(
      log.query(orgId),
    ).resolves.toHaveLength(1);

    // Directly issuing a mutation through the guarded client is rejected.
    const { auditImmutableClient } = await import("./audit-log.js");
    const guarded = auditImmutableClient(client);
    await expect(
      guarded.query("UPDATE audit_entry SET action = $1 WHERE id = $2", ["x", newUuid()]),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      guarded.query("DELETE FROM audit_entry WHERE organization_id = $1", [orgId]),
    ).rejects.toBeInstanceOf(AppError);

    // Existing entry is preserved unchanged.
    expect(await guardedProbe.query(orgId)).toHaveLength(1);
  });
});

describe("toAuditTimestamp", () => {
  it("rejects an invalid Date", () => {
    expect(() => toAuditTimestamp(new Date("not-a-date"))).toThrow(AppError);
  });
});
