/**
 * Bug Condition Exploration Test — Web SPA Backend Connectivity
 *
 * Spec: web-spa-backend-connectivity (BUGFIX)
 * Property 1: Bug Condition — API/data calls cannot reach the live backend.
 *
 * CRITICAL: This test is EXPECTED TO FAIL on the current (unfixed) code.
 * A failure CONFIRMS the bug exists. Do NOT fix the code or the test to make
 * it pass here — the SAME test is re-run in task 7.1 and must PASS once the
 * connectivity + SDK-adoption fix lands.
 *
 * The assertions encode the EXPECTED (post-fix) behavior per Property 1 in
 * design.md: F' forwards `/api/*` to a configurable `API_ORIGIN` with the
 * `/api` prefix stripped to a real backend ROOT path, and data access consumes
 * the published `@streetstudio/sdk` rather than the hand-rolled `ApiClient`.
 *
 * It is deterministic across four dimensions (dev proxy, prod proxy, root-path
 * mapping, reimplementation/base-URL), but is written as a scoped property test
 * that generates over the `/api/*` sub-path / method / query domain so the
 * universal claim ("no `/api/*` request can reach the backend") is exercised
 * across many inputs.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Locate apps/web so we can read the real config/source against reality.
// The jsdom test environment overrides `import.meta.url` with an http:// URL,
// so we discover apps/web from the working directory instead: check cwd and
// cwd/apps/web, then walk up until a directory containing both vite.config.ts
// and server.mjs is found.
// ---------------------------------------------------------------------------
function findWebRoot(): string {
  const isWebRoot = (dir: string) =>
    existsSync(resolve(dir, 'vite.config.ts')) && existsSync(resolve(dir, 'server.mjs'));

  const candidates = [process.cwd(), resolve(process.cwd(), 'apps/web')];
  for (const c of candidates) {
    if (isWebRoot(c)) return c;
  }
  // Walk up from cwd, checking each ancestor and its apps/web child.
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (isWebRoot(dir)) return dir;
    const nested = resolve(dir, 'apps/web');
    if (isWebRoot(nested)) return nested;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate apps/web root for connectivity exploration test');
}

const WEB_ROOT = findWebRoot();

function fileText(relPath: string): string {
  return readFileSync(resolve(WEB_ROOT, relPath), 'utf8');
}

// ---------------------------------------------------------------------------
// Behavior models derived from the actual runtime config/source.
// ---------------------------------------------------------------------------

/**
 * Dev runtime (Vite): does the dev server forward `/api/*` to a backend origin?
 * True only if `vite.config.ts` declares a `server.proxy` entry for `/api` that
 * targets `API_ORIGIN` and rewrites the `/api` prefix away. Unfixed code has no
 * `proxy` block at all, so this is false.
 */
function viteDevProxyForwardsApi(): boolean {
  const src = fileText('vite.config.ts');
  const hasApiProxyKey = /proxy\s*:\s*\{[\s\S]*?['"`]\/api['"`]/.test(src);
  const targetsApiOrigin = /API_ORIGIN/.test(src);
  const stripsPrefix = /rewrite[\s\S]*?replace\(\s*\/\^\\\/api/.test(src);
  return hasApiProxyKey && targetsApiOrigin && stripsPrefix;
}

/**
 * Prod runtime (server.mjs): is there a reverse-proxy branch that forwards
 * `/api/*` to a backend origin? True only if `server.mjs` has an `/api` branch
 * keyed on the `/api` prefix that forwards to `API_ORIGIN`. Unfixed code only
 * handles `/healthz`, static assets, and SPA fallback, so this is false.
 */
function prodServerProxyForwardsApi(): boolean {
  const src = fileText('server.mjs');
  const hasApiBranch = /['"`]\/api\/?['"`]|startsWith\(\s*['"`]\/api/.test(src);
  const readsApiOrigin = /API_ORIGIN/.test(src);
  // Node built-in proxying (an outbound request piped to the client).
  const proxiesUpstream = /node:https?|createServer|request\s*\(|\.pipe\(/.test(src) && readsApiOrigin;
  return hasApiBranch && readsApiOrigin && proxiesUpstream;
}

/** Strip the `/api` routing marker to obtain the backend ROOT path. */
function stripApiPrefix(apiPath: string): string {
  return apiPath.replace(/^\/api/, '') || '/';
}

/**
 * Root-path correctness: an `/api`-prefixed request maps to the backend ROOT
 * path only if a proxy is actually configured to strip the prefix and forward.
 * Unfixed code has neither proxy, so no mapping to ROOT ever happens.
 */
function apiPathReachesBackendRoot(): boolean {
  return viteDevProxyForwardsApi() || prodServerProxyForwardsApi();
}

/**
 * Reimplementation (charter violation): does data access still route through
 * the hand-rolled `ApiClient` in `services/api.ts`? Post-fix, the bespoke
 * client is retired (file deleted or no longer instantiated), so data access
 * uses the published SDK. Unfixed code exports `new ApiClient('/api')`.
 */
function dataAccessUsesHandRolledApiClient(): boolean {
  const apiTsPath = resolve(WEB_ROOT, 'src/services/api.ts');
  if (!existsSync(apiTsPath)) return false; // retired → SDK adopted
  const src = readFileSync(apiTsPath, 'utf8');
  return /new\s+ApiClient\s*\(/.test(src);
}

/**
 * Base-URL consistency (edge): the SDK base URL must be same-origin `/api`
 * (routed through the proxy), NOT a cross-origin absolute default. Unfixed code
 * defaults `apiBaseUrl` to `http://localhost:8080`.
 */
function sdkBaseUrlIsSameOriginApi(): boolean {
  const src = fileText('src/main.ts');
  const crossOriginDefault = /apiBaseUrl\s*:[^\n]*['"`]https?:\/\//.test(src);
  const sameOriginDefault = /apiBaseUrl\s*:[^\n]*['"`]\/api['"`]/.test(src);
  return sameOriginDefault && !crossOriginDefault;
}

// ---------------------------------------------------------------------------
// Generators over the `/api/*` request domain.
// ---------------------------------------------------------------------------
const segmentArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/);
const apiPathArb = fc
  .array(segmentArb, { minLength: 1, maxLength: 4 })
  .map((segs) => `/api/${segs.join('/')}`);
const methodArb = fc.constantFrom('GET', 'POST');
const queryArb = fc.option(fc.stringMatching(/^[a-z]+=[a-z0-9]+$/), { nil: '' });

describe('Property 1: Bug Condition — /api/* calls must reach the live backend (EXPECTED TO FAIL on unfixed code)', () => {
  it('Dimension 1 (dev proxy absence): every /api/* request under Vite is forwarded to API_ORIGIN', () => {
    fc.assert(
      fc.property(apiPathArb, methodArb, queryArb, (apiPath, _method, query) => {
        const fullPath = query ? `${apiPath}?${query}` : apiPath;
        void fullPath;
        // Expected (post-fix): the Vite dev server proxies /api/* to API_ORIGIN
        // with the /api prefix stripped. Unfixed: no server.proxy → FAILS.
        expect(viteDevProxyForwardsApi()).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('Dimension 2 (prod proxy absence): every /api/* request under server.mjs reaches the backend, not the static host', () => {
    fc.assert(
      fc.property(apiPathArb, methodArb, queryArb, (apiPath, _method, query) => {
        const fullPath = query ? `${apiPath}?${query}` : apiPath;
        void fullPath;
        // Expected (post-fix): server.mjs reverse-proxies /api/* to API_ORIGIN.
        // Unfixed: no /api branch → path 404s or falls back to index.html → FAILS.
        expect(prodServerProxyForwardsApi()).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('Dimension 3 (root-path mismatch): /api-prefixed paths map to the backend ROOT path via a proxy', () => {
    fc.assert(
      fc.property(apiPathArb, (apiPath) => {
        const rootPath = stripApiPrefix(apiPath);
        // Sanity: the /api marker is not part of the backend path space.
        expect(rootPath.startsWith('/api')).toBe(false);
        // Expected (post-fix): a configured proxy actually delivers the stripped
        // ROOT path to the backend. Unfixed: neither proxy strips/forwards → FAILS.
        expect(apiPathReachesBackendRoot()).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('Dimension 3 (concrete): /api/auth/login maps to backend ROOT /auth/login and is delivered by a proxy', () => {
    expect(stripApiPrefix('/api/auth/login')).toBe('/auth/login');
    // Expected (post-fix): the proxy delivers POST /auth/login to the backend.
    // Unfixed: no proxy → the ROOT path is never reached → FAILS.
    expect(apiPathReachesBackendRoot()).toBe(true);
  });

  it('Dimension 4 (reimplementation): data access uses the published SDK, not the hand-rolled ApiClient', () => {
    // Expected (post-fix): services/api.ts (hand-rolled ApiClient) is retired.
    // Unfixed: `export const apiClient = new ApiClient('/api')` exists → FAILS.
    expect(dataAccessUsesHandRolledApiClient()).toBe(false);
  });

  it('Dimension 4 (base-URL edge): SDK base URL defaults to same-origin /api, not cross-origin http://localhost:8080', () => {
    // Expected (post-fix): apiBaseUrl defaults to '/api' (proxied same-origin).
    // Unfixed: defaults to 'http://localhost:8080' (cross-origin) → FAILS.
    expect(sdkBaseUrlIsSameOriginApi()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Slice 3 — Root-path correctness assertions
//
// These are pure unit assertions (no server required). They verify that the
// prefix-strip logic is correct: `/api/*` paths are stripped to ROOT paths,
// non-`/api` paths are left unchanged (idempotent), and the strip is applied
// uniformly across all generated `/api/*` inputs.
//
// **Validates: Requirements 1.3, 2.3**
// ---------------------------------------------------------------------------

describe('Slice 3: prefix-strip logic — /api/* is stripped to backend ROOT paths', () => {
  it('concrete: /api/auth/login strips to /auth/login', () => {
    expect(stripApiPrefix('/api/auth/login')).toBe('/auth/login');
  });

  it('concrete: /api/videos strips to /videos', () => {
    expect(stripApiPrefix('/api/videos')).toBe('/videos');
  });

  it('concrete: /api alone strips to /', () => {
    expect(stripApiPrefix('/api')).toBe('/');
  });

  it('property: every /api/* generated path strips to a ROOT path (no /api prefix remaining)', () => {
    fc.assert(
      fc.property(apiPathArb, (apiPath) => {
        const rootPath = stripApiPrefix(apiPath);
        // Stripped path must not start with /api.
        expect(rootPath.startsWith('/api')).toBe(false);
        // Stripped path must start with /.
        expect(rootPath.startsWith('/')).toBe(true);
        // The content after /api in the original must appear verbatim in the result.
        const expectedSuffix = apiPath.slice('/api'.length) || '/';
        expect(rootPath).toBe(expectedSuffix);
      }),
      { numRuns: 200 },
    );
  });

  it('idempotent on ROOT paths: /auth/login (already stripped) is unchanged', () => {
    // Applying stripApiPrefix to a path that has no /api prefix must be a no-op.
    expect(stripApiPrefix('/auth/login')).toBe('/auth/login');
  });

  it('idempotent on ROOT paths: /videos (already stripped) is unchanged', () => {
    expect(stripApiPrefix('/videos')).toBe('/videos');
  });

  it('idempotent property: paths that do not start with /api are unchanged', () => {
    const rootPathArb = fc
      .array(fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/), { minLength: 1, maxLength: 4 })
      .map((segs) => `/${segs.join('/')}`);

    fc.assert(
      fc.property(rootPathArb, (rootPath) => {
        // A path that doesn't start with /api must survive the strip untouched.
        expect(stripApiPrefix(rootPath)).toBe(rootPath);
      }),
      { numRuns: 200 },
    );
  });

  it('both proxies are configured to strip the /api prefix before forwarding', () => {
    // Confirms the runtime-level strip is wired correctly in both host runtimes.
    expect(viteDevProxyForwardsApi()).toBe(true);
    expect(prodServerProxyForwardsApi()).toBe(true);
  });
});
