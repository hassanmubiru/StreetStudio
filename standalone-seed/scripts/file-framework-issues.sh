#!/usr/bin/env bash
#
# Create one StreetJS issue per framework-requirement spec.
#
# Each spec in ../docs/framework-requirements/00NN-*.md becomes an issue whose
# title is the spec's H1 and whose body is the file contents. Issues are labeled
# by layer and assigned a milestone per publish wave (see the specs' README).
#
# Usage:
#   PROVIDER=gh   REPO=streetjs/streetjs        ./file-framework-issues.sh [--dry-run]
#   PROVIDER=glab REPO=streetjs/streetjs        ./file-framework-issues.sh [--dry-run]
#
# Requirements: the `gh` (GitHub) or `glab` (GitLab) CLI, authenticated.
# Labels/milestones are created if missing (GitHub via gh; GitLab expects them
# to exist or be auto-created by the instance).
set -euo pipefail

PROVIDER="${PROVIDER:-gh}"
REPO="${REPO:-}"
DRY_RUN="false"
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN="true"

if [[ -z "$REPO" ]]; then
  echo "error: set REPO=<owner/repo> (the StreetJS repository)." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPEC_DIR="$SCRIPT_DIR/../docs/framework-requirements"

# Map a spec number to its publish wave (see framework-requirements/README.md).
wave_for() {
  case "$1" in
    0001|0002|0016|0017|0018) echo "1" ;;
    0006|0007|0008|0009)      echo "2" ;;
    0003|0004|0005)           echo "3" ;;
    0010|0011|0012|0013)      echo "4" ;;
    0014|0015)                echo "5" ;;
    *)                        echo "0" ;;
  esac
}

create_issue() {
  local title="$1" body="$2" wave="$3"
  local label="framework-requirement,streetjs,wave-${wave}"
  local milestone="StreetJS wave ${wave}"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[dry-run] ($PROVIDER → $REPO) [$milestone] $title"
    return
  fi

  case "$PROVIDER" in
    gh)
      # Ensure labels exist (idempotent).
      gh label create "framework-requirement" --repo "$REPO" --color BFD4F2 2>/dev/null || true
      gh label create "streetjs"              --repo "$REPO" --color 5319E7 2>/dev/null || true
      gh label create "wave-${wave}"          --repo "$REPO" --color FBCA04 2>/dev/null || true
      gh api "repos/$REPO/milestones" -f title="$milestone" >/dev/null 2>&1 || true
      gh issue create --repo "$REPO" --title "$title" --body "$body" \
        --label "$label" --milestone "$milestone"
      ;;
    glab)
      glab issue create --repo "$REPO" --title "$title" --description "$body" \
        --label "$label" --milestone "$milestone" --yes
      ;;
    *)
      echo "error: PROVIDER must be 'gh' or 'glab' (got '$PROVIDER')." >&2
      exit 1
      ;;
  esac
}

shopt -s nullglob
for spec in "$SPEC_DIR"/[0-9][0-9][0-9][0-9]-*.md; do
  num="$(basename "$spec" | cut -d- -f1)"
  title="$(head -n 1 "$spec" | sed 's/^#\s*//')"
  body="$(cat "$spec")"
  wave="$(wave_for "$num")"
  create_issue "$title" "$body" "$wave"
done

echo "Done."
