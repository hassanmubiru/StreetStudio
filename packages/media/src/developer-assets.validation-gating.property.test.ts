import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type { AssetRecord, VideoRecord } from "@streetstudio/database";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import {
  DeveloperAssets,
  DEV_ASSET_BODY_MIN_LENGTH,
  DEV_ASSET_BODY_MAX_LENGTH,
  type DeveloperAssetStore,
} from "./developer-assets.js";

/**
 * Property 69: Developer assets validate length and require Developer Mode.
 *
 * Feature: streetstudio, Property 69: Developer assets validate length and require Developer Mode
 *
 * Validates: Requirements 23.1, 23.3, 23.5, 23.6
 *
 * For any code snippet or markdown attachment, it is stored as an Asset IF AND
 * ONLY IF the target Video has Developer Mode enabled and the body length is
 * between {@link DEV_ASSET_BODY_MIN_LENGTH} (1) and
 * {@link DEV_ASSET_BODY_MAX_LENGTH} (100,000) characters (R23.1, R23.3, R23.5).
 * A 0-length or over-100,000-character body is rejected with `VALIDATION_FAILED`
 * and nothing is stored (R23.5). When Developer Mode is disabled, EVERY developer
 * attachment (code snippet, markdown, terminal recording, API recording) is
 * rejected with the `DEVELOPER_MODE_REQUIRED` error and the Video is left
 * unchanged — no Asset is stored (R23.6).
 */

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

const ASSET_ID: Uuid = "44444444-4444-4444-4444-444444444444";

const actor: AuthContext = { memberId: "33333333-3333-3333-3333-333333333333" };

/**
 * Build a {@link VideoRecord} for the given id/org with a configurable Developer
 * Mode flag; other fields are fixed placeholders irrelevant to the property.
 */
function video(
  videoId: Uuid,
  organizationId: Uuid,
  developerMode: boolean,
): VideoRecord {
  return {
    id: videoId,
    organizationId,
    folderId: null,
    title: "demo",
    durationSeconds: 100,
    status: "ready",
    sourceObjectKey: "src/demo.mp4",
    developerMode,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

/**
 * A {@link DeveloperAssetStore} that resolves a single Video and records every
 * persisted {@link AssetRecord} so the property can assert exactly what was (or
 * was not) stored.
 */
function makeStore(vid: VideoRecord): {
  store: DeveloperAssetStore;
  assets: AssetRecord[];
} {
  const assets: AssetRecord[] = [];
  const store: DeveloperAssetStore = {
    async findVideo(videoId) {
      return vid.id === videoId ? vid : null;
    },
    async insertAsset(record) {
      assets.push(record);
      return record;
    },
  };
  return { store, assets };
}

/** Create-permission is granted for the whole property; gating is the subject. */
const allowAll: AccessControl = {
  can: async () => true,
  assignRole: async () => {},
};

function service(store: DeveloperAssetStore): DeveloperAssets {
  return new DeveloperAssets({
    store,
    access: allowAll,
    clock: { now: () => new Date("2024-01-01T00:00:00.000Z") },
    newId: () => ASSET_ID,
  });
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

const uuid = fc.uuid() as fc.Arbitrary<Uuid>;

/** A body within the permitted 1..100,000-character bounds (R23.1, R23.3, R23.5). */
const validBody = fc.string({
  minLength: DEV_ASSET_BODY_MIN_LENGTH,
  maxLength: DEV_ASSET_BODY_MAX_LENGTH,
});

/**
 * A body outside the permitted bounds: either empty (length 0) or longer than
 * 100,000 characters. The over-length range is capped just past the limit to
 * keep generation fast while still exercising the boundary (R23.5).
 */
const invalidBody = fc.oneof(
  fc.constant(""),
  fc
    .integer({
      min: DEV_ASSET_BODY_MAX_LENGTH + 1,
      max: DEV_ASSET_BODY_MAX_LENGTH + 200,
    })
    .map((n) => "a".repeat(n)),
);

/** Any body (valid or invalid) — used to show gating is length-independent. */
const anyBody = fc.oneof(validBody, invalidBody);

/** Which length-bounded text attachment to exercise. */
const textKind = fc.constantFrom<"code" | "markdown">("code", "markdown");

async function attachText(
  svc: DeveloperAssets,
  kind: "code" | "markdown",
  videoId: Uuid,
  body: string,
) {
  return kind === "code"
    ? svc.attachCodeSnippet(actor, videoId, body)
    : svc.attachMarkdown(actor, videoId, body);
}

/* -------------------------------------------------------------------------
 * Property 69
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 69: Developer assets validate length and require Developer Mode", () => {
  it("stores a code/markdown attachment as an Asset when Developer Mode is enabled and the body is 1..100,000 chars (R23.1, R23.3)", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuid,
        uuid,
        textKind,
        validBody,
        async (videoId, organizationId, kind, body) => {
          const { store, assets } = makeStore(
            video(videoId, organizationId, true),
          );
          const dto = await attachText(service(store), kind, videoId, body);

          const expectedType = kind === "code" ? "code_snippet" : "markdown";
          expect(dto).toMatchObject({
            id: ASSET_ID,
            videoId,
            type: expectedType,
          });
          // Exactly one Asset persisted, carrying the body verbatim.
          expect(assets).toHaveLength(1);
          expect(assets[0]).toMatchObject({
            id: ASSET_ID,
            videoId,
            type: expectedType,
            objectKeyOrBody: body,
          });
          // The stored body length is within bounds.
          expect(assets[0]!.objectKeyOrBody.length).toBeGreaterThanOrEqual(
            DEV_ASSET_BODY_MIN_LENGTH,
          );
          expect(assets[0]!.objectKeyOrBody.length).toBeLessThanOrEqual(
            DEV_ASSET_BODY_MAX_LENGTH,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects a 0-length or >100,000-char code/markdown body with VALIDATION_FAILED and stores nothing when Developer Mode is enabled (R23.5)", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuid,
        uuid,
        textKind,
        invalidBody,
        async (videoId, organizationId, kind, body) => {
          const { store, assets } = makeStore(
            video(videoId, organizationId, true),
          );
          await expect(
            attachText(service(store), kind, videoId, body),
          ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
          // The rejection is surfaced through the shared error taxonomy and the
          // Video is unchanged — no Asset stored.
          await expect(
            attachText(service(store), kind, videoId, body),
          ).rejects.toBeInstanceOf(AppError);
          expect(assets).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects EVERY developer attachment with DEVELOPER_MODE_REQUIRED and stores nothing when Developer Mode is disabled, regardless of body length (R23.6)", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuid,
        uuid,
        anyBody,
        async (videoId, organizationId, body) => {
          const { store, assets } = makeStore(
            video(videoId, organizationId, false),
          );
          const svc = service(store);

          await expect(
            svc.attachCodeSnippet(actor, videoId, body),
          ).rejects.toMatchObject({ code: "DEVELOPER_MODE_REQUIRED" });
          await expect(
            svc.attachMarkdown(actor, videoId, body),
          ).rejects.toMatchObject({ code: "DEVELOPER_MODE_REQUIRED" });
          await expect(
            svc.recordTerminal(actor, videoId, { content: body }),
          ).rejects.toMatchObject({ code: "DEVELOPER_MODE_REQUIRED" });
          await expect(
            svc.attachApiRecording(actor, videoId, { content: body }),
          ).rejects.toMatchObject({ code: "DEVELOPER_MODE_REQUIRED" });

          // The Video is left unchanged across all four rejected attachments.
          expect(assets).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
