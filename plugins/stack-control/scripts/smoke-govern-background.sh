#!/usr/bin/env bash
# Local smoke — impl:fix/audit-barrage-cc-timeout.
#
# Proves the REAL detached chain end-to-end: `stackctl govern --background`
# forks a runner into its own session and returns IMMEDIATELY (before the
# work finishes), and `stackctl govern --status` transitions running ->
# completed and relays the govern exit code. A fake govern command
# (STACKCTL_BG_GOVERN_CMD) stands in for the frontier-model barrage so the
# smoke needs no model CLIs.
#
# Run by hand pre-PR/pre-tag (no CI). Exits non-zero on any failed assertion.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${HERE}/.." && pwd)"
STACKCTL="${PLUGIN_ROOT}/bin/stackctl"

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

# Minimal stack-control installation.
mkdir -p "${WORK}/.stack-control"
cat > "${WORK}/.stack-control/config.yaml" <<'YAML'
version: 1
YAML

# Fake govern: emits the run-dir marker line, sleeps so the launcher must
# return BEFORE completion, then exits with a distinctive non-zero code.
FAKE="${WORK}/fake-govern.sh"
cat > "${FAKE}" <<'SH'
#!/usr/bin/env bash
echo "govern: barrage run-dir = /fake/audit-runs/RUN-1"
sleep 2
exit 1
SH
chmod +x "${FAKE}"
export STACKCTL_BG_GOVERN_CMD="${FAKE}"

fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }

echo "== launch (should return immediately) =="
START=$(date +%s)
LAUNCH_OUT="$("${STACKCTL}" govern --mode implement --background --at "${WORK}")"
END=$(date +%s)
echo "${LAUNCH_OUT}"
[ $((END - START)) -lt 2 ] || fail "launch blocked ${START}->${END}s (should be immediate)"
echo "${LAUNCH_OUT}" | grep -q "launched in the background" || fail "no launch banner"

echo "== status while running (EX_TEMPFAIL 75) =="
set +e
"${STACKCTL}" govern --status --at "${WORK}"
RUNNING_CODE=$?
set -e
[ "${RUNNING_CODE}" -eq 75 ] || fail "expected running exit 75, got ${RUNNING_CODE}"

echo "== poll to completion =="
for _ in $(seq 1 20); do
  set +e
  OUT="$("${STACKCTL}" govern --status --at "${WORK}")"
  CODE=$?
  set -e
  echo "${OUT}" | grep -q "completed" && break
  sleep 1
done
[ "${CODE}" -eq 1 ] || fail "expected completed gate verdict exit 1, got ${CODE}"
echo "${OUT}" | grep -q "run-dir: /fake/audit-runs/RUN-1" || fail "run-dir not surfaced from log"

echo "SMOKE PASS: detached govern launch + status roundtrip"
