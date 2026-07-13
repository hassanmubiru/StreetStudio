# Implementation Plan: StreetStudio

## Overview

This plan converts the StreetStudio design into incremental TypeScript/Node coding tasks. Implementation proceeds bottom-up: foundational packages and boundary tooling first (`shared`, `config`, `database`), then authentication and RBAC, then domain services (organizations, content), the media path (storage, chunked upload, recorder, pipeline, playback), collaboration (comments, notifications, realtime, search, sharing), extensibility (plugins, AI, billing, integrations, developer mode, reviews, knowledge base), analytics, the public-API surfaces (webhooks, security middleware, SDK/parity), and finally deployment, documentation, and CI.

StreetJS is consumed only through its public package entry points. Every cross-package import goes through declared entry points. Property-based tests use `fast-check` with a minimum of 100 iterations and are tagged `Feature: streetstudio, Property N: {property text}`. Property test sub-tasks and unit/integration test sub-tasks are marked optional with `*`.

## Tasks

- [x] 1. Establish monorepo structure and boundary tooling
  - [x] 1.1 Scaffold the monorepo layout and package manifests
    - Create `apps/{api,web,desktop,docs}` and `packages/{ui,sdk,shared,config,database,auth,media,recording,processing,notifications,plugins,analytics}`
    - Add a workspace-level package manifest and per-package manifests, each declaring a single primary domain responsibility and entry-point-only public exports
    - Reference StreetJS only via published version or local package link; add zero filesystem references into the StreetJS repo
    - Configure TypeScript project references, build, and the `fast-check` test runner
    - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.2, 2.3, 2.4_

  - [x] 1.2 Implement the import-boundary analyzer
    - Build a static-analysis step in `packages/config` build tooling that resolves import specifiers against an allowlist
    - Reject imports resolving to StreetJS internals, filesystem paths inside the StreetJS repo, another package's internal module, or a specific AI/billing vendor implementation in core; emit a named error (`DISALLOWED_STREETJS_IMPORT`, `DISALLOWED_INTERNAL_IMPORT`, `DISALLOWED_AI_VENDOR`) and fail the build
    - _Requirements: 1.3, 1.6, 2.4, 2.6, 22.6_

  - [x] 1.3 Write property test for the import-boundary analyzer
    - **Property 1: Import boundary enforcement**
    - **Validates: Requirements 1.1, 1.3, 1.6, 2.4, 2.6, 22.6**

  - [x] 1.4 Implement the package dependency-graph acyclicity checker
    - Derive the dependency graph from package manifests and detect cycles; wire into CI to fail on any cycle
    - _Requirements: 2.5_

  - [x] 1.5 Write property test for dependency-graph acyclicity
    - **Property 2: Package dependency graph is acyclic**
    - **Validates: Requirements 2.5**

- [x] 2. Build the shared foundation package
  - [x] 2.1 Implement the shared error taxonomy and wire-DTO types
    - Define the error categories/codes (validation, authentication, authorization, not-found/gone, conflict, rate-limit, capability-unavailable, upload, boundary) with stable machine-readable `code`, HTTP status, and non-disclosing `message`
    - Define serialized DTO types mirroring the domain entities for REST/WebSocket/SDK reuse
    - _Requirements: 2.4_

  - [x] 2.2 Implement shared fast-check generators for tests
    - Generators for emails, passwords, names at length bounds (1/200/255/2048/5000/10000/100000), timestamps around 0 and duration, chunk sizes around 1 MB/100 MB, byte payloads, multi-org resource graphs, and plugin sets with injected failures
    - _Requirements: 2.4_

- [x] 3. Implement configuration loading and startup validation
  - [x] 3.1 Implement config schema, loading, and startup validation
    - Load and validate configuration via the StreetJS config interface; abort startup and emit an error naming every missing/invalid required value
    - _Requirements: 30.3_

  - [x] 3.2 Write property test for startup configuration validation
    - **Property 88: Startup validation names every invalid configuration value**
    - **Validates: Requirements 30.3**

- [x] 4. Implement the database layer and audit log
  - [x] 4.1 Define schema, migrations, and repositories
    - Implement PostgreSQL schema/migrations and repositories (via StreetJS PostgreSQL access) for all core entities; UUID identifiers; `organization_id` on tenant-scoped tables with indexes for isolation
    - Enforce acyclic layering: `database` depends on `shared`/`config` only
    - _Requirements: 2.5_

  - [x] 4.2 Implement the append-only Audit Log
    - Implement `append` (actor, action, target, orgId, UTC timestamp with ≥ms precision) within 5s, and org-scoped descending `query`; expose no update/delete path and reject mutation at the storage layer; record auth events, authorization denials, sharing changes, and administrative actions
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [x] 4.3 Write property test for audit field recording
    - **Property 54: Audit entries record required fields for security actions**
    - **Validates: Requirements 17.1, 17.4**

  - [x] 4.4 Write property test for audit immutability
    - **Property 55: Audit entries are immutable**
    - **Validates: Requirements 17.2, 17.6**

  - [x] 4.5 Write property test for audit query scoping and ordering
    - **Property 56: Audit queries are organization-scoped and ordered**
    - **Validates: Requirements 17.3, 17.5**

- [ ] 5. Checkpoint - foundation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement authentication and sessions
  - [x] 6.1 Implement registration, login, logout, and token verification
    - `register` (valid non-duplicate email, ≥8-char password) with Argon2id hashing and no plaintext storage; `login` issuing a JWT with `exp ≤ 15 min` plus a session record; `logout` invalidating the session; `verifyAccessToken` rejecting expired/invalidated tokens; uniform non-disclosing auth errors
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.8_

  - [x] 6.2 Implement account lockout policy
    - Lock an account for ≥15 min after 5 failed attempts within a 15-minute window and reject further attempts during the lock
    - _Requirements: 3.9_

  - [x] 6.3 Implement OAuth and SSO sign-in
    - Authenticate through configured OAuth/SSO providers; deny sign-in and create no session on provider failure/unavailability
    - _Requirements: 3.5, 3.6, 3.10_

  - [x] 6.4 Write property test for registration and password hashing
    - **Property 3: Registration creates retrievable accounts without plaintext passwords**
    - **Validates: Requirements 3.1**

  - [x] 6.5 Write property test for short-lived token issuance
    - **Property 4: Login issues short-lived tokens with sessions**
    - **Validates: Requirements 3.2**

  - [x] 6.6 Write property test for non-disclosing invalid authentication
    - **Property 5: Invalid authentication is uniformly non-disclosing**
    - **Validates: Requirements 3.3, 3.8**

  - [x] 6.7 Write property test for session and token invalidation
    - **Property 6: Session and token invalidation**
    - **Validates: Requirements 3.4, 3.7**

  - [x] 6.8 Write property test for account lockout
    - **Property 7: Account lockout after repeated failures**
    - **Validates: Requirements 3.9**

  - [x] 6.9 Write unit tests for OAuth/SSO sign-in with mocked providers
    - Test success and provider-failure paths
    - _Requirements: 3.5, 3.6, 3.10_

- [x] 7. Implement API keys
  - [x] 7.1 Implement API key create, metadata, authenticate, and revoke
    - `create` returns the secret exactly once and stores only a salted hash; `getMeta` never returns the secret; `authenticate` accepts only valid non-revoked keys; `revoke` rejects subsequent use; uniform non-disclosing auth error for malformed/unrecognized/expired/revoked keys; permission-gate create/revoke
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

  - [x] 7.2 Write property test for one-time secret disclosure
    - **Property 57: API-key secrets are disclosed exactly once**
    - **Validates: Requirements 18.1, 18.2**

  - [x] 7.3 Write property test for API-key authentication and validity
    - **Property 58: API-key authentication reflects validity and permissions**
    - **Validates: Requirements 18.3, 18.4, 18.5**

  - [x] 7.4 Write property test for API-key management permission gating
    - **Property 59: API-key management is permission-gated**
    - **Validates: Requirements 18.6**

- [x] 8. Implement RBAC evaluation
  - [x] 8.1 Implement the deny-by-default AccessControl evaluator and role assignment
    - `can(ctx, action, resource)` evaluated in the organization scope that owns the resource, before any action; denied actions cause no change; `assignRole` permission-gated and membership-checked; permissions never leak across organizations; role changes govern subsequent decisions
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 26.3_

  - [x] 8.2 Write property test for owning-organization-scoped authorization
    - **Property 50: Authorization is evaluated in the owning organization's scope**
    - **Validates: Requirements 16.1, 16.3**

  - [x] 8.3 Write property test for role assignment governing decisions
    - **Property 51: Role assignment governs subsequent decisions**
    - **Validates: Requirements 16.2, 26.3**

  - [x] 8.4 Write property test for cross-organization permission isolation
    - **Property 52: Role permissions never leak across organizations**
    - **Validates: Requirements 16.4**

  - [x] 8.5 Write property test for role-management gating
    - **Property 53: Role management is permission-gated and membership-checked**
    - **Validates: Requirements 16.5, 16.6**

- [ ] 9. Checkpoint - auth and RBAC
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement organizations, teams, membership, and administration
  - [x] 10.1 Implement organization, team, and invitation services
    - `createOrg` (name 1–200) assigning the creator Administrator; `invite` creating a pending invitation expiring at +7d and rejecting malformed emails; `acceptInvitation` valid only while pending/unexpired; `createTeam` and `assignToTeam` org-scoped; deny cross-organization access
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 10.2 Implement administrative controls
    - `updateSettings` validating atomically and retaining prior settings on failure; `removeMember` revoking access within 5s; reject removing the last Administrator; deny non-Administrator administrative actions; record successful administrative actions in the Audit Log
    - _Requirements: 26.1, 26.2, 26.4, 26.5, 26.6, 26.7_

  - [x] 10.3 Write property test for organization creation and admin assignment
    - **Property 8: Organization creation validity and administrator assignment**
    - **Validates: Requirements 4.1, 4.7**

  - [x] 10.4 Write property test for invitation expiry
    - **Property 9: Invitations expire seven days after creation**
    - **Validates: Requirements 4.2, 4.8**

  - [x] 10.5 Write property test for invitation acceptance validity
    - **Property 10: Invitation acceptance is valid only while pending and unexpired**
    - **Validates: Requirements 4.3, 4.9**

  - [x] 10.6 Write property test for team scoping
    - **Property 11: Team creation and membership are organization-scoped**
    - **Validates: Requirements 4.4, 4.5**

  - [-] 10.7 Write property test for cross-organization access denial
    - **Property 12: Cross-organization access is denied**
    - **Validates: Requirements 4.6**

  - [-] 10.8 Write property test for organization settings updates
    - **Property 75: Organization settings updates are validated atomically**
    - **Validates: Requirements 26.1, 26.5**

  - [-] 10.9 Write property test for member removal revoking access
    - **Property 76: Removing a member revokes access**
    - **Validates: Requirements 26.2**

  - [ ] 10.10 Write property test for administrator-only actions
    - **Property 77: Administrative actions require Administrator role**
    - **Validates: Requirements 26.4**

  - [ ] 10.11 Write property test for last-administrator retention
    - **Property 78: An organization always retains at least one Administrator**
    - **Validates: Requirements 26.6**

- [ ] 11. Implement content hierarchy (projects, folders, workspaces)
  - [x] 11.1 Implement ContentService for projects, folders, workspaces, and video moves
    - `createProject`/`createFolder` (names 1–255) scoped to org/project with create-permission gating; enforce folder nesting depth ≤10; `moveVideo` same-org only, preserving identity/comments/transcripts/permissions and rejecting cross-org moves; `createWorkspace`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 11.2 Write property test for project/folder validity and scoping
    - **Property 13: Project and folder creation validity and scoping**
    - **Validates: Requirements 5.1, 5.2, 5.8**

  - [x] 11.3 Write property test for folder nesting depth bound
    - **Property 14: Folder nesting is bounded at depth 10**
    - **Validates: Requirements 5.3**

  - [x] 11.4 Write property test for video move preservation
    - **Property 15: Video moves preserve identity and associations within the organization**
    - **Validates: Requirements 5.4, 5.7**

  - [ ] 11.5 Write property test for create-permission enforcement
    - **Property 16: Create permission is required for projects and folders**
    - **Validates: Requirements 5.6**

- [ ] 12. Checkpoint - organizations and content
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Implement storage abstraction and provider contract
  - [x] 13.1 Implement the StorageProvider interface and routing
    - Define `put`/`get`/`signUploadTarget`/`healthCheck`; route persistence exclusively through the interface; write ack within 30s or abort with `STORAGE_ERROR` recording provider id + timestamp; activation validates config/connectivity and retains prior provider on failure; signed targets valid 60–3600s (default 900), direct-to-storage ≤15 min, expired targets rejected
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.6, 9.7, 29.3_

  - [x] 13.2 Write property test for storage round-trip byte preservation
    - **Property 27: Storage round-trip preserves object bytes**
    - **Validates: Requirements 9.1**

  - [x] 13.3 Write property test for provider activation validation
    - **Property 28: Storage provider activation validates configuration**
    - **Validates: Requirements 9.4**

  - [ ] 13.4 Write property test for signed upload credential expiry
    - **Property 29: Signed upload credentials have bounded, secure expiry**
    - **Validates: Requirements 9.6, 9.7, 29.3**

  - [x] 13.5 Write unit tests for storage write timeout/abort handling
    - Test the 30s no-ack abort and write-failure paths
    - _Requirements: 9.5_

- [ ] 14. Implement chunked and resumable uploads
  - [x] 14.1 Implement the UploadService (init, putChunk, status, complete)
    - Accept ordered chunks 1 MB–100 MB, acknowledging each; integrity-check each chunk, rejecting failures without persisting and retrying ≤3 times before aborting and discarding partial chunks; resume within 24h from the chunk after the last ack without retransmission; expire idle sessions after 24h; assemble in order into the completed Video; emit upload-progress on each ack
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ] 14.2 Write property test for chunk size validation and acknowledgment
    - **Property 18: Chunk acceptance validates size and acknowledges each received chunk**
    - **Validates: Requirements 7.1**

  - [ ] 14.3 Write property test for resumable uploads without retransmission
    - **Property 19: Interrupted uploads resume without retransmitting acknowledged chunks**
    - **Validates: Requirements 7.2**

  - [ ] 14.4 Write property test for chunk-assembly round-trip
    - **Property 20: Chunk assembly round-trip reconstructs the original media**
    - **Validates: Requirements 7.3**

  - [ ] 14.5 Write property test for bounded, non-destructive integrity failures
    - **Property 21: Chunk integrity failures are bounded and non-destructive**
    - **Validates: Requirements 7.4, 7.5**

  - [ ] 14.6 Write property test for upload session expiry
    - **Property 22: Upload sessions expire after 24 hours of inactivity**
    - **Validates: Requirements 7.6**

  - [ ] 14.7 Write property test for upload progress reporting
    - **Property 23: Upload progress reflects acknowledged chunk count**
    - **Validates: Requirements 7.7**

- [ ] 15. Implement the Recorder client capture and upload logic
  - [ ] 15.1 Implement Recorder capture, controls, and offline upload
    - Capture screen/window/region with optional camera/microphone/system audio; continue without unsupported system audio and notify; abort and retain nothing on denied permission; cursor highlighting/drawing tools and keyboard shortcuts; pause/resume retaining pre-pause media; finalize ≤10s on stop and initiate upload; persist offline stops locally and upload with ≤5 retries on reconnect
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12_

  - [ ] 15.2 Write property test for bounded offline upload retries
    - **Property 17: Offline recording upload retries are bounded**
    - **Validates: Requirements 6.11**

  - [ ] 15.3 Write unit tests for capture, pause/resume, unsupported audio, and denied permission
    - Test capture source selection, pause/resume state, system-audio-unavailable notification, denied-permission abort, and offline local storage
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 6.9, 6.10_

- [ ] 16. Implement the media processing pipeline
  - [x] 16.1 Implement the MediaPipeline worker (enqueue and process)
    - Enqueue within 5s of upload completion; produce exactly one thumbnail, a 3–10s preview, and ≥3 ABR renditions, then mark the Video ready; emit processing-status transitions (queued|processing|ready|failed) to members with access within 2s; retry ≤3 times on failure, then record failure, retain source, and emit a failure event
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ] 16.2 Write property test for required processing outputs
    - **Property 24: Processing produces the required outputs**
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.7**

  - [ ] 16.3 Write property test for processing status values
    - **Property 25: Processing status events use only defined status values**
    - **Validates: Requirements 8.5**

  - [ ] 16.4 Write property test for bounded processing failures
    - **Property 26: Processing failures are bounded and preserve the source**
    - **Validates: Requirements 8.6**

- [ ] 17. Implement streaming and playback
  - [ ] 17.1 Implement PlaybackService manifest generation
    - Provide an ABR streaming manifest within 3s if and only if the Video is ready and the requester holds view permission (or a valid share credential); deny with the appropriate error and no manifest otherwise
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ] 17.2 Write property test for playback state and authorization
    - **Property 30: Playback requires ready state and authorization**
    - **Validates: Requirements 10.1, 10.2, 10.3**

  - [ ] 17.3 Write property test for share-credential playback
    - **Property 31: Share-credential playback is granted only for valid credentials**
    - **Validates: Requirements 10.4, 10.5**

- [ ] 18. Checkpoint - media path
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Implement sharing and content permissions
  - [ ] 19.1 Implement ShareService (create, revoke, resolve) and content-permission enforcement
    - Generate globally unique share credentials; deny access at/after expiry or once revoked with no change to the Video; grant passcode-protected access only on matching passcode and lock the link ≥15 min after 5 consecutive incorrect attempts; enforce content permission on every Video/Asset/Comment/Folder read or modify with no change on denial
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_

  - [ ] 19.2 Write property test for globally unique share credentials
    - **Property 46: Share credentials are globally unique**
    - **Validates: Requirements 15.1**

  - [ ] 19.3 Write property test for share expiry and revocation
    - **Property 47: Share link expiry and revocation deny access**
    - **Validates: Requirements 15.2, 15.3**

  - [ ] 19.4 Write property test for content-permission enforcement
    - **Property 48: Content permission is required for resource access**
    - **Validates: Requirements 15.4**

  - [ ] 19.5 Write property test for passcode access and lockout
    - **Property 49: Passcode-protected share access and lockout**
    - **Validates: Requirements 15.5, 15.6, 15.7**

- [ ] 20. Implement comments, mentions, threads, and reactions
  - [ ] 20.1 Implement CommentService (post, reply, react, mention)
    - Store comments/replies only when body is 1–5000 chars and any timestamp is 0–duration (nested under parent for replies, associated with playback position when supplied); enforce comment permission; record at most one reaction of each type per member/target; create a mention notification within 2s for a mentioned member with view access
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.7, 11.8, 11.9_

  - [ ] 20.2 Write property test for comment body/timestamp validation
    - **Property 32: Comment creation validates body and timestamp**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.8, 11.9**

  - [ ] 20.3 Write property test for comment permission enforcement
    - **Property 33: Comment permission is enforced**
    - **Validates: Requirements 11.7**

  - [ ] 20.4 Write property test for mention notifications
    - **Property 34: Mentions notify members with view access**
    - **Validates: Requirements 11.4**

  - [ ] 20.5 Write property test for reaction idempotency
    - **Property 35: Reactions are idempotent per type, member, and target**
    - **Validates: Requirements 11.5**

- [ ] 21. Implement notifications
  - [x] 21.1 Implement NotificationService (create, markRead, deliverPending)
    - Create a notification within 5s recording event type, source resource, and timestamp, respecting member preferences; mark-read only for owned notifications recording a read timestamp, rejecting others with no change; retain undelivered notifications and deliver within 5s of reconnect
    - _Requirements: 12.1, 12.3, 12.4, 12.5, 12.6_

  - [ ] 21.2 Write property test for notification creation and preferences
    - **Property 37: Notification creation records required fields and respects preferences**
    - **Validates: Requirements 12.1, 12.4**

  - [ ] 21.3 Write property test for notification delivery online and after reconnect
    - **Property 38: Notification delivery online and after reconnect**
    - **Validates: Requirements 12.2, 12.5**

  - [ ] 21.4 Write property test for ownership-checked mark-read
    - **Property 39: Marking notifications read is ownership-checked**
    - **Validates: Requirements 12.3, 12.6**

- [ ] 22. Implement the Realtime_Service gateway
  - [ ] 22.1 Implement the WebSocket gateway with Redis backplane
    - Implement `join`/`leave`/`emit` over StreetJS WebSockets with a Redis pub/sub backplane for cross-node fan-out; deliver presence-join/leave and typing/typing-stopped to other relevant connected members within 2s (never the originator); start typing on activity and stop after 5s inactivity; emit presence-departure within 5s on dropped connections; deliver live comments to concurrent viewers within 2s; discard events for members with no active connection without disrupting others; carry upload-progress, processing-status, live-comment, and notification events
    - _Requirements: 11.6, 12.2, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [ ] 22.2 Write property test for live comment delivery
    - **Property 36: Live comment delivery to concurrent viewers**
    - **Validates: Requirements 11.6**

  - [ ] 22.3 Write property test for presence/typing audience targeting
    - **Property 40: Presence and typing events target the correct audience**
    - **Validates: Requirements 13.1, 13.2, 13.3**

  - [ ] 22.4 Write property test for discarding events to disconnected members
    - **Property 41: Events for disconnected members are discarded harmlessly**
    - **Validates: Requirements 13.7**

  - [ ] 22.5 Write unit tests for typing-stop timer and dropped-connection departure
    - Test the 5s typing-stop emission and dropped-connection presence-departure using in-memory transport/clock fakes
    - _Requirements: 13.5, 13.6_

- [ ] 23. Implement search and transcript search
  - [ ] 23.1 Implement SearchService with authorized scoping and pagination
    - Return, within 3s, Videos/Assets whose indexed text matches a 1–500 char query within the member's authorized scope; include transcript matches with matching playback position; validate query length rejecting empty/>500; page results at ≤100 with a retrieval cursor; return empty set on no matches
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [ ] 23.2 Write property test for matching, authorized-only results
    - **Property 42: Search returns only matching, authorized results**
    - **Validates: Requirements 14.1, 14.4**

  - [ ] 23.3 Write property test for transcript playback positions
    - **Property 43: Transcript matches include playback position**
    - **Validates: Requirements 14.2**

  - [ ] 23.4 Write property test for query length validation
    - **Property 44: Search query length is validated**
    - **Validates: Requirements 14.5**

  - [ ] 23.5 Write property test for bounded pagination
    - **Property 45: Search results are paginated with a bounded page size**
    - **Validates: Requirements 14.6**

- [ ] 24. Checkpoint - collaboration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 25. Implement the Plugin_Manager
  - [x] 25.1 Implement plugin discovery, load, enable, disable, and isolation
    - Discover/load plugins via the StreetJS loader (≤30s/plugin); enable (activate+register ≤10s) and disable (deactivate+unregister ≤10s); on activation failure leave the plugin deactivated with prior registration unchanged; on load failure record the reason, exclude the plugin, and continue others; run each plugin in an isolated context with no write access to core, denying and recording core-modification attempts
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7_

  - [x] 25.2 Write property test for activation-failure state preservation
    - **Property 66: Plugin activation failures preserve prior state**
    - **Validates: Requirements 21.3**

  - [x] 25.3 Write property test for load-failure isolation
    - **Property 67: Plugin load failures are isolated**
    - **Validates: Requirements 21.5**

  - [x] 25.4 Write unit tests for plugin sandbox enforcement
    - Test that core-modification attempts are denied and recorded
    - _Requirements: 21.6, 21.7_

- [ ] 26. Implement storage provider plugins
  - [x] 26.1 Implement Local, S3, R2, Azure Blob, GCS, and MinIO storage provider plugins
    - Implement each provider against the StorageProvider interface as a plugin; no provider imported into core
    - _Requirements: 9.2_

  - [ ] 26.2 Write the shared storage-provider conformance suite
    - Run the round-trip and signed-target properties (Properties 27, 29) against every provider plugin, against real backends where reachable and MinIO/local otherwise
    - _Requirements: 9.1, 9.6_

- [x] 27. Implement the AI capability router
  - [x] 27.1 Implement AiRouter routing to enabled provider plugins
    - Provide AI capabilities exclusively through AI_Provider plugins; route transcription/summarization/action-items/semantic-search to the enabled provider; reject AI requests within 2s with `AI_UNAVAILABLE` when none is enabled; abort on provider failure or >30s timeout; keep non-AI features unaffected; contain no vendor implementation in core
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5_

  - [x] 27.2 Write property test for AI routing and clean failure
    - **Property 68: AI requests route to the enabled provider or fail cleanly**
    - **Validates: Requirements 22.2, 22.3**

  - [x] 27.3 Write unit tests for AI provider timeout/failure handling
    - Test the >30s timeout and provider-failure abort with non-AI features continuing
    - _Requirements: 22.5_

- [x] 28. Implement the billing abstraction
  - [x] 28.1 Implement BillingGateway routing to a single enabled billing plugin
    - Expose billing exclusively through the abstraction with zero provider references in core; route to the single enabled billing plugin and return its result; reject with `BILLING_NOT_CONFIGURED` when none enabled while non-billing features/state continue; reject configuration when more than one is enabled and route nothing; on plugin failure or >30s return an error with no partial application
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5_

  - [x] 28.2 Write property test for billing routing to the single plugin
    - **Property 79: Billing operations route to the single enabled plugin**
    - **Validates: Requirements 27.2**

  - [x] 28.3 Write property test for optional, isolated billing
    - **Property 80: Billing is optional and isolated**
    - **Validates: Requirements 27.3**

  - [x] 28.4 Write property test for at-most-one billing plugin
    - **Property 81: At most one billing plugin may be enabled**
    - **Validates: Requirements 27.4**

  - [x] 28.5 Write unit tests for billing plugin failure/timeout handling
    - Test the >30s timeout and no-partial-application paths
    - _Requirements: 27.5_

- [x] 29. Implement integration plugins
  - [x] 29.1 Implement integration plugins for Slack, Discord, GitHub, GitLab, Jira, Linear, Microsoft Teams, and Notion
    - Implement each integration against the plugin contract; source-control integrations (GitHub/GitLab) expose repository/pull-request access used by Engineering Reviews
    - _Requirements: 21.8, 24.2_

- [ ] 30. Implement Developer Mode assets
  - [ ] 30.1 Implement DeveloperAssets attachments
    - Attach code snippet/markdown (1–100,000 chars), terminal recording, and API recording as Assets when Developer Mode is enabled; reject out-of-range lengths and reject all developer attachments with "Developer Mode required" when disabled, leaving the Video unchanged
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6_

  - [ ] 30.2 Write property test for developer asset validation and gating
    - **Property 69: Developer assets validate length and require Developer Mode**
    - **Validates: Requirements 23.1, 23.3, 23.5, 23.6**

- [ ] 31. Implement engineering reviews
  - [ ] 31.1 Implement ReviewService (linkPullRequest, postReviewComment)
    - Store a PR association only when the source-control plugin is enabled, the PR/repository is accessible, and the member holds link permission; store review comments at the referenced position only when body is 1–5000 chars and timestamp is 0–duration
    - _Requirements: 24.1, 24.3, 24.4, 24.5, 24.6_

  - [ ] 31.2 Write property test for PR-link plugin and permission gating
    - **Property 70: Pull-request links require an enabled plugin and permission**
    - **Validates: Requirements 24.1, 24.4, 24.6**

  - [ ] 31.3 Write property test for review comment validation
    - **Property 71: Review comments validate body and timestamp**
    - **Validates: Requirements 24.3, 24.5**

- [ ] 32. Implement the knowledge base
  - [ ] 32.1 Implement KnowledgeBase (indexTranscript, storeSummary, linkDoc)
    - Index transcript text and make it searchable within scope within 30s; store AI-produced summaries of 1–10,000 chars associated with the Video; store documentation links of 1–2048 chars with edit permission up to 100 per Video, rejecting invalid/over-cap links
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6_

  - [ ] 32.2 Write property test for transcript indexing and search
    - **Property 72: Transcript indexing makes content searchable within scope**
    - **Validates: Requirements 25.1**

  - [ ] 32.3 Write property test for summary storage bounds
    - **Property 73: Summaries are stored within bounds and associated**
    - **Validates: Requirements 25.2**

  - [ ] 32.4 Write property test for documentation link validation and cap
    - **Property 74: Documentation links validate input and enforce the per-video cap**
    - **Validates: Requirements 25.3, 25.4, 25.5, 25.6**

- [ ] 33. Checkpoint - extensibility
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 34. Implement analytics
  - [ ] 34.1 Implement AnalyticsService (recordView, aggregate)
    - Record a view event scoped to the member's organization within 5s on playback start (Video id, member id, timestamp); aggregate total views, distinct viewers, and total watch duration for a valid time range within 5s, Administrator-only, excluding other organizations; reject invalid ranges
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5_

  - [ ] 34.2 Write property test for view-event recording
    - **Property 82: View events are recorded with required fields on playback**
    - **Validates: Requirements 28.1**

  - [ ] 34.3 Write property test for analytics aggregation and org exclusion
    - **Property 83: Analytics aggregates match a reference computation and exclude other organizations**
    - **Validates: Requirements 28.2, 28.3**

  - [ ] 34.4 Write property test for admin-only, validated-range analytics
    - **Property 84: Analytics access is Administrator-only with validated ranges**
    - **Validates: Requirements 28.4, 28.5**

- [ ] 35. Implement webhooks
  - [ ] 35.1 Implement WebhookService (register, delete) and signed worker delivery
    - Store subscriptions only for supported event types with well-formed HTTPS URLs ≤2048 chars; deliver signed payloads within 30s; treat a >10s non-success as failed and retry ≤5 more times with non-decreasing backoff, then record failed; stop delivery within 60s of deletion
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7_

  - [ ] 35.2 Write property test for webhook registration validation
    - **Property 60: Webhook registration validates endpoint and event type**
    - **Validates: Requirements 19.1, 19.2**

  - [ ] 35.3 Write property test for webhook signature verification
    - **Property 61: Webhook deliveries are signed and verifiable**
    - **Validates: Requirements 19.4**

  - [ ] 35.4 Write property test for bounded delivery retries with backoff
    - **Property 62: Webhook delivery retries are bounded with backoff**
    - **Validates: Requirements 19.5, 19.6**

  - [ ] 35.5 Write property test for delivery stop on deletion
    - **Property 63: Deleting a webhook stops deliveries**
    - **Validates: Requirements 19.7**

- [ ] 36. Implement security middleware and defaults
  - [ ] 36.1 Implement rate limiting, secret handling, and auth-required middleware
    - Enforce a default 100 requests/60s rolling per-client limit rejecting excess with retry-after; store all secrets encrypted via the StreetJS secret interface, never plaintext; deny unauthenticated/invalid-auth requests to non-public endpoints with no state change
    - _Requirements: 29.1, 29.2, 29.4_

  - [ ] 36.2 Write property test for rate limiting
    - **Property 85: Rate limiting rejects excess requests with retry guidance**
    - **Validates: Requirements 29.1**

  - [ ] 36.3 Write property test for secret encryption at rest
    - **Property 86: Secrets are never persisted in plaintext**
    - **Validates: Requirements 29.2**

  - [ ] 36.4 Write property test for non-public endpoint authentication
    - **Property 87: Non-public endpoints deny unauthenticated access**
    - **Validates: Requirements 29.4**

- [ ] 37. Wire the API_Service, REST/WebSocket controllers, and SDK
  - [ ] 37.1 Assemble the API_Service host and controllers
    - Wire all domain services via StreetJS DI into REST controllers and the WebSocket gateway with the request lifecycle (rate limit → authenticate → validate → RBAC → service → audit); expose every Web_Client capability through a public REST/WebSocket/Webhook interface enforcing the same authorization as the equivalent Web_Client request
    - _Requirements: 20.1, 20.4, 20.5_

  - [ ] 37.2 Implement the SDK client
    - Provide typed client methods for every public REST and WebSocket operation; support lockstep release with contract changes and the 90-day deprecation window for breaking changes
    - _Requirements: 20.2, 20.3, 20.6_

  - [ ] 37.3 Write contract test for API/SDK parity
    - **Property 64: Public API parity and SDK coverage**
    - **Validates: Requirements 20.1, 20.2**

  - [ ] 37.4 Write property test for public-API authorization parity
    - **Property 65: Public API authorization matches web equivalents**
    - **Validates: Requirements 20.4, 20.5**

- [ ] 38. Checkpoint - API surface
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 39. Implement self-hosting, deployment, and HA operation
  - [ ] 39.1 Implement startup, health, and metrics endpoints
    - Complete startup within 60s when config is valid; expose health (reflecting dependency reachability) and metrics via the StreetJS interfaces; abort startup on missing/invalid config
    - _Requirements: 30.2, 30.3, 30.4_

  - [ ] 39.2 Implement HA operation against PostgreSQL HA and Redis Cluster
    - Operate against PostgreSQL HA and Redis Cluster via StreetJS interfaces; reconnect on primary/node loss and resume without operator restart
    - _Requirements: 30.5, 30.6_

  - [ ] 39.3 Author container images and deployment configuration
    - Provide `docker/` container images/compose and `infrastructure/` deployment configuration for self-hosting
    - _Requirements: 30.1_

  - [ ] 39.4 Write integration tests for startup/health/metrics and HA reconnection
    - Test startup/health/metrics wiring and PostgreSQL HA / Redis Cluster node-loss reconnection against real dependencies where reachable
    - _Requirements: 30.2, 30.4, 30.5, 30.6_

- [ ] 40. Author project documentation
  - [ ] 40.1 Create the required documentation set
    - Create README, ARCHITECTURE, ROADMAP, CONTRIBUTING, SECURITY, API, PLUGIN_GUIDE, MEDIA_PIPELINE, DEPLOYMENT, and DECISIONS files with content addressing each topic; document StreetJS gaps with external-issue references; record ADRs; document every public endpoint's request/response/auth/error formats; document public endpoints requiring no authentication
    - _Requirements: 1.4, 29.5, 31.1, 31.2, 31.3, 31.4_

- [ ] 41. Establish continuous integration and coverage gating
  - [ ] 41.1 Configure the CI pipeline and test categories
    - Configure CI to execute unit, integration, contract, end-to-end, performance benchmark, load, and media pipeline categories (each with ≥1 executable test) reporting a single pass/fail within 30 min, indicating the failing category, distinguishing infrastructure from test failures, and failing below 80% line coverage; run the boundary and dependency-graph checks; verify behavior against real dependencies where reachable
    - _Requirements: 32.1, 32.2, 32.3, 32.4, 32.5, 32.6_

  - [ ] 41.2 Author end-to-end and performance/load/media-pipeline tests
    - E2E flow (register → org → invite/accept → project/folder → record → chunked upload → pipeline → ready → playback → comment → mention → share access) driven exclusively through the public API/SDK; latency-budget benchmarks; concurrent-upload/realtime-fanout/webhook load tests; media pipeline transcode/thumbnail/preview tests
    - _Requirements: 32.1, 32.4_

- [ ] 42. Final checkpoint - full suite
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references the specific requirements clauses (and, for test tasks, the numbered correctness property) it implements for traceability.
- Property-based tests use `fast-check` with a minimum of 100 iterations and are tagged `Feature: streetstudio, Property N`. Determinism-sensitive properties (realtime, timing) use in-memory transport/clock fakes.
- All 88 correctness properties from the design are covered by the property/contract test sub-tasks above.
- Checkpoints ensure incremental validation at natural boundaries.
- StreetJS is consumed only through public package entry points; cross-package imports use declared entry points only.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "2.1", "2.2"] },
    { "id": 2, "tasks": ["1.3", "1.5", "3.1", "25.1"] },
    { "id": 3, "tasks": ["3.2", "4.1", "25.2", "25.3", "25.4"] },
    { "id": 4, "tasks": ["4.2", "6.1", "6.2", "6.3", "27.1", "28.1", "29.1"] },
    { "id": 5, "tasks": ["4.3", "4.4", "4.5", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9", "7.1", "8.1", "27.2", "27.3", "28.2", "28.3", "28.4", "28.5"] },
    { "id": 6, "tasks": ["7.2", "7.3", "7.4", "8.2", "8.3", "8.4", "8.5", "10.1", "11.1", "13.1"] },
    { "id": 7, "tasks": ["10.2", "10.3", "10.4", "10.5", "10.6", "10.7", "10.8", "10.9", "10.10", "10.11", "11.2", "11.3", "11.4", "11.5", "13.2", "13.3", "13.4", "13.5", "14.1", "16.1", "21.1", "26.1"] },
    { "id": 8, "tasks": ["14.2", "14.3", "14.4", "14.5", "14.6", "14.7", "15.1", "16.2", "16.3", "16.4", "17.1", "19.1", "20.1", "21.2", "21.3", "21.4", "22.1", "23.1", "26.2", "30.1", "31.1", "32.1", "34.1"] },
    { "id": 9, "tasks": ["15.2", "15.3", "17.2", "17.3", "19.2", "19.3", "19.4", "19.5", "20.2", "20.3", "20.4", "20.5", "22.2", "22.3", "22.4", "22.5", "23.2", "23.3", "23.4", "23.5", "30.2", "31.2", "31.3", "32.2", "32.3", "32.4", "34.2", "34.3", "34.4", "35.1", "36.1"] },
    { "id": 10, "tasks": ["35.2", "35.3", "35.4", "35.5", "36.2", "36.3", "36.4", "37.1", "37.2", "39.1", "39.2", "39.3"] },
    { "id": 11, "tasks": ["37.3", "37.4", "39.4", "40.1", "41.1"] },
    { "id": 12, "tasks": ["41.2"] }
  ]
}
```
