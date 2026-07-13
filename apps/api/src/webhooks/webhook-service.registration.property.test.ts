import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { WebhookRecord } from "@streetstudio/database";
import type { AuthContext } from "@streetstudio/auth";
import type { Uuid } from "@streetstudio/shared";
import {
  WebhookService,
  DEFAULT_SUPPORTED_EVENT_TYPES,
  MAX_WEBHOOK_URL_LENGTH,
  type WebhookStore,
} from "./webhook-service.js";
import type { Clock } from "../security/clock.js";

/**
 * Property 60: Webhook registration validates endpoint and event type.
 *
 * Feature: streetstudio, Property 60: Webhook registration validates endpoint
 * and event type
 *
 * Validates: Requirements 19.1, 19.2
 *
 * For any webhook registration, {@link WebhookService.register} stores a
 * subscription if and only if the event type is supported AND the endpoint URL
 * is a well-formed HTTPS URL of at most 2048 characters. Otherwise (an
 * unsupported event type, a malformed URL, a non-HTTPS URL, or an over-length
 * URL) the registration is rejected with a `VALIDATION_FAILED` error and no
 * subscription is stored.
 */

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

const ORG = "org-1" as Uuid;
const MEMBER = "member-1" as Uuid;
const ctx: AuthContext = { memberId: MEMBER, organizationId: ORG };
const fixedClock: Clock = {
  nowMs: () => Date.parse("2024-01-01T00:00:00.000Z"),
};

/** A trivial in-memory subscription store mirroring the unit-test double. */
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

function makeService(store = memoryStore()) {
  let counter = 0;
  const service = new WebhookService({
    store,
    clock: fixedClock,
    newId: (): Uuid => `sub-${++counter}` as Uuid,
    generateSecret: () => "secret-xyz",
  });
  return { service, store };
}

/* -------------------------------------------------------------------------
 * Generators
 *
 * Each URL entry carries its expected well-formedness ("valid") determined by
 * construction, so the property does not depend on the production predicate as
 * its own oracle.
 * ---------------------------------------------------------------------- */

interface UrlEntry {
  readonly url: string;
  readonly valid: boolean;
}

// A well-formed HTTPS URL of <= 2048 chars.
const validHttpsUrl: fc.Arbitrary<UrlEntry> = fc
  .webUrl({ validSchemes: ["https"], withQueryParameters: true })
  .filter((u) => u.length <= MAX_WEBHOOK_URL_LENGTH)
  .map((url) => ({ url, valid: true }));

// A well-formed URL that is not HTTPS.
const nonHttpsUrl: fc.Arbitrary<UrlEntry> = fc
  .webUrl({ validSchemes: ["http"], withQueryParameters: true })
  .map((url) => ({ url, valid: false }));

// A syntactically malformed URL that the URL parser rejects. Each candidate
// contains a space or is empty, which `new URL(...)` cannot parse.
const malformedUrl: fc.Arbitrary<UrlEntry> = fc
  .constantFrom(
    "",
    "not a url",
    "https://exam ple.com/hook",
    "://missing-scheme",
    "just some text with spaces",
    "https:// /path",
  )
  .map((url) => ({ url, valid: false }));

// An HTTPS URL whose length exceeds 2048 characters.
const overLengthUrl: fc.Arbitrary<UrlEntry> = fc
  .integer({ min: MAX_WEBHOOK_URL_LENGTH + 1, max: MAX_WEBHOOK_URL_LENGTH + 512 })
  .map((total) => {
    const prefix = "https://example.com/";
    const url = prefix + "a".repeat(Math.max(0, total - prefix.length));
    return { url, valid: false };
  });

const urlEntry: fc.Arbitrary<UrlEntry> = fc.oneof(
  validHttpsUrl,
  nonHttpsUrl,
  malformedUrl,
  overLengthUrl,
);

const supportedEventType = fc.constantFrom(...DEFAULT_SUPPORTED_EVENT_TYPES);
const unsupportedEventType = fc
  .string()
  .filter((s) => !DEFAULT_SUPPORTED_EVENT_TYPES.includes(s));

interface EventEntry {
  readonly eventType: string;
  readonly supported: boolean;
}

const eventEntry: fc.Arbitrary<EventEntry> = fc.oneof(
  supportedEventType.map((eventType) => ({ eventType, supported: true })),
  unsupportedEventType.map((eventType) => ({ eventType, supported: false })),
);

/* -------------------------------------------------------------------------
 * Property 60
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 60: Webhook registration validates endpoint and event type", () => {
  it("stores a subscription iff the event type is supported and the URL is a well-formed HTTPS URL <= 2048 chars; otherwise rejects with VALIDATION_FAILED and stores nothing", async () => {
    await fc.assert(
      fc.asyncProperty(
        eventEntry,
        urlEntry,
        async ({ eventType, supported }, { url, valid }) => {
          const { service, store } = makeService();
          const shouldStore = supported && valid;

          if (shouldStore) {
            const dto = await service.register(ctx, eventType, url);
            // Exactly one subscription was persisted with the given inputs.
            expect(store.rows.size).toBe(1);
            const stored = store.rows.get(dto.id);
            expect(stored).toBeDefined();
            expect(stored?.eventType).toBe(eventType);
            expect(stored?.url).toBe(url);
            expect(stored?.organizationId).toBe(ORG);
            // The confirmation DTO identifies the created subscription and
            // never exposes the signing secret.
            expect(dto.eventType).toBe(eventType);
            expect(dto.url).toBe(url);
            expect(dto).not.toHaveProperty("signingSecret");
          } else {
            await expect(
              service.register(ctx, eventType, url),
            ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
            // Rejection is an AppError and nothing was stored.
            await expect(
              service.register(ctx, eventType, url),
            ).rejects.toBeInstanceOf(AppError);
            expect(store.rows.size).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
