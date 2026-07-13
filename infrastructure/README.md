# StreetStudio Infrastructure & Self-Hosting

Deployment configuration for self-hosting StreetStudio (Requirement 30.1). This
directory documents how to run the platform beyond the single-host developer
stack, including high-availability (HA) topologies.

Container images and the local/self-hosted stack live under [`../docker`](../docker):

- `docker/Dockerfile` — multi-stage Node 20 build over the npm workspace, with
  role targets: `api`, `worker`, `web`, `docs`.
- `docker/docker-compose.yml` — a complete stack: API_Service + background
  workers + PostgreSQL + Redis + MinIO (S3-compatible object storage).
- `docker/.env.example` — every required/optional config value, mapped to the
  `packages/config` schema keys.

## Quick start (single host)

```bash
cp docker/.env.example docker/.env
# edit docker/.env: set INSTANCE_ID, AUTH_JWT_SECRET, and the passwords
docker compose -f docker/docker-compose.yml up -d
```

The API_Service validates all required configuration at startup and aborts with
a named list of any missing/invalid values (R30.3). When configuration is valid,
startup completes and `/health` reports passing within 60 seconds (R30.2). The
health endpoint reflects dependency reachability, and a metrics endpoint is
exposed via the StreetJS interfaces (R30.4).

## Configuration

All runtime configuration flows through `packages/config`. Environment variables
map to schema keys as follows:

| Env var                             | Config key                        | Required | Default        |
| ----------------------------------- | --------------------------------- | -------- | -------------- |
| `INSTANCE_ID`                       | `instanceId`                      | yes      | —              |
| `DATABASE_URL`                      | `database.url`                    | yes      | —              |
| `REDIS_URL`                         | `redis.url`                       | yes      | —              |
| `AUTH_JWT_SECRET`                   | `auth.jwtSecret` (>= 32 chars)    | yes      | —              |
| `HTTP_PORT`                         | `http.port`                       | yes      | —              |
| `HTTP_PUBLIC_BASE_URL`              | `http.publicBaseUrl`              | yes      | —              |
| `STORAGE_SIGNED_UPLOAD_TTL_SECONDS` | `storage.signedUploadTtlSeconds`  | no       | `900`          |
| `RATE_LIMIT_PER_WINDOW`             | `rateLimit.perWindow`             | no       | `100`          |
| `RATE_LIMIT_WINDOW_SECONDS`         | `rateLimit.windowSeconds`         | no       | `60`           |

Object storage is provider-agnostic (R9). The compose stack ships MinIO; point
`STORAGE_ENDPOINT`, `STORAGE_BUCKET`, and the access credentials at any
S3-compatible provider to swap it out.

Secrets are supplied only as environment placeholders here — never commit real
values. In production, source them from your secret manager and inject them as
environment variables or mounted files; StreetStudio stores secrets encrypted
via the StreetJS secret interface (R29.2).

## Scaling out

The API_Service is stateless: all shared state lives in PostgreSQL, Redis, and
object storage. To scale horizontally, run multiple `api` replicas behind a load
balancer and multiple `worker` replicas. Each replica needs a distinct
`INSTANCE_ID` but otherwise shares the same configuration.

```bash
docker compose -f docker/docker-compose.yml up -d --scale api=3 --scale worker=2
```

(Remove the `api` service `ports` mapping and front the replicas with a load
balancer when running more than one API replica on a single host.)

## High availability (R30.5, R30.6)

StreetStudio reaches PostgreSQL and Redis exclusively through the StreetJS
interfaces, which support HA topologies. HA is enabled purely by configuration —
no code changes are required.

### PostgreSQL HA

- Run a PostgreSQL HA cluster (primary + replicas with automatic failover),
  e.g. Patroni, a cloud managed offering, or an operator on Kubernetes.
- Point `DATABASE_URL` at the HA endpoint (the failover-aware
  connection/proxy endpoint, not a single node).
- On primary loss, the API_Service reconnects through the StreetJS HA interface
  and resumes serving without an operator restart (R30.6).

### Redis Cluster

- Run Redis in Cluster mode (sharded, with replicas per shard).
- Point `REDIS_URL` at the cluster; the StreetJS Redis interface is
  cluster-aware.
- On node loss, the API_Service reconnects through the StreetJS HA interface and
  resumes without an operator restart (R30.6).

### Object storage

Use a replicated/HA object-storage deployment (distributed MinIO or a managed
S3-compatible service) so media persistence has no single point of failure.

## Deployment targets

- **Docker Compose** — single host or small self-hosted deployments (provided).
- **Kubernetes** — run the `api` and `worker` images as separate Deployments,
  back them with managed/HA PostgreSQL, Redis Cluster, and S3-compatible
  storage, and wire config via a `ConfigMap` + `Secret`. Use the `/health`
  endpoint for readiness/liveness probes (allow up to 60s for startup).

See the top-level `DEPLOYMENT` documentation for the full operator guide.
