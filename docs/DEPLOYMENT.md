# Deployment

StreetStudio is self-hostable so operators retain data ownership and control
(Requirement 30). Container images and deployment configuration live under
[`docker/`](../docker) and [`infrastructure/`](../infrastructure). This document
is the operator guide; the deep HA reference is in
[`infrastructure/README.md`](../infrastructure/README.md).

## Components

A running deployment consists of:

- **API_Service** (`apps/api`) — stateless REST + WebSocket + Webhook host.
- **Background workers** — the media pipeline, webhook delivery retries,
  notification fan-out, and the scheduler. Same build artifact as the API,
  selected at runtime via `STREETSTUDIO_ROLE=worker`.
- **PostgreSQL** — primary datastore (StreetJS PostgreSQL access).
- **Redis** — sessions, rate limiting, the realtime backplane, and job queues.
- **Object storage** — S3-compatible media store (MinIO in the provided stack;
  swappable for any S3-compatible provider or another storage plugin).

## Container images

`docker/Dockerfile` is a multi-stage Node 20 build over the npm workspace with
role targets: `api`, `worker`, `web`, and `docs`. The build context is the
repository root so the whole workspace can be installed and compiled with
`tsc -b`, then pruned to production dependencies for a minimal runtime image
that runs as the non-root `node` user.

## Quick start (single host)

```bash
cp docker/.env.example docker/.env
# edit docker/.env: set INSTANCE_ID, AUTH_JWT_SECRET, and the passwords
docker compose -f docker/docker-compose.yml up -d
```

The compose stack brings up the API, workers, PostgreSQL, Redis, MinIO, and a
one-shot job that creates the media bucket. The API health check allows up to
60 seconds for startup.

## Configuration

All runtime configuration flows through `packages/config`. Environment variables
map to schema keys. The API_Service validates all required configuration at
startup and **aborts with a named list of any missing/invalid values** (R30.3);
when configuration is valid, startup completes and `/health` reports passing
within 60 seconds (R30.2).

| Env var                             | Config key                        | Required | Default |
| ----------------------------------- | --------------------------------- | -------- | ------- |
| `INSTANCE_ID`                       | `instanceId` (UUID)               | yes      | —       |
| `DATABASE_URL`                      | `database.url`                    | yes      | —       |
| `REDIS_URL`                         | `redis.url`                       | yes      | —       |
| `AUTH_JWT_SECRET`                   | `auth.jwtSecret` (>= 32 chars)    | yes      | —       |
| `HTTP_PORT`                         | `http.port`                       | yes      | —       |
| `HTTP_PUBLIC_BASE_URL`              | `http.publicBaseUrl`              | yes      | —       |
| `STORAGE_*`                         | `storage.*` (endpoint/bucket/creds) | yes    | —       |
| `STORAGE_SIGNED_UPLOAD_TTL_SECONDS` | `storage.signedUploadTtlSeconds`  | no       | `900`   |
| `RATE_LIMIT_PER_WINDOW`             | `rateLimit.perWindow`             | no       | `100`   |
| `RATE_LIMIT_WINDOW_SECONDS`         | `rateLimit.windowSeconds`         | no       | `60`    |

See [`docker/.env.example`](../docker/.env.example) for the full annotated list.
Secrets are supplied only as environment placeholders — never commit real
values. In production, source them from your secret manager; StreetStudio stores
secrets encrypted via the StreetJS secret interface (R29.2). See
[SECURITY](./SECURITY.md).

## Health and metrics (R30.4)

The API exposes a health check and a metrics endpoint through the StreetJS
interfaces. The health endpoint returns a **passing** status when all required
dependencies (PostgreSQL, Redis, object storage) are reachable and a **failing**
status when any required dependency is unreachable. Use `/health` for
readiness/liveness probes; allow up to 60 seconds for startup.

## Scaling out

The API_Service is stateless — all shared state lives in PostgreSQL, Redis, and
object storage — so it scales horizontally. Run multiple `api` and `worker`
replicas; each replica needs a distinct `INSTANCE_ID` but otherwise shares the
same configuration.

```bash
docker compose -f docker/docker-compose.yml up -d --scale api=3 --scale worker=2
```

When running more than one API replica, remove the single-host `ports` mapping
and front the replicas with a load balancer.

## High availability (R30.5, R30.6)

StreetStudio reaches PostgreSQL and Redis exclusively through StreetJS
interfaces, which support HA. HA is enabled purely by configuration — no code
changes.

- **PostgreSQL HA** — run a primary+replica cluster with automatic failover
  (Patroni, a managed offering, or a Kubernetes operator) and point
  `DATABASE_URL` at the failover-aware endpoint. On primary loss the API
  reconnects through the StreetJS HA interface and resumes without an operator
  restart (R30.6).
- **Redis Cluster** — run Redis in Cluster mode and point `REDIS_URL` at it; the
  StreetJS Redis interface is cluster-aware. On node loss the API reconnects and
  resumes without a restart (R30.6).
- **Object storage** — use a replicated/HA object store (distributed MinIO or a
  managed S3-compatible service).

## Deployment targets

- **Docker Compose** — single host or small self-hosted deployments (provided in
  `docker/docker-compose.yml`).
- **Kubernetes** — run the `api` and `worker` images as separate Deployments,
  back them with managed/HA PostgreSQL, Redis Cluster, and S3-compatible
  storage, and wire config via a `ConfigMap` + `Secret`. Use `/health` for
  readiness/liveness probes (allow up to 60s for startup).

For the full HA reference and the env→config mapping, see
[`infrastructure/README.md`](../infrastructure/README.md).
