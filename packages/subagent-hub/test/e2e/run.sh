#!/usr/bin/env bash
# Boot an isolated web profile with dsh-subagent-hub + the e2e driver, then assert on the report.
# Throwaway DSH_HOME, no model credentials, the user's profiles are untouched.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PKG="$(cd "$HERE/../.." && pwd)"
DSH_PKG="$(cd "$(dirname "$(realpath "$(command -v dsh)")")/.." && pwd)"
export DSH_HOME="$(mktemp -d /tmp/hub-e2e-home.XXXXXX)"
REPORT="$DSH_HOME/report.json"
CWD="$DSH_HOME/work"
mkdir -p "$CWD/.dsh/subagents" "$PKG/node_modules" "$HERE/driver/node_modules"

for dir in "$PKG" "$HERE/driver"; do
  ln -sfn "$DSH_PKG/node_modules/@deepseek-ai" "$dir/node_modules/@deepseek-ai"
done
ln -sfn "$DSH_PKG/node_modules/js-yaml" "$PKG/node_modules/js-yaml"

cat >"$CWD/.dsh/subagents/scout.yaml" <<'YAML'
id: scout
description: Finds files and summarizes layout
instructions: HUB-SCOUT-MARKER Only read; never edit.
needs: [fast]
YAML

dsh --profile web --dump-config >/dev/null
mkdir -p "$DSH_HOME/profiles/web/node_modules"
ln -sfn "$PKG" "$DSH_HOME/profiles/web/node_modules/dsh-subagent-hub"
ln -sfn "$HERE/driver" "$DSH_HOME/profiles/web/node_modules/hub-e2e-driver"

cat >"$DSH_HOME/e2e.patch.yml" <<YAML
- insert:
    - id: subagent-hub
      name: dsh-subagent-hub
      config:
        routes:
          - { id: offline, provider: no-such-provider, model: x, tags: [reasoning, vision] }
          - { id: pro, provider: deepseek-official, model: deepseek-v4-pro, tags: [reasoning], note: 'DeepSeek V4 Pro' }
          - { id: flash, provider: deepseek-official, model: deepseek-flash, tags: [fast], note: 'DeepSeek Flash' }
        agents:
          - id: reviewer
            description: Reviews a diff and reports findings
            instructions: HUB-REVIEWER-MARKER Report findings only.
            routes: [flash]
    - id: hub-e2e-driver
      name: hub-e2e-driver
      config:
        out: $REPORT
        cwd: $CWD
YAML

env -u DEEPSEEK_API_KEY -u MAGPIE_GATEWAY_KEY \
  dsh --profile web --patch "$DSH_HOME/e2e.patch.yml" --no-open --port 0 >"$DSH_HOME/boot.log" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT

for _ in $(seq 1 180); do
  grep -q '"done"' "$REPORT" 2>/dev/null && break
  kill -0 $PID 2>/dev/null || { echo "dsh exited early"; tail -40 "$DSH_HOME/boot.log"; exit 1; }
  sleep 1
done
[ -f "$REPORT" ] || { echo "no report"; tail -40 "$DSH_HOME/boot.log"; exit 1; }
node "$HERE/assert.js" "$REPORT"
# Passed: drop the throwaway home unless asked to keep it for inspection.
[ -n "${KEEP_HOME:-}" ] || { case "$DSH_HOME" in /tmp/hub-e2e-home.*) rm -rf "$DSH_HOME" ;; esac; }
