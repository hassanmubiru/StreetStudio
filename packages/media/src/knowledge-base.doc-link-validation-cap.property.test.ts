import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { Uuid, DocLinkDto } from "@streetstudio/shared";
import type { DocLinkRecord, VideoRecord } from "@streetstudio/database";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import {
  KnowledgeBase,
  DOC_URL_MIN_LENGTH,
  DOC_URL_MAX_LENGTH,
  MAX_DOC_LINKS_PER_VIDEO,
  type KnowledgeStore,
  type TranscriptIndexer,
} from "./knowledge-base.js";

/**
 * Property 74: Documentation links validate input and enforce the per-video cap.
 *
 * Feature: streetstudio, Property 74: Documentation links validate input and enforce the per-video cap
 *
 * Validates: Requirements 25.3, 25.4, 25.5, 25.6
 *
 * For any request to {@link KnowledgeBase.linkDoc} against a resolvable Video,
 * the association is stored and returned IF AND ONLY IF all three conditions
 * hold: the URL is between {@link DOC_URL_MIN_LENGTH} (1) and
 * {@link DOC_URL_MAX_LENGTH} (2048) characters (R25.4), the actor holds the
 * link permission in the Video's owning Organization (R25.5), and the Video has
 * fewer than {@link MAX_DOC_LINKS_PER_VIDEO} (100) existing documentation links
 * (R25.3, R25.6).
 *
 * When any condition fails, `linkDoc` rejects and stores nothing: an
 * out-of-range URL raises a `VALIDATION_FAILED` validation error (R25.4), an
 * unpermitted actor raises an `AUTHORIZATION_DENIED` authorization error
 * (R25.5), and a request at the cap raises a `CONFLICT` error (R25.6). Because
 * the service checks the URL, then permission, then the cap, the outcome for
 * every combination of inputs is fully determined by that precedence.
 */

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

const ORG: Uuid = "11111111-1111-1111-1111-111111111111";

/** A ready Video owned by {@link ORG}, used as the link target. */
function video(id: Uuid): VideoRecord {
  return {
    id,
    organizationId: ORG,
    folderId: null,
    title: "demo",
    durationSeconds: 100,
    status: "ready",
    sourceObjectKey: "src/demo.mp4",
    developerMode: false,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

/**
 * A {@link KnowledgeStore} backed by a single resolvable Video and a seed count
 * of pre-existing documentation links. It records every persisted
 * {@link DocLinkRecord} so the property can assert exactly what was (or was not)
 * stored; the transcript/summary seams throw if touched.
 */
function makeDocStore(
  vid: VideoRecord,
  existingDocLinks: number,
): { store: KnowledgeStore; docLinks: DocLinkRecord[] } {
  const docLinks: DocLinkRecord[] = [];
  const store: KnowledgeStore = {
    async findVideo(videoId) {
      return vid.id === videoId ? vid : null;
    },
    async insertTranscript() {
      throw new Error("not used");
    },
    async insertSummary() {
      throw new Error("not used");
    },
    async countDocLinks(videoId) {
      return existingDocLinks + docLinks.filter((l) => l.videoId === videoId).length;
    },
    async insertDocLink(record) {
      docLinks.push(record);
      return record;
    },
  };
  return { store, docLinks };
}

const noopIndexer: TranscriptIndexer = { async index() {} };

/** An {@link AccessControl} that grants or denies uniformly. */
function accessThatReturns(permitted: boolean): AccessControl {
  return { can: async () => permitted, assignRole: async () => {} };
}

function service(
  store: KnowledgeStore,
  access: AccessControl,
  newId: () => Uuid,
): KnowledgeBase {
  return new KnowledgeBase({
    store,
    indexer: noopIndexer,
    access,
    clock: { now: () => new Date("2024-01-01T00:00:00.000Z") },
    newId,
  });
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

const uuid = fc.uuid() as fc.Arbitrary<Uuid>;
const actor: AuthContext = { memberId: "33333333-3333-3333-3333-333333333333" as Uuid };

/** A URL within the permitted 1..2048 character bounds (R25.4). */
const validUrl = fc.string({
  minLength: DOC_URL_MIN_LENGTH,
  maxLength: DOC_URL_MAX_LENGTH,
});

/**
 * A URL outside the permitted bounds: either empty (length 0) or longer than
 * 2048 characters. The over-length range is capped just past the limit to keep
 * generation fast while still exercising the boundary (R25.4).
 */
const invalidUrl = fc.oneof(
  fc.constant(""),
  fc
    .integer({ min: DOC_URL_MAX_LENGTH + 1, max: DOC_URL_MAX_LENGTH + 200 })
    .map((n) => "h".repeat(n)),
);

/** Any URL, valid or not — lets the property drive the validation branch. */
const anyUrl = fc.oneof(validUrl, invalidUrl);

/**
 * A pre-existing documentation-link count spanning below, at, and above the
 * per-Video cap so the property exercises both the accepted (`< 100`) and
 * rejected (`>= 100`) sides of R25.6.
 */
const existingCount = fc.integer({ min: 0, max: MAX_DOC_LINKS_PER_VIDEO + 5 });

/** Classify the URL the way {@link KnowledgeBase} does (R25.4). */
function urlIsValid(url: string): boolean {
  return url.length >= DOC_URL_MIN_LENGTH && url.length <= DOC_URL_MAX_LENGTH;
}

/* -------------------------------------------------------------------------
 * Property 74
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 74: Documentation links validate input and enforce the per-video cap", () => {
  it("stores exactly one link, associated with its Video, IFF url is 1..2048 chars, actor is permitted, and the Video is under the 100-link cap; otherwise rejects and stores nothing (R25.3, R25.4, R25.5, R25.6)", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuid,
        uuid,
        anyUrl,
        fc.boolean(),
        existingCount,
        async (videoId, linkId, url, permitted, existing) => {
          const vid = video(videoId);
          const { store, docLinks } = makeDocStore(vid, existing);
          const svc = service(store, accessThatReturns(permitted), () => linkId);

          const validUrlInput = urlIsValid(url);
          const underCap = existing < MAX_DOC_LINKS_PER_VIDEO;
          const shouldStore = validUrlInput && permitted && underCap;

          if (shouldStore) {
            const dto: DocLinkDto = await svc.linkDoc(actor, videoId, url);
            // The returned link is associated with its Video and carries the url.
            expect(dto).toMatchObject({ id: linkId, videoId, url });
            // Exactly one link was persisted, matching the returned DTO (R25.3).
            expect(docLinks).toHaveLength(1);
            expect(docLinks[0]).toMatchObject({ id: linkId, videoId, url });
            // The stored url length is within bounds (R25.4).
            expect(docLinks[0]!.url.length).toBeGreaterThanOrEqual(DOC_URL_MIN_LENGTH);
            expect(docLinks[0]!.url.length).toBeLessThanOrEqual(DOC_URL_MAX_LENGTH);
          } else {
            // The exact error is determined by the url -> permission -> cap
            // precedence the service enforces (R25.4, R25.5, R25.6).
            const expectedCode = !validUrlInput
              ? "VALIDATION_FAILED"
              : !permitted
                ? "AUTHORIZATION_DENIED"
                : "CONFLICT";
            await expect(svc.linkDoc(actor, videoId, url)).rejects.toMatchObject({
              code: expectedCode,
            });
            // Every rejection is surfaced through the shared taxonomy and
            // creates no association (R25.4, R25.5, R25.6).
            expect(docLinks).toHaveLength(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects an out-of-range url with a VALIDATION_FAILED AppError and stores nothing, even when permitted and under the cap (R25.4)", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuid,
        uuid,
        invalidUrl,
        fc.integer({ min: 0, max: MAX_DOC_LINKS_PER_VIDEO - 1 }),
        async (videoId, linkId, url, existing) => {
          const { store, docLinks } = makeDocStore(video(videoId), existing);
          const svc = service(store, accessThatReturns(true), () => linkId);
          const promise = svc.linkDoc(actor, videoId, url);
          await expect(promise).rejects.toBeInstanceOf(AppError);
          await expect(promise).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
          expect(docLinks).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("denies an unpermitted actor with an AUTHORIZATION_DENIED error and stores nothing, regardless of the current link count (R25.5)", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuid,
        uuid,
        validUrl,
        existingCount,
        async (videoId, linkId, url, existing) => {
          const { store, docLinks } = makeDocStore(video(videoId), existing);
          const svc = service(store, accessThatReturns(false), () => linkId);
          await expect(svc.linkDoc(actor, videoId, url)).rejects.toMatchObject({
            code: "AUTHORIZATION_DENIED",
          });
          expect(docLinks).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects a permitted, valid request at or above the 100-link cap with a CONFLICT error and stores nothing (R25.6)", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuid,
        uuid,
        validUrl,
        fc.integer({ min: MAX_DOC_LINKS_PER_VIDEO, max: MAX_DOC_LINKS_PER_VIDEO + 50 }),
        async (videoId, linkId, url, existing) => {
          const { store, docLinks } = makeDocStore(video(videoId), existing);
          const svc = service(store, accessThatReturns(true), () => linkId);
          await expect(svc.linkDoc(actor, videoId, url)).rejects.toMatchObject({
            code: "CONFLICT",
          });
          expect(docLinks).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
