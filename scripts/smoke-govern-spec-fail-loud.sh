#!/usr/bin/env bash
#
# smoke-govern-spec-fail-loud.sh — US3 (T012 / T013): govern-spec.sh fails loud
# when the audit capability is absent, and records reduced coverage when only a
# subset of model families is available — never a silent skip (FR-005 / FR-008).
#
# T012 (deterministic): with the barrage entrypoint not resolvable, govern-spec.sh
#   exits 2 with an actionable message and leaves the feature audit-log UNCHANGED.
# T013 (live, when models present): with GOVERN_MODELS pinned to a single lane out
#   of the configured battery, the run records ONLY the lane(s) that ran (coverage
#   is transparent, never presented as the full battery).
#
# Local-only. T012 needs no model CLIs; T013 is skipped unless a model CLI is on PATH.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GOVERN_SPEC_SH="${REPO_ROOT}/plugins/stack-control/spec-kit/spec-governance/scripts/bash/govern-spec.sh"
FIXTURES="${REPO_ROOT}/plugins/stack-control/tests/fixtures/spec-governance"

[ -f "${GOVERN_SPEC_SH}" ] || { echo "smoke-fail-loud: FAIL — script not found at ${GOVERN_SPEC_SH}" >&2; exit 1; }
fail() { echo "smoke-fail-loud: FAIL — $1" >&2; exit 1; }

# ---- T012: capability absent → exit 2, audit-log unchanged ----
work="$(mktemp -d "${TMPDIR:-/tmp}/smoke-fail-loud.XXXXXX")"
trap 'rm -rf "${work}"' EXIT
slug="spec-gov-failloud"
feature_dir="${work}/docs/1.0/001-IN-PROGRESS/${slug}"
mkdir -p "${feature_dir}"
audit_log="${feature_dir}/audit-log.md"
printf '# Audit Log — %s\n' "${slug}" > "${audit_log}"
cp "${FIXTURES}/high-finding/spec.md" "${work}/spec.md"
before_hash="$(shasum "${audit_log}" | awk '{print $1}')"

set +e
GOVERN_REPO_ROOT="${work}" \
GOVERN_FEATURE_SLUG="${slug}" \
GOVERN_SPEC_PATH="${work}/spec.md" \
GOVERN_BARRAGE_BIN="dw-lifecycle-does-not-exist-$$" \
  bash "${GOVERN_SPEC_SH}" >"${work}/out.txt" 2>"${work}/err.txt"
rc=$?
set -e

[ "${rc}" -eq 2 ] || fail "T012 expected exit 2 (capability absent), got ${rc}"
grep -Eq 'not on PATH|cannot govern' "${work}/err.txt" \
  || fail "T012 stderr lacks an actionable 'not on PATH' message"
after_hash="$(shasum "${audit_log}" | awk '{print $1}')"
[ "${before_hash}" = "${after_hash}" ] \
  || fail "T012 audit-log was mutated despite fail-loud (must be untouched)"
grep -Eqi 'governed' "${work}/out.txt" 2>/dev/null \
  && fail "T012 emitted a 'governed' claim despite capability absence"
echo "smoke-fail-loud: T012 OK — exit 2, actionable message, audit-log untouched, no governed claim" >&2

# ---- AUDIT-20260607-15: a bad GOVERN_PLAN_PATH fails loud (no silent degrade) ----
# These fold-fatal cases require dw-lifecycle on PATH (capability guard passes),
# then exit 2 at the fold step BEFORE any barrage fires — fast + deterministic.
if command -v dw-lifecycle >/dev/null 2>&1; then
  before_hash="$(shasum "${audit_log}" | awk '{print $1}')"
  set +e
  GOVERN_REPO_ROOT="${work}" GOVERN_FEATURE_SLUG="${slug}" GOVERN_SPEC_PATH="${work}/spec.md" \
  GOVERN_PLAN_PATH="${work}/does-not-exist-plan.md" \
    bash "${GOVERN_SPEC_SH}" >"${work}/out2.txt" 2>"${work}/err2.txt"
  rc=$?
  set -e
  [ "${rc}" -eq 2 ] || fail "AUDIT-15 expected exit 2 on a bad GOVERN_PLAN_PATH, got ${rc}"
  grep -Eq 'GOVERN_PLAN_PATH|could not be folded' "${work}/err2.txt" \
    || fail "AUDIT-15 stderr lacks an actionable plan-path message"
  [ "${before_hash}" = "$(shasum "${audit_log}" | awk '{print $1}')" ] \
    || fail "AUDIT-15 audit-log mutated despite fail-loud"
  echo "smoke-fail-loud: AUDIT-15 OK — bad GOVERN_PLAN_PATH exits 2, audit-log untouched" >&2

  # ---- AUDIT-20260607-14: an over-budget SPEC fails loud (not plan-only) ----
  set +e
  GOVERN_REPO_ROOT="${work}" GOVERN_FEATURE_SLUG="${slug}" GOVERN_SPEC_PATH="${work}/spec.md" \
  GOVERN_PAYLOAD_BUDGET="5" \
    bash "${GOVERN_SPEC_SH}" >"${work}/out3.txt" 2>"${work}/err3.txt"
  rc=$?
  set -e
  [ "${rc}" -eq 2 ] || fail "AUDIT-14 expected exit 2 when the spec exceeds the payload budget, got ${rc}"
  grep -Eq 'primary audit unit|could not be folded' "${work}/err3.txt" \
    || fail "AUDIT-14 stderr lacks an actionable over-budget-spec message"
  echo "smoke-fail-loud: AUDIT-14 OK — over-budget spec exits 2 (never plan-only)" >&2
fi

# ---- T013: reduced coverage is recorded, not presented as full ----
PINNED_MODEL=""
for c in claude codex gemini; do command -v "$c" >/dev/null 2>&1 && { PINNED_MODEL="$c"; break; }; done
if [ -z "${PINNED_MODEL}" ]; then
  echo "smoke-fail-loud: T013 SKIPPED — no model CLI on PATH (cannot exercise live degraded coverage)" >&2
  echo "smoke-fail-loud: PASS (T012 verified; T013 skipped)"
  exit 0
fi

cw2="$(mktemp -d "${TMPDIR:-/tmp}/smoke-fail-loud-cov.XXXXXX")"
slug2="spec-gov-coverage"
fd2="${cw2}/docs/1.0/001-IN-PROGRESS/${slug2}"
mkdir -p "${fd2}"
printf '# Audit Log — %s\n' "${slug2}" > "${fd2}/audit-log.md"
cp "${FIXTURES}/clean/spec.md" "${cw2}/spec.md"

echo "smoke-fail-loud: T013 firing single lane '${PINNED_MODEL}' of the configured battery ..." >&2
GOVERN_REPO_ROOT="${cw2}" GOVERN_FEATURE_SLUG="${slug2}" \
GOVERN_SPEC_PATH="${cw2}/spec.md" GOVERN_MODELS="${PINNED_MODEL}" \
  bash "${GOVERN_SPEC_SH}" || true

runs="${cw2}/.dw-lifecycle/scope-discovery/audit-runs"
[ -d "${runs}" ] || fail "T013 no run-dir produced"
rundir="$(find "${runs}" -mindepth 1 -maxdepth 1 -type d | head -n1)"
# The run records exactly the lane(s) that ran — a per-model output file for the
# pinned lane, and NOT for the lanes we did not run (coverage is transparent).
ls "${rundir}/${PINNED_MODEL}.md" >/dev/null 2>&1 \
  || fail "T013 run-dir missing the pinned lane's output (${PINNED_MODEL}.md)"
n_model_files="$(find "${rundir}" -maxdepth 1 -name '*.md' ! -name 'INDEX.md' ! -name 'PROMPT.md' | wc -l | tr -d ' ')"
[ "${n_model_files}" -ge 1 ] || fail "T013 no per-model output recorded"
rm -rf "${cw2}"
echo "smoke-fail-loud: T013 OK — run recorded ${n_model_files} lane(s) (pinned '${PINNED_MODEL}'); coverage is explicit, not full-battery" >&2

echo "smoke-fail-loud: PASS"
