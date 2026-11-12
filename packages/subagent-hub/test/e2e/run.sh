#!/usr/bin/env bash
# Boot an isolated web profile with dsh-subagent-hub + the e2e driver, then assert on the report.
# Throwaway DSH_HOME, no model credentials, the user's profiles are untouched.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SOURCE_PKG="${HUB_PACKAGE_DIR:-$(cd "$HERE/../.." && pwd)}"
if [ -n "${DSH_CLI:-}" ]; then CLI="$DSH_CLI"
elif [ -n "${DSH_SDK_DIR:-}" ]; then CLI="$DSH_SDK_DIR/lib/bin.js"
else CLI="$(command -v dsh)"; fi
CLI="$(realpath "$CLI")"
DSH_PKG="${DSH_SDK_DIR:-$(cd "$(dirname "$CLI")/.." && pwd)}"
DSH_PKG="$(cd "$DSH_PKG" && pwd)"
SDK_VERSION="$(node -p 'require(process.argv[1]).version' "$DSH_PKG/package.json")"
CLI_VERSION="$(node "$CLI" --version)"
printf 'DSH SDK: %s (%s); CLI: %s (%s)\n' "$SDK_VERSION" "$DSH_PKG" "$CLI_VERSION" "$CLI"
[ "$CLI_VERSION" = "$SDK_VERSION" ] || { echo 'SDK and CLI versions differ' >&2; exit 1; }
[ -z "${DSH_EXPECT_VERSION:-}" ] || [ "$SDK_VERSION" = "$DSH_EXPECT_VERSION" ] || { echo "Expected DSH $DSH_EXPECT_VERSION, got $SDK_VERSION" >&2; exit 1; }
case "$SDK_VERSION" in 0.2.2-rc.1|0.2.2-rc.2) ;; *) echo "No e2e suite for DSH $SDK_VERSION" >&2; exit 1 ;; esac
DEPS="$DSH_PKG/node_modules"
if [ ! -d "$DEPS/@deepseek-ai" ]; then DEPS="$(cd "$DSH_PKG/../.." && pwd)"; fi
[ -d "$DEPS/@deepseek-ai" ] || { echo "Cannot find SDK dependencies under $DEPS" >&2; exit 1; }
export DSH_HOME="$(mktemp -d /tmp/hub-e2e-home.XXXXXX)"
REPORT="$DSH_HOME/report.json"
CWD="$DSH_HOME/work"
PKG="$DSH_HOME/package"
mkdir -p "$CWD" "$PKG"
# Each invocation owns its package copy and dependency links; parallel SDK versions cannot race.
tar -C "$SOURCE_PKG" --exclude=node_modules -cf - . | tar -C "$PKG" -xf -
DRIVER="$PKG/test/e2e/driver"
# Published archives intentionally omit tests. Stage the source test driver beside the
# exact installed runtime files, preserving its relative client-module lookup.
mkdir -p "$DRIVER"
tar -C "$HERE/driver" --exclude=node_modules -cf - . | tar -C "$DRIVER" -xf -
mkdir -p "$PKG/node_modules" "$DRIVER/node_modules"
for dir in "$PKG" "$DRIVER"; do
  ln -s "$DEPS/@deepseek-ai" "$dir/node_modules/@deepseek-ai"
  ln -s "$DEPS/js-yaml" "$dir/node_modules/js-yaml"
done
if [ -d "$DEPS/zod" ]; then ln -s "$DEPS/zod" "$PKG/node_modules/zod"; fi

node "$CLI" --profile web --dump-config >/dev/null
mkdir -p "$DSH_HOME/profiles/web/node_modules"
ln -sfn "$PKG" "$DSH_HOME/profiles/web/node_modules/dsh-subagent-hub"
# Load the package exactly as an installed bundle: listed in the profile, its own patch applied.
python3 - "$DSH_HOME/profiles/web/package.json" <<'PYEOF'
import json, os, sys
path = sys.argv[1]
manifest = json.load(open(path))
bundles = manifest.setdefault('dsh', {}).setdefault('profile', {}).setdefault('bundles', [])
if os.environ.get('HUB_TEAM_E2E') == 'true' or os.environ.get('HUB_ROUTED_TEAM_E2E') == 'true':
    bundles.append('@deepseek-ai/dsh-experimental-agent-team-profile')
if 'dsh-subagent-hub' not in bundles:
    bundles.append('dsh-subagent-hub')
json.dump(manifest, open(path, 'w'), indent=2)
PYEOF
ln -s "$DRIVER" "$DSH_HOME/profiles/web/node_modules/hub-e2e-driver"

# The plugin row is configured in the profile's own patch layer. A fresh profile patch is `[]`;
# drop it so entries can follow.
python3 - "$DSH_HOME/profiles/web/cordis.patch.yml" <<'PYEOF'
from pathlib import Path
import sys
patch = Path(sys.argv[1])
patch.write_text('\n'.join(line for line in patch.read_text().splitlines() if line.strip() != '[]') + '\n')
PYEOF
cat >>"$DSH_HOME/profiles/web/cordis.patch.yml" <<YAML
- id: subagent-hub
  config:
    manageOfficialSettings: true
    routes:
      - { id: flash, provider: deepseek-official, model: deepseek-flash, tags: [fast, cheap], note: 'DeepSeek Flash' }
      - { id: pro, provider: deepseek-official, model: deepseek-v4-pro, tags: [reasoning], note: 'DeepSeek V4 Pro' }
    maxConcurrent: 1
    agents:
      - id: reviewer
        description: Reviews a diff and reports findings
        instructions: HUB-REVIEWER-MARKER Report findings only.
        routes: [flash]
        needs: [fast]
YAML

cat >"$DSH_HOME/e2e.patch.yml" <<YAML
- insert:
    - id: hub-e2e-driver
      name: hub-e2e-driver
      config:
        out: $REPORT
        cwd: $CWD
        profilePatch: $DSH_HOME/profiles/web/cordis.patch.yml
        team: ${HUB_TEAM_E2E:-false}
        routedTeam: ${HUB_ROUTED_TEAM_E2E:-false}
        routedPhase: initial
        statePath: $DSH_HOME/routed-state.json
        sdkVersion: $SDK_VERSION
YAML

env -u DEEPSEEK_API_KEY -u MAGPIE_GATEWAY_KEY \
  node "$CLI" --profile web --patch "$DSH_HOME/e2e.patch.yml" --no-open --port 0 >"$DSH_HOME/boot.log" 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 180); do
  grep -q '"done"' "$REPORT" 2>/dev/null && break
  kill -0 $PID 2>/dev/null || { echo "dsh exited early"; tail -60 "$DSH_HOME/boot.log"; exit 1; }
  sleep 1
done
[ -f "$REPORT" ] || { echo "no report"; tail -60 "$DSH_HOME/boot.log"; exit 1; }
if [ "$SDK_VERSION" = '0.2.2-rc.2' ]; then
  ASSERT="$HERE/assert-native-rc2.js"
else
  ASSERT="$HERE/assert-routed-team.js"
fi
if [ "${HUB_ROUTED_TEAM_E2E:-}" = true ]; then
  node "$ASSERT" "$REPORT"
  # A second OS process opens the same persisted Team; no runtime maps survive.
  kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
  mv "$REPORT" "$DSH_HOME/report-initial.json"
  python3 - "$DSH_HOME/e2e.patch.yml" <<'PYEOF'
from pathlib import Path
import sys
path = Path(sys.argv[1])
path.write_text(path.read_text().replace('routedPhase: initial', 'routedPhase: recovery'))
PYEOF
  env -u DEEPSEEK_API_KEY -u MAGPIE_GATEWAY_KEY \
    node "$CLI" --profile web --patch "$DSH_HOME/e2e.patch.yml" --no-open --port 0 >"$DSH_HOME/recovery.log" 2>&1 &
  PID=$!
  for _ in $(seq 1 180); do
    grep -q '"done"' "$REPORT" 2>/dev/null && break
    kill -0 "$PID" 2>/dev/null || { echo "recovery dsh exited early"; tail -40 "$DSH_HOME/recovery.log"; exit 1; }
    sleep 1
  done
  node "$ASSERT" "$REPORT"
elif [ "$SDK_VERSION" = '0.2.2-rc.2' ]; then
  node "$ASSERT" "$REPORT"
elif [ "${HUB_TEAM_E2E:-}" = true ]; then
  node "$HERE/assert-team.js" "$REPORT"
else
  node "$HERE/assert.js" "$REPORT"
fi
# Stop the runtime before removing its home.
kill "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true
trap - EXIT
# Passed: drop only the resolved throwaway home created by this runner.
if [ -z "${KEEP_HOME:-}" ]; then
  python3 - "$DSH_HOME" <<'PYEOF'
from pathlib import Path
import shutil, sys
home = Path(sys.argv[1]).resolve()
if home.parent != Path('/tmp').resolve() or not home.name.startswith('hub-e2e-home.'):
    raise RuntimeError(f'Unexpected cleanup target: {home}')
shutil.rmtree(home)
PYEOF
fi
