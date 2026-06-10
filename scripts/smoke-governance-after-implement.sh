#!/usr/bin/env bash
# Integration smoke for the deskwork-governance Spec Kit extension (slice 001).
#
# Exercises the deterministic orchestration script govern.sh directly (the
# command body is an agent-invoked skill, not headlessly callable — see tasks
# T006/T010). Asserts the governance pass fires deskwork's cross-model
# audit-barrage and produces lane output. Automatic hook firing (SC-001) is
# verified separately by the manual /speckit-implement run in quickstart.md.
#
# Run by hand (NOT CI): bash scripts/smoke-governance-after-implement.sh
# Override the audited diff base: GOVERN_DIFF_BASE=HEAD~6 bash scripts/smoke-...
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

GOVERN="plugins/stack-control/spec-kit/deskwork-governance/scripts/bash/govern.sh"
RUNS_DIR=".dw-lifecycle/scope-discovery/audit-runs"

fail() { echo "SMOKE FAIL: $1" >&2; exit 1; }

[ -f "$GOVERN" ] || fail "govern.sh not found at $GOVERN"

# Snapshot existing run-dirs so we can assert a NEW one was created (AUDIT-20260604-32),
# which also gives RUNS_DIR a purpose (AUDIT-20260604-29).
before="$(find "$RUNS_DIR" -maxdepth 1 -type d 2>/dev/null | sort)"

echo "smoke: invoking govern.sh (base=${GOVERN_DIFF_BASE:-HEAD~1})..."
# Capture govern.sh's stdout; its final line is the authoritative run-dir path
# (AUDIT-20260604-26) — do NOT re-derive it by globbing the runs directory.
out="$(GOVERN_DIFF_BASE="${GOVERN_DIFF_BASE:-HEAD~1}" bash "$GOVERN")" \
  || fail "govern.sh exited non-zero"
latest="$(printf '%s\n' "$out" | tail -1)"
[ -n "$latest" ] && [ -d "$latest" ] \
  || fail "govern.sh did not print a valid run-dir as its final stdout line (got: '$latest')"
# The echoed run-dir must be NEW — a stale/pre-existing path must not pass (AUDIT-20260604-32).
if printf '%s\n' "$before" | grep -qxF "$latest"; then
  fail "govern.sh echoed a pre-existing run-dir ($latest); no new run created"
fi

# Count model lanes = *.md in the run-dir excluding INDEX.md / PROMPT.md, with >0 bytes.
lanes=0
for f in "$latest"/*.md; do
  base="$(basename "$f")"
  case "$base" in INDEX.md|PROMPT.md) continue ;; esac
  [ -s "$f" ] && lanes=$((lanes + 1))
done
[ "$lanes" -ge 2 ] || fail "expected >=2 non-empty model lanes in $latest, found $lanes"

echo "SMOKE PASS: run-dir=$latest lanes=$lanes"
