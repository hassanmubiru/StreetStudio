import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type { AssetRecord, VideoRecord } from "@streetstudio/database";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import {
  DeveloperAssets,
  DEV_ASSET_BODY_MAX_LENGTH,
  CREATE_ASSET_PERMISSION,
  type DeveloperAssetStore,
} from "./developer-assets.js";

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

const ORG: Uuid = "11111111-1111-1111-1111-111111111111";
const VIDEO: Uuid = "22222222-2222-2222-2222-222222222222";
const MEMBER: Uuid = "33333333-3333-3333-3333-333333333333";
const ASSET: Uuid = "44444444-4444-4444-4444-444444444444";

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
    developerMode: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

interface Fakes {
  store: DeveloperAssetStore;
  assets: AssetRecord[];
}

function makeStore(opts: { video?: VideoRecord | null } = {}): Fakes {
  const assets: AssetRecord[] = [];
  const vid = opts.video === undefined ? video() : opts.video;
  const store: DeveloperAssetStore = {
    async findVideo(videoId) {
      return vid && vid.id === videoId ? vid : null;
    },
    async insertAsset(record) {
      assets.push(record);
      return record;
    },
  };
  return { store, assets };
}

const allowAll: AccessControl = {
  can: async () => true,
  assignRole: async () => {},
};
const denyAll: AccessControl = {
  can: async () => false,
  assignRole: async () => {},
};

function service(store: DeveloperAssetStore, access: AccessControl) {
  return new DeveloperAssets({
    store,
    access,
    clock: { now: () => new Date("2024-01-01T00:00:00.000Z") },
    newId: () => ASSET,
  });
}

/* -------------------------------------------------------------------------
 * Sanity checks
 * ---------------------------------------------------------------------- */

describe("DeveloperAssets", () => {
  it("attaches a code snippet as a code_snippet Asset when Developer Mode is enabled (R23.1)", async () => {
    const fakes = makeStore();
    const dto = await service(fakes.store, allowAll).attachCodeSnippet(
      actor,
      VIDEO,
      "const x = 1;",
    );
    expect(dto).toMatchObject({ id: ASSET, videoId: VIDEO, type: "code_snippet" });
    expect(fakes.assets).toHaveLength(1);
    expect(fakes.assets[0]?.objectKeyOrBody).toBe("const x = 1;");
  });

  it("attaches markdown as a markdown Asset (R23.3)", async () => {
    const fakes = makeStore();
    const dto = await service(fakes.store, allowAll).attachMarkdown(
      actor,
      VIDEO,
      "# Title",
    );
    expect(dto.type).toBe("markdown");
    expect(fakes.assets).toHaveLength(1);
  });

  it("stores a terminal recording as a terminal Asset (R23.2)", async () => {
    const fakes = makeStore();
    const dto = await service(fakes.store, allowAll).recordTerminal(actor, VIDEO, {
      content: "$ ls\nfile.txt",
    });
    expect(dto.type).toBe("terminal");
    expect(fakes.assets).toHaveLength(1);
  });

  it("stores an API recording as an api_recording Asset (R23.4)", async () => {
    const fakes = makeStore();
    const dto = await service(fakes.store, allowAll).attachApiRecording(actor, VIDEO, {
      content: "{}",
    });
    expect(dto.type).toBe("api_recording");
    expect(fakes.assets).toHaveLength(1);
  });

  it("rejects a 0-length body with VALIDATION_FAILED and creates no Asset (R23.5)", async () => {
    const fakes = makeStore();
    await expect(
      service(fakes.store, allowAll).attachCodeSnippet(actor, VIDEO, ""),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(fakes.assets).toHaveLength(0);
  });

  it("rejects an over-100,000-character body with VALIDATION_FAILED (R23.5)", async () => {
    const fakes = makeStore();
    const tooLong = "a".repeat(DEV_ASSET_BODY_MAX_LENGTH + 1);
    await expect(
      service(fakes.store, allowAll).attachMarkdown(actor, VIDEO, tooLong),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(fakes.assets).toHaveLength(0);
  });

  it("rejects every attachment with DEVELOPER_MODE_REQUIRED when Developer Mode is disabled (R23.6)", async () => {
    const fakes = makeStore({ video: video({ developerMode: false }) });
    const svc = service(fakes.store, allowAll);
    await expect(svc.attachCodeSnippet(actor, VIDEO, "x")).rejects.toMatchObject({
      code: "DEVELOPER_MODE_REQUIRED",
    });
    await expect(svc.attachMarkdown(actor, VIDEO, "x")).rejects.toMatchObject({
      code: "DEVELOPER_MODE_REQUIRED",
    });
    await expect(
      svc.recordTerminal(actor, VIDEO, { content: "x" }),
    ).rejects.toMatchObject({ code: "DEVELOPER_MODE_REQUIRED" });
    await expect(
      svc.attachApiRecording(actor, VIDEO, { content: "x" }),
    ).rejects.toMatchObject({ code: "DEVELOPER_MODE_REQUIRED" });
    expect(fakes.assets).toHaveLength(0);
  });

  it("rejects with DEVELOPER_MODE_REQUIRED before validating body length when disabled (R23.6)", async () => {
    const fakes = makeStore({ video: video({ developerMode: false }) });
    await expect(
      service(fakes.store, allowAll).attachCodeSnippet(actor, VIDEO, ""),
    ).rejects.toMatchObject({ code: "DEVELOPER_MODE_REQUIRED" });
    expect(fakes.assets).toHaveLength(0);
  });

  it("denies creation without create permission and creates no Asset", async () => {
    const fakes = makeStore();
    await expect(
      service(fakes.store, denyAll).attachCodeSnippet(actor, VIDEO, "x"),
    ).rejects.toBeInstanceOf(AppError);
    expect(fakes.assets).toHaveLength(0);
  });

  it("raises NOT_FOUND for an unknown Video", async () => {
    const fakes = makeStore({ video: null });
    await expect(
      service(fakes.store, allowAll).attachCodeSnippet(actor, VIDEO, "x"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("exposes the create-permission token", () => {
    expect(CREATE_ASSET_PERMISSION).toBe("content:create_asset");
  });
});
