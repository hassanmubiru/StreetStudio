# @streetjs/security — secure defaults, rate limiting, secret encryption, error taxonomy

- **Package:** `@streetjs/security`
- **Consumers (StreetStudio):** API middleware, auth, storage credentials, all surfaces
- **Depends on:** `@streetjs/core`, `@streetjs/cache` (for distributed rate limits)
- **Wave:** 1 (kernel)

## Motivation

StreetStudio needs consistent, non-disclosing error handling, per-client rate
limiting, and encrypted secret storage across every surface. These are
cross-cutting platform concerns.

## Required API surface

- Error taxonomy: stable machine-readable codes, non-disclosing messages, optional `retryAfterSeconds`, `details`.
- `RateLimiter` — per-key limits with a backing store (in-memory or `@streetjs/cache`); returns allow/deny + retry guidance.
- Secret encryption: `encryptSecret`/`decryptSecret` with key management; secrets never persisted in plaintext.
- Security middleware factory for the HTTP pipeline (rate limit + standard headers).

## Acceptance criteria

- [ ] Every error maps to a stable code; messages never leak internal detail (stack, SQL, paths).
- [ ] Rate limiter denies over-limit requests and returns a retry-after; limits are enforced across instances when backed by cache.
- [ ] Encrypted secrets round-trip; ciphertext is not reversible without the key; plaintext never touches storage/logs.
- [ ] Deterministic, testable given an injected clock and store.

## Non-goals

- No auth/session logic (that is `@streetjs/auth`); no authorization (that is `@streetjs/rbac`).
