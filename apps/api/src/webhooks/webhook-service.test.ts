import { describe, expect, it } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { WebhookRecord } from "@streetstudio/database";
import type { AuthContext } from "@streetstudio/auth";
import type { Uuid } from "@streetstudio/shared";
import {
  WebhookService,
  isValidWebhookUrl,
  type WebhookStore,
} from "./webhook-service.js";
import type { Clock } from "../security/clock.js";

const ORG = "org-1" as Uuid;
const MEMBER = "member-1" as Uuid;
const fixedClock: Clock = { nowMs: () => Date.parse("2024-01-01T00:00:00.000Z") };

/** A trivial in-memory subscription store. */
function memoryStore(): WebhookStore & { rows: Map<string, WebhookRecord> } {
  const rows = new Map<string, WebhookRecord>();
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

const ctx: AuthContext = { memberId: MEMBER, organizationId: ORG };

function makeService(store = memoryStore(), ids = idFactory()) {
  const service = new WebhookService({
    store,
    clock: fixedClock,
    newId: ids,
    generateSecret: () => "secret-xyz",
  });
  return { service, store };
}

function idFactory(): () => Uuid {
  let n = 0;
  return () => `sub-${++n}` as Uuid;
}

describe("isValidWebhookUrl", () => {
  it("accepts an HTTPS URL at or below 2048 chars", () => {
    expect(isValidWebhookUrl("https://example.com/hook")).toBe(true);
  });

  it("rejects non-HTTPS, malformed, and oversized URLs", () => {
    expect(isValidWebhookUrl("http://example.com/hook")).toBe(false);
    expect(isValidWebhookUrl("ftp://example.com")).toBe(false);
    expect(isValidWebhookUrl("not a url")).toBe(false);
    expect(isValidWebhookUrl(`https://example.com/${"a".repeat(2048)}`)).toBe(
      false,
    );
  });
});

describe("WebhookService.register", () => {
  it("stores a supported event type with a valid HTTPS URL and returns a DTO without the secret", async () => {
    const { service, store } = makeService();
    const dto = await service.register(ctx, "video.ready", "https://ex.com/h");

    expect(dto.id).toBe("sub-1");
    expect(dto.eventType).toBe("video.ready");
    expect(dto.url).toBe("https://ex.com/h");
    expect(dto).not.toHaveProperty("signingSecret");
    expect(store.rows.get("sub-1")?.signingSecret).toBe("secret-xyz");
  });

  it("rejects an unsupported event type without storing", async () => {
    const { service, store } = makeService();
    await expect(
      service.register(ctx, "bogus.event", "https://ex.com/h"),
    ).rejects.toBeInstanceOf(AppError);
    expect(store.rows.size).toBe(0);
  });

  it("rejects a non-HTTPS URL without storing", async () => {
    const { service, store } = makeService();
    await expect(
      service.register(ctx, "video.ready", "http://ex.com/h"),
    ).rejects.toBeInstanceOf(AppError);
    expect(store.rows.size).toBe(0);
  });

  it("denies a caller with no organization scope", async () => {
    const { service } = makeService();
    await expect(
      service.register({ memberId: MEMBER }, "video.ready", "https://ex.com/h"),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
});

describe("WebhookService.delete", () => {
  it("removes an existing subscription so it no longer resolves", async () => {
    const { service, store } = makeService();
    const dto = await service.register(ctx, "video.ready", "https://ex.com/h");
    await service.delete(ctx, dto.id);
    expect(store.rows.has(dto.id)).toBe(false);
  });

  it("reports NOT_FOUND for an unknown subscription", async () => {
    const { service } = makeService();
    await expect(service.delete(ctx, "missing" as Uuid)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
