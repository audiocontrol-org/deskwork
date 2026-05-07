#!/usr/bin/env bash
#
# smoke-bridge-sidecar.sh — Phase 10c local smoke for the
# two-process bridge model (sidecar + studio).
#
# Why a separate script: smoke-bridge.sh exercises the in-process
# bridge mount that 10b retired. This script asserts the
# studio-restart-survives-MCP property that is the whole point of
# Phase 10c.
#
# Per .claude/rules/agent-discipline.md: NOT wired into CI. Local-only
# smoke. Run by hand:
#
#   bash scripts/smoke-bridge-sidecar.sh
#
# Assertions (per workplan Phase 10c task 8):
#   B1. Sidecar boots, descriptor lands at .deskwork/.bridge.
#   B2. Studio boots, discovers sidecar, descriptor lands at .deskwork/.studio.
#   B3. Through-sidecar GET /dev/editorial-studio returns 200 (proxy works).
#   B4. SIGKILL the studio. Through-sidecar GET /dev/* returns 502
#       with the "Studio restarting" page; /api/chat/state still 200.
#   B5. Restart studio. Through-sidecar GET /dev/* returns 200 again.
#   B6. The .studio descriptor reflects the new pid.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIDECAR_PORT="${SIDECAR_PORT:-47498}"
STUDIO_PORT="${STUDIO_PORT:-47598}"
BOOT_TIMEOUT_S="${BOOT_TIMEOUT_S:-30}"

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

# ----- Pre-flight: workspace bins ----------------------------------------

BRIDGE_BIN="${REPO_ROOT}/node_modules/.bin/deskwork-bridge"
STUDIO_BIN="${REPO_ROOT}/node_modules/.bin/deskwork-studio"
if [ ! -x "${BRIDGE_BIN}" ] || [ ! -x "${STUDIO_BIN}" ]; then
  fail "workspace bins missing — run \`npm install\` from ${REPO_ROOT} first"
  fail "  bridge: ${BRIDGE_BIN}"
  fail "  studio: ${STUDIO_BIN}"
  exit 2
fi
ok "workspace bins present"

# ----- Pre-flight: ports must be free ------------------------------------

preflight_port_free() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    local occupant
    occupant="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null | tr '\n' ',' | sed 's/,$//' || true)"
    if [ -n "${occupant}" ]; then
      fail "port ${port} is in use (pid(s): ${occupant})"
      return 1
    fi
    return 0
  fi
  if command -v nc >/dev/null 2>&1; then
    if nc -z 127.0.0.1 "${port}" >/dev/null 2>&1; then
      fail "port ${port} is in use"
      return 1
    fi
    return 0
  fi
  warn "neither lsof nor nc — skipping pre-flight; binds will fail fast on EADDRINUSE"
  return 0
}

preflight_port_free "${SIDECAR_PORT}" || exit 1
preflight_port_free "${STUDIO_PORT}" || exit 1
ok "ports free: sidecar=${SIDECAR_PORT} studio=${STUDIO_PORT}"

# ----- Setup tmp + traps -------------------------------------------------

TMP="$(mktemp -d -t deskwork-bridge-sidecar-smoke.XXXXXX)"
FIXTURE_ROOT="${TMP}/fixture-project"
SIDECAR_LOG="${TMP}/sidecar.log"
STUDIO_LOG="${TMP}/studio.log"
SIDECAR_PID=""
STUDIO_PID=""

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

CLEANUP_RAN=0
cleanup() {
  if [ "${CLEANUP_RAN}" = "1" ]; then
    return 0
  fi
  CLEANUP_RAN=1

  if [ -n "${STUDIO_PID}" ]; then
    kill_tree -TERM "${STUDIO_PID}"
    sleep 1
    kill_tree -KILL "${STUDIO_PID}"
  fi
  if [ -n "${SIDECAR_PID}" ]; then
    kill_tree -TERM "${SIDECAR_PID}"
    sleep 1
    kill_tree -KILL "${SIDECAR_PID}"
  fi

  if [ "${KEEP_TMP:-}" = "1" ]; then
    warn "KEEP_TMP=1 — leaving tmp at ${TMP}"
  else
    rm -rf "${TMP}"
  fi
}
trap cleanup EXIT INT TERM

info "smoke tmp: ${TMP}"

# ----- Build the fixture project root -----------------------------------

mkdir -p "${FIXTURE_ROOT}/.deskwork" "${FIXTURE_ROOT}/docs"
printf '%s\n' \
  '{' \
  '  "version": 1,' \
  '  "sites": {' \
  '    "smoke": {' \
  '      "contentDir": "docs",' \
  '      "calendarPath": ".deskwork/calendar.md"' \
  '    }' \
  '  },' \
  '  "defaultSite": "smoke",' \
  '  "studioBridge": { "enabled": true }' \
  '}' \
  > "${FIXTURE_ROOT}/.deskwork/config.json"
printf '%s\n' "Smoke calendar" "" "(empty)" \
  > "${FIXTURE_ROOT}/.deskwork/calendar.md"
ok "fixture project at ${FIXTURE_ROOT}"

# ----- B1: boot sidecar -------------------------------------------------

info "B1: booting sidecar (--no-tailscale --port ${SIDECAR_PORT})"
(
  cd "${REPO_ROOT}"
  "${BRIDGE_BIN}" \
    --no-tailscale \
    --port "${SIDECAR_PORT}" \
    --project-root "${FIXTURE_ROOT}" \
    > "${SIDECAR_LOG}" 2>&1
) &
SIDECAR_PID=$!

deadline=$(( $(date +%s) + BOOT_TIMEOUT_S ))
booted=0
while [ "$(date +%s)" -lt "${deadline}" ]; do
  if ! kill -0 "${SIDECAR_PID}" 2>/dev/null; then
    break
  fi
  if grep -q 'listening on' "${SIDECAR_LOG}" 2>/dev/null; then
    booted=1
    break
  fi
  sleep 1
done
if [ "${booted}" -ne 1 ]; then
  fail "B1 FAIL — sidecar did not boot within ${BOOT_TIMEOUT_S}s"
  echo "----- sidecar log -----" >&2
  cat "${SIDECAR_LOG}" >&2 || true
  exit 1
fi
if [ ! -f "${FIXTURE_ROOT}/.deskwork/.bridge" ]; then
  fail "B1 FAIL — sidecar booted but .bridge descriptor missing"
  exit 1
fi
ok "B1 PASS — sidecar listening; .bridge descriptor written"

# ----- B2: boot studio --------------------------------------------------

info "B2: booting studio (--studio-port ${STUDIO_PORT})"
(
  cd "${REPO_ROOT}"
  "${STUDIO_BIN}" \
    --studio-port "${STUDIO_PORT}" \
    --project-root "${FIXTURE_ROOT}" \
    > "${STUDIO_LOG}" 2>&1
) &
STUDIO_PID=$!

deadline=$(( $(date +%s) + BOOT_TIMEOUT_S ))
booted=0
while [ "$(date +%s)" -lt "${deadline}" ]; do
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
  fail "B2 FAIL — studio did not boot within ${BOOT_TIMEOUT_S}s"
  echo "----- studio log -----" >&2
  cat "${STUDIO_LOG}" >&2 || true
  exit 1
fi
if [ ! -f "${FIXTURE_ROOT}/.deskwork/.studio" ]; then
  fail "B2 FAIL — studio booted but .studio descriptor missing"
  exit 1
fi
ok "B2 PASS — studio listening; .studio descriptor written"

# ----- B3: through-sidecar /dev hits the studio -------------------------

info "B3: GET /dev/editorial-studio through sidecar returns 200"
sleep 1
DEV_CODE="$(
  curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
    "http://127.0.0.1:${SIDECAR_PORT}/dev/editorial-studio" \
    || echo "000"
)"
if [ "${DEV_CODE}" = "200" ]; then
  ok "B3 PASS — sidecar reverse-proxy reached the studio (HTTP ${DEV_CODE})"
else
  fail "B3 FAIL — expected HTTP 200; got ${DEV_CODE}"
  exit 1
fi

# ----- B4: SIGKILL the studio ------------------------------------------

info "B4: SIGKILL the studio; through-sidecar /dev/* returns 502"
kill_tree -KILL "${STUDIO_PID}"
STUDIO_PID=""
sleep 2

DOWN_CODE="$(
  curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
    "http://127.0.0.1:${SIDECAR_PORT}/dev/editorial-studio" \
    || echo "000"
)"
if [ "${DOWN_CODE}" = "502" ]; then
  ok "B4 PASS — studio down → /dev/* returns 502"
else
  fail "B4 FAIL — expected HTTP 502 with studio down; got ${DOWN_CODE}"
  exit 1
fi

# /api/chat/state should still respond — proves MCP / queue surface is unaffected.
STATE_CODE="$(
  curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
    "http://127.0.0.1:${SIDECAR_PORT}/api/chat/state" \
    || echo "000"
)"
if [ "${STATE_CODE}" = "200" ]; then
  ok "B4b PASS — /api/chat/state still 200 with studio down"
else
  fail "B4b FAIL — expected /api/chat/state 200; got ${STATE_CODE}"
  exit 1
fi

# ----- B5: restart studio ----------------------------------------------

info "B5: restart studio"
(
  cd "${REPO_ROOT}"
  "${STUDIO_BIN}" \
    --studio-port "${STUDIO_PORT}" \
    --project-root "${FIXTURE_ROOT}" \
    > "${STUDIO_LOG}.restart" 2>&1
) &
STUDIO_PID=$!

deadline=$(( $(date +%s) + BOOT_TIMEOUT_S ))
booted=0
while [ "$(date +%s)" -lt "${deadline}" ]; do
  if ! kill -0 "${STUDIO_PID}" 2>/dev/null; then
    break
  fi
  if grep -q 'listening on' "${STUDIO_LOG}.restart" 2>/dev/null; then
    booted=1
    break
  fi
  sleep 1
done
if [ "${booted}" -ne 1 ]; then
  fail "B5 FAIL — studio did not restart within ${BOOT_TIMEOUT_S}s"
  echo "----- studio restart log -----" >&2
  cat "${STUDIO_LOG}.restart" >&2 || true
  exit 1
fi
sleep 1

UP_CODE="$(
  curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
    "http://127.0.0.1:${SIDECAR_PORT}/dev/editorial-studio" \
    || echo "000"
)"
if [ "${UP_CODE}" = "200" ]; then
  ok "B5 PASS — through-sidecar /dev/* returns 200 after studio restart"
else
  fail "B5 FAIL — expected HTTP 200 after restart; got ${UP_CODE}"
  exit 1
fi

# Sidecar's /api/chat/state still works — proves the sidecar process
# survived the studio bounce.
STATE_AFTER_CODE="$(
  curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
    "http://127.0.0.1:${SIDECAR_PORT}/api/chat/state" \
    || echo "000"
)"
if [ "${STATE_AFTER_CODE}" = "200" ]; then
  ok "B6 PASS — sidecar's /api/chat/state still 200 after studio restart"
else
  fail "B6 FAIL — expected 200 after restart; got ${STATE_AFTER_CODE}"
  exit 1
fi

printf '\n%s%sPhase 10c sidecar smoke: PASS%s\n' "$C_GREEN" "$C_BOLD" "$C_OFF"
