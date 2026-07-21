#!/usr/bin/env bash
#
# scripts/check.sh — run the full local verification gate (mirrors CI).
#
# Runs, in order: build, dependency-graph acyclicity, import-boundary analysis,
# and the full test suite. Exits non-zero on the first failing stage so it is
# safe to use as a pre-push or pre-PR check.
#
# Usage:
#   scripts/check.sh
#
set -euo pipefail

# Resolve the repository root (the parent of this script's directory) so the
# script works regardless of the caller's current directory.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

run() {
  echo ""
  echo "▶ $*"
  "$@"
}

echo "StreetStudio — local verification gate"
echo "Repo: $ROOT"

run npm run build
run npm run graph:check
run npm run boundary:check
run npm run streetjs:check

# The DB-gated integration tests (e.g. packages/recordings, packages/uploads)
# run against a real PostgreSQL when STREETSTUDIO_IT_DATABASE_URL is set, and
# skip gracefully otherwise. CI always sets it (service container); locally, set
# it (e.g. point at the docker-compose Postgres) so coverage reflects the real,
# DB-backed execution rather than the skipped-integration figure:
#
#   docker compose -f docker/docker-compose.yml up -d postgres
#   STREETSTUDIO_IT_DATABASE_URL=postgres://streetstudio:<pw>@127.0.0.1:<port>/streetstudio \
#     scripts/check.sh
#
if [ -n "${STREETSTUDIO_IT_DATABASE_URL:-}" ]; then
  echo "  (integration tests enabled — STREETSTUDIO_IT_DATABASE_URL is set)"
else
  echo "  (integration tests will SKIP — STREETSTUDIO_IT_DATABASE_URL is unset)"
fi

# Run the coverage gate (mirrors CI): executes all test categories — including
# the integration category when a DB is present — and fails below 80% lines.
run npm run test:coverage

echo ""
echo "✅ All checks passed (build, graph:check, boundary:check, streetjs:check, coverage)."
