#!/usr/bin/env bash
#
# Local smoke for the dw-lifecycle bin shim's first-run install path.
# Not in CI per the deskwork repo's no-CI-testing rule. Run before
# tagging a release that touches the shim or any declared dep.
#
# Strategy: copy the plugin shell into a tmpdir (so the workspace
# node_modules hoist is invisible to the shim), wipe the copied
# plugin's node_modules/, run the shim, and verify:
#   1. The install advisory prints to stderr.
#   2. After install, every declared dep (tsx, yaml, zod, ajv,
#      ajv-formats, jscpd) is resolvable from <tmpdir>/node_modules/.
#   3. The install-complete sentinel was written.
#   4. A second invocation does NOT re-install (sentinel short-circuit).
#
# This smoke is the one TF-004 explicitly named: a sparse-clone-shaped
# install state where tsx might happen to land via some other path but
# the rest of the deps are missing. We avoid that subtlety here by
# wiping the entire node_modules/ — the install path has to run from
# scratch.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
PLUGIN_SOURCE="$ROOT/plugins/dw-lifecycle"
TMP=$(mktemp -d)
PLUGIN_COPY="$TMP/dw-lifecycle"

cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "== smoke: copying plugin shell to $PLUGIN_COPY =="
mkdir -p "$PLUGIN_COPY"
# Copy everything except node_modules (we want a clean install path).
# Skip vitest config / tests too — not needed for the smoke and shaves
# the copy cost.
for entry in .claude-plugin bin src package.json package-lock.json README.md LICENSE templates skills commands tsconfig.json; do
  [[ -e "$PLUGIN_SOURCE/$entry" ]] || continue
  cp -R "$PLUGIN_SOURCE/$entry" "$PLUGIN_COPY/"
done

# Sanity: confirm we did NOT bring node_modules across.
if [[ -d "$PLUGIN_COPY/node_modules" ]]; then
  echo "FAIL: tmpdir copy unexpectedly contains node_modules" >&2
  exit 1
fi

echo "== smoke: first invocation should install =="
# Capture stderr so we can verify the install advisory printed.
STDERR_LOG="$TMP/stderr-1.log"
if ! "$PLUGIN_COPY/bin/dw-lifecycle" --help >/dev/null 2>"$STDERR_LOG"; then
  # `--help` may exit non-zero in some CLI layouts; we don't care about
  # the exit code as much as we care that the install ran and the shim
  # got past dep resolution. Inspect deps below.
  :
fi

if ! grep -q "installing plugin dependencies" "$STDERR_LOG"; then
  echo "FAIL: expected install advisory on stderr; got:" >&2
  cat "$STDERR_LOG" >&2
  exit 1
fi

echo "== smoke: every declared dep resolvable =="
for dep in tsx yaml zod ajv ajv-formats jscpd; do
  if [[ ! -f "$PLUGIN_COPY/node_modules/$dep/package.json" ]]; then
    echo "FAIL: $dep/package.json missing after install" >&2
    exit 1
  fi
done

echo "== smoke: sentinel written =="
VERSION=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$PLUGIN_COPY/.claude-plugin/plugin.json','utf8')).version || '')")
if [[ -z "$VERSION" ]]; then
  echo "FAIL: could not read plugin version" >&2
  exit 1
fi
SENTINEL="$PLUGIN_COPY/node_modules/.deskwork-install-complete-$VERSION"
if [[ ! -f "$SENTINEL" ]]; then
  echo "FAIL: sentinel missing at $SENTINEL" >&2
  exit 1
fi

echo "== smoke: second invocation should NOT re-install =="
STDERR_LOG_2="$TMP/stderr-2.log"
if ! "$PLUGIN_COPY/bin/dw-lifecycle" --help >/dev/null 2>"$STDERR_LOG_2"; then
  :
fi
if grep -q "installing plugin dependencies" "$STDERR_LOG_2"; then
  echo "FAIL: second invocation re-ran the install path; sentinel short-circuit broken" >&2
  cat "$STDERR_LOG_2" >&2
  exit 1
fi

echo "== smoke: partial-install (delete ajv, expect re-install) =="
rm -rf "$PLUGIN_COPY/node_modules/ajv"
# Also blow away the sentinel — a partial install only re-triggers when
# the sentinel is stale (per the shim contract: sentinel is the
# fast-path, dep probe runs when sentinel is absent).
rm -f "$SENTINEL"
STDERR_LOG_3="$TMP/stderr-3.log"
if ! "$PLUGIN_COPY/bin/dw-lifecycle" --help >/dev/null 2>"$STDERR_LOG_3"; then
  :
fi
if ! grep -q "installing plugin dependencies" "$STDERR_LOG_3"; then
  echo "FAIL: partial-install state did not trigger re-install" >&2
  cat "$STDERR_LOG_3" >&2
  exit 1
fi
if [[ ! -f "$PLUGIN_COPY/node_modules/ajv/package.json" ]]; then
  echo "FAIL: ajv still missing after re-install" >&2
  exit 1
fi

echo "== smoke: PASS =="
