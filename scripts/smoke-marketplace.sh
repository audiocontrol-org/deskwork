#!/usr/bin/env bash
#
# smoke-marketplace.sh — local-only pre-tag smoke that exercises the
# real marketplace install path and asserts the resulting plugin tree
# boots cleanly.
#
# Why: catches packaging regressions before they reach adopters. The
# v0.6.0–v0.8.2 client-JS-404 bug, #88's empty vendor, the v0.9.4
# prepare:husky walk-up — all of these are install-path bugs that
# only surface when the install matches what Claude Code actually
# does. Per `RELEASING.md` § "Maturity stance" this is the release-
# blocking gate.
#
# Phase 26 rewrite (v0.9.5+):
#   The vendor-materialization architecture is gone. Plugins now ship
#   as thin shells that first-run-install @deskwork/<pkg>@<version>
#   from npm at first invocation. The smoke mirrors that path:
#
#   1. Phase A (marketplace.json read) — full clone of the release-
#      source repo + validation that marketplace.json parses and
#      every plugin entry has a usable source spec.
#
#   2. Phase B (per-plugin install via git-subdir + cone-mode sparse-
#      clone) — mirror Claude Code's install behavior. Each plugin's
#      bin shim's first-run `npm install --omit=dev @deskwork/<pkg>@
#      <version>` runs against the actual npm public registry. This
#      means the version pinned in plugin.json MUST be published
#      before this smoke can pass.
#
#   3. Studio HTTP smoke — boot the studio against a fixture project,
#      curl every documented page route, scrape <script>/<link> assets
#      from each, assert every response is 200. Catches the client-JS
#      404 class of bugs that an install-only smoke can't see.
#
# Local-only. Not wired into CI per .claude/rules/agent-discipline.md
# ("No test infrastructure in CI").

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_PORT="${SMOKE_PORT:-47399}"
STUDIO_BOOT_TIMEOUT_S="${STUDIO_BOOT_TIMEOUT_S:-60}"

# ----- ANSI helpers -------------------------------------------------------

if [ -t 1 ]; then
  C_GREEN=$'\033[32m'; C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'
  C_BOLD=$'\033[1m';   C_DIM=$'\033[2m';   C_OFF=$'\033[0m'
else
  C_GREEN=''; C_RED=''; C_YELLOW=''; C_BOLD=''; C_DIM=''; C_OFF=''
fi

ok()    { printf '%s[ok]%s   %s\n'   "$C_GREEN"  "$C_OFF" "$1"; }
fail()  { printf '%s[fail]%s %s\n'   "$C_RED"    "$C_OFF" "$1"; }
info()  { printf '%s[info]%s %s\n'   "$C_BOLD"   "$C_OFF" "$1"; }
warn()  { printf '%s[warn]%s %s\n'   "$C_YELLOW" "$C_OFF" "$1"; }
dim()   { printf '%s%s%s\n'          "$C_DIM"    "$1"     "$C_OFF"; }

# ----- Setup tmp + traps --------------------------------------------------

TMP="$(mktemp -d -t deskwork-smoke.XXXXXX)"
STUDIO_PID=""
STUDIO_LOG=""
FAILURES=0
# Tracked subprocess PIDs the cleanup trap should tear down. Append PIDs of
# long-running subshells (npm install, studio) here when launched so SIGINT
# mid-run kills them rather than orphaning. Entries are removed (best-effort)
# once the subprocess exits cleanly.
KILL_PIDS=()

# Recursively send `signal` to `pid` AND every descendant. Order matters:
# we descend first (kill grandchildren before children) so that a child
# can't reparent its grandchildren to init in the window between parent
# kill and grandchild kill. pgrep is portable on macOS + Linux.
kill_tree() {
  local signal="$1"
  local pid="$2"
  [ -z "${pid}" ] && return 0
  if ! command -v pgrep >/dev/null 2>&1; then
    kill "${signal}" "${pid}" 2>/dev/null || true
    return 0
  fi
  local child
  while IFS= read -r child; do
    [ -z "${child}" ] && continue
    kill_tree "${signal}" "${child}"
  done < <(pgrep -P "${pid}" 2>/dev/null)
  kill "${signal}" "${pid}" 2>/dev/null || true
}

# Idempotent cleanup. Safe to call from EXIT, INT, TERM trap or directly.
CLEANUP_RAN=0
cleanup() {
  if [ "${CLEANUP_RAN}" = "1" ]; then
    return 0
  fi
  CLEANUP_RAN=1

  local pid
  for pid in "${KILL_PIDS[@]:-}"; do
    [ -z "${pid}" ] && continue
    kill_tree -TERM "${pid}"
  done
  if [ "${#KILL_PIDS[@]}" -gt 0 ]; then
    sleep 1
    for pid in "${KILL_PIDS[@]:-}"; do
      [ -z "${pid}" ] && continue
      kill_tree -KILL "${pid}"
    done
  fi

  if [ -n "${STUDIO_PID}" ]; then
    kill_tree -TERM "${STUDIO_PID}"
    sleep 1
    kill_tree -KILL "${STUDIO_PID}"
  fi

  if command -v pgrep >/dev/null 2>&1; then
    local child
    while IFS= read -r child; do
      [ -z "${child}" ] && continue
      kill_tree -TERM "${child}"
    done < <(pgrep -P $$ 2>/dev/null)
    sleep 1
    while IFS= read -r child; do
      [ -z "${child}" ] && continue
      kill_tree -KILL "${child}"
    done < <(pgrep -P $$ 2>/dev/null)
  fi

  if [ "${KEEP_TMP:-}" = "1" ]; then
    warn "KEEP_TMP=1 set — leaving tmp at ${TMP}"
  else
    rm -rf "${TMP}"
  fi
}
trap cleanup EXIT INT TERM

info "smoke tmp: ${TMP}"
info "smoke port: ${SMOKE_PORT}"

# ----- Pre-flight: SMOKE_PORT must be free --------------------------------

preflight_port_free() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    local occupant
    occupant="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null | tr '\n' ',' | sed 's/,$//' || true)"
    if [ -n "${occupant}" ]; then
      fail "smoke-marketplace: port ${port} is in use (pid(s): ${occupant}); set SMOKE_PORT=<free port> and retry"
      return 1
    fi
    return 0
  fi
  if command -v nc >/dev/null 2>&1; then
    if nc -z 127.0.0.1 "${port}" >/dev/null 2>&1; then
      fail "smoke-marketplace: port ${port} is in use; set SMOKE_PORT=<free port> and retry"
      return 1
    fi
    return 0
  fi
  warn "neither lsof nor nc available — skipping port pre-flight; studio will fail fast on EADDRINUSE"
  return 0
}

if ! preflight_port_free "${SMOKE_PORT}"; then
  exit 1
fi
ok "port ${SMOKE_PORT} is free"

# ----- Pre-flight: working tree must be committed -------------------------
#
# build_release_source_clone clones REPO_ROOT, so a dirty working tree
# means the smoke tests a different code state than what's committed
# (and what would actually be tagged at release). The /release skill
# enforces a clean tree as a precondition; this is belt-and-suspenders
# so the smoke can be run independently.
#
# Untracked files are tolerated (they aren't part of HEAD) but
# modifications and staged changes are not.
if ! git -C "${REPO_ROOT}" diff --quiet 2>/dev/null \
   || ! git -C "${REPO_ROOT}" diff --cached --quiet 2>/dev/null; then
  warn "working tree at ${REPO_ROOT} has uncommitted changes"
  warn "smoke clones HEAD; uncommitted changes will NOT be tested"
  warn "for full coverage, commit changes (or stash) before re-running"
  # Not a hard failure — the operator may legitimately want to smoke
  # against committed-state for an iteration loop. We surface it
  # loudly so they can't miss it.
fi

# ----- Pre-flight: pinned npm versions must be published ------------------
#
# Phase B's bin shims run `npm install --omit=dev @deskwork/<pkg>@
# <version>` against the public registry. If the pinned version
# (plugin.json#version) isn't on npm yet, that install will fail with a
# misleading "404 Not Found". Surface that condition explicitly here so
# the operator knows to publish before re-running the smoke.
preflight_npm_version_published() {
  local plugin_dir="$1"
  local pkg="$2"
  local version
  version="$(node -e "
    const fs = require('fs');
    const j = JSON.parse(fs.readFileSync('${plugin_dir}/.claude-plugin/plugin.json', 'utf8'));
    process.stdout.write(j.version);
  ")"
  local got
  got="$(npm view "${pkg}@${version}" version 2>/dev/null || true)"
  if [ "${got}" = "${version}" ]; then
    ok "${pkg}@${version} is published"
    return 0
  fi
  fail "${pkg}@${version} is NOT published on npm — run \`make publish\` (or \`npm publish --access public --workspace ${pkg}\`) before re-running smoke"
  return 1
}

PREFLIGHT_FAIL=0
preflight_npm_version_published "${REPO_ROOT}/plugins/deskwork" "@deskwork/cli" || PREFLIGHT_FAIL=1
preflight_npm_version_published "${REPO_ROOT}/plugins/deskwork-studio" "@deskwork/studio" || PREFLIGHT_FAIL=1
if [ "${PREFLIGHT_FAIL}" -ne 0 ]; then
  exit 1
fi

# ----- Source the clone-install helper -----------------------------------

# shellcheck source=./smoke-clone-install.sh
. "${REPO_ROOT}/scripts/smoke-clone-install.sh"

# ----- Build the release-source clone ------------------------------------
#
# Phases A and B both clone from this repo. With Phase 26's vendor
# retirement, the clone is the release source as-is — no materialize-
# vendor step. See smoke-clone-install.sh for why we clone (rather than
# point at REPO_ROOT directly).

RELEASE_SOURCE="${TMP}/release-source"
build_release_source_clone "${RELEASE_SOURCE}"

# (plugin, bin_name) pairs to validate against both install shapes.
PLUGIN_BIN_PAIRS=(
  "deskwork:deskwork"
  "deskwork-studio:deskwork-studio"
  "dw-lifecycle:dw-lifecycle"
)

# ----- Phase A: full marketplace clone -----------------------------------

info "===== Phase A — marketplace.json read (catalog validation) ====="
phase_a_marketplace_read "${RELEASE_SOURCE}" || true

# ----- Phase B: sparse git-subdir clone ----------------------------------

info "===== Phase B — per-plugin install (marketplace.json source) ====="
for pair in "${PLUGIN_BIN_PAIRS[@]}"; do
  plugin="${pair%%:*}"
  bin_name="${pair#*:}"
  phase_b_per_source "${RELEASE_SOURCE}" "${plugin}" "${bin_name}" || true
done

# Bail before the (slower) studio HTTP smoke if the install path is
# already broken. Saves the operator a 60s wait when the answer is
# "fix the install first."
if [ "${FAILURES}" -gt 0 ]; then
  fail "${FAILURES} install-path assertion(s) failed — skipping studio HTTP smoke"
  exit 1
fi

# ----- Studio HTTP smoke -------------------------------------------------
#
# We re-use the Phase B sparse clone of deskwork-studio for the HTTP
# smoke — its node_modules are already populated (the bin wrapper
# install ran during phase_b), so we can skip a redundant install. We
# just need a fixture project + a studio process bound to SMOKE_PORT.

STUDIO_INSTALL="${TMP}/phase-b-deskwork-studio/plugins/deskwork-studio"
if [ ! -d "${STUDIO_INSTALL}/node_modules" ]; then
  fail "studio install dir has no node_modules — Phase B must have failed silently"
  exit 1
fi

make_fixture_project() {
  local fixture_root="$1"
  mkdir -p "${fixture_root}/.deskwork"
  mkdir -p "${fixture_root}/docs"
  cat > "${fixture_root}/.deskwork/config.json" <<JSON
{
  "version": 1,
  "sites": {
    "smoke-collection": {
      "contentDir": "docs",
      "calendarPath": ".deskwork/calendar.md"
    }
  },
  "defaultSite": "smoke-collection"
}
JSON
  cat > "${fixture_root}/docs/hello.md" <<MD
---
title: Hello smoke test
deskwork:
  id: 00000000-0000-4000-8000-000000000001
---

Smoke fixture body.
MD
  cat > "${fixture_root}/.deskwork/calendar.md" <<MD
# Smoke calendar

(empty)
MD
}

assert_200() {
  local url="$1"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "${url}" || echo "000")"
  if [ "${code}" = "200" ]; then
    ok "200 ${url}"
    return 0
  fi
  fail "HTTP ${code} for ${url}"
  FAILURES=$((FAILURES + 1))
  return 1
}

# Scrape <script src="..."> and <link href="..."> from a URL's body.
# Emits resolved absolute URLs, one per line, deduped.
scrape_assets() {
  local page_url="$1"
  local origin="$2"
  local body
  body="$(curl -sS --max-time 15 "${page_url}")"
  printf '%s' "${body}" \
    | grep -oE '<(script|link)[^>]+(src|href)=("[^"]+"|'"'"'[^'"'"']+'"'"')' \
    | grep -oE '(src|href)=("[^"]+"|'"'"'[^'"'"']+'"'"')' \
    | grep -oE '("[^"]+"|'"'"'[^'"'"']+'"'"')' \
    | tr -d '"'"'" \
    | while IFS= read -r ref; do
        case "${ref}" in
          ''|data:*|mailto:*|javascript:*|'#'*) continue ;;
          http://*|https://*) printf '%s\n' "${ref}" ;;
          //*) printf 'http:%s\n' "${ref}" ;;
          /*) printf '%s%s\n' "${origin}" "${ref}" ;;
          *)  printf '%s/%s\n' "${origin}" "${ref}" ;;
        esac
      done \
    | sort -u
}

assert_page_and_assets() {
  local page_url="$1"
  local origin="$2"
  assert_200 "${page_url}" || return 0
  local asset_count=0
  local asset
  while IFS= read -r asset; do
    [ -z "${asset}" ] && continue
    asset_count=$((asset_count + 1))
    assert_200 "${asset}" || true
  done < <(scrape_assets "${page_url}" "${origin}")
  if [ "${asset_count}" -gt 0 ]; then
    dim "  -> ${asset_count} asset(s) checked from ${page_url}"
  fi
}

FIXTURE_ROOT="${TMP}/fixture-project"
make_fixture_project "${FIXTURE_ROOT}"
ok "fixture project at ${FIXTURE_ROOT}"

STUDIO_LOG="${TMP}/studio.log"
info "booting deskwork-studio (--no-tailscale --port ${SMOKE_PORT} --project-root ${FIXTURE_ROOT})"
(
  cd "${STUDIO_INSTALL}"
  ./bin/deskwork-studio \
    --no-tailscale \
    --port "${SMOKE_PORT}" \
    --project-root "${FIXTURE_ROOT}" \
    > "${STUDIO_LOG}" 2>&1
) &
STUDIO_PID=$!
KILL_PIDS+=("$STUDIO_PID")

# Wait for "listening on" in the log.
boot_deadline=$(( $(date +%s) + STUDIO_BOOT_TIMEOUT_S ))
booted=0
while [ "$(date +%s)" -lt "${boot_deadline}" ]; do
  if ! kill -0 "${STUDIO_PID}" 2>/dev/null; then
    break
  fi
  if grep -q 'listening on' "${STUDIO_LOG}" 2>/dev/null; then
    booted=1
    break
  fi
  sleep 1
done

if [ "${booted}" -ne 1 ]; then
  fail "studio did not boot within ${STUDIO_BOOT_TIMEOUT_S}s"
  echo "----- studio log -----" >&2
  cat "${STUDIO_LOG}" >&2 || true
  echo "----- end log --------" >&2
  exit 1
fi
ok "studio booted, log at ${STUDIO_LOG}"

ORIGIN="http://127.0.0.1:${SMOKE_PORT}"
PAGE_ROUTES=(
  "/dev"
  "/dev/"
  "/dev/editorial-studio"
  "/dev/editorial-help"
  "/dev/editorial-review-shortform"
  "/dev/content"
  "/dev/content/smoke-collection"
)

info "asserting page routes + scraped assets"
for route in "${PAGE_ROUTES[@]}"; do
  assert_page_and_assets "${ORIGIN}${route}" "${ORIGIN}"
done

# ----- Summary -----------------------------------------------------------

if [ "${FAILURES}" -gt 0 ]; then
  fail "${FAILURES} assertion(s) failed"
  exit 1
fi
ok "marketplace smoke test passed"
