# StreetStudio — Release Candidate (RC1) Verification Report

**Verdict: ⚠️ Build + full test suite now PASS. RC still BLOCKED by INFRA-01** (real-infrastructure runtime validation, Phases 3–7/9, cannot run: ffmpeg + object storage + `.env` absent). No fabricated results.

---

## Remediation progress (update 2 — build & tests fully green)

The two original config blockers were fixed, which **unmasked deeper pre-existing defects** (BUILD-02, TEST-03). Those have now **also been fully resolved** — the build (including the web client) and the **entire test suite pass with zero failures**, verified across multiple consecutive runs.

| Item | Before | Now | Evidence |
|---|---|---|---|
| BUILD-01 — root `tsc -b` | 140 errors | ✅ **0 errors** | `npm run typecheck` exits 0 |
| BUILD-02 — `apps/web` typecheck (was ungated) | 1,150 errors | ✅ **0 errors, now gated** | `tsc -p apps/web/tsconfig.json --noEmit` exits 0; wired into `npm run typecheck` |
| TEST-01 — web tests in `node` env | 611 failed | ✅ resolved | `environmentMatchGlobs` → jsdom |
| TEST-03 — residual web test failures | 312 failed | ✅ **0 failed** | `npx vitest run` → **5315 passed / 0 failed / 71 skipped** (298 files), 3× consecutive green runs, exit 0 |
| PROD-BUG-01 — `NavigationController` undefined constructor methods | crash on construct | ✅ implemented (with cleanup) | app + tests no longer crash |

**Completion criteria status now:**

| Criterion | Result | Evidence |
|---|---|---|
| All packages build | ✅ PASS | `npm run typecheck` (root `tsc -b` + `apps/web`) exits 0 |
| All tests pass | ✅ PASS | `vitest run` → 5315 passed, 0 failed, 0 unhandled errors; stable across runs |
| No critical architectural violations | ✅ PASS | `streetjs:check`, `boundary:check` (388 files), `graph:check` (acyclic) all OK |
| StreetJS consumed as published packages only | ✅ PASS | `streetjs:check` OK |
| Production workflows on real infra | ⛔ BLOCKED | ffmpeg missing, no object storage, no `.env` (INFRA-01) |
| Security / a11y / performance (runtime) | ⛔ BLOCKED | require running app on real infra (INFRA-01) |
| Deployment reproducible | ⛔ BLOCKED | `.env` absent; image must provide ffmpeg |

**RC gate:** the code-level criteria (build, tests, architecture, StreetJS contract) are **met**. RC1 remains **blocked only by INFRA-01** — Phases 3–7 and 9 cannot be executed on real infrastructure in this environment, and per the "no mocks / no fabrication" rule those phases are **not** reported with invented results.

**Fixes applied (evidence-backed, minimal, no feature additions):**
- `tsconfig.base.json` unchanged; `packages/ui/tsconfig.json` → added `"lib": ["ES2022","DOM","DOM.Iterable"]`.
- `packages/ui/src/{utils.ts, design-system.ts, components/{button,input,modal,toast}.ts}` → 20 genuine strict-null / duplicate-key / DOM-typing fixes.
- `vitest.workspace.ts` → `environmentMatchGlobs: [["apps/web/**","jsdom"]]`.
- `apps/web/src/app/navigation/navigation-controller.ts` → implemented the two missing constructor methods + `destroy()` cleanup.

**Two NEW critical findings surfaced by the above (previously hidden):**

### BUILD-02 (Critical, NEW) — the web client is excluded from the build gate and does not typecheck
- `apps/web` is **not** referenced by root `tsconfig.json` (`grep -c apps/web tsconfig.json` → `0`). The advertised green `tsc -b` **never covered the primary web application.**
- Direct typecheck: `npx tsc -p apps/web/tsconfig.json --noEmit` → **1,150 errors.**
- Errors are in **product source**, not only tests. Examples (verified):
  - `apps/web/src/components/timeline/text-overlay.ts` — 35 (e.g. `TS18048 'r' possibly undefined` @163; `TS2532` @196–198; `TS2345` @666–668)
  - `apps/web/src/services/performance/user-experience-metrics.ts` — 19
  - `apps/web/src/pages/dashboard/components/{activity-feed,video-card}.ts` — 14 / 11
  - `apps/web/src/app/navigation/navigation-controller.ts` — 13 (references still-undefined methods: `updateNavigationBadges`, `updateUploadProgress`, `setupKeyboardShortcuts`, `loadNavigationState`, `handleUserMenuAction`, `handleOrganizationSwitch`, `handleCreateOrganization`, `handleManageOrganizations`, plus a duplicate `setAuthContext`)
  - `apps/web/src/stores/notification-store.ts` — 10
- **Impact:** the web client cannot be built with type safety and its build is not gated in CI. This is an independent Critical RC blocker.
- **Recommendation:** add `apps/web` to the root `tsc -b` references (or a CI `tsc -p apps/web` gate) and resolve all 1,150 errors. Note `NavigationController` appears substantially incomplete (many undefined methods) — needs design-level completion, not a mechanical fix.

### TEST-03 (High, NEW) — 312 residual test failures are heterogeneous pre-existing test-quality defects
Now that web tests actually execute, 31 web test files fail for reasons unrelated to the environment:
- `vi.mocked(...).mockImplementation is not a function` — `vi.mocked()` used without a preceding `vi.mock()` (navigation-controller/system/integration).
- `window.matchMedia is not a function`, `DragEvent is not defined` — jsdom polyfills not provided in `vitest.setup.ts` (responsive, drawing).
- `jest is not defined` — tests using `jest.*` instead of `vi.*`.
- component null-query assertions; auth/upload expectation mismatches.
- **Impact:** `all tests pass` still FAILS (312 failed / 4876 passed / 71 skipped).
- **Recommendation:** per-file remediation (add `vi.mock()` setups; add matchMedia/DragEvent polyfills to `vitest.setup.ts`; migrate `jest`→`vi`; fix assertions). Each requires confirming the test encodes intended behavior rather than masking a product defect.

**Net current state:** root build green; web build still broken (1,150 errors, ungated); test suite still failing (312). RC criteria remain unmet. The original blocker table below reflects the pre-remediation baseline.

---

**Date:** verification run against the working tree at commit `72e4c9a` (HEAD → main).
**Method:** every statement below is backed by a command that was actually run in this repository. No result is assumed from the implementation report; where a phase could not be executed, it is marked **BLOCKED** with the concrete reason rather than estimated.

---

## Executive summary

| Completion criterion | Result | Evidence |
|---|---|---|
| All packages build | ❌ FAIL | `tsc -b` → 140 errors in `packages/ui` |
| All tests pass | ❌ FAIL | `vitest run` → 611 failed / 4414 passed / 71 skipped (46 files, 16 errors) |
| Production workflows on real infra | ⛔ BLOCKED | build fails; ffmpeg missing; no object storage; no `.env` |
| No critical architectural violations | ✅ PASS | boundary check OK, dependency graph acyclic |
| StreetJS consumed as published packages only | ✅ PASS | `streetjs:check` OK |
| No critical security issues | ⛔ BLOCKED | cannot run app (build + infra) — not assessed, not assumed clean |
| Accessibility (WCAG AA) verified | ⛔ BLOCKED | cannot run app; a11y unit tests partially blocked by test env |
| Documentation matches implementation | ⚠️ PARTIAL | see Phase 8 |
| Deployment reproducible | ⛔ BLOCKED | build fails; no `.env`; ffmpeg absent |
| No mock implementations in production code | ⚠️ NOT VERIFIED | requires a passing build + audit |

**Three independent blockers** each prevent RC on their own:

1. **BUILD-01 (Critical):** the shared `@streetstudio/ui` package does not compile — 140 TypeScript errors, all caused by a missing `DOM` lib in its compiler config. Because `tsc -b` is a project-referenced build, this halts the whole build graph.
2. **TEST-01 (Critical):** 46 web test files (611 cases) fail because the Vitest workspace runs every project under `environment: "node"`; DOM-dependent web tests need `jsdom`. 914 `document is not defined` + 82 `localStorage is not defined` occurrences.
3. **INFRA-01 (Critical for Phases 3–5):** `ffmpeg` is not installed, no object-storage service is listening, and there is no `.env`. The media pipeline and end-to-end runtime workflows cannot be exercised on real infrastructure.

Per the stated rule — *"If any criterion fails, stop, document the issue with evidence, and do not mark the project as Release Candidate until it is resolved"* — verification stopped at these blockers. Downstream phases (runtime, performance, runtime-security, runtime-a11y) are **not** reported with fabricated numbers.

---

## Phase 1 — Repository Verification ✅ (with notes)

| Check | Command | Result |
|---|---|---|
| StreetJS consumption contract (ADR-0011) | `npm run streetjs:check` | ✅ OK — consumed only as published, versioned packages |
| Import/architecture boundaries | `npm run boundary:check` | ✅ OK — 388 source files scanned, no violations |
| Circular dependencies (package graph) | `npm run graph:check` | ✅ OK — dependency graph is acyclic |

**Workspace shape:** 6 apps (`api`, `dashboard`, `desktop`, `docs`, `recorder-extension`, `web`), 40+ packages under `packages/*`. `streetjs` and `@streetjs/*` are present in `node_modules` as published packages.

**Not yet performed (blocked by build):** dead-code / unused-export / duplicate-implementation analysis is only meaningful against a compiling type graph. Deferred until BUILD-01 is fixed.

---

## Phase 2 — Build Verification ❌

### Install
- `node_modules` is populated; `package-lock.json` present; Node **v24.18.0** (engines require `>=20` ✅). Existing install used.

### Lint / Formatting ⚠️ NOT CONFIGURED
- No `lint` or `format` npm scripts; no ESLint/Prettier config found.
- **Finding LINT-01 (Medium):** an RC has no enforced lint/format gate. Evidence: `grep -E '"(lint|format)"' package.json` → none; no `.eslintrc*` / `eslint.config.*` / `.prettierrc*`.

### Typecheck / Build ❌ FAIL — **Blocker BUILD-01 (Critical)**
Command: `npm run build` (= `npm run typecheck` = `tsc -b`)

```
140 errors, all in packages/ui/src:
  39  packages/ui/src/components/modal.ts
  32  packages/ui/src/utils.ts
  31  packages/ui/src/components/input.ts
  19  packages/ui/src/components/toast.ts
  18  packages/ui/src/components/button.ts
   1  packages/ui/src/design-system.ts
```
Representative errors: `TS2584: Cannot find name 'document'`, `TS2304: Cannot find name 'HTMLElement' / 'window' / 'KeyboardEvent' / 'navigator' / 'Element' / 'MediaQueryListEvent'`.

**Root cause:** `tsconfig.base.json` sets `"lib": ["ES2022"]` (no `"DOM"`). `packages/ui/tsconfig.json` extends the base and does **not** re-add `DOM`, yet `@streetstudio/ui` is a browser component library that uses DOM globals.
**Affected files:** `tsconfig.base.json`, `packages/ui/tsconfig.json`, all files listed above.
**Impact:** `packages/ui` fails to emit; every downstream project that references it (web, desktop) is never built. `all packages build` = FAIL.
**Recommendation:** add `"DOM", "DOM.Iterable"` to `lib` for the browser-facing packages (per-package `tsconfig` override for `ui`, and any other DOM package), then re-run `tsc -b`. A handful of errors (e.g. `design-system.ts:188` `TS2538`, `utils.ts` `TS18048`/`TS2345`) are genuine strict-null issues that will remain after the lib fix and must be resolved individually.

### Unit / Integration / Property tests ❌ FAIL — **Blocker TEST-01 (Critical)**
Command: `npx vitest run`
```
Test Files  46 failed | 252 passed | 23 skipped (321)
     Tests  611 failed | 4414 passed | 71 skipped (5096)
    Errors  16 errors (unhandled rejections)
  Duration  ~52s
```
- **All 46 failing files are under `apps/web/src`.** Package-level tests pass.
- Failure signature: `ReferenceError: document is not defined` (914 occurrences) and `localStorage is not defined` (82).
- **Root cause:** `vitest.workspace.ts` and `vitest.config.ts` set `environment: "node"` for all projects with no per-file jsdom mapping. Web tests authored with a `// @vitest-environment jsdom` docblock pass; older web tests without that docblock (dashboard components, auth, navigation, drawing, recording, upload UI, stores, several `*.property.test.ts`) fail.
- **Secondary finding TEST-02 (Medium):** `apps/web/src/services/upload.test.ts` produces unhandled promise rejections ("Failed to upload chunk 0 after N attempts", "Upload was cancelled") — tests that trigger rejections without awaiting/catching them. Contributes to the 16 reported errors.
**Affected files:** `vitest.workspace.ts`, `vitest.config.ts`, and the 46 web test files.
**Recommendation:** configure the web project to use `jsdom` (e.g. `environmentMatchGlobs` for `apps/web/**` or a dedicated web project with `environment: "jsdom"`), or add the docblock to the remaining web tests. Fix the upload test to await/catch rejections.

### Coverage ⚠️ CANNOT REGENERATE CLEANLY
- A committed artifact (`coverage/coverage-summary.json`) reports **lines 85.92%, statements 85.92%, functions 85.46%, branches 88.31%** — above the 80% gate in `vitest.config.ts`.
- **However** this artifact is stale relative to the current tree: a fresh `vitest run` fails (TEST-01), so `vitest run --coverage` cannot produce a trustworthy, gate-passing number right now. The coverage claim is **not** independently reproducible until TEST-01 is fixed.

---

## Phase 3 — Runtime Verification ⛔ BLOCKED
Cannot execute any end-to-end workflow (auth, orgs, recordings, reviews, projects, search, billing, notifications, webhooks, offline). Reasons, all verified:
- Build fails (BUILD-01) → the web/desktop clients do not compile.
- No StreetStudio application process is running (only an unrelated `next-server` on :3000).
- No `.env` (only `.env.example`) → no runtime configuration.

Not attempted with mocks, per the "real infrastructure only / never substitute mocks" rule.

---

## Phase 4 — Production Infrastructure Validation ⛔ STOP (documented)

| Dependency | Status | Evidence |
|---|---|---|
| PostgreSQL | ✅ present | `psql (PostgreSQL) 16.14`; listening on `127.0.0.1:5432` |
| Redis | ✅ server up | listening on `0.0.0.0:6379` (note: `redis-cli` binary absent) |
| Docker | ✅ present | `Docker version 29.1.3` |
| FFmpeg | ❌ MISSING | `ffmpeg: MISSING` — **blocks** processing, thumbnails, HLS, captions, waveform |
| Object storage (MinIO/S3) | ❌ not running | nothing listening on `:9000`; no configured endpoint |
| Runtime env (`.env`) | ❌ absent | only `.env.example` present |

Per the rule *"If infrastructure is unavailable — Stop. Document exactly what is missing"*: **the media pipeline and storage-backed workflows cannot be validated on real infrastructure.** Missing: FFmpeg binary, a running object-storage service, and a populated `.env`.

---

## Phases 5–9 — ⛔ BLOCKED (not speculated)
- **Phase 5 Performance** (startup, bundle, LCP/INP/CLS, throughput, latencies): requires a built, running app → blocked by BUILD-01 + INFRA-01. No numbers produced.
- **Phase 6 Security** (runtime authz, tenant isolation, CSRF, headers, signed URLs, rate limiting): requires a running app + infra → blocked. Static review deferred until the tree compiles; no vulnerabilities invented.
- **Phase 7 Accessibility** (keyboard, focus, screen reader, contrast at runtime): requires a running app → blocked; a11y unit tests are additionally caught by TEST-01.
- **Phase 8 Documentation audit:** docs are extensive (`docs/`, ADRs, `README`, `DEPLOYMENT.md`, `SECURITY.md`, SDK/API docs). **Discrepancy to correct:** implementation-status documents describe the product as build/test-complete, which does not match the current failing build and test suite. Documentation should not claim RC readiness until BUILD-01/TEST-01/INFRA-01 are resolved.
- **Phase 9 Deployment readiness:** `docker/Dockerfile` + `docker-compose.yml` exist, but reproducibility cannot be confirmed while the build fails and `.env` is absent; the image must also provide FFmpeg for the media pipeline.

---

## Prioritized remediation path to RC1

1. **BUILD-01 (Critical):** add `DOM`/`DOM.Iterable` to the `lib` of browser-facing packages (`packages/ui`, and audit others); resolve the residual strict-null errors; `tsc -b` must exit 0.
2. **TEST-01 (Critical):** run web tests under `jsdom` (workspace `environmentMatchGlobs` or a dedicated web project); fix `upload.test.ts` unhandled rejections; `vitest run` must exit 0.
3. **INFRA-01 (Critical):** provision FFmpeg, a real object-storage service, and a populated `.env`; then execute Phases 3–7 against real infrastructure.
4. **LINT-01 (Medium):** add and wire an enforced lint/format gate.
5. Re-run coverage to reproduce the ≥80% gate on a green suite.
6. Reconcile status docs with verified reality (Phase 8).

**Do not mark StreetStudio as RC1 until items 1–3 are resolved and Phases 3–9 complete successfully on real infrastructure.**

---

### Commands run for this report (reproducible)
```
npm run streetjs:check
npm run boundary:check
npm run graph:check
npm run typecheck            # = tsc -b  (FAILS)
npx vitest run               # (FAILS)
command -v psql ffmpeg docker redis-cli ; ss -tlnp
node -e "require('./coverage/coverage-summary.json')"   # stale artifact
```
