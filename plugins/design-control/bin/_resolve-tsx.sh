#!/bin/sh
# _resolve-tsx.sh — shared tsx resolution + adopter bootstrap for the
# design-control bin shims. SOURCED, not executed (the leading underscore marks
# it as a library, not a verb). POSIX sh, matching the shims (set -eu).
#
# A fresh marketplace install of ONLY this plugin (a git-subdir clone of
# plugins/design-control/) has no node_modules, no hoisted tsx, and none of the
# declared runtime deps. This helper first-run-installs them into the plugin's
# own node_modules/, then resolves tsx — so the advertised marketplace path
# works on first use. Mirrors plugins/stack-control/bin/stackctl's order.
#
# Contract: the caller exports SHIM_NAME (for messages) and PLUGIN_ROOT, then
# `. "$PLUGIN_ROOT/bin/_resolve-tsx.sh"`, then `resolve_tsx` sets $TSX.
#
# Resolution order (first match wins):
#   1. Workspace dev path: tsx resolves from an ANCESTOR's node_modules/.bin/
#      (npm workspace hoist). The monorepo owns the full dep set, so dispatch
#      directly — NO probe, NO install (hoisted deps resolve from PLUGIN_ROOT
#      via Node's upward lookup).
#   2. Adopter post-install: tsx exists at $PLUGIN_ROOT/node_modules/.bin/tsx
#      AND every declared runtime dep is present under $PLUGIN_ROOT/node_modules.
#      Dispatch via the local tsx.
#   3. First run / partial install: npm install in $PLUGIN_ROOT, then dispatch.
#      The dependency PROBE (every declared runtime dep present on disk) is the
#      AUTHORITATIVE skip signal; install runs whenever any declared dep is
#      actually missing.
#
# Declared runtime deps — keep in sync with package.json "dependencies". A
# probe that only checked tsx would skip npm install on a partial adopter
# install (tsx present, parse5/zod missing) and then crash on Node module
# resolution at first dispatch.
RUNTIME_DEPS="parse5 tsx zod"

# Walk up from PLUGIN_ROOT for a usable tsx bin. Handles the workspace-hoist
# case (deps in the monorepo root's node_modules/.bin) and the adopter
# post-install case (deps in this plugin's node_modules/.bin). Echoes the path
# (empty if none found).
_dc_find_tsx() {
  _dc_cur="$PLUGIN_ROOT"
  while [ "$_dc_cur" != "/" ]; do
    if [ -x "$_dc_cur/node_modules/.bin/tsx" ]; then
      printf '%s' "$_dc_cur/node_modules/.bin/tsx"
      return 0
    fi
    _dc_cur=$(dirname -- "$_dc_cur")
  done
  return 1
}

# Probe whether a declared runtime dep is installed in the plugin's own
# node_modules/ (test the dep's package.json, not just the dir, so a partial
# install where the dir exists but metadata never landed is caught).
_dc_all_deps_installed() {
  for _dc_dep in $RUNTIME_DEPS; do
    if [ ! -f "$PLUGIN_ROOT/node_modules/$_dc_dep/package.json" ]; then
      return 1
    fi
  done
  return 0
}

# First-run install into the plugin's own node_modules/.
#   --workspaces=false: when sparse-cloned from a workspaces-declaring monorepo,
#   npm would otherwise hoist node_modules/ to the workspace root, leaving
#   $PLUGIN_ROOT/node_modules/ empty. Force install into the plugin's own tree.
_dc_run_install() {
  echo "${SHIM_NAME:-design-control}: installing plugin dependencies (first run)..." >&2
  ( cd "$PLUGIN_ROOT" && npm install --omit=dev --workspaces=false \
      --no-audit --no-fund --loglevel=error ) >&2
}

# resolve_tsx — sets TSX to a usable tsx path, bootstrapping (npm install) when
# in adopter mode and the dep probe fails. Exits non-zero with a descriptive
# message on unrecoverable failure (no silent fallback).
resolve_tsx() {
  TSX=$(_dc_find_tsx || true)

  # Workspace dev path: tsx resolved from an ANCESTOR (not from
  # $PLUGIN_ROOT/node_modules). The monorepo owns deps; do not probe/install.
  if [ -n "$TSX" ] && [ "$TSX" != "$PLUGIN_ROOT/node_modules/.bin/tsx" ]; then
    return 0
  fi

  # Adopter post-install: local tsx present AND every dep present → dispatch.
  if [ -n "$TSX" ] && _dc_all_deps_installed; then
    return 0
  fi

  # First run / partial install: bootstrap, then re-resolve + re-probe.
  _dc_run_install
  TSX=$(_dc_find_tsx || true)
  if [ -z "$TSX" ]; then
    echo "${SHIM_NAME:-design-control}: npm install completed but tsx is still not resolvable from $PLUGIN_ROOT. Aborting." >&2
    exit 1
  fi
  if ! _dc_all_deps_installed; then
    echo "${SHIM_NAME:-design-control}: npm install completed but a declared runtime dep ($RUNTIME_DEPS) is still missing under $PLUGIN_ROOT/node_modules. Aborting." >&2
    exit 1
  fi
  return 0
}
