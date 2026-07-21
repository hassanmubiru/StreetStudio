# @streetstudio/identity

Real member registration/login (Argon2id) and JWT issuance on StreetJS, plus the
shared auth helpers product APIs use to authenticate requests.

## Why it exists

Every product API authenticates the acting member. This package owns that: it
registers members (Argon2id-hashed passwords in real PostgreSQL), verifies
credentials, issues JWTs via the StreetJS `JwtService`, and exposes the shared
`jwtAuth` / `requireActor` helpers so each slice authenticates identically
instead of duplicating the wiring.

## What problem it solves

- Real credentials: Argon2id password hashing (`argon2`), real member store.
- Real sessions: signed JWTs (`sub` = member id) with a bounded lifetime.
- Non-disclosing auth: unknown email and wrong password both return 401.
- One shared auth path (`requireActor`, `jwtAuth`) across all product APIs.

## What it exposes publicly (`src/index.ts`)

- `jwtAuth(secret)`, `requireActor(ctx)`, `Actor` — shared auth helpers.
- `Member`, `normalizeEmail`, `assertPasswordPolicy` — domain.
- `hashPassword` / `verifyPassword` — Argon2id.
- `IdentityService` — register / login (JWT issuance).
- `MemberRepository`, `ensureIdentitySchema` — real PostgreSQL persistence.
- `IdentityController`, `createIdentityApp`, `registerIdentity` — public auth API.

## What it depends on

- `streetjs` — HTTP/DI, `PgPool`, `JwtService`, `authMiddleware`, exceptions.
- `argon2` — Argon2id password hashing (crypto primitive; the framework does not
  expose password hashing).
- `@streetstudio/shared` — `Uuid` / `IsoTimestamp`.

## HTTP surface (public — no auth)

```
POST /auth/register   { email, password }        → 201 { member }
POST /auth/login      { email, password }         → 200 { token, member }
```

Other product APIs apply `jwtAuth(secret)` and send `Authorization: Bearer
<token>` + `X-Organization-Id`.

## Tests

- `identity.test.ts` — unit + property: Argon2id hash/verify, email/password
  policy validation.
- `identity.integration.test.ts` — register → login over real HTTP against real
  Postgres (duplicate → 409, wrong password / unknown email → 401, verified token
  carries the member id). Runs when `STREETSTUDIO_IT_DATABASE_URL` is set.
