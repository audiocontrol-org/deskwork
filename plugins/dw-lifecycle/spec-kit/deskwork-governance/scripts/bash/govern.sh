#!/usr/bin/env bash
# deskwork governance orchestration (T007).
#
# Fires on Spec Kit's after_implement: gather the diff of the just-implemented
# work, run deskwork's cross-model audit-barrage over it, and lift findings into
# the feature audit-log. Composes EXISTING dw-lifecycle verbs — no reimplementation.
#
# Branches only on the diff + feature slug, NEVER on which tool authored/executed
# the plan (constitution III / spec FR-003). Fails loudly if dw-lifecycle is
# absent — no silent skip (constitution V / spec FR-005 edge).
#
# Env:
#   GOVERN_FEATURE_SLUG  (optional override; otherwise derived from the deskwork
#                         feature branch `feature/<slug>`)
#   GOVERN_DIFF_BASE     (default: HEAD~1) — git ref the implemented work is diffed against
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Derive the deskwork feature slug generically (AUDIT-20260604-24): never hardcode
# a project default. deskwork runs each feature on its own `feature/<slug>` branch,
# so the slug is the branch name minus the `feature/` prefix. Explicit env override
# wins; if neither resolves, fail loudly (no silent wrong-target — constitution V).
if [ -n "${GOVERN_FEATURE_SLUG:-}" ]; then
  SLUG="${GOVERN_FEATURE_SLUG}"
else
  _branch="$(git branch --show-current 2>/dev/null || true)"
  case "${_branch}" in
    feature/*) SLUG="${_branch#feature/}" ;;
    *)
      echo "govern.sh: FATAL — cannot derive feature slug from branch '${_branch}' (expected 'feature/<slug>'). Set GOVERN_FEATURE_SLUG." >&2
      exit 2 ;;
  esac
fi
BASE="${GOVERN_DIFF_BASE:-HEAD~1}"
FEATURE_DOCS="docs/1.0/001-IN-PROGRESS/${SLUG}"
AUDIT_LOG="${FEATURE_DOCS}/audit-log.md"

command -v dw-lifecycle >/dev/null 2>&1 || {
  echo "govern.sh: FATAL — dw-lifecycle not on PATH; cannot govern (no silent skip)." >&2
  exit 2
}
command -v jq >/dev/null 2>&1 || {
  echo "govern.sh: FATAL — jq required to assemble the audit vars JSON." >&2
  exit 2
}

# --- gather the implemented-work context (the plan under audit) ---
DIFF="$(git diff "${BASE}" 2>/dev/null || true)"
COMMIT_SUBJECTS="$(git log "${BASE}..HEAD" --oneline 2>/dev/null || true)"
AUDIT_EXCERPT="$(tail -n 40 "${AUDIT_LOG}" 2>/dev/null || true)"
WORKPLAN_SUMMARY="Governance pass over the just-implemented work for feature '${SLUG}', diffed against ${BASE}. The differentiated back half audits a plan it did not author or execute."

if [ -z "${DIFF}" ]; then
  echo "govern.sh: empty diff against ${BASE} — running barrage over the plan context only (edge case; no defects expected)." >&2
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/govern.XXXXXX")"
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

# --- render -> barrage -> lift (existing verbs) ---
dw-lifecycle audit-barrage-render --feature "${SLUG}" --vars-file "${VARS}" --output "${PROMPT}"

RUN_DIR="$(dw-lifecycle audit-barrage --feature "${SLUG}" --prompt-file "${PROMPT}" --output-run-dir)"
echo "govern.sh: barrage run-dir = ${RUN_DIR}" >&2

dw-lifecycle audit-barrage-lift --feature "${SLUG}" --run-dir "${RUN_DIR}" --apply

echo "${RUN_DIR}"
