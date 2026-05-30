#!/usr/bin/env bash
# Phase 15 Task 5 Step 1 — dogfood the /dwi end-of-task audit-barrage hook
# against the Phase 15 implementation diff. Fires the 5-CLI hook exactly
# as documented in plugins/dw-lifecycle/skills/implement/SKILL.md Step 6.
#
# Range: 54ebcd6..HEAD (the Phase 15 implementation commits).
#
# Usage: bash scripts/dogfood-phase15-hook.sh

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

FEATURE=scope-discovery
BASE=54ebcd6
HEAD_SHA=$(git rev-parse HEAD)

WORKDIR=$(mktemp -d)
VARS_JSON="$WORKDIR/vars.json"
PROMPT_MD="$WORKDIR/prompt.md"

echo "==> Phase 15 hook dogfood"
echo "    base: $BASE"
echo "    head: $HEAD_SHA"
echo "    workdir: $WORKDIR"
echo

# ---- Build vars.json (EXPECTED_VARS: feature_slug, workplan_summary, diff, audit_log_excerpt, commit_subjects)

WORKPLAN_SUMMARY=$(tail -200 docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md)
DIFF=$(git diff "$BASE..HEAD" -- plugins/dw-lifecycle/ docs/1.0/001-IN-PROGRESS/scope-discovery/)
AUDIT_LOG_EXCERPT=$(tail -150 docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md)
COMMIT_SUBJECTS=$(git log --format='%h %s' "$BASE..HEAD")

# Use python for JSON-safe escaping (jq isn't guaranteed).
python3 - "$FEATURE" "$WORKPLAN_SUMMARY" "$DIFF" "$AUDIT_LOG_EXCERPT" "$COMMIT_SUBJECTS" "$VARS_JSON" <<'PY'
import json, sys
feature, wp, diff, audit, commits, out_path = sys.argv[1:]
obj = {
    "feature_slug": feature,
    "workplan_summary": wp,
    "diff": diff,
    "audit_log_excerpt": audit,
    "commit_subjects": commits,
}
with open(out_path, "w") as f:
    json.dump(obj, f)
print(f"vars.json: {out_path} ({sum(len(v) for v in obj.values())} chars across vars)", file=sys.stderr)
PY

# ---- Step 1: render prompt
echo "==> [1/5] audit-barrage-render"
plugins/dw-lifecycle/bin/dw-lifecycle audit-barrage-render \
  --feature "$FEATURE" \
  --vars-file "$VARS_JSON" \
  --output "$PROMPT_MD"
echo "    prompt bytes: $(wc -c < "$PROMPT_MD")"
echo

# ---- Step 2: fire barrage
echo "==> [2/5] audit-barrage --output-run-dir"
RUN_DIR=$(plugins/dw-lifecycle/bin/dw-lifecycle audit-barrage \
  --feature "$FEATURE" \
  --prompt-file "$PROMPT_MD" \
  --output-run-dir)
echo "    run-dir: $RUN_DIR"
echo

# ---- Step 3: lift findings to audit-log
echo "==> [3/5] audit-barrage-lift --apply (dry-run first, then apply)"
plugins/dw-lifecycle/bin/dw-lifecycle audit-barrage-lift \
  --feature "$FEATURE" \
  --run-dir "$RUN_DIR"
echo
echo "    proceeding to --apply"
plugins/dw-lifecycle/bin/dw-lifecycle audit-barrage-lift \
  --feature "$FEATURE" \
  --run-dir "$RUN_DIR" \
  --apply
echo

# ---- Step 4: auto-promote findings to workplan
echo "==> [4/5] promote-findings --auto"
plugins/dw-lifecycle/bin/dw-lifecycle promote-findings \
  --feature "$FEATURE" \
  --auto
echo

# ---- Step 5: gate sanity-check
echo "==> [5/5] check-open-findings (sanity)"
plugins/dw-lifecycle/bin/dw-lifecycle check-open-findings \
  --feature "$FEATURE"
echo
echo "==> dogfood complete"
