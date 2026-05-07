#!/usr/bin/env bash
#
# Create root-level symlinks for workspace package bins.
#
# Why: npm install doesn't auto-create node_modules/.bin/<bin> for workspace
# packages even when they're listed as devDependencies (verified npm 10.9).
# The CLI test suite (~13 files) spawns `node_modules/.bin/deskwork` via
# spawnSync, so without these symlinks every test that hits the bin path
# returns spawn -1 (cannot execute) with empty stderr. Locally the symlinks
# accumulated from old npm versions; CI starts cold every run.
#
# Run via the root `build` npm script (after `npm run build --workspaces`)
# so the dist files exist by the time the symlinks are created.
#
# Idempotent: ln -sf overwrites existing symlinks.

set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p node_modules/.bin
ln -sf ../@deskwork/cli/dist/cli.js node_modules/.bin/deskwork
ln -sf ../@deskwork/bridge/dist/server.js node_modules/.bin/deskwork-bridge
ln -sf ../@deskwork/studio/dist/server.js node_modules/.bin/deskwork-studio

echo "linked node_modules/.bin/deskwork -> @deskwork/cli/dist/cli.js"
echo "linked node_modules/.bin/deskwork-bridge -> @deskwork/bridge/dist/server.js"
echo "linked node_modules/.bin/deskwork-studio -> @deskwork/studio/dist/server.js"
