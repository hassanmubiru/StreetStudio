// @vitest-environment node
//
// Preservation property tests for the production static host (server.mjs).
//
// Property 2 (Preservation): non-`/api` behavior is unchanged — F(X) == F'(X)
// for every request that does NOT carry the `/api` prefix.
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
//
// Methodology: observation-first. These tests baseline the ACTUAL behavior of
// the UNFIXED server.mjs by starting it against the real built `dist` fixture
// and issuing real HTTP requests over an ephemeral port. They MUST PASS on the
// unfixed code — they encode the F baseline that task 7.2 re-runs against the
// fixed code (F') to guarantee no regression.
//
// The generated property domain covers only NON-`/api` requests:
//   3.1 static assets (hashed assets + index.html) — content-type + cache-control
//   3.2 SPA history fallback — route-looking paths serve index.html
//   3.3 health — /healthz and /health return { "status": "ok" }
//   3.4 missing-asset 404 — absent asset-looking paths 404 (not index.html)
//   (method guard) non-GET/HEAD on non-`/api` paths return 405

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SERVER_PATH = fileURLToPath(new URL('./server.mjs', import.meta.url));
const DIST = fileURLToPath(new URL('./dist', import.meta.url));
const ASSETS_DIR = fileURLToPath(new URL('./dist/assets', import.meta.url));
const INDEX_HTML = readFileSync(fileURLToPath(new URL('./dist/index.html', import.meta.url)), 'utf8');

// Real hashed asset filenames emitted by Vite under dist/assets/. Reading them
// at runtime keeps the test robust against rebuilds (hashes change per build).
const HASHED_ASSETS = readdirSync(ASSETS_DIR);

// Content-type table mirrored from server.mjs so we assert the OBSERVED values.
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

interface Response {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

let child: ChildProcessWithoutNullStreams;
let PORT: number;

/** Grab a free ephemeral port from the OS, then release it for the child. */
function getFreePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const p = addr.port;
        srv.close(() => res(p));
      } else {
        srv.close(() => rej(new Error('could not determine free port')));
      }
    });
  });
}

/** Issue a single HTTP request against the running static host. */
function makeRequest(path: string, method = 'GET'): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port: PORT, path, method },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  PORT = await getFreePort();
  child = spawn(process.execPath, [SERVER_PATH], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('server.mjs did not become ready in time')),
      15000,
    );
    child.stdout.on('data', (buf: Buffer) => {
      if (buf.toString().includes('serving')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', (buf: Buffer) => {
      // Surface a boot failure (e.g. missing dist) instead of hanging.
      const msg = buf.toString();
      if (msg.includes('no built SPA found')) {
        clearTimeout(timer);
        reject(new Error(`server.mjs failed to boot: ${msg}`));
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server.mjs exited early with code ${code}`));
    });
  });
}, 20000);

afterAll(() => {
  child?.kill('SIGKILL');
});

describe('server.mjs preservation baseline (UNFIXED code)', () => {
  it('has a real built dist fixture with hashed assets to baseline against', () => {
    expect(HASHED_ASSETS.length).toBeGreaterThan(0);
    expect(INDEX_HTML.length).toBeGreaterThan(0);
  });

  // 3.1 — Static asset preservation: hashed assets under dist/assets/ are
  // served 200 with their content-type and immutable cache-control.
  it('3.1 serves hashed assets with correct content-type and immutable cache-control', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...HASHED_ASSETS), async (asset) => {
        const res = await makeRequest(`/assets/${asset}`);
        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
        const expectedType = CONTENT_TYPES[extOf(asset)] ?? 'application/octet-stream';
        expect(res.headers['content-type']).toBe(expectedType);
      }),
      { numRuns: 10 },
    );
  }, 30000);

  // 3.1 — index.html served with text/html and no-cache at both `/` and
  // `/index.html`.
  it('3.1 serves index.html with text/html and no-cache', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom('/', '/index.html'), async (path) => {
        const res = await makeRequest(path);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
        expect(res.headers['cache-control']).toBe('no-cache');
        expect(res.body).toBe(INDEX_HTML);
      }),
      { numRuns: 10 },
    );
  }, 30000);

  // 3.2 — SPA history fallback: route-looking paths (no file extension on the
  // last segment, possibly nested, with optional query/hash) serve index.html.
  it('3.2 serves index.html for client-side route paths (SPA fallback)', async () => {
    // A path segment with no dot → not asset-looking → SPA fallback.
    const segment = fc
      .string({ minLength: 1, maxLength: 12 })
      .map((s) => s.replace(/[^a-zA-Z0-9-]/g, '') || 'route')
      .filter((s) => !s.includes('.'));
    const routePath = fc
      .array(segment, { minLength: 1, maxLength: 4 })
      .map((segs) => '/' + segs.join('/'))
      // Exclude the non-`/api` special-cased paths and anything api-prefixed.
      .filter((p) => p !== '/healthz' && p !== '/health' && !p.startsWith('/api'));
    const suffix = fc.constantFrom('', '?q=1', '?a=1&b=2', '#frag', '?x=1#y');

    await fc.assert(
      fc.asyncProperty(routePath, suffix, async (path, sfx) => {
        const res = await makeRequest(path + sfx);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
        expect(res.headers['cache-control']).toBe('no-cache');
        expect(res.body).toBe(INDEX_HTML);
      }),
      { numRuns: 20 },
    );
  }, 30000);

  // 3.3 — Health endpoints return { "status": "ok" } as JSON.
  it('3.3 returns { status: "ok" } for /healthz and /health', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom('/healthz', '/health'), async (path) => {
        const res = await makeRequest(path);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
        expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
      }),
      { numRuns: 20 },
    );
  }, 60000);

  // 3.4 — Missing-asset 404: absent asset-looking paths (has an extension on
  // the last segment, does not resolve to a real file) return 404 with a plain
  // "Not Found" body — NOT index.html.
  it('3.4 returns 404 (not index.html) for absent asset-looking paths', async () => {
    const ext = fc.constantFrom(
      '.json', '.png', '.js', '.css', '.svg', '.ico', '.woff2', '.map', '.xyz', '.foo123',
    );
    // Random base name prefixed to make a real-file collision effectively impossible.
    const base = fc
      .hexaString({ minLength: 6, maxLength: 16 })
      .map((h) => `absent-${h}`);
    const missingAssetPath = fc
      .tuple(base, ext)
      .map(([b, e]) => `/${b}${e}`);

    await fc.assert(
      fc.asyncProperty(missingAssetPath, async (path) => {
        const res = await makeRequest(path);
        expect(res.status).toBe(404);
        expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
        expect(res.body).toBe('Not Found');
        expect(res.body).not.toContain('<!doctype html');
        expect(res.body).not.toBe(INDEX_HTML);
      }),
      { numRuns: 100 },
    );
  }, 60000);

  // Method guard: non-GET/HEAD methods on non-`/api` paths return 405 with an
  // `allow: GET, HEAD` header.
  it('returns 405 for non-GET/HEAD methods on non-`/api` paths', async () => {
    const method = fc.constantFrom('POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS');
    const path = fc.constantFrom('/', '/index.html', '/healthz', '/some/route', '/absent.json');

    await fc.assert(
      fc.asyncProperty(method, path, async (m, p) => {
        const res = await makeRequest(p, m);
        expect(res.status).toBe(405);
        expect(res.headers['allow']).toBe('GET, HEAD');
      }),
      { numRuns: 100 },
    );
  }, 60000);
});
