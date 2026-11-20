#!/usr/bin/env bash
set -euo pipefail
[[ $# -ge 2 ]] || { echo "usage: $0 <match-id> <seat-id> [base-ref]"; exit 2; }
MATCH="$1"; SEAT="$2"; BASE="${3:-HEAD}"
ROOT="$(git rev-parse --show-toplevel)"
SAFE_MATCH="${MATCH//[^A-Za-z0-9._-]/_}"; SAFE_SEAT="${SEAT//[^A-Za-z0-9._-]/_}"
BRANCH="warforge/${SAFE_MATCH}/${SAFE_SEAT}"
DIR="${ROOT}/../.warforge-worktrees/${SAFE_MATCH}/${SAFE_SEAT}"
mkdir -p "$(dirname "$DIR")"
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then git worktree add "$DIR" "$BRANCH"; else git worktree add -b "$BRANCH" "$DIR" "$BASE"; fi
printf '{"match_id":"%s","seat_id":"%s","branch":"%s","worktree":"%s","base":"%s"}\n' "$MATCH" "$SEAT" "$BRANCH" "$DIR" "$BASE"
