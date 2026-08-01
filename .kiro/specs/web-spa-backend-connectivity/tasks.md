# Implementation Plan

## Overview

This plan fixes the web SPA backend-connectivity defect using the bug condition
methodology. Exploration and preservation tests are written and run against the
UNFIXED code FIRST (to prove the bug and to baseline preserved behavior), then
the fix is delivered as four independently-verifiable slices, each of which is
curl-verifiable and gated through the per-slice verification loop.

**Bug condition (C):** an API/data call that cannot reach the live backend
(no dev proxy, no prod reverse proxy, or an unstripped `/api` prefix against a
ROOT-serving backend), OR a data-access path routed through the hand-rolled
`ApiClient` instead of `@streetstudio/sdk`.

**Per-slice verification loop (applied to every implementation slice):**
1. `get_diagnostics` on every touched file (0 problems)
2. `npx tsc -b apps/api` and web type-check clean
3. Gates: `infra:ratchet`, `streetjs:check`, `boundary:check`, `graph:check`, full `typecheck`
4. Start the static/dev host against real infra (Postgres :5435, MinIO :9000, Redis :6379; API on `HTTP_PORT`)
5. curl-through-proxy verification of the slice's acceptance
6. Clean up any temp files created during verification
7. `npx vitest run` — keep **5308 passed / 0 failed**

---

## Tasks

- [-] 1. Write bug condition exploration test (BEFORE any fix)
  - **Property 1: Bug Condition** - API/data calls cannot reach the live backend
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug across dev, prod, root-path, and reimplementation dimensions
  - **Scoped PBT Approach**: This is a deterministic bug — scope the property to concrete failing cases while still generating over the `/api/*` sub-path/method/query domain:
    - Dev: generate `/api/*` requests (method ∈ {GET,POST}, arbitrary sub-path/query) under `vite.config.ts`; assert none is forwarded to `API_ORIGIN` (no `server.proxy`) — expect FAIL
    - Prod: generate `/api/*` requests against `server.mjs`; assert each 404s or falls back to `index.html` instead of reaching the backend — expect FAIL
    - Root-path: assert an `/api`-prefixed path (e.g. `/api/auth/login`) does NOT map to the backend ROOT path (`/auth/login`) — expect FAIL
    - Reimplementation/base-URL (edge): assert data access uses the hand-rolled `ApiClient` and the SDK base URL defaults to cross-origin `http://localhost:8080` rather than proxied `/api` — demonstrates the charter violation
  - The test assertions must match Property 1 (Correctness Properties) in design: F' forwards `/api/*` to `API_ORIGIN` with the prefix stripped to a real backend ROOT path, returning a real response
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists)
  - Document counterexamples found (e.g. "`POST /api/auth/login` under Vite is never forwarded", "`GET /api/videos` under server.mjs returns index.html", "`/api/auth/login` != backend ROOT `/auth/login`")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [~] 2. Write preservation property tests (BEFORE any fix)
  - **Property 2: Preservation** - non-`/api` behavior is unchanged
  - **IMPORTANT**: Follow observation-first methodology — observe behavior on the UNFIXED `server.mjs`/Vite host first, then encode it as properties
  - Observe and record on UNFIXED code, then assert as generated properties over the non-`/api` request domain:
    - Static assets: generate hashed asset paths + `index.html`; observe content-type + cache-control (`immutable` for hashed assets, `no-cache` for `index.html`) and assert they are preserved
    - SPA fallback: generate route-looking paths (no file extension, nested); observe `index.html` served and assert preserved
    - Health: `/healthz` and `/health` observed returning `{ "status": "ok" }`; assert preserved
    - Missing-asset 404: generate absent asset-looking paths (`/manifest.json`, `/favicon.png`, odd extensions); observe 404 (not `index.html`) and assert preserved
    - Method guard: non-GET/HEAD on non-`/api` paths observed returning 405; assert preserved
  - Property-based testing generates many non-`/api` paths across the input domain for a strong `F(X) == F'(X)` guarantee (status, content-type, cache-control, body classification)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 3. Slice 1 — Dev connectivity (Vite proxy)

  - [~] 3.1 Add `server.proxy` for `/api` in `apps/web/vite.config.ts`
    - Add a `server.proxy['/api']` entry: `target` = `process.env.API_ORIGIN` with a sensible dev default (`http://localhost:8080`), `changeOrigin: true`, `rewrite: (path) => path.replace(/^\/api/, '')` so the backend receives ROOT paths, `ws` left unset/false (WebSocket upgrade scoped out)
    - Mirror the identical `proxy` block under `preview` so `vite preview` behaves like dev
    - Leave every other Vite config (build target, resolve alias, test block) untouched
    - _Bug_Condition: isBugCondition(X) where X.runtime = dev AND X.target = API_CALL AND NOT devProxyForwards(X)_
    - _Expected_Behavior: dev server forwards `/api/*` to `API_ORIGIN` with `/api` stripped to ROOT (Property 1)_
    - _Preservation: non-`/api` dev behavior unchanged (Preservation Requirements)_
    - _Requirements: 1.1, 2.1, 2.3_

  - [~] 3.2 Verify Slice 1 via the per-slice verification loop
    - `get_diagnostics` on `vite.config.ts` (0 problems); web type-check + `npx tsc -b apps/api` clean
    - Gates: `infra:ratchet`, `streetjs:check`, `boundary:check`, `graph:check`, full `typecheck`
    - Start Vite dev host against real infra (Postgres :5435, MinIO :9000, Redis :6379; API on `HTTP_PORT`)
    - curl-through-proxy: `curl http://localhost:3000/api/auth/login` returns a real backend response (200/401), NOT a 404 / `index.html`
    - Clean up any temp files; run `npx vitest run` (keep 5308 passed / 0 failed)
    - _Requirements: 2.1, 2.3, 3.5_

- [ ] 4. Slice 2 — Prod connectivity (`server.mjs` reverse proxy)

  - [~] 4.1 Add an `/api` reverse-proxy branch to `apps/web/server.mjs` (Node built-ins only)
    - Import `node:http` / `node:https` / `node:url` only — no new runtime deps (must survive `npm prune --omit=dev`)
    - Read `API_ORIGIN` from env at startup; parse once into `{ protocol, hostname, port }`. If unset, log a clear warning and continue serving static content (connectivity disabled) so the host still boots
    - Insert the `/api` branch AFTER the `/healthz` check and BEFORE `resolveFile`, keyed strictly on `pathname === '/api' || pathname.startsWith('/api/')`
    - Strip the `/api` prefix (`/api/auth/login` → `/auth/login`); build the outbound request with same method, path+query, forwarded headers (rewrite `host` to backend host; drop hop-by-hop headers); choose `node:http`/`node:https` by parsed protocol
    - Stream via pipe both ways (`req.pipe(proxyReq)`, `proxyRes.pipe(res)`), forwarding status + response headers; do NOT set a fixed `Content-Length`
    - Respond `502 Bad Gateway` on upstream/socket error
    - Relax the top-level GET/HEAD-only method guard for the `/api` branch ONLY so POST/PUT/PATCH/DELETE reach the backend; guard unchanged for static/SPA paths
    - Leave every non-`/api` path (healthz, `resolveFile`, `looksLikeAsset` 404, SPA fallback, cache-control) byte-for-byte untouched
    - _Bug_Condition: isBugCondition(X) where X.runtime = prod AND X.target = API_CALL AND NOT prodProxyForwards(X)_
    - _Expected_Behavior: server.mjs reverse-proxies `/api/*` to `API_ORIGIN` with `/api` stripped to ROOT (Property 1)_
    - _Preservation: static assets, SPA fallback, /healthz, missing-asset 404, method guard unchanged (Preservation Requirements)_
    - _Requirements: 1.2, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [~] 4.2 Verify Slice 2 via the per-slice verification loop
    - `get_diagnostics` on `server.mjs` (0 problems); web type-check + `npx tsc -b apps/api` clean
    - Gates: `infra:ratchet`, `streetjs:check`, `boundary:check`, `graph:check`, full `typecheck`
    - Start `server.mjs` serving `dist` with `API_ORIGIN` set, against real infra (Postgres :5435, MinIO :9000, Redis :6379; API on `HTTP_PORT`)
    - curl-through-proxy: `/api/...` returns a real backend response; confirm `/healthz`, a hashed static asset (content-type + immutable cache-control), a SPA route (index.html), and a missing asset path (404) all behave exactly as before
    - Clean up any temp files; run `npx vitest run` (keep 5308 passed / 0 failed)
    - _Requirements: 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 5. Slice 3 — Root-path correctness

  - [~] 5.1 Assert stripped requests hit real backend ROOT paths
    - No code changes beyond slices 1–2; add explicit assertions (unit + curl) that a stripped `/api`-prefixed request maps to a real backend ROOT route through EACH proxy (dev Vite and prod `server.mjs`)
    - Assert `/api/auth/login` → backend `POST /auth/login` returns 200/401 (not 404), confirming the backend — not the static host — answers
    - _Bug_Condition: isBugCondition(X) where NOT hitsBackendRootPath(X) (unstripped `/api` prefix)_
    - _Expected_Behavior: hitsBackendRootPath(X) true — `/api` stripped to ROOT via both proxies (Property 1)_
    - _Preservation: prefix strip affects `/api` paths only; non-`/api` paths unchanged_
    - _Requirements: 1.3, 2.3_

  - [~] 5.2 Verify Slice 3 via the per-slice verification loop
    - `get_diagnostics` (0 problems); web type-check + `npx tsc -b apps/api` clean
    - Gates: `infra:ratchet`, `streetjs:check`, `boundary:check`, `graph:check`, full `typecheck`
    - Start each host against real infra (Postgres :5435, MinIO :9000, Redis :6379; API on `HTTP_PORT`)
    - curl a known backend ROOT route through each proxy; confirm the backend answers at ROOT (not 404, not `index.html`)
    - Clean up any temp files; run `npx vitest run` (keep 5308 passed / 0 failed)
    - _Requirements: 2.3, 3.5_

- [ ] 6. Slice 4 — SDK adoption (login vertical first)

  - [~] 6.1 Reconcile the SDK base URL to same-origin `/api`
    - In `apps/web/src/main.ts` / `apps/web/src/app/app.ts`, default `apiBaseUrl` to `/api` (relative), removing the cross-origin `http://localhost:8080` default from the browser bundle
    - `DashboardSession` → `StreetStudioClient.buildUrl` concatenates `/api` + `/auth/login` → `/api/auth/login`, which both proxies strip to `/auth/login`; the backend origin is configured once at the proxy via `API_ORIGIN`
    - _Bug_Condition: isBugCondition(X) where X.layer = DATA_ACCESS AND base URL is cross-origin/inconsistent_
    - _Expected_Behavior: single same-origin `/api` base routed through the proxy (Property 1, base-URL edge)_
    - _Preservation: no change to non-`/api` behavior_
    - _Requirements: 1.4, 2.4_

  - [~] 6.2 Implement a composable `HttpTransport` and adapt error/degradation
    - Implement a composable `HttpTransport` (timeout + retry/exponential-backoff + offline-awareness) injected via `SdkClientOptions.transport` / `DashboardSessionOptions.transport` — the SDK is transport-agnostic and has no built-in retry/backoff/timeout/`NetworkMonitor`
    - Adapt `AppError` (shared taxonomy) into the existing `handleError` / `getDegradationManager` calls at the call sites so error reporting and graceful degradation are retained without the bespoke client
    - Add unit tests for the transport: timeout, retry/backoff, offline-awareness, and `AppError` → `handleError`/degradation adaptation
    - _Bug_Condition: isBugCondition(X) where X.layer = DATA_ACCESS AND usesHandRolledApiClient(X)_
    - _Expected_Behavior: cross-cutting concerns preserved via injected transport, not reimplemented (Property 1)_
    - _Preservation: existing degradation/error-reporting behavior retained_
    - _Requirements: 1.4, 2.4_

  - [~] 6.3 Route the login vertical through the SDK; use `useBearerToken` for dynamic tokens
    - Replace raw `fetch('/api/auth/login')`, `/api/auth/register`, `/api/auth/logout`, and session-validation calls in `auth-controller.ts` with the `DashboardSession`/`StreetStudioClient` methods the SPA already holds (`register`, `auth.login`, `auth.logout`, `currentMember`)
    - Use `DashboardSession.useBearerToken` (which rebuilds the client) for dynamic token injection rather than mutating construction-time `auth`
    - Add unit tests: login/register/logout/validation routed through `DashboardSession`, with the token-gap path handled explicitly (see 6.5)
    - _Bug_Condition: isBugCondition(X) where X.layer = DATA_ACCESS (login) AND usesHandRolledApiClient(X)_
    - _Expected_Behavior: login vertical consumes `@streetstudio/sdk` via `DashboardSession` (Property 1)_
    - _Preservation: login remains functional over the correctly-proxied endpoint_
    - _Requirements: 1.4, 2.4_

  - [~] 6.4 Migrate already-sufficient data verticals off `ApiClient` and retire `services/api.ts`
    - Migrate verticals whose SDK contract is already sufficient (`videos`, `comments`, `uploads`, `projects`) off the hand-rolled `ApiClient` to `StreetStudioClient` via `DashboardSession`
    - Once every data-access vertical is on the SDK, delete `apps/web/src/services/api.ts` (and its `NetworkMonitor`), leaving the composable transport as the single home for retry/timeout/offline concerns
    - _Bug_Condition: isBugCondition(X) where X.layer = DATA_ACCESS AND usesHandRolledApiClient(X)_
    - _Expected_Behavior: usesPublishedSdk(X) true for all migrated verticals; `ApiClient` retired (Property 1)_
    - _Preservation: migrated verticals return real backend responses; degradation/error reporting preserved_
    - _Requirements: 1.4, 2.4_

  - [~] 6.5 Report the login-token framework gap (do NOT deep-import or force-fit)
    - The SDK's `AuthResource.login` returns `SessionDto` = `{ id, memberId, issuedAt, expiresAt, revokedAt? }` with no bearer token / refresh token / `expiresIn` / user, while `AuthController.login` needs `{ token, refreshToken, expiresIn, user }`
    - REPORT the gap requesting the login contract surface a bearer token (and refresh/expiry) — do NOT deep-import (forbidden by ADR-0001/0011) or fabricate a bespoke token path
    - Until resolved, connectivity slices 1–3 keep login functional over the correctly-proxied endpoint; the SDK token exchange lands when the contract is extended (tracked by task 8)
    - _Bug_Condition: published SDK contract genuinely insufficient for login token surfacing_
    - _Expected_Behavior: gap reported, not force-fit (Property 1 gap clause)_
    - _Preservation: no bespoke workaround introduced_
    - _Requirements: 2.4_

  - [~] 6.6 Verify Slice 4 via the per-slice verification loop
    - `get_diagnostics` on all touched files (0 problems); web type-check + `npx tsc -b apps/api` clean
    - Gates: `infra:ratchet`, `streetjs:check`, `boundary:check`, `graph:check`, full `typecheck`
    - Start a host against real infra (Postgres :5435, MinIO :9000, Redis :6379; API on `HTTP_PORT`)
    - curl / scripted verification: a migrated vertical (e.g. `videos`) performs its calls through `StreetStudioClient` and returns real backend responses, with degradation/error reporting preserved via the injected transport and `AppError` adapter
    - Clean up any temp files; run `npx vitest run` (keep 5308 passed / 0 failed)
    - _Requirements: 2.4, 3.5_

- [ ] 7. Verify correctness properties against the fixed code

  - [~] 7.1 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - API/data calls reach the live backend via the SDK
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior; passing confirms `/api/*` is forwarded to `API_ORIGIN` stripped to ROOT and data access uses the published SDK
    - **EXPECTED OUTCOME**: Test PASSES (confirms the bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [~] 7.2 Verify preservation tests still pass
    - **Property 2: Preservation** - non-`/api` behavior is unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Confirm static-asset serving, SPA fallback, `/healthz`/`/health`, missing-asset 404s, and the method guard are all unchanged (`F(X) == F'(X)`)
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [~] 8. File the reported login-token framework gap
  - File a framework gap (issue/ticket + reference in `docs/DECISIONS.md`) requesting the SDK login contract surface a bearer token, refresh token, and expiry so the web login token exchange can adopt the SDK
  - Cross-reference the documented limitation in `apps/dashboard/src/session.ts` and the SDK `SessionDto` contract in `packages/shared/src/dto.ts`
  - Do NOT implement a deep-import or bespoke workaround (ADR-0001/0011)
  - _Requirements: 2.4_

- [~] 9. Update documentation and record an ADR (final step)
  - Update `STATUS.md` to reflect web SPA connectivity + SDK adoption status and the outstanding login-token gap
  - Update `RC1-VERIFICATION-REPORT.md` with the curl-through-proxy verification results per slice and the test-suite status (5308 passed / 0 failed)
  - Add a `CHANGELOG.md` entry for the dev proxy, prod reverse proxy, root-path correctness, and SDK adoption
  - Record an ADR (in `docs/DECISIONS.md` / new ADR file) capturing: `API_ORIGIN` single-origin proxy decision, Node-built-ins-only prod proxy, strangler-fig SDK adoption, and the reported login-token gap
  - _Requirements: 2.4, 3.5_

- [~] 10. Checkpoint - Ensure all tests pass
  - Confirm every slice passed its per-slice verification loop and both correctness properties hold
  - Ensure the full suite passes at 5308 passed / 0 failed with no regressions; ask the user if questions arise
  - _Requirements: 3.5_

---

## Notes

- Tasks 1 and 2 run against the UNFIXED code: task 1 MUST fail (proves the bug),
  task 2 MUST pass (baselines preserved behavior). Do not fix code while task 1 fails.
- Every implementation slice (3–6) runs the full per-slice verification loop; the
  test suite must stay at 5308 passed / 0 failed throughout.
- The login-token exchange is intentionally NOT migrated to the SDK — it is blocked
  on a framework contract gap (task 8). Connectivity slices keep login working over
  the proxied endpoint until the contract is extended.
- No deployment or manual browser QA tasks — verification is curl/scripted only.

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "description": "Exploration and preservation tests on UNFIXED code (bug condition methodology)",
      "tasks": ["1", "2"],
      "parallel": true
    },
    {
      "wave": 2,
      "description": "Connectivity slices — dev and prod proxies are independent and can run in parallel",
      "tasks": ["3", "4"],
      "parallel": true,
      "dependsOn": [1, 2]
    },
    {
      "wave": 3,
      "description": "Root-path correctness — depends on both dev and prod proxies stripping the /api prefix",
      "tasks": ["5"],
      "parallel": false,
      "dependsOn": [3, 4]
    },
    {
      "wave": 4,
      "description": "SDK adoption (login vertical first) — depends on connectivity being in place",
      "tasks": ["6"],
      "parallel": false,
      "dependsOn": [5]
    },
    {
      "wave": 5,
      "description": "Property verification against fixed code, gap filing",
      "tasks": ["7", "8"],
      "parallel": true,
      "dependsOn": [6]
    },
    {
      "wave": 6,
      "description": "Documentation + ADR, then final checkpoint",
      "tasks": ["9", "10"],
      "parallel": false,
      "dependsOn": [7, 8]
    }
  ]
}
```
