# Security

StreetStudio is secure by default: protections apply without extra
configuration (Requirement 29). This document describes the security model, the
defaults in force, and how to report a vulnerability.

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.
Open a GitHub security advisory on the repository, or contact the maintainers
through the private channel listed in the repository profile. Include:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- affected version/commit.

We aim to acknowledge reports promptly and coordinate disclosure. Do not
exploit a vulnerability beyond what is necessary to demonstrate it, and do not
access or modify data that is not yours.

## Authentication

- Passwords are hashed with **Argon2id**; the stored credential is never the
  plaintext password. Registration returns a uniform result for duplicate or
  invalid input (`REGISTRATION_FAILED`) so an email's existence is never
  disclosed (R3.8).
- Successful login issues a **JWT access token that expires within 15 minutes**
  and is backed by a live, non-revoked session record. Sign-out invalidates the
  session; tokens referencing a revoked session are rejected.
- Invalid credentials — wrong password, unknown email, expired/invalid token,
  locked account, invalid/revoked API key — all return a single uniform
  `AUTHENTICATION_FAILED` error that never reveals which credential was
  incorrect (R3.3).
- OAuth and SSO are supported where configured; provider failures deny sign-in
  and create no session.

## Authorization (RBAC, deny-by-default)

- Every authenticated read/modify request is evaluated against the requesting
  Member's Role permissions **in the owning Organization's scope** before the
  action runs. Access is denied unless a Role explicitly grants the required
  action (deny-by-default).
- Roles are scoped to their organization and never leak across organizations.
- A public API request is subject to the identical authorization as the
  equivalent Web_Client request, because the composition root applies the same
  policy regardless of channel or client (R20.4).
- On denial, the request performs **no state change**, returns
  `AUTHORIZATION_DENIED` (403), and an authorization-denial entry is appended to
  the append-only audit log.

## Public endpoints

Only three network-exposed endpoints require no authentication:
`POST /auth/register`, `POST /auth/login`, and `POST /shared/resolve`. These are
allow-listed in `apps/api/src/http/operations.ts` (`authz.kind === "public"`)
and documented as public in [API.md](./API.md) (R29.5). Every other endpoint
requires authentication; unauthenticated or invalid-auth requests to a
non-public endpoint are denied with no state change (R29.4).

## Secure defaults (Requirement 29)

- **Rate limiting** — default 100 requests per 60-second rolling window per
  client. Excess requests are rejected with `RATE_LIMITED` (429) and a
  `retryAfterSeconds` hint indicating when the client may retry (R29.1).
  Configurable via `rateLimit.perWindow` / `rateLimit.windowSeconds`.
- **Secret management** — all secrets are stored encrypted via the StreetJS
  secret interface and are never persisted in plaintext (R29.2).
- **Signed upload credentials** — credentials issued for direct-to-storage
  uploads expire within 15 minutes of issuance. The general signed-target TTL
  is bounded 60–3600 seconds, defaulting to 900 (R29.3, R9.6). Expired targets
  are rejected with `SIGNED_TARGET_EXPIRED` (R9.7).
- **Non-disclosing errors** — the shared error taxonomy
  (`packages/shared/src/errors.ts`) uses generic messages that never reveal
  internal state, which credential was wrong, or whether an account, email, or
  API key exists. Sensitive `cause` data is retained for server-side logging
  only and is never serialized.

## API keys

Organization-scoped API keys store only a salted hash of the secret. The
plaintext secret is returned exactly once at creation and is never retrievable
afterward. Keys can be revoked and are subject to the same RBAC as the
equivalent session-authenticated request.

## Sharing

Share links can require a passcode. After 5 consecutive incorrect passcode
attempts, a link locks for at least 15 minutes (`SHARE_LINK_LOCKED`). Expired
links return `SHARE_LINK_EXPIRED`. Resolving a shared video enforces the share
credential and never exposes org-scoped data beyond the shared resource.

## Audit logging

An append-only audit log (`packages/database`) records authentication events,
authorization denials, sharing changes, and administrative actions, providing a
tamper-evident trail for security review.

## Tenant isolation

All tenant-scoped tables carry and are indexed on `organization_id`. Domain
queries filter by organization, and analytics never include data from other
organizations. RBAC, search, and sharing all enforce scope so cross-tenant
access is not possible through any surface.

## Plugin isolation

Plugins run in an isolated context with no write access to core code. Attempts
to modify core are denied and recorded. A plugin that fails to load is recorded
and excluded while other plugins continue. See [PLUGIN_GUIDE](./PLUGIN_GUIDE.md).

## Build-time boundary safety

Three build-time boundary checks (StreetJS boundary, package boundary, AI/billing
vendor boundary) fail the build on disallowed imports, preventing accidental
coupling to framework internals or hardcoded vendors. See
[ARCHITECTURE](./ARCHITECTURE.md).
