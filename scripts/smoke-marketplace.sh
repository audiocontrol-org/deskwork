#!/usr/bin/env bash
#
# smoke-marketplace.sh — local-only pre-tag smoke test that reproduces the
# marketplace install path against the current commit and asserts every
# page route + every <script>/<link> static asset returns HTTP 200.
#
# Why: catches the v0.6.0–v0.8.2 client-JS-404 bug class, dangling vendor
# symlinks, missing files, broken bin wrappers — packaging regressions —
# at release time rather than after adopters install.
#
# How:
#   1. git archive HEAD plugins/<plugin> packages/ → $tmp (reproduces the
#      marketplace tarball as Claude Code's clone+copy would see it).
#   2. Materialize vendor symlinks in the extracted tree (rsync from the
#      extracted packages/ into plugins/<plugin>/vendor/<pkg>/). This is
#      the same step the release workflow runs; we run it locally against
#      the extracted tree, not the working tree.
#   3. Boot the studio against a fixture project; curl every documented
#      page route; scrape <script src> and <link href> URLs from each
#      page body and curl those too. Assert every response is 200.
#   4. Repeat for the deskwork CLI plugin (no HTTP routes — verify
#      `deskwork --help` exits 0).
#
# Local-only. Not wired into CI per .claude/rules/agent-discipline.md
# ("No test infrastructure in CI").

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_PORT="${SMOKE_PORT:-47399}"
STUDIO_BOOT_TIMEOUT_S="${STUDIO_BOOT_TIMEOUT_S:-60}"

# Source the release-time materialization runtime so the smoke uses the
# SAME code path the release uses — including the symlink-traversal
# guard and the mode-bit verification. Sourcing must happen at script
# top, not inside a function (sourcing is one-time and exposes the
# functions to the rest of this script).
# shellcheck source=./materialize-vendor.sh
. "${REPO_ROOT}/scripts/materialize-vendor.sh"

# (plugin, vendored-pkg) pairs. Mirrors scripts/materialize-vendor.sh.
STUDIO_VENDOR_PAIRS=(
  "deskwork-studio:core"
  "deskwork-studio:studio"
  "deskwork-studio:cli-bin-lib"
)
CLI_VENDOR_PAIRS=(
  "deskwork:core"
  "deskwork:cli"
  "deskwork:cli-bin-lib"
)

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
# Tears down (in order): tracked subprocess PIDs (with their entire process
# subtree, since each was launched in a `( ... ) &` subshell whose grandchild
# may be the actual server / npm process), the recorded studio PID's tree,
# any direct children of the script (catch-all), then the tmp dir.
CLEANUP_RAN=0
cleanup() {
  if [ "${CLEANUP_RAN}" = "1" ]; then
    return 0
  fi
  CLEANUP_RAN=1

  # Tear down each tracked subprocess subtree (TERM → 1s grace → KILL).
  # We walk descendants and kill them too because launching a server with
  # `( cd ... ; node server.ts ) &` records the subshell's PID, NOT the
  # node grandchild. SIGTERM to the subshell does not reliably propagate
  # to the grandchild on macOS — the grandchild reparents to init and
  # keeps running. kill_tree fixes that.
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

  # Defense in depth: kill the recorded studio PID's subtree even if it
  # wasn't tracked in KILL_PIDS.
  if [ -n "${STUDIO_PID}" ]; then
    kill_tree -TERM "${STUDIO_PID}"
    sleep 1
    kill_tree -KILL "${STUDIO_PID}"
  fi

  # Final sweep: any direct children of this script (catches grandchildren
  # spawned inside subshells we did not record). Use the recursive walker
  # via pgrep -P $$ so we hit the full subtree, not just direct children.
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
#
# Belt-and-suspenders check. The studio refuses to auto-increment when
# --port is passed explicitly (which we do), so a port collision will
# surface as a hard boot failure with a clear error from the studio. But
# checking here too means we fail BEFORE the (slow) git archive + npm
# install, which is a much better operator experience.
#
# Detection method (macOS + Linux):
#   1. lsof -nP -iTCP:<port> -sTCP:LISTEN -t  — preferred; macOS default,
#      common on Linux. Exits with PIDs listed if occupied.
#   2. nc -z 127.0.0.1 <port>                 — fallback; widely available.
#      Exits 0 when a connection succeeds (= port occupied).
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

# ----- Materialize one extracted plugin's vendor symlinks ----------------
#
# Delegates to materialize_vendor_pairs (sourced from materialize-vendor.sh
# above). The shared function does the symlink-traversal guard, content
# diff, and mode-bit verification — keeping smoke and release on a
# single code path so they cannot disagree about what materialization
# does.
#
# Args: $1 = root of extracted tree (containing plugins/ and packages/).
#       $2..$N = "<plugin>:<pkg>" pairs to materialize.
materialize_vendor_in_tree() {
  local tree_root="$1"
  shift
  if ! materialize_vendor_pairs "${tree_root}" "$@"; then
    fail "materialize: materialize_vendor_pairs failed under ${tree_root}"
    return 1
  fi
}

# ----- Fixture project ---------------------------------------------------
#
# A minimal collection: one site, one stub markdown file, no host. The
# studio only needs .deskwork/config.json + the contentDir to be present;
# calendar.md is optional (renderer treats absence as "no entries").
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

# ----- HTTP assertion helpers --------------------------------------------

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

# Scrape <script src="..."> and <link href="..."> from a URL's body. Emits
# resolved absolute URLs (one per line). Resolution: anything that already
# starts with http:// or https:// is left alone; anything else is treated
# as path-relative to the page's origin.
scrape_assets() {
  local page_url="$1"
  local origin="$2"
  local body
  body="$(curl -sS --max-time 15 "${page_url}")"
  # Extract script src and link href values. Tolerate single or double
  # quotes; ignore inline scripts (no `src=`).
  printf '%s' "${body}" \
    | grep -oE '<(script|link)[^>]+(src|href)=("[^"]+"|'"'"'[^'"'"']+'"'"')' \
    | grep -oE '(src|href)=("[^"]+"|'"'"'[^'"'"']+'"'"')' \
    | grep -oE '("[^"]+"|'"'"'[^'"'"']+'"'"')' \
    | tr -d '"'"'" \
    | while IFS= read -r ref; do
        # Skip empty, data:, mailto:, javascript:, fragment-only.
        case "${ref}" in
          ''|data:*|mailto:*|javascript:*|'#'*) continue ;;
          http://*|https://*) printf '%s\n' "${ref}" ;;
          //*) printf 'http:%s\n' "${ref}" ;;
          /*) printf '%s%s\n' "${origin}" "${ref}" ;;
          *)  # treat as relative-to-page; rare in this codebase but safe.
              printf '%s/%s\n' "${origin}" "${ref}" ;;
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
    dim "  → ${asset_count} asset(s) checked from ${page_url}"
  fi
}

# ----- Studio plugin smoke -----------------------------------------------

info "extracting plugins/deskwork-studio + packages/ from HEAD"
mkdir -p "${TMP}/studio-tree"
git -C "${REPO_ROOT}" archive HEAD plugins/deskwork-studio packages \
  | tar -x -C "${TMP}/studio-tree/"
ok "extracted to ${TMP}/studio-tree"

materialize_vendor_in_tree "${TMP}/studio-tree" "${STUDIO_VENDOR_PAIRS[@]}"

# Drop packages/ AFTER materialization so the npm install sees a fully
# self-contained plugin tree (the marketplace install does not include
# packages/; it only sees plugins/<name>/).
# We keep the studio tree at studio-tree/plugins/deskwork-studio. The
# packages/ dir can be removed to mirror what the operator's machine has.
rm -rf "${TMP}/studio-tree/packages"

STUDIO_INSTALL="${TMP}/studio-tree/plugins/deskwork-studio"
info "first-run npm install in ${STUDIO_INSTALL}"
# Run in background + wait so SIGINT can interrupt the wait (bash's `wait`
# is signal-interruptible) and the trap can find the npm subshell PID in
# KILL_PIDS to tear it down cleanly. A bare `(...)` synchronous subshell
# does not propagate SIGINT predictably to the npm child.
(
  cd "${STUDIO_INSTALL}"
  npm install --omit=dev --no-audit --no-fund --loglevel=error
) &
STUDIO_NPM_PID=$!
KILL_PIDS+=("$STUDIO_NPM_PID")
set +e
wait "$STUDIO_NPM_PID"
STUDIO_NPM_EXIT=$?
set -e
# Best-effort: drop the just-finished PID from KILL_PIDS so the trap doesn't
# try to TERM a reaped process. (Trap is already idempotent w.r.t. dead PIDs
# via `kill -0` guard, so this is purely cosmetic / future-proofing.)
KILL_PIDS=("${KILL_PIDS[@]/$STUDIO_NPM_PID}")
if [ "${STUDIO_NPM_EXIT}" -ne 0 ]; then
  fail "npm install failed in ${STUDIO_INSTALL} (exit ${STUDIO_NPM_EXIT})"
  exit 1
fi
ok "npm install completed"

# Fixture project
FIXTURE_ROOT="${TMP}/fixture-project"
make_fixture_project "${FIXTURE_ROOT}"
ok "fixture project at ${FIXTURE_ROOT}"

# Boot the studio.
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
# Note: `/` is intentionally excluded — it 302-redirects to `/dev/`, which is
# already covered below. assert_200 expects 200 directly and does not follow
# redirects. Coverage is unchanged because every destination route is listed.
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

# ----- CLI plugin smoke --------------------------------------------------

info "stopping studio for CLI plugin smoke"
# Use kill_tree to reach grandchildren — STUDIO_PID points at the `( ... ) &`
# subshell, but the actual node process is its grandchild via tsx. A bare
# kill on the subshell does NOT reliably propagate on macOS.
kill_tree -TERM "${STUDIO_PID}"
sleep 1
kill_tree -KILL "${STUDIO_PID}"
# Drop from KILL_PIDS now that we've reaped it ourselves.
KILL_PIDS=("${KILL_PIDS[@]/$STUDIO_PID}")
STUDIO_PID=""

info "extracting plugins/deskwork + packages/ from HEAD"
mkdir -p "${TMP}/cli-tree"
git -C "${REPO_ROOT}" archive HEAD plugins/deskwork packages \
  | tar -x -C "${TMP}/cli-tree/"
ok "extracted to ${TMP}/cli-tree"

materialize_vendor_in_tree "${TMP}/cli-tree" "${CLI_VENDOR_PAIRS[@]}"

rm -rf "${TMP}/cli-tree/packages"

CLI_INSTALL="${TMP}/cli-tree/plugins/deskwork"
info "first-run npm install in ${CLI_INSTALL}"
# Same trackable-background pattern as the studio install above so SIGINT
# mid-install tears down the npm subshell instead of orphaning it.
(
  cd "${CLI_INSTALL}"
  npm install --omit=dev --no-audit --no-fund --loglevel=error
) &
CLI_NPM_PID=$!
KILL_PIDS+=("$CLI_NPM_PID")
set +e
wait "$CLI_NPM_PID"
CLI_NPM_EXIT=$?
set -e
KILL_PIDS=("${KILL_PIDS[@]/$CLI_NPM_PID}")
if [ "${CLI_NPM_EXIT}" -ne 0 ]; then
  fail "npm install failed in ${CLI_INSTALL} (exit ${CLI_NPM_EXIT})"
  exit 1
fi
ok "npm install completed"

info "running deskwork --help"
if ( cd "${CLI_INSTALL}" && ./bin/deskwork --help >/dev/null 2>&1 ); then
  ok "deskwork --help exited 0"
else
  fail "deskwork --help exited non-zero"
  ( cd "${CLI_INSTALL}" && ./bin/deskwork --help || true ) >&2
  FAILURES=$((FAILURES + 1))
fi

# ----- Summary -----------------------------------------------------------

if [ "${FAILURES}" -gt 0 ]; then
  fail "${FAILURES} assertion(s) failed"
  exit 1
fi
ok "marketplace smoke test passed"
