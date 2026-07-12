# Implementation Plan: StreetStudio

## Overview

This plan converts the StreetStudio design into incremental TypeScript/Node coding tasks. Implementation proceeds bottom-up: foundational packages and boundary tooling first (`shared`, `config`, `database`), then authentication and RBAC, then domain services (organizations, content), the media path (storage, chunked upload, recorder, pipeline, playback), collaboration (comments, notifications, realtime, search, sharing), extensibility (plugins, AI, billing, integrations, developer mode, reviews, knowledge base), analytics, the public-API surfaces (webhooks, security middleware, SDK/parity), and finally deployment, documentation, and CI.

StreetJS is consumed only through its public package entry points. Every cross-package import goes through declared entry points. Property-based tests use `fast-check` with a minimum of 100 iterations and are tagged `Feature: streetstudio, Property N: {property text}`. Property test sub-tasks and unit/integration test sub-tasks are marked optional with `*`.

## Tasks

- [ ] 1. Establish monorepo structure and boundary tooling
  - [ ] 1.1 Scaffold the monorepo layout and package manifests
    - Create `apps/{api,web,desktop,docs}` and `packages/{ui,sdk,shared,config,database,auth,media,recording,processing,notifications,plugins,analytics}`
    - Add a workspace-level package manifest and per-package manifests, each declaring a single primary domain responsibility and entry-point-only public exports
    - Reference StreetJS only via published version or local package link; add zero filesystem references into the StreetJS repo
    - Configure TypeScript project references, build, and the `fast-check` test runner
    - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.2, 2.3, 2.4_

  - [ ] 1.2 Implement the import-boundary analyzer
    - Build a static-analysis step in `packages/config` build tooling that resolves import specifiers against an allowlist
    - Reject imports resolving to StreetJS internals, filesystem paths inside the StreetJS repo, another package's internal module, or a specific AI/billing vendor implementation in core; emit a named error (`DISALLOWED_STREETJS_IMPORT`, `DISALLOWED_INTERNAL_IMPORT`, `DISALLOWED_AI_VENDOR`) and fail the build
    - _Requirements: 1.3, 1.6, 2.4, 2.6, 22.6_

  - [ ]* 1.3 Write property test for the import-boundary analyzer
    - **Property 1: Import boundary enforcement**
    - **Validates: Requirements 1.1, 1.3, 1.6, 2.4, 2.6, 22.6**

  - [ ] 1.4 Implement the package dependency-graph acyclicity checker
    - Derive the dependency graph from package manifests and detect cycles; wire into CI to fail on any cycle
    - _Requirements: 2.5_

  - [ ]* 1.5 Write property test for dependency-graph acyclicity
    - **Property 2: Package dependency graph is acyclic**
    - **Validates: Requirements 2.5**

- [ ] 2. Build the shared foundation package
  - [ ] 2.1 Implement the shared error taxonomy and wire-DTO types
    - Define the error categories/codes (validation, authentication, authorization, not-found/gone, conflict, rate-limit, capability-unavailable, upload, boundary) with stable machine-readable `code`, HTTP status, and non-disclosing `message`
    - Define serialized DTO types mirroring the domain entities for REST/WebSocket/SDK reuse
    - _Requirements: 2.4_

  - [ ]* 2.2 Implement shared fast-check generators for tests
    - Generators for emails, passwords, names at length bounds (1/200/255/2048/5000/10000/100000), timestamps around 0 and duration, chunk sizes around 1 MB/100 MB, byte payloads, multi-org resource graphs, and plugin sets with injected failures
    - _Requirements: 2.4_

- [ ] 3. Implement configuration loading and startup validation
  - [ ] 3.1 Implement config schema, loading, and startup validation
    - Load and validate configuration via the StreetJS config interface; abort startup and emit an error naming every missing/invalid required value
    - _Requirements: 30.3_

  - [ ]* 3.2 Write property test for startup configuration validation
    - **Property 88: Startup validation names every invalid configuration value**
    - **Validates: Requirements 30.3**

- [ ] 4. Implement the database layer and audit log
  - [ ] 4.1 Define schema, migrations, and repositories
    - Implement PostgreSQL schema/migrations and repositories (via StreetJS PostgreSQL access) for all core entities; UUID identifiers; `organization_id` on tenant-scoped tables with indexes for isolation
    - Enforce acyclic layering: `database` depends on `shared`/`config` only
    - _Requirements: 2.5_

  - [ ] 4.2 Implement the append-only Audit Log
    - Implement `append` (actor, action, target, orgId, UTC timestamp with ≥ms precision) within 5s, and org-scoped descending `query`; expose no update/delete path and reject mutation at the storage layer; record auth events, authorization denials, sharing changes, and administrative actions
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [ ]* 4.3 Write property test for audit field recording
    - **Property 54: Audit entries record required fields for security actions**
    - **Validates: Requirements 17.1, 17.4**

  - [ ]* 4.4 Write property test for audit immutability
    - **Property 55: Audit entries are immutable**
    - **Validates: Requirements 17.2, 17.6**

  - [ ]* 4.5 Write property test for audit query scoping and ordering
    - **Property 56: Audit queries are organization-scoped and ordered**
    - **Validates: Requirements 17.3, 17.5**

- [ ] 5. Checkpoint - foundation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement authentication and sessions
  - [ ] 6.1 Implement registration, login, logout, and token verification
    - `register` (valid non-duplicate email, ≥8-char password) with Argon2id hashing and no plaintext storage; `login` issuing a JWT with `exp ≤ 15 min` plus a session record; `logout` invalidating the session; `verifyAccessToken` rejecting expired/invalidated tokens; uniform non-disclosing auth errors
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.8_

  - [ ] 6.2 Implement account lockout policy
    - Lock an account for ≥15 min after 5 failed attempts within a 15-minute window and reject further attempts during the lock
    - _Requirements: 3.9_

  - [ ] 6.3 Implement OAuth and SSO sign-in
    - Authenticate through configured OAuth/SSO providers; deny sign-in and create no session on provider failure/unavailability
    - _Requirements: 3.5, 3.6, 3.10_

  - [ ]* 6.4 Write property test for registration and password hashing
    - **Property 3: Registration creates retrievable accounts without plaintext passwords**
    - **Validates: Requirements 3.1**

  - [ ]* 6.5 Write property test for short-lived token issuance
    - **Property 4: Login issues short-lived tokens with sessions**
    - **Validates: Requirements 3.2**

  - [ ]* 6.6 Write property test for non-disclosing invalid authentication
    - **Property 5: Invalid authentication is uniformly non-disclosing**
    - **Validates: Requirements 3.3, 3.8**

  - [ ]* 6.7 Write property test for session and token invalidation
    - **Property 6: Session and token invalidation**
    - **Validates: Requirements 3.4, 3.7**

  - [ ]* 6.8 Write property test for account lockout
    - **Property 7: Account lockout after repeated failures**
    - **Validates: Requirements 3.9**

  - [ ]* 6.9 Write unit tests for OAuth/SSO sign-in with mocked providers
    - Test success and provider-failure paths
    - _Requirements: 3.5, 3.6, 3.10_

- [ ] 7. Implement API keys
  - [ ] 7.1 Implement API key create, metadata, authenticate, and revoke
    - `create` returns the secret exactly once and stores only a salted hash; `getMeta` never returns the secret; `authenticate` accepts only valid non-revoked keys; `revoke` rejects subsequent use; uniform non-disclosing auth error for malformed/unrecognized/expired/revoked keys; permission-gate create/revoke
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

  - [ ]* 7.2 Write property test for one-time secret disclosure
    - **Property 57: API-key secrets are disclosed exactly once**
    - **Validates: Requirements 18.1, 18.2**

  - [ ]* 7.3 Write property test for API-key authentication and validity
    - **Property 58: API-key authentication reflects validity and permissions**
    - **Validates: Requirements 18.3, 18.4, 18.5**

  - [ ]* 7.4 Write property test for API-key management permission gating
    - **Property 59: API-key management is permission-gated**
    - **Validates: Requirements 18.6**

- [ ] 8. Implement RBAC evaluation
  - [ ] 8.1 Implement the deny-by-default AccessControl evaluator and role assignment
    - `can(ctx, action, resource)` evaluated in the organization scope that owns the resource, before any action; denied actions cause no change; `assignRole` permission-gated and membership-checked; permissions never leak across organizations; role changes govern subsequent decisions
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 26.3_

  - [ ]* 8.2 Write property test for owning-organization-scoped authorization
    - **Property 50: Authorization is evaluated in the owning organization's scope**
    - **Validates: Requirements 16.1, 16.3**

  - [ ]* 8.3 Write property test for role assignment governing decisions
    - **Property 51: Role assignment governs subsequent decisions**
    - **Validates: Requirements 16.2, 26.3**

  - [ ]* 8.4 Write property test for cross-organization permission isolation
    - **Property 52: Role permissions never leak across organizations**
    - **Validates: Requirements 16.4**

  - [ ]* 8.5 Write property test for role-management gating
    - **Property 53: Role management is permission-gated and membership-checked**
    - **Validates: Requirements 16.5, 16.6**

- [ ] 9. Checkpoint - auth and RBAC
  - Ensure all tests pass, ask the user if questions arise.
