import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { Uuid, TranscriptSegmentDto } from "@streetstudio/shared";
import type {
  DocLinkRecord,
  SummaryRecord,
  TranscriptRecord,
  VideoRecord,
} from "@streetstudio/database";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import {
  KnowledgeBase,
  SUMMARY_BODY_MAX_LENGTH,
  DOC_URL_MAX_LENGTH,
  MAX_DOC_LINKS_PER_VIDEO,
  LINK_DOC_PERMISSION,
  type KnowledgeStore,
  type TranscriptIndexer,
} from "./knowledge-base.js";

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

const ORG: Uuid = "11111111-1111-1111-1111-111111111111";
const VIDEO: Uuid = "22222222-2222-2222-2222-222222222222";
const MEMBER: Uuid = "33333333-3333-3333-3333-333333333333";
const ID: Uuid = "44444444-4444-4444-4444-444444444444";
const PLUGIN: Uuid = "55555555-5555-5555-5555-555555555555";

const actor: AuthContext = { memberId: MEMBER };

function video(overrides: Partial<VideoRecord> = {}): VideoRecord {
  return {
    id: VIDEO,
    organizationId: ORG,
    folderId: null,
    title: "demo",
    durationSeconds: 100,
    status: "ready",
    sourceObjectKey: "src/demo.mp4",
    developerMode: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

interface Fakes {
  store: KnowledgeStore;
  indexer: TranscriptIndexer;
  transcripts: TranscriptRecord[];
  summaries: SummaryRecord[];
  docLinks: DocLinkRecord[];
  indexed: { videoId: Uuid; segments: readonly TranscriptSegmentDto[] }[];
}

function makeFakes(opts: { video?: VideoRecord | null; existingDocLinks?: number } = {}): Fakes {
  const transcripts: TranscriptRecord[] = [];
  const summaries: SummaryRecord[] = [];
  const docLinks: DocLinkRecord[] = [];
  const indexed: { videoId: Uuid; segments: readonly TranscriptSegmentDto[] }[] = [];
  const vid = opts.video === undefined ? video() : opts.video;
  const existing = opts.existingDocLinks ?? 0;

  const store: KnowledgeStore = {
    async findVideo(videoId) {
      return vid && vid.id === videoId ? vid : null;
    },
    async insertTranscript(record) {
      transcripts.push(record);
      return record;
    },
    async insertSummary(record) {
      summaries.push(record);
      return record;
    },
    async countDocLinks(videoId) {
      return existing + docLinks.filter((l) => l.videoId === videoId).length;
    },
    async insertDocLink(record) {
      docLinks.push(record);
      return record;
    },
  };
  const indexer: TranscriptIndexer = {
    async index(videoId, segments) {
      indexed.push({ videoId, segments });
    },
  };
  return { store, indexer, transcripts, summaries, docLinks, indexed };
}

function service(fakes: Fakes, access: AccessControl) {
  return new KnowledgeBase({
    store: fakes.store,
    indexer: fakes.indexer,
    access,
    clock: { now: () => new Date("2024-01-01T00:00:00.000Z") },
    newId: () => ID,
  });
}

const allowAll: AccessControl = { can: async () => true, assignRole: async () => {} };
const denyAll: AccessControl = { can: async () => false, assignRole: async () => {} };

const segments: TranscriptSegmentDto[] = [
  { start: 0, end: 2, text: "hello world" },
  { start: 2, end: 4, text: "second segment" },
];

/* -------------------------------------------------------------------------
 * Sanity checks
 * ---------------------------------------------------------------------- */

describe("KnowledgeBase.indexTranscript (R25.1)", () => {
  it("persists the transcript with an indexedAt timestamp and makes it searchable", async () => {
    const fakes = makeFakes();
    await service(fakes, allowAll).indexTranscript(VIDEO, { segments });
    expect(fakes.transcripts).toHaveLength(1);
    expect(fakes.transcripts[0]?.videoId).toBe(VIDEO);
    expect(fakes.transcripts[0]?.indexedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(fakes.indexed).toHaveLength(1);
    expect(fakes.indexed[0]?.videoId).toBe(VIDEO);
    expect(fakes.indexed[0]?.segments).toHaveLength(2);
  });
});

describe("KnowledgeBase.storeSummary (R25.2)", () => {
  it("stores a provider-produced summary attributed to the source plugin", async () => {
    const fakes = makeFakes();
    const dto = await service(fakes, allowAll).storeSummary(VIDEO, "a concise summary", PLUGIN);
    expect(dto).toMatchObject({ id: ID, videoId: VIDEO, body: "a concise summary", sourcePluginId: PLUGIN });
    expect(fakes.summaries).toHaveLength(1);
  });

  it("rejects an empty summary body and stores nothing", async () => {
    const fakes = makeFakes();
    await expect(service(fakes, allowAll).storeSummary(VIDEO, "", PLUGIN)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(fakes.summaries).toHaveLength(0);
  });

  it("rejects an over-10,000-character summary body (R25.2)", async () => {
    const fakes = makeFakes();
    const tooLong = "a".repeat(SUMMARY_BODY_MAX_LENGTH + 1);
    await expect(service(fakes, allowAll).storeSummary(VIDEO, tooLong, PLUGIN)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(fakes.summaries).toHaveLength(0);
  });
});

describe("KnowledgeBase.linkDoc (R25.3–R25.6)", () => {
  it("stores and returns a documentation link when all checks pass (R25.3)", async () => {
    const fakes = makeFakes();
    const dto = await service(fakes, allowAll).linkDoc(actor, VIDEO, "https://docs.example.com/guide");
    expect(dto).toMatchObject({ id: ID, videoId: VIDEO, url: "https://docs.example.com/guide" });
    expect(fakes.docLinks).toHaveLength(1);
  });

  it("raises NOT_FOUND for an unknown Video and stores nothing", async () => {
    const fakes = makeFakes({ video: null });
    await expect(service(fakes, allowAll).linkDoc(actor, VIDEO, "https://x.dev")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(fakes.docLinks).toHaveLength(0);
  });

  it("rejects an empty URL with VALIDATION_FAILED (R25.4)", async () => {
    const fakes = makeFakes();
    await expect(service(fakes, allowAll).linkDoc(actor, VIDEO, "")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(fakes.docLinks).toHaveLength(0);
  });

  it("rejects an over-2048-character URL with VALIDATION_FAILED (R25.4)", async () => {
    const fakes = makeFakes();
    const tooLong = "h".repeat(DOC_URL_MAX_LENGTH + 1);
    await expect(service(fakes, allowAll).linkDoc(actor, VIDEO, tooLong)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(fakes.docLinks).toHaveLength(0);
  });

  it("denies linking without edit permission and stores nothing (R25.5)", async () => {
    const fakes = makeFakes();
    await expect(service(fakes, denyAll).linkDoc(actor, VIDEO, "https://x.dev")).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect(fakes.docLinks).toHaveLength(0);
  });

  it("rejects with CONFLICT once the Video already holds the maximum links and stores nothing (R25.6)", async () => {
    const fakes = makeFakes({ existingDocLinks: MAX_DOC_LINKS_PER_VIDEO });
    await expect(service(fakes, allowAll).linkDoc(actor, VIDEO, "https://x.dev")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(fakes.docLinks).toHaveLength(0);
  });

  it("checks permission before the cap so a denied caller cannot probe the count (R25.5)", async () => {
    const fakes = makeFakes({ existingDocLinks: MAX_DOC_LINKS_PER_VIDEO });
    await expect(service(fakes, denyAll).linkDoc(actor, VIDEO, "https://x.dev")).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
  });

  it("rejects failures through the shared taxonomy", async () => {
    const fakes = makeFakes({ video: null });
    await expect(service(fakes, allowAll).linkDoc(actor, VIDEO, "https://x.dev")).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("exposes the link-doc permission token", () => {
    expect(LINK_DOC_PERMISSION).toBe("content:link_doc");
  });
});
