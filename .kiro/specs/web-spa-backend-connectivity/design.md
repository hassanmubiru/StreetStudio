# Web SPA Backend Connectivity Bugfix Design

## Overview

The `apps/web` SPA is marked "complete" but cannot reach the live StreetStudio backend in either the dev or production runtime, and it hand-rolls API infrastructure the Production Charter requires it to consume from `@streetstudio/sdk`.

Two independently-verifiable defect classes are addressed:

1. **Connectivity.** The SPA issues API calls against a same-origin `/api` prefix, but nothing bridges that prefix to the real backend. The Vite dev server (`apps/web/vite.config.ts`, port 3000) has no `server.proxy` for `/api`; the production static host (`apps/web/server.mjs`) serves static assets, SPA history fallback, and `/healthz` only, with no `/api` reverse proxy. Additionally the real API serves at ROOT (`POST /auth/login`), not under `/api`, so even a request that reached the backend host would hit a nonexistent path.

2. **Reimplementation (charter violation).** `apps/web/src/services/api.ts` hand-rolls a full `ApiClient` (fetch wrapper with retry, exponential backoff, timeout, error categorization, and a `NetworkMonitor`), duplicating `@streetstudio/sdk` — already a declared dependency in `apps/web/package.json` and already the client the sibling `@streetstudio/dashboard` consumes through `DashboardSession`.

The fix strategy is strangler-fig: deliver connectivity wiring first (one verifiable slice for dev, one for prod, both routing a same-origin `/api/*` prefix to a configurable backend origin and stripping the prefix so the backend receives ROOT paths), verifiable via curl-through-proxy; then adopt the published SDK vertical-by-vertical starting with login, retiring the hand-rolled `ApiClient` as each vertical moves over. The full test suite (5308 passed / 0 failed) must stay green, and `server.mjs` must stay dependency-light (Node built-ins only) so it keeps surviving `npm prune --omit=dev`.

A grounding investigation of the SDK and the web auth stack (documented in the Hypothesized Root Cause and Fix Implementation sections) surfaced a genuine framework gap in the login vertical that this design reports rather than force-fits.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — an API/data call that cannot reach the live backend, OR a data-access path routed through the bespoke `ApiClient` instead of the published SDK.
- **Property (P)**: The desired behavior — API calls reach the live backend at the path it actually serves and return a real response, and data access consumes `@streetstudio/sdk`.
- **Preservation**: Existing static-asset serving, SPA history fallback, `/healthz`, missing-asset 404s, and the passing test suite that must remain unchanged by the fix.
- **`/api` prefix**: A same-origin routing marker used by the browser bundle. It is not part of the backend's real path space; both proxies strip it so the backend receives ROOT paths.
- **`API_ORIGIN`**: The single configurable backend-origin env var read by both runtimes (Vite dev proxy and `server.mjs` prod reverse proxy) to determine where `/api/*` is forwarded.
- **`StreetStudioClient` / `SdkClientOptions`**: The published SDK client (`packages/sdk/src/client.ts`) and its construction options (`baseUrl`, `organizationId`, `auth`, injectable `transport`/`realtimeTransport`). Verified surface — see Root Cause.
- **`DashboardSession`**: The framework's stateful wrapper over `StreetStudioClient` (`apps/dashboard/src/session.ts`) that the web `AuthController`/`AuthStore` already receive. Rebuilds the underlying client on credential/scope change (`useBearerToken`, `useApiKey`, `selectOrganization`).
- **`ApiClient`**: The hand-rolled client in `apps/web/src/services/api.ts` (`apiClient = new ApiClient('/api')`) that this fix retires.
- **F / F'**: The SPA + dev/prod hosting before the fix (F) and after wiring connectivity and adopting the SDK (F').

## Bug Details

### Bug Condition

The bug manifests when the SPA makes an API/data call that cannot reach the live backend — because the dev server has no `/api` proxy, the prod host has no `/api` reverse proxy, or the request path carries the `/api` prefix while the backend serves at ROOT — OR when a data-access path routes through the hand-rolled `ApiClient` instead of the published `@streetstudio/sdk`.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type SpaRequest        // { runtime, target, path, layer }
  OUTPUT: boolean

  RETURN (X.target = API_CALL AND NOT reachesLiveBackend(X))
      OR (X.layer = DATA_ACCESS AND usesHandRolledApiClient(X))
END FUNCTION

FUNCTION reachesLiveBackend(X)
  // False today because:
  //   dev  : no server.proxy for /api in vite.config.ts
  //   prod : no reverse proxy for /api in server.mjs
  //   path : /api-prefixed requests never reach the backend ROOT path
  RETURN devProxyForwards(X) AND prodProxyForwards(X) AND hitsBackendRootPath(X)
END FUNCTION
```

### Examples

- **Dev login** — `POST /api/auth/login` under `vite` (port 3000): the dev server has no `/api` proxy, so the request is not forwarded to the backend. Expected: forwarded to `API_ORIGIN` as `POST /auth/login`, returning a real 200/401.
- **Prod data call** — `GET /api/videos` under `server.mjs`: no reverse proxy; the path either 404s or (for a route-looking path) falls back to `index.html`. Expected: forwarded to `API_ORIGIN` as `GET /videos`.
- **Root-path mismatch** — a request that somehow reached the backend host as `/api/auth/login` would hit a nonexistent path; the backend serves `POST /auth/login` at ROOT. Expected: the `/api` prefix is stripped before forwarding.
- **Reimplementation** — a video/comment/upload data call routed through `apiClient` in `apps/web/src/services/api.ts` duplicates SDK behavior. Expected: consume `StreetStudioClient` (via `DashboardSession`).
- **Base-URL inconsistency (edge)** — `app.ts` points `DashboardSession` at `VITE_API_BASE_URL || 'http://localhost:8080'` (absolute, cross-origin) while `auth-controller.ts` uses same-origin `/api/*`; the two disagree on where the backend is. Expected: a single same-origin `/api` base routed through the proxy.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Existing static-asset requests (hashed assets under `dist/assets/`, `index.html`) continue to be served with the same content-type and cache-control (`immutable` for hashed assets, `no-cache` for `index.html`).
- Navigation requests for client-side routes continue to fall back to `index.html` (SPA history fallback).
- `/healthz` and `/health` continue to return `{ "status": "ok" }`.
- Requests for missing asset-looking paths (e.g. `/manifest.json`, `/favicon.png`) continue to return 404 rather than `index.html`.
- The full test suite continues to pass at 5308 passed / 0 failed.

**Scope:**
All requests that do NOT carry the `/api` prefix must be completely unaffected by this fix. This includes:
- Static asset requests (hashed assets, `index.html`).
- Client-side navigation routes handled by SPA history fallback.
- Health checks (`/healthz`, `/health`).
- Missing-asset paths that must 404.

Only requests matching the `/api` prefix are newly intercepted and forwarded; every other code path in `server.mjs` and Vite remains byte-for-byte the same.

**Note:** The expected correct behavior for buggy inputs is defined in Correctness Properties (Property 1). This section defines only what must NOT change.

## Hypothesized Root Cause

Grounded in reading `packages/sdk/src/client.ts`, `packages/sdk/src/index.ts`, `apps/dashboard/src/session.ts`, `packages/shared/src/dto.ts`, and the web auth stack (`app.ts`, `main.ts`, `auth-controller.ts`, `auth-store.ts`, `services/api.ts`):

1. **Missing dev proxy.** `apps/web/vite.config.ts` `server` block (port 3000) declares `port`/`host` only — no `proxy`. `/api/*` calls in dev are never forwarded to the backend.

2. **Missing prod reverse proxy.** `apps/web/server.mjs` handles `/healthz`, static assets, and SPA fallback only. There is no branch that forwards `/api/*` to a backend origin.

3. **Path-prefix mismatch.** The browser bundle calls `/api/...`, but the backend serves at ROOT (`POST /auth/login`, `/videos`, …). The `/api` prefix must be treated as a routing marker and stripped before forwarding.

4. **Inconsistent, cross-origin SDK base URL.** `main.ts` sets `apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'`, and `app.ts` builds `new DashboardSession({ baseUrl: this.config.apiBaseUrl })`. So the SDK path points cross-origin (CORS-exposed, baked into the browser bundle) while `auth-controller.ts` uses same-origin `/api/*`. The two disagree on the backend location.

5. **Reimplementation instead of SDK.** `apps/web/src/services/api.ts` hand-rolls `ApiClient` (retry, backoff, timeout, error categorization, `NetworkMonitor`), and `auth-controller.ts` issues raw `fetch('/api/auth/login')` directly, duplicating `StreetStudioClient` — which the SPA already receives, unused for these calls, via `DashboardSession`.

6. **Genuine framework gap in the login vertical (reported, not force-fit).** The SDK's `AuthResource.login` returns `SessionDto` = `{ id, memberId, issuedAt, expiresAt, revokedAt? }` (`packages/shared/src/dto.ts`) — it carries **no bearer token, refresh token, `expiresIn`, or user**. The web `AuthController.login` expects `{ token, refreshToken, expiresIn, user }` to attach a bearer token and drive refresh. `apps/dashboard/src/session.ts` documents the same limitation: "the current public surface returns a `SessionDto` … not a bearer token string … Surfacing a login bearer token is a backend/spec concern." Therefore full SDK adoption of the login token exchange is blocked on a framework contract change; this design reports it as a gap rather than deep-importing (forbidden by ADR-0001/0011) or forcing a bespoke workaround.

## Correctness Properties

Property 1: Bug Condition — API calls reach the live backend via the SDK

_For any_ input where the bug condition holds (`isBugCondition` returns true) — an API call that cannot currently reach the backend, or a data-access path on the hand-rolled `ApiClient` — the fixed system (F') SHALL forward the request to the live backend at the path the backend actually serves (the `/api` prefix stripped to ROOT, e.g. `POST /auth/login`) via a configurable `API_ORIGIN`, returning a real backend response; and data-access paths SHALL be served by `@streetstudio/sdk` (`StreetStudioClient` via `DashboardSession`) rather than the hand-rolled `ApiClient`. Where the published SDK contract is genuinely insufficient (login token surfacing), the gap SHALL be reported rather than force-fit or satisfied by a deep import.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation — non-API behavior is unchanged

_For any_ input where the bug condition does NOT hold (`isBugCondition` returns false) — any request that does not carry the `/api` prefix — the fixed system (F') SHALL produce exactly the same result as the original system (F), preserving static-asset serving (content-type and cache-control), SPA history fallback, `/healthz`/`/health` responses, missing-asset 404s, and a green test suite (5308 passed / 0 failed).

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

The fix is sequenced as four independently-verifiable slices. Connectivity (slices 1–3) unblocks the SPA regardless of client library; SDK adoption (slice 4) then satisfies the charter vertical-by-vertical.

### Slice 1 — Dev connectivity (Vite proxy)

**File**: `apps/web/vite.config.ts`

**Changes**:
1. Add a `server.proxy` entry for `/api`:
   - `target`: `process.env.API_ORIGIN` with a sensible dev default (e.g. `http://localhost:8080`).
   - `changeOrigin: true`.
   - `rewrite: (path) => path.replace(/^\/api/, '')` so the backend receives ROOT paths (`/api/auth/login` → `/auth/login`).
   - `ws`: leave `false`/unset for this slice (WebSocket upgrade is scoped out — see Streaming & Upgrade Considerations).
2. Mirror the same `proxy` block under `preview` so `vite preview` behaves like dev.

**Verification**: `curl` through `http://localhost:3000/api/auth/login` (or `/api/healthz`-equivalent backend route) returns a real backend response, not a 404 / `index.html`.

### Slice 2 — Prod connectivity (`server.mjs` reverse proxy)

**File**: `apps/web/server.mjs`

**Changes** (Node built-ins only — `node:http`, `node:https`, `node:url`; no new runtime deps):
1. Read `API_ORIGIN` from env at startup; parse it once into `{ protocol, hostname, port }`. If unset, log a clear warning and continue serving static content (connectivity disabled) so the static host still boots.
2. Insert an `/api` branch in the request handler **after** the `/healthz` check and **before** `resolveFile`, keyed strictly on `pathname === '/api' || pathname.startsWith('/api/')`:
   - Strip the `/api` prefix (`/api/auth/login` → `/auth/login`).
   - Build an outbound request to `API_ORIGIN` with the same method, path+query, and forwarded headers (rewrite `host` to the backend host; drop hop-by-hop headers).
   - Choose `node:http` or `node:https` based on the parsed `API_ORIGIN` protocol.
   - Pipe the inbound request body to the outbound request (`req.pipe(proxyReq)`) and the backend response back to the client (`proxyRes.pipe(res)`), forwarding status and response headers.
   - On upstream/socket error, respond `502 Bad Gateway`.
   - Relax the top-level `GET`/`HEAD`-only method guard for the `/api` branch so POST/PUT/PATCH/DELETE reach the backend (the guard remains unchanged for static/SPA paths).
3. Leave every non-`/api` code path (healthz, `resolveFile`, `looksLikeAsset` 404, SPA fallback, cache-control) untouched.

**Verification**: `curl` through the prod host `/api/...` returns a real backend response; `/healthz`, static assets, and SPA routes behave exactly as before.

### Slice 3 — Root-path correctness

Achieved by the prefix strip in slices 1 and 2, called out as its own verifiable concern.

**Changes**: none beyond slices 1–2; add explicit assertions that a stripped request hits a real backend ROOT path (e.g. login returns 200/401, not 404).

**Verification**: `curl` a known backend ROOT route through each proxy and confirm the backend, not the static host, answers.

### Slice 4 — SDK adoption (login vertical first)

**Files**: `apps/web/src/main.ts`, `apps/web/src/app/app.ts`, `apps/web/src/app/auth/auth-controller.ts`, then `apps/web/src/services/api.ts` consumers.

**Changes**:
1. **Reconcile the base URL to same-origin `/api`.** Default `apiBaseUrl` to `/api` (relative) so `DashboardSession` → `StreetStudioClient` routes through the same proxy as everything else. This removes the cross-origin `http://localhost:8080` default from the browser bundle; the backend origin is configured once at the proxy layer via `API_ORIGIN`. (`StreetStudioClient.buildUrl` concatenates `baseUrl + path`, so `/api` + `/auth/login` → `/api/auth/login`, which the proxy strips to `/auth/login`.)
2. **Route the login vertical through the SDK.** Replace the raw `fetch('/api/auth/login')`, `/api/auth/register`, `/api/auth/logout`, and session-validation calls in `auth-controller.ts` with the `DashboardSession`/`StreetStudioClient` methods the SPA already holds (`register`, `auth.login`, `auth.logout`, `currentMember`, `useBearerToken`).
3. **Report the login token gap.** Because `auth.login` returns `SessionDto` (no token/refreshToken/expiresIn/user), the token-acquisition step cannot be satisfied by the published contract today. File a framework gap requesting the login contract surface a bearer token (and refresh/expiry) — do NOT deep-import or fabricate a bespoke token path. Until resolved, the connectivity slices (1–3) keep login functional over the correctly-proxied endpoint; the SDK adoption for the token exchange lands when the contract is extended. Verticals whose SDK contract is already sufficient (e.g. `videos`, `comments`, `uploads`, `projects`) migrate off `ApiClient` immediately.
4. **Preserve cross-cutting behavior without reimplementing it.** The SDK is deliberately transport-agnostic (`HttpTransport` seam) and surfaces `AppError` from the shared taxonomy; it has no built-in retry/backoff/timeout/`NetworkMonitor`. Preserve the existing degradation behavior by:
   - Implementing a composable `HttpTransport` (timeout + retry/exponential-backoff + offline-awareness) injected via `SdkClientOptions.transport` / `DashboardSessionOptions.transport`.
   - Adapting `AppError` into the existing `handleError` / `getDegradationManager` calls at the call sites, so error reporting and graceful degradation are retained without the bespoke `ApiClient`.
   - Using `DashboardSession.useBearerToken` (which rebuilds the client) for dynamic token injection — the framework's supported pattern — rather than mutating the SDK's construction-time `auth`.
5. **Retire `ApiClient`.** Once each data-access vertical is on the SDK, delete `apps/web/src/services/api.ts` (and its `NetworkMonitor`), leaving the composable transport as the single home for retry/timeout/offline concerns.

### Streaming & Upgrade Considerations (prod proxy)

- **Streaming / large uploads**: request and response bodies are streamed via `pipe`, so chunked uploads and large downloads flow without buffering the whole body in memory. Do not set a fixed `Content-Length`; rely on the piped stream / existing transfer encoding.
- **WebSocket upgrade**: explicitly **scoped out of the first slice**. The SDK's realtime transport is not yet adopted by the web app (`app.ts` has a "TODO: Add realtime transport" note and `main.ts` carries a separate `wsBaseUrl`). The `server.on('upgrade', …)` hook point is noted for a later slice; it is not implemented now, and no current preserved behavior depends on it.

## Testing Strategy

### Validation Approach

Two phases: first surface counterexamples that demonstrate the bug on the unfixed code, then verify the fix reaches the backend correctly and preserves all non-`/api` behavior. Property-based tests anchor the two correctness properties; curl-through-proxy checks anchor the connectivity slices; the full existing suite (5308/0) guards against regressions.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples demonstrating the bug BEFORE the fix, and confirm/refute the root-cause analysis. If refuted, re-hypothesize.

**Test Plan**: Exercise `/api/*` requests against each runtime and the SDK/auth base URL on the UNFIXED code to observe non-reachability.

**Test Cases**:
1. **Dev proxy absence**: `GET/POST /api/*` under Vite (port 3000) is not forwarded to the backend (will fail on unfixed code).
2. **Prod proxy absence**: `/api/*` under `server.mjs` 404s or falls back to `index.html` instead of reaching the backend (will fail on unfixed code).
3. **Root-path mismatch**: an `/api`-prefixed request does not map to the backend ROOT path (will fail on unfixed code).
4. **Reimplementation / base-URL inconsistency**: data access uses the hand-rolled `ApiClient`, and the SDK base URL is the cross-origin `http://localhost:8080` default rather than the proxied `/api` (edge — demonstrates the charter violation and the inconsistency).

**Expected Counterexamples**:
- `/api/*` requests never reach `API_ORIGIN` (no dev proxy, no prod reverse proxy).
- `/api`-prefixed paths do not correspond to backend ROOT paths.
- Possible causes: missing `server.proxy`, missing `server.mjs` reverse proxy, unstripped `/api` prefix, cross-origin SDK base URL, bespoke `ApiClient` usage.

### Fix Checking

**Goal**: For all inputs where the bug condition holds, the fixed system produces the expected behavior.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := F'(X)
  ASSERT reachesLiveBackend(X)                              // dev proxy + prod reverse proxy + stripped ROOT path
     AND result = real_backend_response(X)
     AND (X.layer = DATA_ACCESS IMPLIES usesPublishedSdk(X)) // @streetstudio/sdk, not hand-rolled ApiClient
END FOR
```

### Preservation Checking

**Goal**: For all inputs where the bug condition does NOT hold, the fixed system produces the same result as the original.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
  // Covers static assets, SPA history fallback, /healthz, missing-asset 404s,
  // and the passing test suite (5308 passed / 0 failed).
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation because it generates many non-`/api` request paths across the input domain, catches edge cases (odd extensions, nested routes, query/hash), and gives strong assurance that behavior is unchanged for all non-buggy inputs. Observe behavior on the UNFIXED `server.mjs` first, then encode it as properties.

**Test Cases**:
1. **Static asset preservation**: hashed assets and `index.html` keep their content-type and cache-control after the fix.
2. **SPA fallback preservation**: client-side route paths still serve `index.html`.
3. **Health endpoint preservation**: `/healthz` and `/health` still return `{ "status": "ok" }`.
4. **Missing-asset 404 preservation**: `/manifest.json`, `/favicon.png` (absent) still 404, not `index.html`.
5. **Method-guard preservation**: non-`GET`/`HEAD` methods on non-`/api` paths still return 405.

### Unit Tests

- `server.mjs` `/api` branch: prefix stripping, method pass-through, header forwarding, 502 on upstream error, and that non-`/api` paths bypass the branch entirely.
- `vite.config.ts` proxy config: `/api` mapped to `API_ORIGIN` with `rewrite` stripping the prefix.
- `auth-controller` login/register/logout/validation routed through the SDK `DashboardSession`, with the token-gap path handled explicitly (reported gap).
- Composable `HttpTransport`: timeout, retry/backoff, offline-awareness; `AppError` → `handleError`/degradation adaptation.

### Property-Based Tests

- **Fix property (Property 1)**: for generated `/api/*` requests (method, sub-path, query), F' forwards to `API_ORIGIN` with the `/api` prefix stripped to the backend ROOT path.
- **Preservation property (Property 2)**: for generated non-`/api` requests (static paths, route-looking paths, missing-asset paths, health paths), `F(X) == F'(X)` for status, content-type, cache-control, and body classification.

### Integration Tests

- Full dev flow: SPA served by Vite, `/api/*` proxied to a stub/live backend; login reaches `POST /auth/login` at ROOT.
- Full prod flow: `server.mjs` serving `dist` with `API_ORIGIN` set; `/api/*` reverse-proxied while static/SPA/health paths are unchanged.
- SDK-adoption vertical: a migrated data-access vertical (e.g. videos) performs its calls through `StreetStudioClient` and returns real backend responses, with degradation/error reporting preserved via the injected transport and `AppError` adapter.
