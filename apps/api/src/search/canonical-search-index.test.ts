import { describe, expect, it } from "vitest";
import type { PgClient } from "../runtime/pg-client.js";
import { canonicalSearchIndex } from "./canonical-search-index.js";

/** Rows the fake returns for the title (`FROM video`) and transcript queries. */
interface Script {
  title: Array<{ id: string; organization_id: string; created_at: string }>;
  transcript: Array<{
    video_id: string;
    organization_id: string;
    created_at: string;
    segments: string | null;
  }>;
}

/** A fake PgClient that records params and returns scripted rows per query kind. */
function fakePg(script: Script): { pg: PgClient; params: unknown[][] } {
  const params: unknown[][] = [];
  const pg = {
    async query(text: string, p?: readonly unknown[]) {
      params.push([...(p ?? [])]);
      const rows = text.includes("FROM transcript")
        ? script.transcript
        : script.title;
      return { rows, rowCount: rows.length };
    },
  } as unknown as PgClient;
  return { pg, params };
}

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";

describe("canonicalSearchIndex (canonical singular video/transcript schema)", () => {
  it("escapes LIKE wildcards so a query matches literally (no wildcard injection)", async () => {
    const { pg, params } = fakePg({ title: [], transcript: [] });
    await canonicalSearchIndex(pg).query("a%b_c\\d");
    // Both queries receive the same escaped needle as $1.
    expect(params[0]?.[0]).toBe("%a\\%b\\_c\\\\d%");
    expect(params[1]?.[0]).toBe("%a\\%b\\_c\\\\d%");
  });

  it("returns a title match as a video resource with no transcript position", async () => {
    const { pg } = fakePg({
      title: [{ id: V1, organization_id: ORG, created_at: "2026-01-01T00:00:00.000Z" }],
      transcript: [],
    });
    const matches = await canonicalSearchIndex(pg).query("hello");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.resource).toEqual({ organizationId: ORG, type: "video", id: V1 });
    expect(matches[0]?.transcriptPosition).toBeUndefined();
  });

  it("carries the matching segment's start as the transcript position (R14.2)", async () => {
    const segments = JSON.stringify([
      { start: 0, end: 5, text: "intro" },
      { start: 12, end: 18, text: "the needle is here" },
    ]);
    const { pg } = fakePg({
      title: [],
      transcript: [
        { video_id: V1, organization_id: ORG, created_at: "2026-01-01T00:00:00.000Z", segments },
      ],
    });
    const matches = await canonicalSearchIndex(pg).query("needle");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.resource.id).toBe(V1);
    expect(matches[0]?.transcriptPosition).toBe(12);
  });

  it("de-duplicates a video matched by both title and transcript, preferring the position", async () => {
    const segments = JSON.stringify([{ start: 7, end: 9, text: "needle" }]);
    const { pg } = fakePg({
      title: [{ id: V1, organization_id: ORG, created_at: "2026-01-01T00:00:00.000Z" }],
      transcript: [
        { video_id: V1, organization_id: ORG, created_at: "2026-01-01T00:00:00.000Z", segments },
      ],
    });
    const matches = await canonicalSearchIndex(pg).query("needle");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.transcriptPosition).toBe(7);
  });

  it("orders results by created_at then id for stable pagination (R14.6)", async () => {
    const { pg } = fakePg({
      title: [
        { id: V2, organization_id: ORG, created_at: "2026-01-02T00:00:00.000Z" },
        { id: V1, organization_id: ORG, created_at: "2026-01-01T00:00:00.000Z" },
      ],
      transcript: [],
    });
    const matches = await canonicalSearchIndex(pg).query("x");
    expect(matches.map((m) => m.resource.id)).toEqual([V1, V2]);
  });

  it("treats an unparseable/absent segments column as no transcript match", async () => {
    const { pg } = fakePg({
      title: [],
      transcript: [
        { video_id: V1, organization_id: ORG, created_at: "2026-01-01T00:00:00.000Z", segments: "not-json" },
      ],
    });
    const matches = await canonicalSearchIndex(pg).query("needle");
    // The row still surfaces the video (it matched the ILIKE), but with no position.
    expect(matches).toHaveLength(1);
    expect(matches[0]?.transcriptPosition).toBeUndefined();
  });
});
