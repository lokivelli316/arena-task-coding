#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "$0")"
command -v git >/dev/null
command -v node >/dev/null
command -v npm >/dev/null
if ! command -v bwrap >/dev/null; then
  echo "Bubblewrap is required for worktree-backed command and judge checks." >&2
  exit 1
fi
node --version
npm ci
npm test
npm run validate
npm run smoke
