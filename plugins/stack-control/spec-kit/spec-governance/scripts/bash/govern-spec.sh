#!/usr/bin/env bash
# spec-governance orchestration (T007/T008/T009/T014/T019).
#
# Fires on Spec Kit's after_clarify (default) / after_plan (optional): gather
# the SPEC artifact (+ the plan when after_plan), run the cross-model
# audit-barrage over it, lift findings into the feature audit-log, then
# evaluate the convergence gate. Mirrors the founding deskwork-governance
# govern.sh step-for-step, with the audit unit being the SPEC (research R2)
# instead of a code diff. Composes EXISTING dw-lifecycle verbs — no
# reimplementation (FR-006 / Principle II).
#
# Branches only on the spec text + feature slug, NEVER on which tool authored
# the spec (Principle III / FR-003). Fails loud if the audit capability is
# absent — no silent skip (Principle V / FR-005).
#
# Env:
#   GOVERN_FEATURE_SLUG  (optional override; else derived from feature/<slug>)
#   GOVERN_SPEC_PATH     (optional; else derived from the CLAUDE.md SPECKIT marker)
#   GOVERN_PLAN_PATH     (optional; when set — the after_plan checkpoint — the
#                         plan is folded alongside the spec, FR-013)
#   GOVERN_REPO_ROOT     (optional; else `git rev-parse --show-toplevel`) — testability
#   GOVERN_MODELS        (optional; comma-list passed to audit-barrage --models)
#   GOVERN_CEILING       (optional; convergence iteration ceiling, FR-014)
#   GOVERN_OVERRIDE      (optional; recorded override reason, FR-010)
#   GOVERN_BARRAGE_BIN   (optional; the barrage entrypoint; default: bundled stackctl)
set -euo pipefail

# Resolve the script's own dir + the bundled stackctl BEFORE any `cd` — the
# relative BASH_SOURCE is only valid in the original cwd, so a later
# `cd "${REPO_ROOT}"` (when GOVERN_REPO_ROOT differs) must not break it.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# scripts/bash -> spec-governance -> spec-kit -> stack-control
STACKCTL="$(cd "${SCRIPT_DIR}/../../../.." && pwd)/bin/stackctl"
# The audit-barrage capability is now stack-control's OWN (vendored in via
# multi/migrate-audit-barrage) — no dw-lifecycle dependency. The barrage verbs
# (audit-barrage-render/-barrage/-lift) dispatch through stackctl. GOVERN_BARRAGE_BIN
# overrides for tests (stub / fail-loud).
BARRAGE_BIN="${GOVERN_BARRAGE_BIN:-${STACKCTL}}"

REPO_ROOT="${GOVERN_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
[ -n "${REPO_ROOT}" ] || {
  echo "govern-spec.sh: FATAL — cannot resolve repo root (not a git tree; set GOVERN_REPO_ROOT)." >&2
  exit 2
}
cd "${REPO_ROOT}"

# --- derive the feature slug (mirror govern.sh lines 25-42) ---
if [ -n "${GOVERN_FEATURE_SLUG:-}" ]; then
  SLUG="${GOVERN_FEATURE_SLUG}"
else
  _branch="$(git branch --show-current 2>/dev/null || true)"
  case "${_branch}" in
    feature/*) SLUG="${_branch#feature/}" ;;
    *)
      echo "govern-spec.sh: FATAL — cannot derive feature slug from branch '${_branch}' (expected 'feature/<slug>'). Set GOVERN_FEATURE_SLUG." >&2
      exit 2 ;;
  esac
fi
[ -n "${SLUG}" ] || {
  echo "govern-spec.sh: FATAL — derived an empty feature slug (branch '${_branch:-}'); set GOVERN_FEATURE_SLUG explicitly." >&2
  exit 2
}

# --- fail-loud capability guards (T014 / FR-005; mirror govern.sh) ---
command -v "${BARRAGE_BIN}" >/dev/null 2>&1 || {
  echo "govern-spec.sh: FATAL — barrage entrypoint '${BARRAGE_BIN}' not on PATH; cannot govern the spec (no silent skip)." >&2
  exit 2
}
command -v jq >/dev/null 2>&1 || {
  echo "govern-spec.sh: FATAL — jq required to assemble the audit vars JSON." >&2
  exit 2
}

# --- resolve the spec under audit (research R2) ---
if [ -n "${GOVERN_SPEC_PATH:-}" ]; then
  SPEC_PATH="${GOVERN_SPEC_PATH}"
else
  # Derive from the CLAUDE.md SPECKIT marker (the active plan path on this
  # one-long-lived-branch convention; TF-09). The spec is its sibling spec.md.
  _marker_path="$(grep -Eo 'specs/[^[:space:]]+\.md' CLAUDE.md 2>/dev/null | head -n1 || true)"
  [ -n "${_marker_path}" ] || {
    echo "govern-spec.sh: FATAL — no spec path in GOVERN_SPEC_PATH and no specs/<dir>/*.md in the CLAUDE.md SPECKIT marker." >&2
    exit 2
  }
  SPEC_PATH="$(dirname "${_marker_path}")/spec.md"
fi
[ -f "${SPEC_PATH}" ] || {
  echo "govern-spec.sh: FATAL — spec file not found at ${SPEC_PATH}." >&2
  exit 2
}

AUDIT_LOG="docs/1.0/001-IN-PROGRESS/${SLUG}/audit-log.md"

# --- gather the audit unit: spec (+ plan when after_plan), bounded (T009/R2/R7) ---
# 256 KB soft budget (override GOVERN_PAYLOAD_BUDGET for tests); drops are logged
# to stderr (no silent cap). Specs are small, so this is a guard, not a hot path.
PAYLOAD_BUDGET="${GOVERN_PAYLOAD_BUDGET:-$((256 * 1024))}"
DIFF=""
_payload_bytes=0

# fold_artifact returns: 0 folded; 1 missing file; 2 over budget. The CALLER
# decides fatality — an artifact the audit REQUIRES (the spec; a plan when
# after_plan) must NOT be silently dropped (AUDIT-20260607-14/-15 / FR-005).
fold_artifact() {
  local path="$1" label="$2"
  [ -f "${path}" ] || return 1
  local sz
  sz="$(wc -c < "${path}" 2>/dev/null || echo 0)"
  if [ "$((_payload_bytes + sz))" -gt "${PAYLOAD_BUDGET}" ]; then
    echo "govern-spec.sh: ${label} ${path} (${sz} bytes) would exceed the ${PAYLOAD_BUDGET}-byte payload budget." >&2
    return 2
  fi
  DIFF="${DIFF}"$'\n'"===== ${label}: ${path} ====="$'\n'"$(cat "${path}")"
  _payload_bytes="$((_payload_bytes + sz))"
}

# The SPEC is the primary audit unit — if it cannot be folded (missing or over
# budget) the run is fatal, never silently degraded to a plan-only audit
# (AUDIT-20260607-14).
if ! fold_artifact "${SPEC_PATH}" "SPEC"; then
  echo "govern-spec.sh: FATAL — the spec '${SPEC_PATH}' could not be folded into the audit payload (missing or exceeds the ${PAYLOAD_BUDGET}-byte budget). The spec is the primary audit unit; split it or raise GOVERN_PAYLOAD_BUDGET." >&2
  exit 2
fi

# When GOVERN_PLAN_PATH is set (the after_plan checkpoint), the plan is REQUIRED
# (FR-013) — a typo / stale path must fail loud, not silently degrade to
# spec-only (AUDIT-20260607-15).
if [ -n "${GOVERN_PLAN_PATH:-}" ]; then
  if ! fold_artifact "${GOVERN_PLAN_PATH}" "PLAN"; then
    echo "govern-spec.sh: FATAL — GOVERN_PLAN_PATH='${GOVERN_PLAN_PATH}' is set but could not be folded (missing or over budget); after_plan requires the plan (FR-013) — no silent degrade to spec-only." >&2
    exit 2
  fi
fi

[ -n "${DIFF}" ] || {
  echo "govern-spec.sh: FATAL — assembled an empty audit payload (spec '${SPEC_PATH}' empty?)." >&2
  exit 2
}

# Checkpoint scoping (AUDIT-20260607-05 / FR-011): each enabled checkpoint runs
# an INDEPENDENT convergence loop with its own ceiling. Default after_clarify;
# after_plan when a plan is folded. The checkpoint tags the barrage run-dir and
# scopes the gate so a passed after_clarify gate is durable.
if [ -n "${GOVERN_CHECKPOINT:-}" ]; then
  CHECKPOINT="${GOVERN_CHECKPOINT}"
elif [ -n "${GOVERN_PLAN_PATH:-}" ]; then
  CHECKPOINT="after_plan"
else
  CHECKPOINT="after_clarify"
fi

COMMIT_SUBJECTS="$(git log -n 20 --oneline 2>/dev/null || true)"
AUDIT_EXCERPT="$(tail -n 40 "${AUDIT_LOG}" 2>/dev/null || true)"
_plan_note=""
[ -n "${GOVERN_PLAN_PATH:-}" ] && _plan_note=" + plan ${GOVERN_PLAN_PATH}"
WORKPLAN_SUMMARY="Definition-time governance pass over the SPEC for feature '${SLUG}' (${SPEC_PATH}${_plan_note}). The design-phase barrage audits a spec — internal contradictions, ambiguity, unstated assumptions, missing edge cases — not produced code."

WORK="$(mktemp -d "${TMPDIR:-/tmp}/govern-spec.XXXXXX")"
trap 'rm -rf "${WORK}"' EXIT
VARS="${WORK}/vars.json"
PROMPT="${WORK}/prompt.md"

jq -n \
  --arg feature_slug "${SLUG}" \
  --arg workplan_summary "${WORKPLAN_SUMMARY}" \
  --arg diff "${DIFF}" \
  --arg audit_log_excerpt "${AUDIT_EXCERPT}" \
  --arg commit_subjects "${COMMIT_SUBJECTS}" \
  '{feature_slug:$feature_slug, workplan_summary:$workplan_summary, diff:$diff, audit_log_excerpt:$audit_log_excerpt, commit_subjects:$commit_subjects}' \
  > "${VARS}"

# --- render -> barrage -> lift (existing verbs; compose, never reimplement) ---
"${BARRAGE_BIN}" audit-barrage-render --feature "${SLUG}" --vars-file "${VARS}" --output "${PROMPT}"

_models_flag=()
[ -n "${GOVERN_MODELS:-}" ] && _models_flag=(--models "${GOVERN_MODELS}")
# bash 3.2 (macOS default) errors on `"${arr[@]}"` for an EMPTY array under
# `set -u` ("unbound variable") — caught by the T024 dogfood when GOVERN_MODELS
# was unset (the default, all-models path). The `${arr[@]+...}` form expands to
# nothing when empty and is safe on bash 3.2+.
#
# The barrage's --feature is the run-dir LABEL: tag it with the checkpoint
# (`<slug>-<checkpoint>`) so the lift section header carries the checkpoint and
# the gate can scope per-checkpoint (AUDIT-20260607-05). The LIFT + GATE keep the
# bare slug for audit-log resolution.
set +e
RUN_DIR="$("${BARRAGE_BIN}" audit-barrage --feature "${SLUG}-${CHECKPOINT}" --prompt-file "${PROMPT}" ${_models_flag[@]+"${_models_flag[@]}"} --output-run-dir)"
_barrage_exit=$?
set -e
# AUDIT-20260607-07: a non-zero barrage exit means zero model families were
# healthy (an OUTAGE) — fail loud with an actionable message and do NOT lift
# (an empty run must never be scored as a clean/converged result). Distinct from
# a clean zero-FINDING run, where >=1 family ran and the barrage exits 0.
if [ "${_barrage_exit}" -ne 0 ]; then
  echo "govern-spec.sh: FATAL — audit-barrage OUTAGE (exit ${_barrage_exit}): zero model families were healthy. The spec is NOT recorded as governed (FR-005). Check that the configured model-family CLIs are installed and reachable." >&2
  exit 2
fi
echo "govern-spec.sh: barrage run-dir = ${RUN_DIR}" >&2

# Cross-model agreement annotation + disposition slots are produced + preserved
# end-to-end by the lift verb (T011 / US2) — compose it, do not reimplement.
"${BARRAGE_BIN}" audit-barrage-lift --feature "${SLUG}" --run-dir "${RUN_DIR}" --apply

# --- convergence gate (T019 / FR-010 / SC-007), scoped to this checkpoint ---
_gate_flags=(--feature "${SLUG}" --repo-root "${REPO_ROOT}" --checkpoint "${CHECKPOINT}")
[ -n "${GOVERN_CEILING:-}" ] && _gate_flags+=(--ceiling "${GOVERN_CEILING}")
[ -n "${GOVERN_OVERRIDE:-}" ] && _gate_flags+=(--override "${GOVERN_OVERRIDE}")

set +e
GATE_OUT="$("${STACKCTL}" spec-governance-gate "${_gate_flags[@]}" --json)"
GATE_EXIT=$?
set -e
echo "${GATE_OUT}"
echo "govern-spec.sh: run-dir=${RUN_DIR}" >&2

if [ "${GATE_EXIT}" -eq 2 ]; then
  echo "govern-spec.sh: FATAL — gate could not evaluate (capability/audit-log absent)." >&2
  exit 2
fi
if [ "${GATE_EXIT}" -ne 0 ]; then
  echo "govern-spec.sh: spec graduation REFUSED — convergence gate not satisfied (fix findings & re-govern, or record GOVERN_OVERRIDE)." >&2
  exit 1
fi
echo "govern-spec.sh: spec may graduate (convergence gate satisfied or overridden)." >&2
exit 0
