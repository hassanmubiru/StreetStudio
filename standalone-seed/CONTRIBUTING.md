# Contributing to StreetStudio

StreetStudio is the flagship product built on StreetJS. Contributions are held to
the standard in [`docs/PRODUCTION_CHARTER`](../docs/PRODUCTION_CHARTER.md) (copied
into `docs/` during migration) and [`docs/ENGINEERING_PRINCIPLES.md`](docs/ENGINEERING_PRINCIPLES.md).

## Ground rules

1. **Compose StreetJS; never reimplement it.** Depend only on published
   `@streetjs/*` public APIs (ADR-0001). If a capability is missing, file/extend a
   [framework requirement](docs/framework-requirements/) and pause the feature —
   do not build the framework here.
2. **No fakes in production code.** No mock data, placeholder implementations,
   stub services, or simulated infrastructure outside automated tests. Real
   PostgreSQL, Redis, object storage, FFmpeg, WebSockets, etc.
3. **Domain-first, vertical slices.** New work lands as a complete slice
   (domain → persistence → API → SDK → tests), organized by domain (ADR-0002/0003).
4. **Product vocabulary.** Public API and UI speak `Recording`/`Review`/`Share`,
   not framework plumbing terms.

## Definition of done

Every change must:

- [ ] compile (`pnpm build`) and pass typecheck;
- [ ] pass tests (`pnpm test`) — unit + property (where valuable) + integration
      against real infrastructure;
- [ ] pass `pnpm lint`;
- [ ] pass architecture gates: `pnpm graph:check`, `pnpm boundary:check`,
      `pnpm streetjs:check`;
- [ ] meet the coverage goal;
- [ ] update the package `README.md` (why / problem / public surface / deps) and
      add an ADR for any significant architectural decision;
- [ ] introduce no placeholder/mock production code; record any blocker in the
      dependency register (`MIGRATION.md`).

## Local development

```bash
pnpm install
pnpm dev:infra          # start PostgreSQL, Redis, MinIO, MailHog
cp .env.example .env    # fill SESSION_SECRET / JWT_SIGNING_KEY (openssl rand -base64 48)
pnpm test
```

## Commits & branches

- Work on feature branches; never push directly to `main`.
- Keep PRs scoped to a single slice or concern; describe what was built, what was
  tested, and any blocked/paused features with their recorded dependency.
