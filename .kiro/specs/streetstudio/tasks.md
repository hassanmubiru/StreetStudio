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

- [ ] 10. Implement organizations, teams, membership, and administration
  - [ ] 10.1 Implement organization, team, and invitation services
    - `createOrg` (name 1–200) assigning the creator Administrator; `invite` creating a pending invitation expiring at +7d and rejecting malformed emails; `acceptInvitation` valid only while pending/unexpired; `createTeam` and `assignToTeam` org-scoped; deny cross-organization access
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [ ] 10.2 Implement administrative controls
    - `updateSettings` validating atomically and retaining prior settings on failure; `removeMember` revoking access within 5s; reject removing the last Administrator; deny non-Administrator administrative actions; record successful administrative actions in the Audit Log
    - _Requirements: 26.1, 26.2, 26.4, 26.5, 26.6, 26.7_

  - [ ]* 10.3 Write property test for organization creation and admin assignment
    - **Property 8: Organization creation validity and administrator assignment**
    - **Validates: Requirements 4.1, 4.7**

  - [ ]* 10.4 Write property test for invitation expiry
    - **Property 9: Invitations expire seven days after creation**
    - **Validates: Requirements 4.2, 4.8**

  - [ ]* 10.5 Write property test for invitation acceptance validity
    - **Property 10: Invitation acceptance is valid only while pending and unexpired**
    - **Validates: Requirements 4.3, 4.9**

  - [ ]* 10.6 Write property test for team scoping
    - **Property 11: Team creation and membership are organization-scoped**
    - **Validates: Requirements 4.4, 4.5**

  - [ ]* 10.7 Write property test for cross-organization access denial
    - **Property 12: Cross-organization access is denied**
    - **Validates: Requirements 4.6**

  - [ ]* 10.8 Write property test for organization settings updates
    - **Property 75: Organization settings updates are validated atomically**
    - **Validates: Requirements 26.1, 26.5**

  - [ ]* 10.9 Write property test for member removal revoking access
    - **Property 76: Removing a member revokes access**
    - **Validates: Requirements 26.2**

  - [ ]* 10.10 Write property test for administrator-only actions
    - **Property 77: Administrative actions require Administrator role**
    - **Validates: Requirements 26.4**

  - [ ]* 10.11 Write property test for last-administrator retention
    - **Property 78: An organization always retains at least one Administrator**
    - **Validates: Requirements 26.6**

- [ ] 11. Implement content hierarchy (projects, folders, workspaces)
  - [ ] 11.1 Implement ContentService for projects, folders, workspaces, and video moves
    - `createProject`/`createFolder` (names 1–255) scoped to org/project with create-permission gating; enforce folder nesting depth ≤10; `moveVideo` same-org only, preserving identity/comments/transcripts/permissions and rejecting cross-org moves; `createWorkspace`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [ ]* 11.2 Write property test for project/folder validity and scoping
    - **Property 13: Project and folder creation validity and scoping**
    - **Validates: Requirements 5.1, 5.2, 5.8**

  - [ ]* 11.3 Write property test for folder nesting depth bound
    - **Property 14: Folder nesting is bounded at depth 10**
    - **Validates: Requirements 5.3**

  - [ ]* 11.4 Write property test for video move preservation
    - **Property 15: Video moves preserve identity and associations within the organization**
    - **Validates: Requirements 5.4, 5.7**

  - [ ]* 11.5 Write property test for create-permission enforcement
    - **Property 16: Create permission is required for projects and folders**
    - **Validates: Requirements 5.6**

- [ ] 12. Checkpoint - organizations and content
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Implement storage abstraction and provider contract
  - [ ] 13.1 Implement the StorageProvider interface and routing
    - Define `put`/`get`/`signUploadTarget`/`healthCheck`; route persistence exclusively through the interface; write ack within 30s or abort with `STORAGE_ERROR` recording provider id + timestamp; activation validates config/connectivity and retains prior provider on failure; signed targets valid 60–3600s (default 900), direct-to-storage ≤15 min, expired targets rejected
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.6, 9.7, 29.3_

  - [ ]* 13.2 Write property test for storage round-trip byte preservation
    - **Property 27: Storage round-trip preserves object bytes**
    - **Validates: Requirements 9.1**

  - [ ]* 13.3 Write property test for provider activation validation
    - **Property 28: Storage provider activation validates configuration**
    - **Validates: Requirements 9.4**

  - [ ]* 13.4 Write property test for signed upload credential expiry
    - **Property 29: Signed upload credentials have bounded, secure expiry**
    - **Validates: Requirements 9.6, 9.7, 29.3**

  - [ ]* 13.5 Write unit tests for storage write timeout/abort handling
    - Test the 30s no-ack abort and write-failure paths
    - _Requirements: 9.5_

- [ ] 14. Implement chunked and resumable uploads
  - [ ] 14.1 Implement the UploadService (init, putChunk, status, complete)
    - Accept ordered chunks 1 MB–100 MB, acknowledging each; integrity-check each chunk, rejecting failures without persisting and retrying ≤3 times before aborting and discarding partial chunks; resume within 24h from the chunk after the last ack without retransmission; expire idle sessions after 24h; assemble in order into the completed Video; emit upload-progress on each ack
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 14.2 Write property test for chunk size validation and acknowledgment
    - **Property 18: Chunk acceptance validates size and acknowledges each received chunk**
    - **Validates: Requirements 7.1**

  - [ ]* 14.3 Write property test for resumable uploads without retransmission
    - **Property 19: Interrupted uploads resume without retransmitting acknowledged chunks**
    - **Validates: Requirements 7.2**

  - [ ]* 14.4 Write property test for chunk-assembly round-trip
    - **Property 20: Chunk assembly round-trip reconstructs the original media**
    - **Validates: Requirements 7.3**

  - [ ]* 14.5 Write property test for bounded, non-destructive integrity failures
    - **Property 21: Chunk integrity failures are bounded and non-destructive**
    - **Validates: Requirements 7.4, 7.5**

  - [ ]* 14.6 Write property test for upload session expiry
    - **Property 22: Upload sessions expire after 24 hours of inactivity**
    - **Validates: Requirements 7.6**

  - [ ]* 14.7 Write property test for upload progress reporting
    - **Property 23: Upload progress reflects acknowledged chunk count**
    - **Validates: Requirements 7.7**

- [ ] 15. Implement the Recorder client capture and upload logic
  - [ ] 15.1 Implement Recorder capture, controls, and offline upload
    - Capture screen/window/region with optional camera/microphone/system audio; continue without unsupported system audio and notify; abort and retain nothing on denied permission; cursor highlighting/drawing tools and keyboard shortcuts; pause/resume retaining pre-pause media; finalize ≤10s on stop and initiate upload; persist offline stops locally and upload with ≤5 retries on reconnect
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12_

  - [ ]* 15.2 Write property test for bounded offline upload retries
    - **Property 17: Offline recording upload retries are bounded**
    - **Validates: Requirements 6.11**

  - [ ]* 15.3 Write unit tests for capture, pause/resume, unsupported audio, and denied permission
    - Test capture source selection, pause/resume state, system-audio-unavailable notification, denied-permission abort, and offline local storage
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 6.9, 6.10_

- [ ] 16. Implement the media processing pipeline
  - [ ] 16.1 Implement the MediaPipeline worker (enqueue and process)
    - Enqueue within 5s of upload completion; produce exactly one thumbnail, a 3–10s preview, and ≥3 ABR renditions, then mark the Video ready; emit processing-status transitions (queued|processing|ready|failed) to members with access within 2s; retry ≤3 times on failure, then record failure, retain source, and emit a failure event
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ]* 16.2 Write property test for required processing outputs
    - **Property 24: Processing produces the required outputs**
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.7**

  - [ ]* 16.3 Write property test for processing status values
    - **Property 25: Processing status events use only defined status values**
    - **Validates: Requirements 8.5**

  - [ ]* 16.4 Write property test for bounded processing failures
    - **Property 26: Processing failures are bounded and preserve the source**
    - **Validates: Requirements 8.6**

- [ ] 17. Implement streaming and playback
  - [ ] 17.1 Implement PlaybackService manifest generation
    - Provide an ABR streaming manifest within 3s if and only if the Video is ready and the requester holds view permission (or a valid share credential); deny with the appropriate error and no manifest otherwise
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 17.2 Write property test for playback state and authorization
    - **Property 30: Playback requires ready state and authorization**
    - **Validates: Requirements 10.1, 10.2, 10.3**

  - [ ]* 17.3 Write property test for share-credential playback
    - **Property 31: Share-credential playback is granted only for valid credentials**
    - **Validates: Requirements 10.4, 10.5**

- [ ] 18. Checkpoint - media path
  - Ensure all tests pass, ask the user if questions arise.
