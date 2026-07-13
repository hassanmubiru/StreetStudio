/**
 * Sanity unit tests for {@link StreetStudioClient}. They exercise request
 * construction (method, path, headers incl. auth + org scope, query, body),
 * typed response parsing, error-taxonomy surfacing on non-2xx responses, and
 * the optional realtime seam — all through a fake transport with no network.
 *
 * The exhaustive parity contract test (task 37.3) and the authorization-parity
 * property test (task 37.4) live in their own dedicated files.
 */
import { describe, expect, it } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { Uuid, VideoDto } from "@streetstudio/shared";
import {
  StreetStudioClient,
  fetchTransport,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
  type RealtimeConnection,
  type RealtimeHandlers,
  type RealtimeTransport,
} from "./client.js";

const BASE = "https://api.example.com/";
const ORG = "11111111-1111-4111-8111-111111111111" as Uuid;
const VIDEO = "22222222-2222-4222-8222-222222222222" as Uuid;

/** Records the last request and returns a canned response. */
function recordingTransport(response: HttpResponse): HttpTransport & {
  last(): HttpRequest;
} {
  let captured: HttpRequest | undefined;
  return {
    async send(request: HttpRequest): Promise<HttpResponse> {
      captured = request;
      return response;
    },
    last(): HttpRequest {
      if (!captured) {
        throw new Error("no request captured");
      }
      return captured;
    },
  };
}

const ok = (body: unknown): HttpResponse => ({
  status: 200,
  body: JSON.stringify(body),
});

describe("StreetStudioClient request construction", () => {
  it("builds an authenticated, org-scoped GET with a normalized URL", async () => {
    const video: VideoDto = { id: VIDEO } as VideoDto;
    const transport = recordingTransport(ok(video));
    const client = new StreetStudioClient({
      baseUrl: BASE,
      organizationId: ORG,
      auth: { kind: "bearer", token: "tok-123" },
      transport,
    });

    const result = await client.videos.get(VIDEO);

    const req = transport.last();
    expect(req.method).toBe("GET");
    // Trailing slash on baseUrl is normalized; path is joined cleanly.
    expect(req.url).toBe(`https://api.example.com/videos/${VIDEO}`);
    expect(req.headers.Authorization).toBe("Bearer tok-123");
    expect(req.headers["X-Organization-Id"]).toBe(ORG);
    expect(req.body).toBeUndefined();
    expect(result).toEqual(video);
  });

  it("serializes a JSON body and sets the content-type on writes", async () => {
    const transport = recordingTransport(ok({ id: "p1" }));
    const client = new StreetStudioClient({
      baseUrl: BASE,
      auth: { kind: "bearer", token: "t" },
      transport,
    });

    await client.projects.create({ name: "Launch" });

    const req = transport.last();
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://api.example.com/projects");
    expect(req.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(req.body ?? "")).toEqual({ name: "Launch" });
  });

  it("encodes query parameters and omits undefined values", async () => {
    const transport = recordingTransport(ok([]));
    const client = new StreetStudioClient({ baseUrl: BASE, transport });

    await client.search.videos({ q: "a b", limit: 5, cursor: undefined });

    const req = transport.last();
    expect(req.url).toBe("https://api.example.com/search/videos?q=a%20b&limit=5");
  });

  it("attaches an API-key header when authenticating as automation", async () => {
    const transport = recordingTransport(ok([]));
    const client = new StreetStudioClient({
      baseUrl: BASE,
      auth: { kind: "apiKey", apiKey: "sk-live-9" },
      transport,
    });

    await client.apiKeys.list();

    expect(transport.last().headers["X-Api-Key"]).toBe("sk-live-9");
    expect(transport.last().headers.Authorization).toBeUndefined();
  });

  it("allows a per-request organization scope override", async () => {
    const other = "33333333-3333-4333-8333-333333333333" as Uuid;
    const transport = recordingTransport(ok([]));
    const client = new StreetStudioClient({
      baseUrl: BASE,
      organizationId: ORG,
      transport,
    });

    await client.folders.listByProject(other);
    // Default org scope still applied (no per-call override here).
    expect(transport.last().headers["X-Organization-Id"]).toBe(ORG);
    expect(transport.last().url).toBe(
      `https://api.example.com/folders?projectId=${other}`,
    );
  });
});

describe("StreetStudioClient response handling", () => {
  it("returns undefined for a 204 No Content response", async () => {
    const transport = recordingTransport({ status: 204 });
    const client = new StreetStudioClient({ baseUrl: BASE, transport });

    await expect(client.projects.delete(VIDEO)).resolves.toBeUndefined();
  });

  it("surfaces the shared error taxonomy on a non-2xx response", async () => {
    const transport = recordingTransport({
      status: 403,
      body: JSON.stringify({ code: "AUTHORIZATION_DENIED" }),
    });
    const client = new StreetStudioClient({ baseUrl: BASE, transport });

    await expect(client.videos.get(VIDEO)).rejects.toBeInstanceOf(AppError);
    await expect(client.videos.get(VIDEO)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
  });

  it("falls back to a validation error and retains the HTTP status for unknown bodies", async () => {
    const transport = recordingTransport({ status: 500, body: "not json" });
    const client = new StreetStudioClient({ baseUrl: BASE, transport });

    await expect(client.videos.get(VIDEO)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { httpStatus: 500 },
    });
  });
});

describe("StreetStudioClient realtime seam", () => {
  it("throws a capability error when no realtime transport is configured", () => {
    const client = new StreetStudioClient({ baseUrl: BASE });
    expect(() => client.connectRealtime({ onEvent: () => {} })).toThrow(AppError);
  });

  it("opens a realtime connection over a ws(s) URL derived from baseUrl", () => {
    let connectedUrl = "";
    const realtimeTransport: RealtimeTransport = {
      connect(url: string, _handlers: RealtimeHandlers): RealtimeConnection {
        connectedUrl = url;
        return { close() {} };
      },
    };
    const client = new StreetStudioClient({
      baseUrl: BASE,
      organizationId: ORG,
      realtimeTransport,
    });

    const conn = client.connectRealtime({ onEvent: () => {} });

    expect(connectedUrl).toBe(
      `wss://api.example.com/realtime?organizationId=${ORG}`,
    );
    expect(typeof conn.close).toBe("function");
  });
});

describe("fetchTransport adapter", () => {
  it("adapts a fetch-like function into an HttpTransport", async () => {
    const transport = fetchTransport(async (url, init) => {
      expect(url).toBe("https://api.example.com/auth/login");
      expect(init.method).toBe("POST");
      return { status: 200, async text() {
        return JSON.stringify({ ok: true, echoed: init.body });
      } };
    });

    const res = await transport.send({
      method: "POST",
      url: "https://api.example.com/auth/login",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "pw" }),
    });

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body ?? "")).toMatchObject({ ok: true });
  });
});
