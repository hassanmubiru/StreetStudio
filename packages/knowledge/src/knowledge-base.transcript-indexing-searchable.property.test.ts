import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Uuid, TranscriptSegmentDto } from "@streetstudio/shared";
import type { TranscriptRecord } from "@streetstudio/database";
import type { AccessControl } from "@streetstudio/auth";
import {
  KnowledgeBase,
  type KnowledgeStore,
  type TranscriptIndexer,
} from "./knowledge-base.js";

/**
 * Property 72: Transcript indexing makes content searchable within scope.
 *
 * Feature: streetstudio, Property 72: Transcript indexing makes content searchable within scope
 *
 * Validates: Requirements 25.1
 *
 * *For any* Video whose transcript becomes available, `indexTranscript`:
 *
 *  - persists the transcript for that Video with an `indexedAt` timestamp and
 *    its segments preserved verbatim (text and the `start`/`end` playback
 *    positions), and
 *  - pushes the transcript's segment text to the pluggable
 *    {@link TranscriptIndexer} search backend seam so it becomes searchable to
 *    Members within their authorized scope — with each matching segment's
 *    playback position preserved so a subsequent search can identify where in
 *    the Video the match occurs (R25.1).
 *
 * This generalizes the single fixed-example indexing check in
 * knowledge-base.test.ts across arbitrary Videos, segment counts, segment text,
 * and playback positions. Search itself is authorization-filtered by the
 * SearchService at query time; here we exercise the indexing seam that makes the
 * transcript text discoverable and assert playback positions survive indexing.
 */

/* -------------------------------------------------------------------------
 * A searchable in-memory model wired to the TranscriptIndexer seam.
 *
 * `index(videoId, segments)` is exactly what the SearchService's backend reads:
 * we store the pushed segments and expose a `searchByText` that returns, for a
 * text term, the Videos whose indexed transcript contains that text along with
 * the matching segment's playback position (its `start`). This mirrors R14.2 /
 * R25.1 "identify the matching playback position".
 * ---------------------------------------------------------------------- */

interface SearchHit {
  readonly videoId: Uuid;
  readonly position: number;
}

class SearchableTranscriptIndex implements TranscriptIndexer {
  /** Every push made through the seam, in call order. */
  readonly pushes: {
    videoId: Uuid;
    segments: readonly TranscriptSegmentDto[];
  }[] = [];

  async index(
    videoId: Uuid,
    segments: readonly TranscriptSegmentDto[],
  ): Promise<void> {
    this.pushes.push({ videoId, segments });
  }

  /** Return every indexed segment whose text contains `term`, as a search hit. */
  searchByText(term: string): SearchHit[] {
    const hits: SearchHit[] = [];
    for (const push of this.pushes) {
      for (const segment of push.segments) {
        if (term.length > 0 && segment.text.includes(term)) {
          hits.push({ videoId: push.videoId, position: segment.start });
        }
      }
    }
    return hits;
  }
}

/** An in-memory {@link KnowledgeStore} capturing persisted transcripts. */
class InMemoryKnowledgeStore implements KnowledgeStore {
  readonly transcripts: TranscriptRecord[] = [];

  async findVideo(): Promise<never> {
    throw new Error("not used by indexTranscript");
  }
  async insertTranscript(record: TranscriptRecord): Promise<TranscriptRecord> {
    this.transcripts.push(record);
    return record;
  }
  async insertSummary(): Promise<never> {
    throw new Error("not used by indexTranscript");
  }
  async countDocLinks(): Promise<number> {
    throw new Error("not used by indexTranscript");
  }
  async insertDocLink(): Promise<never> {
    throw new Error("not used by indexTranscript");
  }
}

/** indexTranscript performs no permission check; a deny-all access proves it. */
const denyAll: AccessControl = {
  can: async () => false,
  assignRole: async () => {},
};

const FIXED_NOW = new Date("2024-06-01T12:00:00.000Z");
let idCounter = 0;
function sequentialIds(): () => Uuid {
  return () => `id-${++idCounter}` as Uuid;
}

/**
 * An arbitrary transcript segment with an ordered, non-negative playback window
 * and non-empty text (so it is searchable). `start`/`end` are the playback
 * positions that must be preserved through indexing (R25.1).
 */
const segmentArb: fc.Arbitrary<TranscriptSegmentDto> = fc
  .record({
    start: fc.double({ min: 0, max: 100_000, noNaN: true }),
    duration: fc.double({ min: 0, max: 10_000, noNaN: true }),
    text: fc.string({ minLength: 1, maxLength: 200 }),
  })
  .map(({ start, duration, text }) => ({
    start,
    end: start + duration,
    text,
  }));

const scenarioArb = fc.record({
  videoId: fc.uuid().map((s) => s as Uuid),
  segments: fc.array(segmentArb, { minLength: 1, maxLength: 20 }),
});

describe("Property 72: Transcript indexing makes content searchable within scope", () => {
  it("persists the transcript and pushes its segments to the search backend, preserving playback positions", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ videoId, segments }) => {
        const store = new InMemoryKnowledgeStore();
        const indexer = new SearchableTranscriptIndex();
        const kb = new KnowledgeBase({
          store,
          indexer,
          access: denyAll,
          clock: { now: () => FIXED_NOW },
          newId: sequentialIds(),
        });

        await kb.indexTranscript(videoId, { segments });

        // --- Persisted with an indexedAt timestamp and segments preserved ---
        expect(store.transcripts).toHaveLength(1);
        const persisted = store.transcripts[0]!;
        expect(persisted.videoId).toBe(videoId);
        expect(persisted.indexedAt).toBe(FIXED_NOW.toISOString());
        // Segment text AND playback positions preserved verbatim (R25.1).
        expect(persisted.segments).toEqual(segments);

        // --- Segment text pushed to the search backend seam ------------------
        expect(indexer.pushes).toHaveLength(1);
        const pushed = indexer.pushes[0]!;
        expect(pushed.videoId).toBe(videoId);
        expect(pushed.segments).toEqual(segments);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  it("makes every transcript segment subsequently searchable at its preserved playback position", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ videoId, segments }) => {
        const store = new InMemoryKnowledgeStore();
        const indexer = new SearchableTranscriptIndex();
        const kb = new KnowledgeBase({
          store,
          indexer,
          access: denyAll,
          clock: { now: () => FIXED_NOW },
          newId: sequentialIds(),
        });

        await kb.indexTranscript(videoId, { segments });

        // For every indexed segment, a search for its text returns this Video
        // with the matching playback position (the segment's start) (R25.1).
        for (const segment of segments) {
          const hits = indexer.searchByText(segment.text);
          const matched = hits.some(
            (h) => h.videoId === videoId && h.position === segment.start,
          );
          expect(matched).toBe(true);
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });
});
