#!/usr/bin/env bash
# Boot an isolated web profile with the spike row, wait for its report, stop it.
# Uses a throwaway DSH_HOME and no model credentials; the user's profiles are untouched.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DSH_BIN="$(command -v dsh)"
DSH_PKG="$(cd "$(dirname "$(realpath "$DSH_BIN")")/.." && pwd)"
export DSH_HOME="${SPIKE_HOME:-$(mktemp -d /tmp/hub-spike-home.XXXXXX)}"
REPORT="$HERE/report.json"
CWD="$DSH_HOME/work"
rm -f "$REPORT"
mkdir -p "$CWD" "$HERE/node_modules"

# Resolve the runtime's own packages from the spike's real path.
ln -sfn "$DSH_PKG/node_modules/@deepseek-ai" "$HERE/node_modules/@deepseek-ai"
ln -sfn "$DSH_PKG/node_modules/js-yaml" "$HERE/node_modules/js-yaml"

# First boot materializes the profile directory; link the spike into it.
dsh --profile web --dump-config >/dev/null
mkdir -p "$DSH_HOME/profiles/web/node_modules"
ln -sfn "$HERE" "$DSH_HOME/profiles/web/node_modules/hub-spike"

cat >"$DSH_HOME/spike.patch.yml" <<YAML
- insert:
    - id: hub-spike
      name: hub-spike
      config:
        out: $REPORT
        cwd: $CWD
YAML

env -u DEEPSEEK_API_KEY -u MAGPIE_GATEWAY_KEY \
  dsh --profile web --patch "$DSH_HOME/spike.patch.yml" --no-open --port 0 >"$DSH_HOME/boot.log" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT

for _ in $(seq 1 120); do
  grep -q "\"done\"" "$REPORT" 2>/dev/null && break
  kill -0 $PID 2>/dev/null || { echo "dsh exited early"; tail -40 "$DSH_HOME/boot.log"; exit 1; }
  sleep 1
done
[ -f "$REPORT" ] || { echo "no report"; tail -40 "$DSH_HOME/boot.log"; exit 1; }
echo "report: $REPORT (home: $DSH_HOME)"
