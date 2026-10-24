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
mkdir -p "$CWD" "$PKG/node_modules" "$HERE/driver/node_modules"

for dir in "$PKG" "$HERE/driver"; do
  ln -sfn "$DSH_PKG/node_modules/@deepseek-ai" "$dir/node_modules/@deepseek-ai"
done
ln -sfn "$DSH_PKG/node_modules/js-yaml" "$PKG/node_modules/js-yaml"
if [ -d "$DSH_PKG/node_modules/zod" ]; then ln -sfn "$DSH_PKG/node_modules/zod" "$PKG/node_modules/zod"; fi
ln -sfn "$DSH_PKG/node_modules/js-yaml" "$HERE/driver/node_modules/js-yaml"

dsh --profile web --dump-config >/dev/null
mkdir -p "$DSH_HOME/profiles/web/node_modules"
ln -sfn "$PKG" "$DSH_HOME/profiles/web/node_modules/dsh-subagent-hub"
# Load the package exactly as an installed bundle: listed in the profile, its own patch applied.
python3 - "$DSH_HOME/profiles/web/package.json" <<'PYEOF'
import json, os, sys
path = sys.argv[1]
manifest = json.load(open(path))
bundles = manifest.setdefault('dsh', {}).setdefault('profile', {}).setdefault('bundles', [])
if os.environ.get('HUB_TEAM_E2E') == 'true':
    bundles.append('@deepseek-ai/dsh-experimental-agent-team-profile')
if 'dsh-subagent-hub' not in bundles:
    bundles.append('dsh-subagent-hub')
json.dump(manifest, open(path, 'w'), indent=2)
PYEOF
ln -sfn "$HERE/driver" "$DSH_HOME/profiles/web/node_modules/hub-e2e-driver"

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
YAML

env -u DEEPSEEK_API_KEY -u MAGPIE_GATEWAY_KEY \
  dsh --profile web --patch "$DSH_HOME/e2e.patch.yml" --no-open --port 0 >"$DSH_HOME/boot.log" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT

for _ in $(seq 1 180); do
  grep -q '"done"' "$REPORT" 2>/dev/null && break
  kill -0 $PID 2>/dev/null || { echo "dsh exited early"; tail -60 "$DSH_HOME/boot.log"; exit 1; }
  sleep 1
done
[ -f "$REPORT" ] || { echo "no report"; tail -60 "$DSH_HOME/boot.log"; exit 1; }
if [ "${HUB_TEAM_E2E:-}" = true ]; then
  node "$HERE/assert-team.js" "$REPORT"
else
  node "$HERE/assert.js" "$REPORT"
fi
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
