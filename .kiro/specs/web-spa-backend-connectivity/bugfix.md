# Bugfix Requirements Document

## Introduction

The StreetStudio web SPA (`apps/web`) is marked "complete" — every task section in the `web-application-implementation` spec is checked — but it cannot reach the live StreetStudio backend in either the dev or production runtime, and it reimplements published framework infrastructure that it is supposed to consume.

Two distinct classes of defect are covered by this bugfix:

1. **Connectivity defect.** The SPA prefixes every API call with `/api` (`apiClient = new ApiClient('/api')`), but the real backend serves at ROOT (`POST /auth/login`, catalog endpoints, etc.), not under `/api`. Neither runtime bridges that gap: the Vite dev server (`vite.config.ts`, port 3000) has no `proxy` mapping for `/api`, and the production static host (`server.mjs`) serves static assets, SPA history fallback, and `/healthz` only, with no `/api` reverse proxy. As a result, login and every data operation fail in both dev and prod.

2. **Charter violation (reimplementation).** `apps/web/src/services/api.ts` hand-rolls a full `ApiClient` (fetch wrapper with retry, exponential backoff, timeout, error categorization, and a network monitor), duplicating `@streetstudio/sdk` — which is already a declared dependency in `apps/web/package.json`. The project's Production Charter requires consuming the published, parity-guaranteed SDK instead of a bespoke client.

This fix must be delivered as verifiable slices (connectivity wiring first, verifiable via curl-through-proxy; SDK adoption following vertical-by-vertical starting with login) and must keep the existing test suite green (currently 5308 passed / 0 failed).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the SPA runs under the Vite dev server (port 3000) and makes an API call to `/api/*` THEN the dev server does not forward the request to the live backend (no `server.proxy` mapping exists), so the request fails to reach the backend.

1.2 WHEN the SPA runs under the production static host (`server.mjs`) and makes an API call to `/api/*` THEN the static host has no reverse proxy for `/api`, so the request is treated as a client-side route (falls back to `index.html`) or 404s and never reaches the backend.

1.3 WHEN any authenticated or data operation (e.g. login) is issued THEN the request path is prefixed with `/api` while the backend serves at ROOT, so even a request that reached the backend host would target a nonexistent path.

1.4 WHEN the SPA performs data access THEN it routes through the hand-rolled `ApiClient` in `apps/web/src/services/api.ts`, duplicating `@streetstudio/sdk` and violating the Production Charter's "consume published packages; never reimplement reusable infrastructure" rule.

### Expected Behavior (Correct)

2.1 WHEN the SPA runs under the Vite dev server (port 3000) and makes an API call THEN the dev server SHALL forward the request to the live StreetStudio backend so that a curl-through-proxy check returns a real backend response.

2.2 WHEN the SPA runs under the production static host (`server.mjs`) and makes an API call THEN the static host SHALL route the request to the live StreetStudio backend (reverse proxy to a configurable backend origin) so that the deployed SPA reaches the backend.

2.3 WHEN any authenticated or data operation (e.g. login) is issued THEN the request SHALL be delivered to the backend at the path the backend actually serves (ROOT, e.g. `POST /auth/login`) and return a real response.

2.4 WHEN the SPA performs data access THEN it SHALL consume `@streetstudio/sdk` (already a declared dependency) in place of the hand-rolled `ApiClient`, adopted vertical-by-vertical starting with login; genuine framework gaps SHALL be reported rather than force-fit or deep-imported.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the static host receives a request for an existing static asset (hashed asset, `index.html`) THEN the system SHALL CONTINUE TO serve that asset with its existing content-type and cache-control behavior.

3.2 WHEN the static host receives a navigation request for a client-side route (a path that is not an existing file and does not look like an asset) THEN the system SHALL CONTINUE TO serve `index.html` for SPA history fallback.

3.3 WHEN the static host receives a request for `/healthz` or `/health` THEN the system SHALL CONTINUE TO return the `{ "status": "ok" }` health response.

3.4 WHEN a request for a missing asset-looking path (e.g. `/manifest.json`, `/favicon.png`) is received THEN the system SHALL CONTINUE TO return 404 rather than falling back to `index.html`.

3.5 WHEN the full test suite is run THEN it SHALL CONTINUE TO pass at 5308 passed / 0 failed, with no regressions introduced by the connectivity wiring or SDK adoption.

## Bug Condition and Properties

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type SpaRequest        // { runtime, target, path, layer }
  OUTPUT: boolean

  // A request is buggy when it is an API/data call that cannot reach the
  // live backend, OR when data access is routed through the bespoke client
  // instead of the published SDK.
  RETURN (X.target = API_CALL AND NOT reachesLiveBackend(X))
      OR (X.layer = DATA_ACCESS AND usesHandRolledApiClient(X))
END FUNCTION
```

Where `reachesLiveBackend(X)` is false today because:
- dev: no `server.proxy` for `/api`
- prod: no reverse proxy in `server.mjs`
- path: `/api`-prefixed while backend serves at ROOT

### Fix Checking

```pascal
// Property: Fix Checking — API calls reach the live backend
FOR ALL X WHERE isBugCondition(X) DO
  result ← F'(X)
  ASSERT reachesLiveBackend(X)                       // dev proxy + prod reverse proxy + correct root path
     AND result = real_backend_response(X)
     AND (X.layer = DATA_ACCESS IMPLIES usesPublishedSdk(X))   // @streetstudio/sdk, not hand-rolled ApiClient
END FOR
```

### Preservation Checking

```pascal
// Property: Preservation Checking — non-buggy behavior is unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
  // Covers static asset serving, SPA history fallback, /healthz,
  // missing-asset 404s, and the passing test suite (5308 passed / 0 failed).
END FOR
```

**Key Definitions:**
- **F**: the SPA + dev/prod hosting as it exists before the fix.
- **F'**: the SPA + dev/prod hosting after wiring connectivity and adopting `@streetstudio/sdk`.
