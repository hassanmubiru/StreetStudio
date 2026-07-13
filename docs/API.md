# API Reference

This document is the public API reference for the StreetStudio API_Service. It
documents, for every public endpoint, the request format, the response format,
the authentication requirement, and the error responses returned on failure
(Requirement 31.3).

The single source of truth for the catalog of public operations is
`apps/api/src/http/operations.ts` (`PUBLIC_OPERATIONS`). The SDK
(`@streetstudio/sdk`) mirrors this catalog one-for-one, and a contract test
diffs the two surfaces so they cannot drift. When a public endpoint is added,
removed, or changed, update the catalog and this document together
(Requirement 31.4).

## Base URL and versioning

All REST routes are served relative to the configured public base URL
(`http.publicBaseUrl`, e.g. `http://localhost:8080`). Route templates below use
`:param` for path parameters.

## Authentication

Requests authenticate with one of:

- **JWT access token** — `Authorization: Bearer <token>`. Issued by
  `POST /auth/login`, expires within 15 minutes, and is backed by a live,
  non-revoked session.
- **API key** — an organization-scoped key created via `POST /api-keys`. The
  plaintext secret is returned exactly once at creation and is never retrievable
  afterward.

Each operation declares one authorization policy, applied uniformly regardless
of the channel or client:

| Policy          | Meaning                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------- |
| `public`        | Reachable with **no authentication** (explicitly allow-listed). See the section below.    |
| `authenticated` | Any authenticated principal; the resource is scoped to the principal itself.              |
| `rbac(action)`  | Authenticated principal whose Role in the owning Organization grants `action`; deny-by-default. |

A request that is unauthenticated or presents invalid authentication against a
non-public endpoint is denied with `AUTHENTICATION_REQUIRED` / `AUTHENTICATION_FAILED`
and performs no state change (R29.4).

## Public endpoints requiring NO authentication (R29.5)

The following network-exposed endpoints are public and require no
authentication. These are the only entries whose authorization policy is
`public` in `PUBLIC_OPERATIONS`. Every other endpoint requires authentication.

| Operation         | Method | Path              | Notes                                                        |
| ----------------- | ------ | ----------------- | ------------------------------------------------------------ |
| `auth.register`   | POST   | `/auth/register`  | Create a Member account.                                     |
| `auth.login`      | POST   | `/auth/login`     | Exchange credentials for a JWT access token + session.       |
| `sharing.resolve` | POST   | `/shared/resolve` | Resolve a shared video using a public share credential (and passcode when required); carries no org scope. |

## Error responses

All errors share a single wire representation (`ErrorDto`, from
`packages/shared/src/errors.ts`), returned on every surface (REST, WebSocket,
SDK). Messages are deliberately non-disclosing.

```json
{
  "code": "AUTHORIZATION_DENIED",
  "category": "authorization",
  "status": 403,
  "message": "Access is denied.",
  "details": { "field": "..." },
  "retryAfterSeconds": 30
}
```

`details` and `retryAfterSeconds` are optional. `retryAfterSeconds` is present
on rate-limit errors and indicates when the client may retry (R29.1).

### Error catalog

| Code                        | Category                | HTTP | Meaning                                                    |
| --------------------------- | ----------------------- | ---- | ---------------------------------------------------------- |
| `VALIDATION_FAILED`         | validation              | 400  | The request was invalid.                                   |
| `REGISTRATION_FAILED`       | validation              | 400  | Registration could not be completed (uniform result).      |
| `CONFIGURATION_INVALID`     | validation              | 500  | The service configuration is invalid.                      |
| `STORAGE_CONFIG_INVALID`    | validation              | 400  | The storage provider configuration is invalid.             |
| `AUTHENTICATION_REQUIRED`   | authentication          | 401  | Authentication is required.                                |
| `AUTHENTICATION_FAILED`     | authentication          | 401  | Authentication failed (uniform for all credential errors). |
| `AUTHORIZATION_DENIED`      | authorization           | 403  | Access is denied.                                          |
| `NOT_FOUND`                 | not_found               | 404  | Resource not found (or hidden to avoid disclosure).        |
| `RESOURCE_GONE`             | gone                    | 410  | Resource no longer available.                              |
| `SIGNED_TARGET_EXPIRED`     | gone                    | 410  | The upload target has expired.                             |
| `SHARE_LINK_EXPIRED`        | gone                    | 410  | The share link is no longer valid.                         |
| `INVITATION_INVALID`        | gone                    | 410  | The invitation is no longer valid.                         |
| `CONFLICT`                  | conflict                | 409  | The request conflicts with the current state.              |
| `VIDEO_NOT_READY`           | conflict                | 409  | The video is not available for playback.                   |
| `DEVELOPER_MODE_REQUIRED`   | conflict                | 409  | Developer Mode is required for this action.                |
| `RATE_LIMITED`              | rate_limit              | 429  | Too many requests; includes `retryAfterSeconds`.           |
| `SHARE_LINK_LOCKED`         | rate_limit              | 429  | Share link temporarily locked after failed attempts.       |
| `CAPABILITY_UNAVAILABLE`    | capability_unavailable  | 503  | The requested capability is not available.                 |
| `AI_UNAVAILABLE`            | capability_unavailable  | 503  | No AI provider is available for this capability.           |
| `BILLING_NOT_CONFIGURED`    | capability_unavailable  | 503  | Billing is not configured.                                 |
| `STORAGE_ERROR`             | capability_unavailable  | 502  | The storage provider could not complete the operation.     |
| `UPLOAD_CHUNK_SIZE_INVALID` | upload                  | 400  | Chunk size outside the accepted range (1 MB–100 MB).       |
| `UPLOAD_CHUNK_INVALID`      | upload                  | 422  | The upload chunk failed its integrity check.               |
| `UPLOAD_FAILED`             | upload                  | 422  | The upload could not be completed.                         |
| `UPLOAD_SESSION_EXPIRED`    | upload                  | 410  | The upload session has expired.                            |

Common error responses for any authenticated endpoint: `VALIDATION_FAILED`
(400) on malformed input, `AUTHENTICATION_REQUIRED`/`AUTHENTICATION_FAILED`
(401) on missing/invalid credentials, `AUTHORIZATION_DENIED` (403) when RBAC
denies the action, `NOT_FOUND` (404) when the resource is absent or hidden, and
`RATE_LIMITED` (429) when the per-client limit is exceeded.

## Endpoint catalog

Below, every public operation is listed with its channel, method, path, and
authorization. Request bodies are JSON; successful responses return the created
or requested resource as JSON (`201` for creation, `200` for reads/updates,
`204` for deletions unless a body is noted).

### Authentication & current session

| Operation            | Method | Path             | Auth            |
| -------------------- | ------ | ---------------- | --------------- |
| `auth.register`      | POST   | `/auth/register` | public          |
| `auth.login`         | POST   | `/auth/login`    | public          |
| `auth.logout`        | POST   | `/auth/logout`   | authenticated   |
| `auth.currentMember` | GET    | `/auth/me`       | authenticated   |

- **`POST /auth/register`** — body `{ email, password }` (email syntactically
  valid and non-duplicate; password ≥ 8 chars). Returns the created Member on
  success. On duplicate/invalid input returns `REGISTRATION_FAILED` (uniform, so
  existence of an email is never disclosed).
- **`POST /auth/login`** — body `{ email, password }`. Returns a JWT access
  token (≤ 15 min) and creates a session. Invalid credentials return
  `AUTHENTICATION_FAILED` without revealing which credential was wrong.
- **`POST /auth/logout`** — invalidates the caller's session; subsequent
  requests presenting it are rejected.
- **`GET /auth/me`** — returns the current authenticated Member.

### Organizations, membership, roles, invitations

| Operation                   | Method | Path                             | Auth                       |
| --------------------------- | ------ | -------------------------------- | -------------------------- |
| `organizations.create`      | POST   | `/organizations`                 | authenticated              |
| `organizations.list`        | GET    | `/organizations`                 | authenticated              |
| `organizations.get`         | GET    | `/organizations/:id`             | rbac `org:read`            |
| `organizations.update`      | PATCH  | `/organizations/:id`             | rbac `org:update`          |
| `organizations.listMembers` | GET    | `/organizations/:id/members`     | rbac `org:read_members`    |
| `organizations.listRoles`   | GET    | `/organizations/:id/roles`       | rbac `org:read_roles`      |
| `organizations.invite`      | POST   | `/organizations/:id/invitations` | rbac `org:invite`          |

Creating an organization assigns the creator the Administrator role. Invitations
expire 7 days after creation (`INVITATION_INVALID` when consumed after expiry).

### Projects

| Operation         | Method | Path            | Auth                 |
| ----------------- | ------ | --------------- | -------------------- |
| `projects.create` | POST   | `/projects`     | rbac `project:create`|
| `projects.list`   | GET    | `/projects`     | rbac `project:read`  |
| `projects.get`    | GET    | `/projects/:id` | rbac `project:read`  |
| `projects.update` | PATCH  | `/projects/:id` | rbac `project:update`|
| `projects.delete` | DELETE | `/projects/:id` | rbac `project:delete`|

### Folders

| Operation             | Method | Path           | Auth                |
| --------------------- | ------ | -------------- | ------------------- |
| `folders.create`      | POST   | `/folders`     | rbac `folder:create`|
| `folders.get`         | GET    | `/folders/:id` | rbac `folder:read`  |
| `folders.listByProject` | GET  | `/folders`     | rbac `folder:read`  |
| `folders.move`        | PATCH  | `/folders/:id` | rbac `folder:update`|
| `folders.delete`      | DELETE | `/folders/:id` | rbac `folder:delete`|

Folder nesting is capped at depth 10; exceeding it returns `VALIDATION_FAILED`.

### Videos

| Operation          | Method | Path                       | Auth               |
| ------------------ | ------ | -------------------------- | ------------------ |
| `videos.list`      | GET    | `/videos`                  | rbac `video:read`  |
| `videos.get`       | GET    | `/videos/:id`              | rbac `video:read`  |
| `videos.update`    | PATCH  | `/videos/:id`              | rbac `video:update`|
| `videos.delete`    | DELETE | `/videos/:id`              | rbac `video:delete`|
| `videos.transcript`| GET    | `/videos/:id/transcript`   | rbac `video:read`  |
| `videos.summary`   | GET    | `/videos/:id/summary`      | rbac `video:read`  |

`videos.summary` may return `AI_UNAVAILABLE` (503) when no AI provider is
configured; other video features continue to work.

### Chunked uploads

| Operation          | Method | Path                    | Auth                |
| ------------------ | ------ | ----------------------- | ------------------- |
| `uploads.create`   | POST   | `/uploads`              | rbac `upload:create`|
| `uploads.get`      | GET    | `/uploads/:id`          | rbac `upload:read`  |
| `uploads.complete` | POST   | `/uploads/:id/complete` | rbac `upload:write` |
| `uploads.abort`    | POST   | `/uploads/:id/abort`    | rbac `upload:write` |

Chunks are 1 MB–100 MB and integrity-checked. Invalid size returns
`UPLOAD_CHUNK_SIZE_INVALID`; a failed integrity check returns
`UPLOAD_CHUNK_INVALID` and does not persist. Sessions expire after 24h idle
(`UPLOAD_SESSION_EXPIRED`). See [MEDIA_PIPELINE](./MEDIA_PIPELINE.md).

### Comments & reactions

| Operation          | Method | Path                        | Auth                  |
| ------------------ | ------ | --------------------------- | --------------------- |
| `comments.list`    | GET    | `/videos/:videoId/comments` | rbac `comment:read`   |
| `comments.create`  | POST   | `/videos/:videoId/comments` | rbac `comment:create` |
| `comments.delete`  | DELETE | `/comments/:id`             | rbac `comment:delete` |
| `comments.react`   | POST   | `/reactions`                | rbac `reaction:create`|
| `comments.unreact` | DELETE | `/reactions`                | rbac `reaction:delete`|

### Playback & views

| Operation             | Method | Path                        | Auth              |
| --------------------- | ------ | --------------------------- | ----------------- |
| `playback.manifest`   | GET    | `/videos/:videoId/playback` | rbac `video:read` |
| `playback.recordView` | POST   | `/videos/:videoId/views`    | rbac `video:view` |

Playback requires view permission or a valid share credential; otherwise no
manifest is returned. A video that is still processing returns `VIDEO_NOT_READY`.

### Search

| Operation       | Method | Path             | Auth              |
| --------------- | ------ | ---------------- | ----------------- |
| `search.videos` | GET    | `/search/videos` | rbac `video:read` |

Results are always filtered to the caller's authorized scope and paginated at
most 100 per page.

### Sharing

| Operation         | Method | Path                          | Auth                |
| ----------------- | ------ | ----------------------------- | ------------------- |
| `sharing.create`  | POST   | `/videos/:videoId/share-links`| rbac `share:create` |
| `sharing.get`     | GET    | `/share-links/:id`            | rbac `share:read`   |
| `sharing.revoke`  | DELETE | `/share-links/:id`            | rbac `share:revoke` |
| `sharing.resolve` | POST   | `/shared/resolve`             | **public**          |

`sharing.resolve` accepts a public share credential (and passcode when
required). Expired links return `SHARE_LINK_EXPIRED`; after 5 consecutive
incorrect passcodes the link locks for at least 15 minutes (`SHARE_LINK_LOCKED`).

### Notifications & preferences (personal scope)

| Operation                       | Method | Path                          | Auth          |
| ------------------------------- | ------ | ----------------------------- | ------------- |
| `notifications.list`            | GET    | `/notifications`              | authenticated |
| `notifications.markRead`        | POST   | `/notifications/:id/read`     | authenticated |
| `notifications.listPreferences` | GET    | `/notifications/preferences`  | authenticated |
| `notifications.updatePreference`| PUT    | `/notifications/preferences`  | authenticated |

### Outbound webhook subscriptions

| Operation        | Method | Path            | Auth                 |
| ---------------- | ------ | --------------- | -------------------- |
| `webhooks.create`| POST   | `/webhooks`     | rbac `webhook:create`|
| `webhooks.list`  | GET    | `/webhooks`     | rbac `webhook:read`  |
| `webhooks.delete`| DELETE | `/webhooks/:id` | rbac `webhook:delete`|

Deliveries are signed, time out after 10s, and retry up to 5 additional times
with non-decreasing backoff before being recorded as failed.

### API keys

| Operation        | Method | Path            | Auth                |
| ---------------- | ------ | --------------- | ------------------- |
| `apiKeys.create` | POST   | `/api-keys`     | rbac `apikey:create`|
| `apiKeys.list`   | GET    | `/api-keys`     | rbac `apikey:read`  |
| `apiKeys.revoke` | DELETE | `/api-keys/:id` | rbac `apikey:revoke`|

The plaintext secret is returned only in the `apiKeys.create` response; later
reads return metadata only.

### Analytics

| Operation           | Method | Path                 | Auth                  |
| ------------------- | ------ | -------------------- | --------------------- |
| `analytics.metrics` | GET    | `/analytics/metrics` | rbac `analytics:read` |

Analytics never include data from other organizations and require a valid time
range (end must not precede start); malformed ranges return `VALIDATION_FAILED`.

### Realtime (WebSocket)

| Operation          | Channel   | Path        | Auth          |
| ------------------ | --------- | ----------- | ------------- |
| `realtime.connect` | websocket | `/realtime` | authenticated |

A single authenticated realtime channel delivers server-pushed events (new
comments, processing status, notifications, presence/typing). Errors use the
same `ErrorDto` shape as REST.

## Keeping this document in sync

`PUBLIC_OPERATIONS` in `apps/api/src/http/operations.ts` is authoritative. Any
change to a public endpoint (add/remove/change) must update both the catalog and
this document (R31.4). The API↔SDK parity contract test guards drift between the
catalog and the SDK surface.
