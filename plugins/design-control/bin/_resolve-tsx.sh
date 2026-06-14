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
# Skip signal — the AUTHORITATIVE runnability check (not a path-existence probe):
#   Every declared runtime dep must RESOLVE via Node's own module resolution
#   FROM $PLUGIN_ROOT. This is correct in BOTH environments without any
#   "ancestor tsx == workspace" heuristic:
#     - Monorepo workspace dev: hoisted deps resolve from $PLUGIN_ROOT via Node's
#       upward node_modules lookup → probe passes → NO install, dispatch directly.
#     - Adopter sparse-clone (incl. a stray-ancestor node_modules/.bin/tsx that
#       does NOT carry parse5/zod): the plugin's own deps do NOT resolve →
#       probe fails → local `npm install --omit=dev --workspaces=false`.
#   A mere on-disk path probe ($PLUGIN_ROOT/node_modules/<dep>/package.json) is
#   NOT sufficient: an interrupted first-run install can leave direct metadata +
#   .bin/tsx while missing transitive packages, after which the next run would
#   skip reinstall and dispatch into a broken tree. Node resolution proves the
#   dep (and its transitive closure) is actually loadable.
#
# Declared runtime deps — keep in sync with package.json "dependencies".
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

# Probe whether every declared runtime dep RESOLVES via Node from $PLUGIN_ROOT.
# Uses Node's own resolver (createRequire(...).resolve) so the check proves the
# dep — and its transitive closure entry — is genuinely loadable, not merely
# present on disk. Returns 0 only if ALL deps resolve.
_dc_all_deps_resolve() {
  for _dc_dep in $RUNTIME_DEPS; do
    if ! node -e "require('node:module').createRequire('$PLUGIN_ROOT/package.json').resolve('$_dc_dep')" >/dev/null 2>&1; then
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
# the declared runtime deps do not resolve from $PLUGIN_ROOT. The resolution
# probe is the single source of truth and runs UNCONDITIONALLY — there is no
# "ancestor tsx == workspace, skip the probe" short-circuit (that wrongly let a
# stray-ancestor tsx suppress the install for non-monorepo adopters). Exits
# non-zero with a descriptive message on unrecoverable failure (no silent
# fallback).
resolve_tsx() {
  # Already runnable (monorepo hoist OR a complete prior adopter install)?
  # Dispatch via whatever tsx the upward walk finds — no install.
  if _dc_all_deps_resolve; then
    TSX=$(_dc_find_tsx || true)
    if [ -n "$TSX" ]; then
      return 0
    fi
  fi

  # Deps don't resolve (fresh/partial adopter clone): bootstrap, then re-locate
  # tsx (now local) and re-run the resolution probe.
  _dc_run_install
  TSX=$(_dc_find_tsx || true)
  if [ -z "$TSX" ]; then
    echo "${SHIM_NAME:-design-control}: npm install completed but tsx is still not resolvable from $PLUGIN_ROOT. Aborting." >&2
    exit 1
  fi
  if ! _dc_all_deps_resolve; then
    echo "${SHIM_NAME:-design-control}: npm install completed but a declared runtime dep ($RUNTIME_DEPS) still does not resolve from $PLUGIN_ROOT. Aborting." >&2
    exit 1
  fi
  return 0
}
