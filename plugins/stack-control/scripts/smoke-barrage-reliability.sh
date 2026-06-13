#!/usr/bin/env bash
# smoke-barrage-reliability.sh — specs/014-audit-barrage-reliability
# quickstart validations SC-003 + SC-006 (fixture lanes; no model spend).
#
#   SC-003 — forced timeout is loud at synthesis: a two-lane barrage where one
#            lane has timeout_seconds: 1 must (a) render the INDEX fleet
#            report `configured: 2, produced: 1 ⚠ DEGRADED` with the killed
#            lane `terminal state: timed-out`, and (b) repeat the degradation
#            in `audit-barrage-lift` output while lifting ZERO findings from
#            the killed lane — readable without opening the run dir.
#
#   SC-006 — a pre-014 (v1) config override is refused at load: exit 2, a
#            message naming the config file, the missing v2 fields, and the
#            template path; zero spawns launched.
#
# Local-only smoke (run by hand pre-PR); not wired into CI per
# .claude/rules/agent-discipline.md § No test infrastructure in CI.

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACKCTL="$PLUGIN_ROOT/bin/stackctl"
NODE_BIN="$(command -v node)"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
  echo "SMOKE FAIL: $1" >&2
  exit 1
}

# ---------- SC-003: forced timeout is loud at synthesis ----------
REPO="$WORK/sc003"
mkdir -p "$REPO/docs/1.0/001-IN-PROGRESS/sc003" "$REPO/.stack-control"
printf '# Audit Log — sc003\n' > "$REPO/docs/1.0/001-IN-PROGRESS/sc003/audit-log.md"

cat > "$WORK/emit.cjs" <<'CJS'
process.stdout.write([
  '### Forced-timeout smoke finding',
  '',
  'Finding-ID: AUDIT-BARRAGE-fast-01',
  'Status:     open',
  'Severity:   low',
  'Surface:    smoke/sc003.ts:1',
  '',
  'Body from the surviving lane.',
  '',
].join('\n'));
CJS
cat > "$WORK/sleep.cjs" <<'CJS'
setTimeout(() => {}, 30000);
CJS

cat > "$REPO/.stack-control/audit-barrage-config.yaml" <<YAML
models:
  - name: fast
    binary: $NODE_BIN
    model: fixture
    args_template: "$WORK/emit.cjs --model {{model}} {{prompt}}"
    readonly_enforcement: none
    output_mode: text
    liveness_signal: none
    timeout_seconds: 60
  - name: slow
    binary: $NODE_BIN
    model: fixture
    args_template: "$WORK/sleep.cjs --model {{model}} {{prompt}}"
    readonly_enforcement: none
    output_mode: text
    liveness_signal: none
    timeout_seconds: 1
YAML

printf 'smoke prompt\n' > "$WORK/prompt.md"

set +e
BARRAGE_ERR="$WORK/barrage.err"
RUN_DIR="$("$STACKCTL" audit-barrage \
  --feature sc003 \
  --prompt-file "$WORK/prompt.md" \
  --repo-root "$REPO" \
  --output-run-dir 2>"$BARRAGE_ERR")"
barrage_exit=$?
set -e
[ "$barrage_exit" -eq 0 ] || { cat "$BARRAGE_ERR" >&2; fail "SC-003 barrage expected exit 0 (fast lane converged), got $barrage_exit"; }

grep -q '## Fleet report' "$RUN_DIR/INDEX.md" || fail 'SC-003 INDEX missing fleet report block'
grep -q -- '- configured: 2, produced: 1  ⚠ DEGRADED' "$RUN_DIR/INDEX.md" || fail 'SC-003 INDEX missing degraded line'
grep -q -- '- terminal state: timed-out' "$RUN_DIR/INDEX.md" || fail 'SC-003 INDEX missing timed-out terminal state'
grep -q 'DEGRADED' "$BARRAGE_ERR" || fail 'SC-003 fire-time stderr missing fleet degradation'

LIFT_OUT="$WORK/lift.out"
LIFT_ERR="$WORK/lift.err"
"$STACKCTL" audit-barrage-lift \
  --feature sc003 \
  --run-dir "$RUN_DIR" \
  --repo-root "$REPO" \
  >"$LIFT_OUT" 2>"$LIFT_ERR" || fail 'SC-003 lift exited non-zero'
grep -q 'slow — timed-out' "$LIFT_ERR" || fail 'SC-003 lift output missing killed-lane state'
grep -q 'ZERO findings' "$LIFT_ERR" || fail 'SC-003 lift output missing zero-findings marking'
grep -q -- '- configured: 2, produced: 1  ⚠ DEGRADED' "$LIFT_ERR" || fail 'SC-003 lift output missing repeated fleet report'
grep -q 'Forced-timeout smoke finding' "$LIFT_OUT" || fail 'SC-003 lift dropped the surviving lane finding'
echo 'SC-003 PASS: degradation readable from synthesis output alone'

# ---------- SC-006: pre-014 config refused with remediation ----------
REPO6="$WORK/sc006"
mkdir -p "$REPO6/.stack-control"
cat > "$REPO6/.stack-control/audit-barrage-config.yaml" <<'YAML'
models:
  - name: claude
    binary: claude
    args_template: "-p {{prompt-stdin}}"
    timeout_seconds: 300
YAML

set +e
SC6_ERR="$WORK/sc006.err"
"$STACKCTL" audit-barrage \
  --feature sc006 \
  --prompt-file "$WORK/prompt.md" \
  --repo-root "$REPO6" \
  --output-run-dir 2>"$SC6_ERR" >/dev/null
sc6_exit=$?
set -e
[ "$sc6_exit" -eq 2 ] || fail "SC-006 expected exit 2 (load refusal), got $sc6_exit"
grep -q 'audit-barrage-config.yaml' "$SC6_ERR" || fail 'SC-006 refusal does not name the config file'
grep -q 'model' "$SC6_ERR" || fail 'SC-006 refusal does not name the missing model pin'
grep -q 'readonly_enforcement' "$SC6_ERR" || fail 'SC-006 refusal does not name readonly_enforcement'
grep -q 'templates/audit-barrage-config.yaml' "$SC6_ERR" || fail 'SC-006 refusal does not name the template path'
[ -z "$(ls "$REPO6/.stack-control" | grep audit-runs || true)" ] || fail 'SC-006 refused load still created a run dir (spawns launched?)'
echo 'SC-006 PASS: pre-014 config refused with file + fields + template path; zero spawns'

echo 'smoke-barrage-reliability: ALL PASS'
