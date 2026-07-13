import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { Uuid, SummaryDto } from "@streetstudio/shared";
import type { SummaryRecord } from "@streetstudio/database";
import type { AccessControl } from "@streetstudio/auth";
import {
  KnowledgeBase,
  SUMMARY_BODY_MIN_LENGTH,
  SUMMARY_BODY_MAX_LENGTH,
  type KnowledgeStore,
  type TranscriptIndexer,
} from "./knowledge-base.js";

/**
 * Property 73: Summaries are stored within bounds and associated.
 *
 * Feature: streetstudio, Property 73: Summaries are stored within bounds and associated
 *
 * Validates: Requirements 25.2
 *
 * For any summary produced by an enabled AI_Provider,
 * {@link KnowledgeBase.storeSummary} persists it IF AND ONLY IF its body is
 * between {@link SUMMARY_BODY_MIN_LENGTH} (1) and {@link SUMMARY_BODY_MAX_LENGTH}
 * (10,000) characters, and the stored Summary is associated with its Video (and
 * attributed to the producing plugin). An empty body or a body exceeding 10,000
 * characters is rejected with a `VALIDATION_FAILED` validation error and nothing
 * is stored (R25.2).
 */

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

/**
 * A {@link KnowledgeStore} that records every persisted {@link SummaryRecord} so
 * the property can assert exactly what was (or was not) stored. Only the summary
 * seam is exercised here; the other ports throw if touched.
 */
function makeSummaryStore(): {
  store: KnowledgeStore;
  summaries: SummaryRecord[];
} {
  const summaries: SummaryRecord[] = [];
  const store: KnowledgeStore = {
    async findVideo() {
      throw new Error("not used");
    },
    async insertTranscript() {
      throw new Error("not used");
    },
    async insertSummary(record) {
      summaries.push(record);
      return record;
    },
    async countDocLinks() {
      throw new Error("not used");
    },
    async insertDocLink() {
      throw new Error("not used");
    },
  };
  return { store, summaries };
}

/** Indexer/access seams that are irrelevant to summary storage. */
const noopIndexer: TranscriptIndexer = { async index() {} };
const allowAll: AccessControl = {
  can: async () => true,
  assignRole: async () => {},
};

function service(store: KnowledgeStore, newId: () => Uuid): KnowledgeBase {
  return new KnowledgeBase({
    store,
    indexer: noopIndexer,
    access: allowAll,
    clock: { now: () => new Date("2024-01-01T00:00:00.000Z") },
    newId,
  });
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

const uuid = fc.uuid() as fc.Arbitrary<Uuid>;

/** A summary body within the permitted 1..10,000 character bounds (R25.2). */
const validBody = fc.string({
  minLength: SUMMARY_BODY_MIN_LENGTH,
  maxLength: SUMMARY_BODY_MAX_LENGTH,
});

/**
 * A summary body outside the permitted bounds: either empty (length 0) or longer
 * than 10,000 characters. The over-length range is capped just past the limit to
 * keep generation fast while still exercising the boundary (R25.2).
 */
const invalidBody = fc.oneof(
  fc.constant(""),
  fc
    .integer({ min: SUMMARY_BODY_MAX_LENGTH + 1, max: SUMMARY_BODY_MAX_LENGTH + 200 })
    .map((n) => "a".repeat(n)),
);

/* -------------------------------------------------------------------------
 * Property 73
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 73: Summaries are stored within bounds and associated", () => {
  it("stores a summary whose body is 1..10,000 chars, associated with its Video and source plugin (R25.2)", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuid,
        uuid,
        uuid,
        validBody,
        async (videoId, sourcePluginId, id, body) => {
          const { store, summaries } = makeSummaryStore();
          const dto: SummaryDto = await service(store, () => id).storeSummary(
            videoId,
            body,
            sourcePluginId,
          );

          // The returned summary is associated with its Video and source plugin.
          expect(dto).toMatchObject({ id, videoId, body, sourcePluginId });
          // Exactly one summary was persisted, matching the returned DTO.
          expect(summaries).toHaveLength(1);
          expect(summaries[0]).toMatchObject({
            id,
            videoId,
            body,
            sourcePluginId,
          });
          // The stored body length is within bounds.
          expect(summaries[0]!.body.length).toBeGreaterThanOrEqual(
            SUMMARY_BODY_MIN_LENGTH,
          );
          expect(summaries[0]!.body.length).toBeLessThanOrEqual(
            SUMMARY_BODY_MAX_LENGTH,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects an empty or >10,000-char body with VALIDATION_FAILED and stores nothing (R25.2)", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuid,
        uuid,
        uuid,
        invalidBody,
        async (videoId, sourcePluginId, id, body) => {
          const { store, summaries } = makeSummaryStore();
          await expect(
            service(store, () => id).storeSummary(videoId, body, sourcePluginId),
          ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
          // The rejection is surfaced through the shared error taxonomy and
          // nothing was persisted.
          expect(summaries).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("surfaces the out-of-bounds rejection as an AppError (R25.2)", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuid,
        uuid,
        invalidBody,
        async (videoId, sourcePluginId, body) => {
          const { store, summaries } = makeSummaryStore();
          await expect(
            service(store, () => videoId).storeSummary(
              videoId,
              body,
              sourcePluginId,
            ),
          ).rejects.toBeInstanceOf(AppError);
          expect(summaries).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
