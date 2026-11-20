#!/usr/bin/env bash
set -euo pipefail
command -v git >/dev/null
command -v node >/dev/null
node --version
npm test
npm run validate
npm run smoke
echo "Warforge repository foundation verified. External donor runtimes are NOT installed by this script."
