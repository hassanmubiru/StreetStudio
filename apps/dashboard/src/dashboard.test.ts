import { describe, it, expect } from "vitest";
import type { HttpRequest, HttpResponse, HttpTransport } from "@streetstudio/sdk";
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
});
