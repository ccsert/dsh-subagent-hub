#!/usr/bin/env bash
# Unit tests, then the e2e against the installed `dsh` runtime.
set -euo pipefail
cd "$(dirname "$0")/packages/subagent-hub"
if [ -z "${DSH_SDK_DIR:-}" ]; then
  CLI="$(realpath "${DSH_CLI:-$(command -v dsh)}")"
  export DSH_SDK_DIR="$(cd "$(dirname "$CLI")/.." && pwd)"
fi
node --test test/*.test.js
SDK_VERSION="$(node -p 'require(process.argv[1]).version' "$DSH_SDK_DIR/package.json")"
if [ "$SDK_VERSION" = '0.2.2-rc.2' ]; then
  HUB_ROUTED_TEAM_E2E=true bash test/e2e/run.sh
else
  bash test/e2e/run.sh
  HUB_TEAM_E2E=true bash test/e2e/run.sh
  HUB_ROUTED_TEAM_E2E=true bash test/e2e/run.sh
fi
node test/e2e/native-slot.js
