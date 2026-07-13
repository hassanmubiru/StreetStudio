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
run npm test

echo ""
echo "✅ All checks passed (build, graph:check, boundary:check, tests)."
