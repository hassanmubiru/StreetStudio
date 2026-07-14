import { describe, it, expect } from "vitest";
import type { HttpRequest, HttpResponse, HttpTransport } from "@streetstudio/sdk";
import type { CommentDto } from "@streetstudio/shared";
import { DashboardSession } from "./session.js";
import {
  loadWorkspace,
  openProject,
  listFolderVideos,
  openVideo,
  threadComments,
  loadNotifications,
  searchVideos,
} from "./flows.js";
import { UploadController, uploadProgress } from "./uploads.js";
import {
  createShareLink,
  revokeShareLink,
  resolveSharedVideo,
  shareLinkState,
  isShareLinkActive,
} from "./sharing.js";
import {
  addReaction,
  removeReaction,
  toggleReaction,
  summarizeReactions,
} from "./reactions.js";
import { EditSessionController } from "./editing.js";
import type { ReactionDto } from "@streetstudio/shared";
import type { Timeline } from "@streetstudio/timeline";

/**
 * A scripted in-memory transport: matches `METHOD path` (path without the base
 * URL or query string) to a canned JSON response. Records requests so tests can
 * assert on headers (auth / organization scoping). This exercises the dashboard
 * session + flows against the real SDK client without a network or backend.
 */
class ScriptedTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];
  constructor(private readonly routes: Record<string, unknown>) {}

  send(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    const path = new URL(request.url).pathname;
    const key = `${request.method} ${path}`;
    const body = this.routes[key];
    if (body === undefined) {
      return Promise.resolve({ status: 404, body: JSON.stringify({ code: "NOT_FOUND" }) });
    }
    return Promise.resolve({ status: 200, body: JSON.stringify(body) });
  }
}

const BASE = "https://api.example.test";

const org = { id: "11111111-1111-1111-1111-111111111111", name: "Platform", settings: {}, createdAt: "2026-01-01T00:00:00.000Z" };
const project = { id: "22222222-2222-2222-2222-222222222222", organizationId: org.id, name: "Onboarding", createdAt: "2026-01-01T00:00:00.000Z" };
const folder = { id: "33333333-3333-3333-3333-333333333333", projectId: project.id, name: "Intro", parentId: null, createdAt: "2026-01-01T00:00:00.000Z" };

describe("DashboardSession", () => {
  it("is unauthenticated until credentials are attached, then scopes requests", async () => {
    const transport = new ScriptedTransport({ "GET /organizations": [org] });
    const session = new DashboardSession({ baseUrl: BASE, transport });

    expect(session.isAuthenticated).toBe(false);
    session.useBearerToken("tok-123");
    expect(session.isAuthenticated).toBe(true);
    session.selectOrganization(org.id);
    expect(session.organizationId).toBe(org.id);

    await session.api.organizations.list();
    const req = transport.requests.at(-1)!;
    expect(req.headers["authorization"] ?? req.headers["Authorization"]).toContain("tok-123");
  });

  it("clears credentials and scope on sign-out", async () => {
    const transport = new ScriptedTransport({ "POST /auth/logout": {} });
    const session = new DashboardSession({ baseUrl: BASE, transport, auth: { kind: "bearer", token: "t" }, organizationId: org.id });
    await session.signOut();
    expect(session.isAuthenticated).toBe(false);
    expect(session.organizationId).toBeUndefined();
  });
});

describe("dashboard flows", () => {
  it("loadWorkspace returns orgs, and projects only when an org is active", async () => {
    const transport = new ScriptedTransport({
      "GET /organizations": [org],
      "GET /projects": [project],
    });
    const session = new DashboardSession({ baseUrl: BASE, transport, auth: { kind: "bearer", token: "t" } });

    const before = await loadWorkspace(session);
    expect(before.organizations).toHaveLength(1);
    expect(before.projects).toEqual([]);
    expect(before.activeOrganization).toBeUndefined();

    session.selectOrganization(org.id);
    const after = await loadWorkspace(session);
    expect(after.activeOrganization).toEqual(org);
    expect(after.projects).toEqual([project]);
  });

  it("openProject aggregates the project and its folders", async () => {
    const transport = new ScriptedTransport({
      [`GET /projects/${project.id}`]: project,
      "GET /folders": [folder],
    });
    const session = new DashboardSession({ baseUrl: BASE, transport, auth: { kind: "bearer", token: "t" }, organizationId: org.id });

    const view = await openProject(session, project.id);
    expect(view.project).toEqual(project);
    expect(view.folders).toEqual([folder]);
  });

  it("listFolderVideos queries videos by folder", async () => {
    const video = { id: "44444444-4444-4444-4444-444444444444", organizationId: org.id, folderId: folder.id, title: "Demo", status: "ready", createdAt: "2026-01-01T00:00:00.000Z" };
    const transport = new ScriptedTransport({ "GET /videos": [video] });
    const session = new DashboardSession({ baseUrl: BASE, transport, auth: { kind: "bearer", token: "t" }, organizationId: org.id });

    const videos = await listFolderVideos(session, folder.id);
    expect(videos).toEqual([video]);
    // the folderId filter is carried on the query string
    expect(transport.requests.at(-1)!.url).toContain(`folderId=${folder.id}`);
  });

  const video = { id: "44444444-4444-4444-4444-444444444444", organizationId: org.id, folderId: folder.id, title: "Demo", durationSeconds: 42, status: "ready", developerMode: false, createdAt: "2026-01-01T00:00:00.000Z" };

  it("openVideo aggregates video, comments and playback; transcript/summary are best-effort", async () => {
    const comment = { id: "55555555-5555-5555-5555-555555555555", videoId: video.id, authorId: org.id, body: "Nice", createdAt: "2026-01-01T00:00:00.000Z" };
    const manifest = { videoId: video.id, renditions: [{ id: "66666666-6666-6666-6666-666666666666", videoId: video.id, quality: "720p", bitrate: 2_500_000 }] };
    // No transcript/summary routes → those calls 404 and degrade to undefined.
    const transport = new ScriptedTransport({
      [`GET /videos/${video.id}`]: video,
      [`GET /videos/${video.id}/comments`]: [comment],
      [`GET /videos/${video.id}/playback`]: manifest,
    });
    const session = new DashboardSession({ baseUrl: BASE, transport, auth: { kind: "bearer", token: "t" }, organizationId: org.id });

    const page = await openVideo(session, video.id);
    expect(page.video).toEqual(video);
    expect(page.comments).toEqual([comment]);
    expect(page.playback).toEqual(manifest);
    expect(page.transcript).toBeUndefined();
    expect(page.summary).toBeUndefined();
  });

  it("openVideo includes transcript and summary when present", async () => {
    const transcript = { id: "77777777-7777-7777-7777-777777777777", videoId: video.id, segments: [{ start: 0, end: 1, text: "hi" }] };
    const summary = { id: "88888888-8888-8888-8888-888888888888", videoId: video.id, body: "A demo.", sourcePluginId: "99999999-9999-9999-9999-999999999999" };
    const transport = new ScriptedTransport({
      [`GET /videos/${video.id}`]: video,
      [`GET /videos/${video.id}/comments`]: [],
      [`GET /videos/${video.id}/playback`]: { videoId: video.id, renditions: [] },
      [`GET /videos/${video.id}/transcript`]: transcript,
      [`GET /videos/${video.id}/summary`]: summary,
    });
    const session = new DashboardSession({ baseUrl: BASE, transport, auth: { kind: "bearer", token: "t" }, organizationId: org.id });

    const page = await openVideo(session, video.id);
    expect(page.transcript).toEqual(transcript);
    expect(page.summary).toEqual(summary);
  });

  it("openVideo rejects when a required call fails", async () => {
    // Only comments is routed; the required video.get 404s.
    const transport = new ScriptedTransport({ [`GET /videos/${video.id}/comments`]: [] });
    const session = new DashboardSession({ baseUrl: BASE, transport, auth: { kind: "bearer", token: "t" }, organizationId: org.id });
    await expect(openVideo(session, video.id)).rejects.toBeTruthy();
  });

  it("searchVideos short-circuits blank queries and forwards trimmed ones", async () => {
    const transport = new ScriptedTransport({ "GET /search/videos": [video] });
    const session = new DashboardSession({ baseUrl: BASE, transport, auth: { kind: "bearer", token: "t" }, organizationId: org.id });

    expect(await searchVideos(session, "   ")).toEqual([]);
    expect(transport.requests).toHaveLength(0);

    const results = await searchVideos(session, "  demo  ", { limit: 10 });
    expect(results).toEqual([video]);
    const url = transport.requests.at(-1)!.url;
    expect(url).toContain("q=demo");
    expect(url).toContain("limit=10");
  });

  it("loadNotifications derives an unread count from readAt", async () => {
    const read = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", memberId: org.id, eventType: "comment.created", sourceResourceId: video.id, createdAt: "2026-01-01T00:00:00.000Z", readAt: "2026-01-02T00:00:00.000Z" };
    const unread = { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", memberId: org.id, eventType: "mention.created", sourceResourceId: video.id, createdAt: "2026-01-03T00:00:00.000Z" };
    const transport = new ScriptedTransport({ "GET /notifications": [read, unread] });
    const session = new DashboardSession({ baseUrl: BASE, transport, auth: { kind: "bearer", token: "t" }, organizationId: org.id });

    const inbox = await loadNotifications(session);
    expect(inbox.notifications).toHaveLength(2);
    expect(inbox.unreadCount).toBe(1);
  });
});

describe("threadComments", () => {
  const at = (n: number) => `2026-01-0${n}T00:00:00.000Z`;
  const root1: CommentDto = { id: "c1", videoId: "v", authorId: "a", body: "root1", createdAt: at(1) };
  const root2: CommentDto = { id: "c2", videoId: "v", authorId: "a", body: "root2", createdAt: at(2) };
  const reply1: CommentDto = { id: "c3", videoId: "v", authorId: "a", body: "reply1", parentCommentId: "c1", createdAt: at(3) };
  const reply2: CommentDto = { id: "c4", videoId: "v", authorId: "a", body: "reply2", parentCommentId: "c1", createdAt: at(4) };

  it("groups replies under roots, preserving input order", () => {
    const threads = threadComments([root1, root2, reply1, reply2]);
    expect(threads.map((t) => t.comment.id)).toEqual(["c1", "c2"]);
    expect(threads[0]!.replies.map((r) => r.id)).toEqual(["c3", "c4"]);
    expect(threads[1]!.replies).toEqual([]);
  });

  it("drops replies whose parent is not in view", () => {
    const orphan: CommentDto = { id: "c5", videoId: "v", authorId: "a", body: "orphan", parentCommentId: "missing", createdAt: at(5) };
    const threads = threadComments([root1, orphan]);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.comment.id).toBe("c1");
    expect(threads[0]!.replies).toEqual([]);
  });
});

describe("uploadProgress", () => {
  const base = { id: "u1", organizationId: org.id, videoId: "v1", expiresAt: "2026-02-01T00:00:00.000Z" };

  it("derives fraction/percent and flags for an in-progress session", () => {
    const p = uploadProgress({ ...base, totalChunks: 4, ackedChunks: 1, status: "open" });
    expect(p.fraction).toBeCloseTo(0.25);
    expect(p.percent).toBe(25);
    expect(p.allChunksAcked).toBe(false);
    expect(p.isTerminal).toBe(false);
  });

  it("flags a fully-acked, completed session as terminal", () => {
    const p = uploadProgress({ ...base, totalChunks: 3, ackedChunks: 3, status: "completed" });
    expect(p.percent).toBe(100);
    expect(p.allChunksAcked).toBe(true);
    expect(p.isTerminal).toBe(true);
  });

  it("guards against a zero total-chunk count", () => {
    const p = uploadProgress({ ...base, totalChunks: 0, ackedChunks: 0, status: "open" });
    expect(p.fraction).toBe(0);
    expect(p.percent).toBe(0);
    expect(p.allChunksAcked).toBe(false);
  });
});

describe("UploadController", () => {
  const sid = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const open = { id: sid, organizationId: org.id, videoId: "v1", totalChunks: 3, ackedChunks: 0, expiresAt: "2026-02-01T00:00:00.000Z", status: "open" };

  it("has no current session or progress before begin()", () => {
    const session = new DashboardSession({ baseUrl: BASE, transport: new ScriptedTransport({}), auth: { kind: "bearer", token: "t" }, organizationId: org.id });
    const controller = new UploadController(session);
    expect(controller.current).toBeUndefined();
    expect(controller.progress).toBeUndefined();
  });

  it("drives create → refresh → complete and derives progress along the way", async () => {
    const transport = new ScriptedTransport({
      "POST /uploads": open,
      [`GET /uploads/${sid}`]: { ...open, ackedChunks: 3, lastAckAt: "2026-01-05T00:00:00.000Z" },
      [`POST /uploads/${sid}/complete`]: { ...open, ackedChunks: 3, status: "completed" },
    });
    const session = new DashboardSession({ baseUrl: BASE, transport, auth: { kind: "bearer", token: "t" }, organizationId: org.id });
    const controller = new UploadController(session);

    await controller.begin({ title: "Demo", totalChunks: 3 });
    expect(controller.progress!.percent).toBe(0);
    expect(controller.progress!.allChunksAcked).toBe(false);

    await controller.refresh();
    expect(controller.progress!.allChunksAcked).toBe(true);
    expect(controller.progress!.isTerminal).toBe(false);

    const done = await controller.complete();
    expect(done.status).toBe("completed");
    expect(controller.progress!.isTerminal).toBe(true);
  });

  it("aborts the active session", async () => {
    const transport = new ScriptedTransport({
      "POST /uploads": open,
      [`POST /uploads/${sid}/abort`]: { ...open, status: "aborted" },
    });
    const session = new DashboardSession({ baseUrl: BASE, transport, auth: { kind: "bearer", token: "t" }, organizationId: org.id });
    const controller = new UploadController(session);

    await controller.begin({ title: "Demo", totalChunks: 3 });
    const aborted = await controller.abort();
    expect(aborted.status).toBe("aborted");
    expect(controller.progress!.isTerminal).toBe(true);
  });

  it("throws when a lifecycle call is made before begin()", async () => {
    const session = new DashboardSession({ baseUrl: BASE, transport: new ScriptedTransport({}), auth: { kind: "bearer", token: "t" }, organizationId: org.id });
    const controller = new UploadController(session);
    await expect(controller.refresh()).rejects.toThrow(/No active upload session/);
  });
});
