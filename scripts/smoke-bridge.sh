#!/usr/bin/env bash
#
# smoke-bridge.sh — local-only Phase 8 automated smoke for the
# studio-bridge feature (feature/studio-bridge branch).
#
# Why a separate script: the bridge code is on the feature branch and
# NOT on npm. scripts/smoke-marketplace.sh exercises the marketplace
# install path (which pulls @deskwork/studio from the public registry)
# — so it boots a bridge-less studio. This script boots the WORKSPACE
# studio (node_modules/.bin/deskwork-studio, which dereferences the
# workspace symlink at node_modules/@deskwork/studio -> packages/studio)
# and asserts the documented bridge endpoints behave as designed.
#
# Per .claude/rules/agent-discipline.md: NOT wired into CI. Local-only
# pre-tag/integration smoke. Run by hand:
#
#   bash scripts/smoke-bridge.sh
#
# Assertions (per workplan Phase 8 task list):
#   1. POST /mcp with an MCP initialize request from loopback returns
#      200 with the streamable-HTTP transport's `event: message` payload
#      (the SSE handshake response). GET /mcp from loopback returns 400
#      session-required — the documented protocol behavior for a GET
#      without an mcp-session-id header.
#   2. POST /mcp from a non-loopback peer returns 403 (loopback guard).
#      Best-effort: requires the host machine to expose a non-loopback
#      IP we can curl. When no such IP exists (e.g. an air-gapped CI
#      runner), this assertion is SKIPPED with a warning, and the
#      operator must verify the 403 path via the manual checklist in
#      docs/1.0/001-IN-PROGRESS/studio-bridge/README.md.
#   3. GET /api/chat/state returns
#      {"mcpConnected":false,"listenModeOn":false,"awaitingMessage":false}.
#   4. POST /api/chat/send with the bridge offline (no MCP client
#      connected) returns 503 with `error: "bridge-offline"`.
#
# The script:
#   - mktemp -d's a fixture project with a minimal .deskwork/config.json
#   - boots the WORKSPACE studio bound to --host 0.0.0.0 so we can curl
#     a non-loopback IP for the 403 check (loopback guard fires on
#     remote-address, not bind-address)
#   - waits up to STUDIO_BOOT_TIMEOUT_S for the listening banner
#   - runs the assertions
#   - tears down studio + tmp dir on success or failure (trap)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_PORT="${SMOKE_PORT:-47398}"
STUDIO_BOOT_TIMEOUT_S="${STUDIO_BOOT_TIMEOUT_S:-30}"

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

# ----- Pre-flight: workspace bin must exist -------------------------------

STUDIO_BIN="${REPO_ROOT}/node_modules/.bin/deskwork-studio"
if [ ! -x "${STUDIO_BIN}" ]; then
  fail "workspace studio bin not found at ${STUDIO_BIN}"
  fail "run \`npm install\` from ${REPO_ROOT} first"
  exit 2
fi
ok "workspace studio bin: ${STUDIO_BIN}"

# ----- Pre-flight: SMOKE_PORT must be free --------------------------------

preflight_port_free() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    local occupant
    occupant="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null | tr '\n' ',' | sed 's/,$//' || true)"
    if [ -n "${occupant}" ]; then
      fail "smoke-bridge: port ${port} is in use (pid(s): ${occupant}); set SMOKE_PORT=<free port> and retry"
      return 1
    fi
    return 0
  fi
  if command -v nc >/dev/null 2>&1; then
    if nc -z 127.0.0.1 "${port}" >/dev/null 2>&1; then
      fail "smoke-bridge: port ${port} is in use; set SMOKE_PORT=<free port> and retry"
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

# ----- Setup tmp + traps --------------------------------------------------

TMP="$(mktemp -d -t deskwork-bridge-smoke.XXXXXX)"
FIXTURE_ROOT="${TMP}/fixture-project"
STUDIO_LOG="${TMP}/studio.log"
STUDIO_PID=""

# Recursively send `signal` to `pid` AND every descendant.
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

  if [ "${KEEP_TMP:-}" = "1" ]; then
    warn "KEEP_TMP=1 set — leaving tmp at ${TMP}"
  else
    rm -rf "${TMP}"
  fi
}
trap cleanup EXIT INT TERM

info "smoke tmp: ${TMP}"
info "smoke port: ${SMOKE_PORT}"

# ----- Build the fixture project root -----------------------------------

mkdir -p "${FIXTURE_ROOT}/.deskwork" "${FIXTURE_ROOT}/docs"
# Minimal config: one site (so the studio dashboard has something to
# render) plus studioBridge.enabled = true so the bridge mounts.
# `printf` keeps us out of heredoc territory (project rule: no `#` in
# heredocs / quoted args).
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

# ----- Pick a non-loopback IP for the 403 assertion ----------------------
#
# The loopback guard checks the remote-address of the incoming request.
# We bind the studio to 0.0.0.0 so it's reachable from any interface,
# then issue a curl from a non-loopback IP we own. If the host has no
# non-loopback IPv4 address, we skip the 403 assertion and surface the
# limitation; the operator covers it via the manual checklist.
NON_LOOPBACK_IP=""
if command -v ifconfig >/dev/null 2>&1; then
  # macOS / BSD ifconfig output: `inet 10.0.0.5 netmask ...`
  NON_LOOPBACK_IP="$(
    ifconfig 2>/dev/null \
      | awk '/inet [0-9]/ && $2 != "127.0.0.1" { print $2; exit }'
  )"
elif command -v ip >/dev/null 2>&1; then
  # Linux iproute2: `inet 10.0.0.5/24 scope global ...`
  NON_LOOPBACK_IP="$(
    ip -4 -o addr show 2>/dev/null \
      | awk '$2 != "lo" { split($4, a, "/"); print a[1]; exit }'
  )"
fi
if [ -n "${NON_LOOPBACK_IP}" ]; then
  ok "non-loopback IP for 403 check: ${NON_LOOPBACK_IP}"
else
  warn "no non-loopback IP detected — 403 (loopback guard) assertion will be SKIPPED"
  warn "operator must verify the 403 path via docs/1.0/001-IN-PROGRESS/studio-bridge/README.md manual checklist"
fi

# ----- Boot the studio ---------------------------------------------------

info "booting workspace studio (--host 0.0.0.0 --port ${SMOKE_PORT} --project-root <fixture>)"
(
  cd "${REPO_ROOT}"
  "${STUDIO_BIN}" \
    --host 0.0.0.0 \
    --port "${SMOKE_PORT}" \
    --project-root "${FIXTURE_ROOT}" \
    > "${STUDIO_LOG}" 2>&1
) &
STUDIO_PID=$!

# Wait for the listening banner. The studio prints "listening on:" then
# every reachable URL on its own line.
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
ok "studio booted (log: ${STUDIO_LOG})"

# Confirm the bridge mounted (banner should mention `Bridge: ...`).
if grep -q "Bridge: http" "${STUDIO_LOG}"; then
  ok "bridge endpoint advertised in startup banner"
else
  fail "studio booted but the bridge banner line is missing — bridge did not mount"
  echo "----- studio log -----" >&2
  cat "${STUDIO_LOG}" >&2 || true
  exit 1
fi

# ----- Assertions --------------------------------------------------------

FAILURES=0

# A1: GET /api/chat/state returns the documented default state.
info "A1: GET /api/chat/state returns default BridgeState"
STATE_BODY="$(curl -sS --max-time 5 "http://127.0.0.1:${SMOKE_PORT}/api/chat/state" || echo "")"
EXPECTED_STATE='{"mcpConnected":false,"listenModeOn":false,"awaitingMessage":false}'
if [ "${STATE_BODY}" = "${EXPECTED_STATE}" ]; then
  ok "A1 PASS — got ${STATE_BODY}"
else
  fail "A1 FAIL — expected ${EXPECTED_STATE}; got: ${STATE_BODY}"
  FAILURES=$((FAILURES + 1))
fi

# A2: POST /api/chat/send with bridge offline returns 503 + bridge-offline.
info "A2: POST /api/chat/send returns 503 when bridge offline"
SEND_BODY_FILE="${TMP}/send-resp.json"
SEND_CODE="$(
  curl -sS -o "${SEND_BODY_FILE}" -w '%{http_code}' --max-time 5 \
    -X POST "http://127.0.0.1:${SMOKE_PORT}/api/chat/send" \
    -H 'content-type: application/json' \
    -d '{"text":"hi"}' \
    || echo "000"
)"
SEND_RESP="$(cat "${SEND_BODY_FILE}" 2>/dev/null || echo '')"
if [ "${SEND_CODE}" = "503" ] && printf '%s' "${SEND_RESP}" | grep -q 'bridge-offline'; then
  ok "A2 PASS — HTTP 503, body: ${SEND_RESP}"
else
  fail "A2 FAIL — expected HTTP 503 with error=bridge-offline; got HTTP ${SEND_CODE}, body: ${SEND_RESP}"
  FAILURES=$((FAILURES + 1))
fi

# A3: POST /mcp with an initialize request from loopback returns 200
# with an SSE-shaped response carrying `event: message` and the MCP
# initialize result. The MCP streamable-HTTP transport responds to a
# JSON initialize POST with an SSE stream; curl reads through to EOF or
# --max-time 3 — either way we get the handshake bytes.
info "A3: POST /mcp initialize from loopback returns the MCP handshake"
MCP_BODY_FILE="${TMP}/mcp-init.txt"
MCP_INIT_BODY='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
MCP_CODE="$(
  curl -sS -o "${MCP_BODY_FILE}" -w '%{http_code}' --max-time 5 \
    -X POST "http://127.0.0.1:${SMOKE_PORT}/mcp" \
    -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -d "${MCP_INIT_BODY}" \
    || echo "000"
)"
MCP_RESP="$(cat "${MCP_BODY_FILE}" 2>/dev/null || echo '')"
if [ "${MCP_CODE}" = "200" ] \
   && printf '%s' "${MCP_RESP}" | grep -q 'event: message' \
   && printf '%s' "${MCP_RESP}" | grep -q 'deskwork-studio-bridge'; then
  ok "A3 PASS — HTTP 200, server identified itself as deskwork-studio-bridge"
  dim "  body preview: $(printf '%s' "${MCP_RESP}" | head -c 200 | tr '\n' ' ')"
else
  fail "A3 FAIL — expected HTTP 200 with MCP handshake; got HTTP ${MCP_CODE}"
  fail "  body: ${MCP_RESP}"
  FAILURES=$((FAILURES + 1))
fi

# A4: GET /mcp without a session header returns 400 session-required.
# This isn't strictly a workplan task, but it documents the GET behavior
# the workplan called out ("MCP handshake response") so the protocol
# contract stays observable from the smoke output.
info "A4: GET /mcp from loopback returns 400 session-required (documented protocol behavior)"
GET_MCP_FILE="${TMP}/mcp-get.json"
GET_MCP_CODE="$(
  curl -sS -o "${GET_MCP_FILE}" -w '%{http_code}' --max-time 5 \
    "http://127.0.0.1:${SMOKE_PORT}/mcp" \
    || echo "000"
)"
GET_MCP_RESP="$(cat "${GET_MCP_FILE}" 2>/dev/null || echo '')"
if [ "${GET_MCP_CODE}" = "400" ] && printf '%s' "${GET_MCP_RESP}" | grep -q 'session-required'; then
  ok "A4 PASS — HTTP 400 session-required (loopback peer reached the MCP handler)"
else
  fail "A4 FAIL — expected HTTP 400 session-required; got HTTP ${GET_MCP_CODE}, body: ${GET_MCP_RESP}"
  FAILURES=$((FAILURES + 1))
fi

# A5: POST /mcp from a non-loopback peer returns 403 (loopback guard).
# Skipped when the host has no non-loopback IPv4.
if [ -n "${NON_LOOPBACK_IP}" ]; then
  info "A5: POST /mcp from ${NON_LOOPBACK_IP} returns 403 (loopback guard)"
  NL_BODY_FILE="${TMP}/mcp-nonloopback.json"
  NL_CODE="$(
    curl -sS -o "${NL_BODY_FILE}" -w '%{http_code}' --max-time 5 \
      -X POST "http://${NON_LOOPBACK_IP}:${SMOKE_PORT}/mcp" \
      -H 'content-type: application/json' \
      -H 'accept: application/json, text/event-stream' \
      -d "${MCP_INIT_BODY}" \
      || echo "000"
  )"
  NL_RESP="$(cat "${NL_BODY_FILE}" 2>/dev/null || echo '')"
  if [ "${NL_CODE}" = "403" ] && printf '%s' "${NL_RESP}" | grep -q 'loopback-only'; then
    ok "A5 PASS — HTTP 403 loopback-only"
  else
    fail "A5 FAIL — expected HTTP 403 loopback-only; got HTTP ${NL_CODE}, body: ${NL_RESP}"
    FAILURES=$((FAILURES + 1))
  fi
else
  warn "A5 SKIPPED — no non-loopback IP available; verify manually per Phase 8 checklist"
fi

# ----- Summary -----------------------------------------------------------

if [ "${FAILURES}" -gt 0 ]; then
  fail "${FAILURES} assertion(s) failed"
  echo "----- studio log -----" >&2
  cat "${STUDIO_LOG}" >&2 || true
  echo "----- end log --------" >&2
  exit 1
fi
printf '\n%s%sPhase 8 automated smoke: PASS%s\n' "$C_GREEN" "$C_BOLD" "$C_OFF"
