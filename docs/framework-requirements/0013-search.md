# @streetjs/search — indexing & query

- **Package:** `@streetjs/search`
- **Consumers (StreetStudio):** video/content search, transcript search
- **Depends on:** `@streetjs/core`; a real index backend (Postgres FTS or a search engine)
- **Wave:** 4 (domain infra)

## Motivation

StreetStudio searches real persisted content and stored transcripts with
authorization enforced. The indexing/query engine is generic platform
infrastructure; StreetStudio supplies what to index and the authorization scope.

## Required API surface

- `index(document)` / `remove(id)` with typed document schemas.
- `query(request)` with pagination (bounded page size) and ranking.
- Authorization hook so results are filtered to what the requester may see.
- Transcript-oriented querying returning match positions/offsets.

## Acceptance criteria

- [ ] Indexed documents are retrievable by query; removed documents stop appearing.
- [ ] Pagination is bounded and stable; page size cannot exceed the configured max.
- [ ] Results exclude content the requester is not authorized to see.
- [ ] Transcript queries return correct positional matches.
- [ ] Integration tests run against the real index backend.

## Non-goals

- No transcript generation (that is media/AI); no product content model.
