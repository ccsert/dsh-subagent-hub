#!/usr/bin/env bash
# Unit tests, then the e2e against the installed `dsh` runtime.
set -euo pipefail
cd "$(dirname "$0")/packages/subagent-hub"
node --test test/*.test.js
bash test/e2e/run.sh
HUB_TEAM_E2E=true bash test/e2e/run.sh
node test/e2e/native-slot.js
