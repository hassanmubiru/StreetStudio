# Self-hosting with Docker Compose

StreetStudio is self-hostable and vendor-neutral. This example runs the full
stack locally using the container assets in [`../docker/`](../docker/).

## Prerequisites

- Docker and Docker Compose
- A copy of the example environment file

## Steps

```bash
# 1. From the repository root, copy the example environment.
cp docker/.env.example docker/.env

# 2. Edit docker/.env and set the required values. Startup validates the
#    resulting config and aborts naming every missing/invalid one
#    (see docs/DEPLOYMENT.md). At minimum, replace:
#      - INSTANCE_ID            (UUID)
#      - AUTH_JWT_SECRET        (≥ 32 characters)
#      - HTTP_PORT              (1–65535)
#      - HTTP_PUBLIC_BASE_URL   (http(s)://…)
#      - POSTGRES_PASSWORD      (strong password)
#      - MINIO_ROOT_PASSWORD    (strong password)
#    The in-stack PostgreSQL/Redis URLs are derived automatically; set
#    DATABASE_URL / REDIS_URL only to target an external or HA endpoint.

# 3. Bring up the stack (API + PostgreSQL + Redis + object storage).
docker compose -f docker/docker-compose.yml up -d

# 4. Check health and metrics (exposed via the StreetJS health/metrics interfaces).
curl -f "$HTTP_PUBLIC_BASE_URL/health"
```

## Configuration notes

- **Object storage** is pluggable (Local, S3, R2, Azure Blob, GCS, MinIO). Select
  and configure a provider plugin; nothing is hardcoded to a vendor.
- **AI is optional** — the platform runs fully without any AI provider. Enable an
  AI provider plugin only if you want transcription/summaries/etc.
- **High availability** — for production, point `DATABASE_URL` at a PostgreSQL HA
  endpoint and `REDIS_URL` at a Redis Cluster; the service reconnects on
  primary/node loss without an operator restart.

See [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md) for scaling, the
`api`/`worker` roles, and HA operation, and [`../infrastructure/`](../infrastructure/)
for deployment configuration.
