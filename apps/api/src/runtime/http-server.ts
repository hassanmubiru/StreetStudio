/**
 * Node `http` transport for the slice API service.
 *
 * This is the only place that speaks raw HTTP. It parses the method, URL, JSON
 * body, and bearer credential, matches the request URL to a slice REST
 * operation TEMPLATE (the {@link RestRouter} keys routes by template via
 * `restKey(method, path)`, so the raw URL is resolved to its template and any
 * `:param` segments are extracted into {@link ApiRequest.params}), then hands a
 * transport-independent {@link ApiRequest} to {@link RestRouter.dispatch}. The
 * router runs the full request lifecycle; this layer only serializes the result
 * or maps a thrown {@link AppError} to its HTTP status via the shared taxonomy.
 *
 * A `GET /health` endpoint short-circuits routing and reports dependency
 * reachability (a real `SELECT 1` against PostgreSQL).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import { restOperations, type PublicOperation } from "../http/operations.js";
import type { ApiRequest } from "../http/lifecycle.js";
import type { RestRouter } from "../http/controllers.js";
import type { PgClient } from "./pg-client.js";

/** A compiled route: its operation plus the template split into segments. */
interface CompiledRoute {
  readonly operation: PublicOperation;
  readonly method: string;
  readonly segments: readonly string[];
}

/** Split a path template/URL path into non-empty segments. */
function segmentsOf(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

/** Compile the REST operations of the slice into a matchable route table. */
function compileRoutes(operations: readonly PublicOperation[]): CompiledRoute[] {
  return restOperations(operations).map((operation) => ({
    operation,
    method: (operation.method ?? "GET").toUpperCase(),
    segments: segmentsOf(operation.path),
  }));
}

/** Result of matching a request path against a compiled route. */
interface RouteMatch {
  readonly operation: PublicOperation;
  readonly params: Record<string, string>;
}

/** Match `method`/`pathname` against the compiled routes, extracting params. */
function matchRoute(
  routes: readonly CompiledRoute[],
  method: string,
  pathname: string,
): RouteMatch | undefined {
  const requestSegments = segmentsOf(pathname);
  for (const route of routes) {
    if (route.method !== method.toUpperCase()) {
      continue;
    }
    if (route.segments.length !== requestSegments.length) {
      continue;
    }
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < route.segments.length; i++) {
      const template = route.segments[i] as string;
      const actual = requestSegments[i] as string;
      if (template.startsWith(":")) {
        params[template.slice(1)] = decodeURIComponent(actual);
      } else if (template !== actual) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return { operation: route.operation, params };
    }
  }
  return undefined;
}

/** Read the entire request body and parse it as JSON (empty body → undefined). */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) {
    return undefined;
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("VALIDATION_FAILED", {
      details: { reason: "request body is not valid JSON" },
    });
  }
}

/** Extract a bearer token from the Authorization header, if present. */
function bearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers["authorization"];
  if (typeof header !== "string") {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? (match[1] as string) : undefined;
}

/** First header value as a string, or undefined. */
function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return typeof value === "string" ? value : undefined;
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** Options for {@link createHttpServer}. */
export interface HttpServerDeps {
  readonly router: RestRouter;
  readonly operations: readonly PublicOperation[];
  readonly pg: PgClient;
}

/**
 * Create the Node HTTP server. The server matches requests to slice operation
 * templates, builds an {@link ApiRequest}, and dispatches through the router's
 * lifecycle. Errors are mapped to HTTP status via the shared error taxonomy.
 */
export function createHttpServer(deps: HttpServerDeps): Server {
  const routes = compileRoutes(deps.operations);

  return createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      // Last-resort guard: never leave a socket hanging.
      if (!res.headersSent) {
        respondWithError(res, error);
      }
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = (req.method ?? "GET").toUpperCase();
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    // Health check: report dependency reachability (R30.2/R30.4).
    if (method === "GET" && pathname === "/health") {
      await respondHealth(res);
      return;
    }

    const match = matchRoute(routes, method, pathname);
    if (!match) {
      respondWithError(res, new AppError("NOT_FOUND"));
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      respondWithError(res, error);
      return;
    }

    const credential = bearerToken(req);
    const remoteAddress = req.socket.remoteAddress ?? "unknown";
    const query = Object.fromEntries(url.searchParams.entries());

    const organizationId =
      headerValue(req, "x-organization-id") ??
      match.params["id"] ??
      (typeof body === "object" && body !== null
        ? (body as Record<string, unknown>)["organizationId"]
        : undefined);

    const request: ApiRequest = {
      method,
      path: match.operation.path, // the TEMPLATE the router keys on
      clientKey: credential ?? remoteAddress,
      ...(credential !== undefined ? { credential } : {}),
      ...(typeof organizationId === "string"
        ? { organizationId: organizationId as Uuid }
        : {}),
      params: match.params,
      query,
      ...(body !== undefined ? { body } : {}),
    };

    try {
      const result = await deps.router.dispatch(request);
      const status = method === "POST" ? 201 : 200;
      writeJson(res, status, result ?? null);
    } catch (error) {
      respondWithError(res, error);
    }
  }

  async function respondHealth(res: ServerResponse): Promise<void> {
    let postgres = false;
    try {
      postgres = await deps.pg.ping();
    } catch {
      postgres = false;
    }
    const ok = postgres;
    writeJson(res, ok ? 200 : 503, {
      status: ok ? "ok" : "degraded",
      checks: { postgres },
    });
  }

  function respondWithError(res: ServerResponse, error: unknown): void {
    if (error instanceof AppError) {
      writeJson(res, error.status, { error: error.toDto() });
      return;
    }
    // Unexpected failure — do not leak internals to the client, but log the
    // real cause server-side so operators can diagnose it.
    // eslint-disable-next-line no-console
    console.error("[api] unhandled request error:", error);
    const dto = new AppError("CAPABILITY_UNAVAILABLE").toDto();
    writeJson(res, 500, { error: { ...dto, status: 500 } });
  }
}
