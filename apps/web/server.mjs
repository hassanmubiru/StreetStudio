// StreetStudio Web_Client static host.
//
// Serves the Vite production bundle (apps/web/dist) over HTTP with SPA history
// fallback. Uses only Node built-ins so it survives `npm prune --omit=dev`
// (Vite is a dev dependency and is not present in the runtime image).
//
// This replaces the previous, incorrect Docker `web` CMD
// (`node apps/web/dist/index.js` — a file the Vite build never produces).
//
// Config (env):
//   PORT   — listen port (default 3000)
//   HOST   — bind address (default 0.0.0.0)
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = resolve(__dirname, "dist");
const INDEX = join(DIST, "index.html");
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

// API_ORIGIN — the backend origin to reverse-proxy /api/* to.
// Parsed once at startup into { protocol, hostname, port } for reuse.
let apiOrigin = null;
if (process.env.API_ORIGIN) {
  try {
    const parsed = new URL(process.env.API_ORIGIN);
    apiOrigin = {
      protocol: parsed.protocol, // "http:" or "https:"
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? "443" : "80"),
    };
  } catch {
    console.error(`[web] API_ORIGIN is set but could not be parsed as a URL: ${process.env.API_ORIGIN}`);
  }
} else {
  console.error("[web] API_ORIGIN not set — /api/* requests will not be proxied");
}

if (!existsSync(INDEX)) {
  // Fail fast with a clear message rather than serving an empty site.
  console.error(
    `[web] no built SPA found at ${INDEX}. Run \`npm run build -w @streetstudio/web\` first.`,
  );
  process.exit(1);
}

/** Minimal, explicit content-type table for the assets Vite emits. */
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function contentType(path) {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Resolve a request path to a real file inside DIST, guarding against path
 * traversal. Returns an absolute path to an existing file, or null.
 */
function resolveFile(urlPath) {
  // Strip query/hash and decode; reject anything that escapes DIST.
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  const candidate = normalize(join(DIST, decoded));
  if (candidate !== DIST && !candidate.startsWith(DIST + "/")) {
    return null; // traversal attempt
  }
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  return null;
}

/** Hop-by-hop headers that must not be forwarded to/from the backend. */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
]);

const server = createServer((req, res) => {
  const urlPath = req.url ?? "/";
  const pathname = urlPath.split("?")[0].split("#")[0];
  const isApiPath = pathname === "/api" || pathname.startsWith("/api/");

  // Method guard: only GET/HEAD are allowed for static/SPA paths.
  // The /api branch passes any method through to the backend.
  if (!isApiPath && req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" });
    res.end("Method Not Allowed");
    return;
  }

  // Health endpoint for orchestrators/load balancers.
  if (urlPath === "/healthz" || urlPath === "/health") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // /api reverse proxy branch.
  if (isApiPath) {
    if (!apiOrigin) {
      res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
      res.end("Service Unavailable: API_ORIGIN is not configured");
      return;
    }

    // Strip /api prefix; preserve the rest of the path and the query string.
    const rawQuery = urlPath.includes("?") ? urlPath.slice(urlPath.indexOf("?")) : "";
    const strippedPath = pathname.slice("/api".length) || "/";
    const outboundPath = strippedPath + rawQuery;

    // Forward headers; rewrite host; drop hop-by-hop.
    const outboundHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(key.toLowerCase())) {
        outboundHeaders[key] = value;
      }
    }
    outboundHeaders["host"] = apiOrigin.port &&
      ((apiOrigin.protocol === "https:" && apiOrigin.port !== "443") ||
       (apiOrigin.protocol === "http:"  && apiOrigin.port !== "80"))
      ? `${apiOrigin.hostname}:${apiOrigin.port}`
      : apiOrigin.hostname;

    const options = {
      hostname: apiOrigin.hostname,
      port: apiOrigin.port,
      path: outboundPath,
      method: req.method,
      headers: outboundHeaders,
    };

    const requestFn = apiOrigin.protocol === "https:" ? httpsRequest : httpRequest;
    const proxyReq = requestFn(options, (proxyRes) => {
      // Forward response status and headers (drop hop-by-hop).
      const responseHeaders = {};
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (!HOP_BY_HOP.has(key.toLowerCase())) {
          responseHeaders[key] = value;
        }
      }
      res.writeHead(proxyRes.statusCode, responseHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        res.end("Bad Gateway");
      } else {
        res.end();
      }
    });

    req.pipe(proxyReq);
    return;
  }

  const file = resolveFile(urlPath);
  // SPA history fallback applies to NAVIGATION requests (client-side routes),
  // not to missing asset files. A request for a path that looks like a file
  // (has an extension, e.g. /manifest.json, /favicon.png) that doesn't exist
  // must 404 — serving index.html for it makes the browser parse HTML as that
  // asset (e.g. "Manifest: Syntax error").
  const pathname = urlPath.split("?")[0].split("#")[0];
  const looksLikeAsset = /\.[a-z0-9]+$/i.test(pathname.slice(pathname.lastIndexOf("/") + 1));
  if (!file && looksLikeAsset) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }
  // A real asset request: serve the file. Anything else (client-side route)
  // falls back to index.html so the SPA router can handle it.
  const target = file ?? INDEX;
  const isHashedAsset = file !== null && target.includes(`${DIST}/assets/`);

  const headers = { "content-type": contentType(target) };
  // Vite emits content-hashed asset filenames → safe to cache immutably.
  // index.html and the fallback must never be cached.
  headers["cache-control"] = isHashedAsset
    ? "public, max-age=31536000, immutable"
    : "no-cache";

  res.writeHead(200, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = createReadStream(target);
  stream.on("error", () => {
    res.writeHead(500);
    res.end("Internal Server Error");
  });
  stream.pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`[web] StreetStudio web client serving ${DIST} on http://${HOST}:${PORT}`);
});
