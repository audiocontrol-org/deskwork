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

# (plugin, vendored-pkg) pairs. Mirrors scripts/materialize-vendor.sh.
STUDIO_VENDOR_PAIRS=(
  "deskwork-studio:core"
  "deskwork-studio:studio"
)
CLI_VENDOR_PAIRS=(
  "deskwork:core"
  "deskwork:cli"
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

cleanup() {
  if [ -n "${STUDIO_PID}" ] && kill -0 "${STUDIO_PID}" 2>/dev/null; then
    kill "${STUDIO_PID}" 2>/dev/null || true
    # Give it a moment, then SIGKILL if it didn't go.
    sleep 1
    kill -9 "${STUDIO_PID}" 2>/dev/null || true
  fi
  if [ -n "${STUDIO_LOG}" ] && [ -f "${STUDIO_LOG}" ] && [ "${KEEP_TMP:-}" != "1" ]; then
    :
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

# ----- Materialize one extracted plugin's vendor symlinks ----------------
#
# Args: $1 = root of extracted tree (containing plugins/ and packages/).
#       $2..$N = "<plugin>:<pkg>" pairs to materialize.
materialize_vendor_in_tree() {
  local tree_root="$1"
  shift
  local pair plugin pkg source_dir vendor_link
  for pair in "$@"; do
    plugin="${pair%%:*}"
    pkg="${pair#*:}"
    source_dir="${tree_root}/packages/${pkg}"
    vendor_link="${tree_root}/plugins/${plugin}/vendor/${pkg}"
    if [ ! -d "${source_dir}" ]; then
      fail "materialize: source dir missing in extracted tree: ${source_dir}"
      return 1
    fi
    if [ ! -L "${vendor_link}" ]; then
      fail "materialize: expected symlink in extracted tree at ${vendor_link} (got: $(ls -ld "${vendor_link}" 2>/dev/null || echo missing))"
      return 1
    fi
    rm "${vendor_link}"
    rsync -a \
      --exclude 'node_modules' \
      --exclude '.turbo' \
      --exclude 'dist' \
      --exclude '*.tsbuildinfo' \
      "${source_dir}/" "${vendor_link}/"
    ok "materialized ${plugin}/vendor/${pkg}"
  done
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
(
  cd "${STUDIO_INSTALL}"
  npm install --omit=dev --no-audit --no-fund --loglevel=error
)
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
  "/"
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
if kill -0 "${STUDIO_PID}" 2>/dev/null; then
  kill "${STUDIO_PID}" 2>/dev/null || true
  sleep 1
  kill -9 "${STUDIO_PID}" 2>/dev/null || true
fi
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
(
  cd "${CLI_INSTALL}"
  npm install --omit=dev --no-audit --no-fund --loglevel=error
)
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
