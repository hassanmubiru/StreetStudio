# syntax=docker/dockerfile:1.7

# =============================================================================
# StreetStudio container images (Requirement 30.1)
#
# A single multi-stage build over the npm workspace produces role-specific
# runtime images. The build context is the repository ROOT (see
# docker-compose.yml `build.context: ..`), so paths below are repo-relative.
#
# Pipeline:
#   deps     -> install the full workspace from the lockfile (cached by manifests)
#   builder  -> compile every package/app with `tsc -b`, then prune to prod deps
#   runtime  -> minimal Node 20 base carrying only prod node_modules + dist
#   api      -> runtime that serves REST/WebSocket/Webhook (apps/api)
#   worker   -> runtime that runs background workers (same artifact, worker role)
#   web      -> static/SPA host (apps/web)
#   docs     -> documentation site (apps/docs)
#
# Pin to a specific Node 20 patch for reproducible builds.
# =============================================================================
ARG NODE_VERSION=20.18.1

# -----------------------------------------------------------------------------
# deps: install the entire workspace deterministically from the lockfile.
# Only manifests are copied first so this layer is cached across source edits.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
ENV NODE_ENV=development

# Root manifests + lockfile drive the workspace install.
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./

# Workspace member manifests. Copying these (not their sources) keeps the
# install layer cache-friendly: it only invalidates when a package.json changes.
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/desktop/package.json ./apps/desktop/
COPY apps/docs/package.json ./apps/docs/
COPY packages/ ./packages-manifests-tmp/
# Keep only package.json files from the copied packages tree, discard sources
# so the deps layer stays cache-stable. Sources arrive in the builder stage.
RUN set -eux; \
    for pkg in ./packages-manifests-tmp/*/; do \
      name="$(basename "$pkg")"; \
      mkdir -p "packages/$name"; \
      cp "$pkg/package.json" "packages/$name/package.json"; \
    done; \
    rm -rf ./packages-manifests-tmp

# Full install (includes dev deps: typescript is needed to build).
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# -----------------------------------------------------------------------------
# builder: bring in sources, compile the workspace, then prune to prod deps.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS builder
WORKDIR /app
ENV NODE_ENV=development

# Reuse the installed workspace + manifests from deps.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./

# Now the full sources.
COPY apps ./apps
COPY packages ./packages

# Compile every project reference (`tsc -b` at the workspace root).
RUN npm run build

# Drop dev dependencies so the runtime image carries production deps only.
RUN --mount=type=cache,target=/root/.npm \
    npm prune --omit=dev

# -----------------------------------------------------------------------------
# runtime: shared minimal base for all Node service images.
# Runs as the non-root `node` user shipped with the official image.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps

# Pruned production dependency tree.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Built JavaScript for every workspace member (dist/ trees) plus manifests so
# workspace symlinks in node_modules resolve to the compiled output.
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps ./apps

USER node

# -----------------------------------------------------------------------------
# api: API_Service — REST + WebSocket + Webhook host (apps/api).
# -----------------------------------------------------------------------------
FROM runtime AS api
# STREETSTUDIO_ROLE lets the composition root select the API surface.
ENV STREETSTUDIO_ROLE=api
# http.port default (overridable via HTTP_PORT env → config mapping).
EXPOSE 8080
CMD ["node", "apps/api/dist/index.js"]

# -----------------------------------------------------------------------------
# worker: background workers — media pipeline, delivery retries, scheduler.
# Shares the API build artifact and selects the worker role at runtime.
# -----------------------------------------------------------------------------
FROM runtime AS worker
ENV STREETSTUDIO_ROLE=worker
CMD ["node", "apps/api/dist/index.js"]

# -----------------------------------------------------------------------------
# web: Web_Client host (apps/web).
# -----------------------------------------------------------------------------
FROM runtime AS web
ENV STREETSTUDIO_ROLE=web
EXPOSE 3000
CMD ["node", "apps/web/dist/index.js"]

# -----------------------------------------------------------------------------
# docs: documentation site (apps/docs).
# -----------------------------------------------------------------------------
FROM runtime AS docs
ENV STREETSTUDIO_ROLE=docs
EXPOSE 3001
CMD ["node", "apps/docs/dist/index.js"]
