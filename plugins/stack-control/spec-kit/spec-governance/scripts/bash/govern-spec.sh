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
#   GOVERN_BARRAGE_BIN   (optional; the dw-lifecycle entrypoint; default `dw-lifecycle`)
set -euo pipefail

REPO_ROOT="${GOVERN_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
[ -n "${REPO_ROOT}" ] || {
  echo "govern-spec.sh: FATAL — cannot resolve repo root (not a git tree; set GOVERN_REPO_ROOT)." >&2
  exit 2
}
cd "${REPO_ROOT}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# scripts/bash -> spec-governance -> spec-kit -> stack-control
STACKCTL="$(cd "${SCRIPT_DIR}/../../../.." && pwd)/bin/stackctl"
BARRAGE_BIN="${GOVERN_BARRAGE_BIN:-dw-lifecycle}"

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
# 256 KB soft budget; drops are logged to stderr (no silent cap). Specs are
# small, so this is a guard, not a hot path.
PAYLOAD_BUDGET=$((256 * 1024))
DIFF=""
_payload_bytes=0

fold_artifact() {
  local path="$1" label="$2"
  [ -f "${path}" ] || return 0
  local sz
  sz="$(wc -c < "${path}" 2>/dev/null || echo 0)"
  if [ "$((_payload_bytes + sz))" -gt "${PAYLOAD_BUDGET}" ]; then
    echo "govern-spec.sh: ${label} ${path} (${sz} bytes) would exceed the ${PAYLOAD_BUDGET}-byte payload budget; skipping it (not silently — split the artifact or raise the budget)." >&2
    return 0
  fi
  DIFF="${DIFF}"$'\n'"===== ${label}: ${path} ====="$'\n'"$(cat "${path}")"
  _payload_bytes="$((_payload_bytes + sz))"
}

fold_artifact "${SPEC_PATH}" "SPEC"
if [ -n "${GOVERN_PLAN_PATH:-}" ]; then
  fold_artifact "${GOVERN_PLAN_PATH}" "PLAN"
fi

[ -n "${DIFF}" ] || {
  echo "govern-spec.sh: FATAL — assembled an empty audit payload (spec '${SPEC_PATH}' empty?)." >&2
  exit 2
}

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
RUN_DIR="$("${BARRAGE_BIN}" audit-barrage --feature "${SLUG}" --prompt-file "${PROMPT}" ${_models_flag[@]+"${_models_flag[@]}"} --output-run-dir)"
echo "govern-spec.sh: barrage run-dir = ${RUN_DIR}" >&2

# Cross-model agreement annotation + disposition slots are produced + preserved
# end-to-end by the lift verb (T011 / US2) — compose it, do not reimplement.
"${BARRAGE_BIN}" audit-barrage-lift --feature "${SLUG}" --run-dir "${RUN_DIR}" --apply

# --- convergence gate (T019 / FR-010 / SC-007) ---
_gate_flags=(--feature "${SLUG}" --repo-root "${REPO_ROOT}")
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
