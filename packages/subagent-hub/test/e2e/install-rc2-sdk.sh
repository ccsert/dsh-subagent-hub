#!/usr/bin/env bash
# Install the official SDK in this checkout only; no global CLI or user profile changes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
DEST="$ROOT/output/sdk-rc2"
npm install --prefix "$DEST" --cache "$DEST/.npm-cache" --registry https://registry.npmjs.org \
  --no-save --no-package-lock --ignore-scripts @deepseek-ai/dsh@0.2.2-rc.2
SDK="$DEST/node_modules/@deepseek-ai/dsh"
VERSION="$(node -p 'require(process.argv[1]).version' "$SDK/package.json")"
[ "$VERSION" = 0.2.2-rc.2 ] || { echo "Unexpected SDK version: $VERSION" >&2; exit 1; }
printf 'SDK %s: %s\n' "$VERSION" "$SDK"
