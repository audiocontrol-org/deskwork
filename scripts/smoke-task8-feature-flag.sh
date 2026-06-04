#!/usr/bin/env bash
# Phase 18 Task 8 — verify every SKILL-prose chain that uses --feature
# runs without "unknown arg" against the LOCAL source (tsx-driven).
#
# Refs #417.
#
# This is the regression check for Task 8: the implementation in
# Tasks 2-7 added --feature to six verbs. This smoke confirms the
# SKILL prose's invocations all resolve. The post-release verification
# (against an installed dw-lifecycle binary) is the operator's call
# per the verify-in-installed-release rule.
set -e
set -o pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
CLI="npx tsx $REPO_ROOT/plugins/dw-lifecycle/src/cli.ts"

run_chain() {
  local label=$1
  shift
  echo "=== $label ==="
  set +e
  local out
  out=$($CLI "$@" 2>&1)
  local code=$?
  set -e
  if echo "$out" | grep -q 'unknown arg'; then
    echo "FAIL: '$label' emitted 'unknown arg':"
    echo "$out"
    return 2
  fi
  echo "OK: '$label' (exit=$code; no unknown-arg)"
  return 0
}

# All 6 chained verbs against this repo's hygiene feature. Each verb's
# acceptance criterion is "no `unknown arg: --feature` error" — the
# exit code may be 0/1/2 depending on findings, which is expected.
run_chain 'check-clones'                check-clones                --feature hygiene
run_chain 'check-anti-patterns'         check-anti-patterns         --feature hygiene
run_chain 'check-adopters'              check-adopters              --feature hygiene
run_chain 'check-module-symmetry'       check-module-symmetry       --feature hygiene
# check-refactor-preconditions needs a commit-msg input; pass empty so
# the marker scan finds nothing and the gate is silent. --feature is
# accepted regardless.
run_chain 'check-refactor-preconditions' check-refactor-preconditions --feature hygiene --commit-msg ''
run_chain 'check-disposition-survivor'  check-disposition-survivor  --feature hygiene

echo ''
echo 'All 6 SKILL-chain verbs accept --feature hygiene against the local source.'
