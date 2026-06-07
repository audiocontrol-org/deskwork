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

# The audit-barrage capability is stack-control's OWN (vendored via
# multi/migrate-audit-barrage) — no dw-lifecycle dependency. Dispatch the barrage
# verbs through stackctl. Resolve the script dir + stackctl BEFORE any `cd`, so
# the relative BASH_SOURCE stays valid. scripts/bash -> deskwork-governance ->
# spec-kit -> stack-control.
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# GOVERN_BARRAGE_BIN overrides the dispatched barrage entrypoint (tests).
STACKCTL="${GOVERN_BARRAGE_BIN:-$(cd "${_SCRIPT_DIR}/../../../.." && pwd)/bin/stackctl}"

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
# Guard the empty-slug case (AUDIT-20260604-30): `feature/` (or a trailing-slash
# branch) strips to "", which would silently target the wrong feature — the exact
# failure the FATAL branch exists to prevent.
[ -n "${SLUG}" ] || {
  echo "govern.sh: FATAL — derived an empty feature slug (branch '${_branch:-}'); set GOVERN_FEATURE_SLUG explicitly." >&2
  exit 2
}
BASE="${GOVERN_DIFF_BASE:-HEAD~1}"
FEATURE_DOCS="docs/1.0/001-IN-PROGRESS/${SLUG}"
AUDIT_LOG="${FEATURE_DOCS}/audit-log.md"

command -v "${STACKCTL}" >/dev/null 2>&1 || {
  echo "govern.sh: FATAL — stackctl not found at ${STACKCTL}; cannot govern (no silent skip)." >&2
  exit 2
}
command -v jq >/dev/null 2>&1 || {
  echo "govern.sh: FATAL — jq required to assemble the audit vars JSON." >&2
  exit 2
}

# --- gather the implemented-work context (the plan under audit) ---
DIFF="$(git diff "${BASE}" 2>/dev/null || true)"
# Include untracked-but-not-ignored files so newly-added work is audited too
# (AUDIT-20260605-01): `git diff <base>` omits untracked files, so a barrage
# run before those files are committed cannot review the very surfaces most
# worth auditing (new modules, new tests). Render each as an all-added diff
# via --no-index WITHOUT mutating the index. The real after_implement flow
# commits first (git hook precedes governance), but a manual govern run on a
# dirty tree must not silently drop new files.
#
# BOUNDED (AUDIT-20260605-06): the folded content is shipped to external model
# CLIs, so the enumeration must not transmit arbitrary working-tree content
# off-box. `--exclude-standard` already drops gitignored paths (incl. the
# audit-runs output dir). We additionally (a) skip binary files — never ship
# binary blobs — and (b) cap the total folded bytes, logging any drop to stderr
# (no silent truncation, per the project "no silent caps" rule).
#
# The budget accounts each file's raw size (`wc -c`); the actual folded payload
# is the larger `git diff --no-index` output (per-line `+` prefixes + headers),
# so the off-box total runs modestly above UNTRACKED_FOLD_BUDGET. The cap is a
# soft bound on transmitted working-tree content, not a hard byte ceiling on the
# wire (AUDIT-20260605-12 acknowledgment).
UNTRACKED_FOLD_BUDGET=$((256 * 1024))
_folded_bytes=0
while IFS= read -r _untracked; do
  [ -n "${_untracked}" ] || continue
  # grep -I treats a binary file as non-matching; `.` matches any text line.
  # So a non-zero exit here means "binary or empty" — skip it.
  if ! grep -Iq . "${_untracked}" 2>/dev/null; then
    echo "govern.sh: skipping untracked binary/empty file ${_untracked} (not folded into the audit diff)." >&2
    continue
  fi
  _sz="$(wc -c < "${_untracked}" 2>/dev/null || echo 0)"
  if [ "$((_folded_bytes + _sz))" -gt "${UNTRACKED_FOLD_BUDGET}" ]; then
    # Skip ONLY this oversized file and keep packing smaller ones (AUDIT-20260605-12):
    # `git ls-files` emits sorted paths, so a single large file early in the sort
    # must not suppress folding of the feature's smaller new source/test files that
    # sort later — exactly the surfaces the fold exists to audit. `continue` (not
    # `break`) skips the over-budget file without incrementing _folded_bytes, so
    # later files that still fit are folded. The skip is logged (no silent cap).
    echo "govern.sh: untracked file ${_untracked} (${_sz} bytes) would exceed the fold budget (${UNTRACKED_FOLD_BUDGET} bytes); skipping it but continuing with smaller files (not silently — audit it by committing first)." >&2
    continue
  fi
  DIFF="${DIFF}"$'\n'"$(git diff --no-index --no-color -- /dev/null "${_untracked}" 2>/dev/null || true)"
  _folded_bytes="$((_folded_bytes + _sz))"
done < <(git ls-files --others --exclude-standard 2>/dev/null || true)
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
"${STACKCTL}" audit-barrage-render --feature "${SLUG}" --vars-file "${VARS}" --output "${PROMPT}"

RUN_DIR="$("${STACKCTL}" audit-barrage --feature "${SLUG}" --prompt-file "${PROMPT}" --output-run-dir)"
echo "govern.sh: barrage run-dir = ${RUN_DIR}" >&2

"${STACKCTL}" audit-barrage-lift --feature "${SLUG}" --run-dir "${RUN_DIR}" --apply

echo "${RUN_DIR}"
