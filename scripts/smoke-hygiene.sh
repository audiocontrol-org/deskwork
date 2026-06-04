#!/usr/bin/env bash
# Local smoke test for the hygiene-skill family. Not wired into CI per
# .claude/rules/agent-discipline.md "No test infrastructure in CI" --
# this is a hand-run gate the operator exercises before merging the
# hygiene branch.
#
# Exercises each hygiene verb end-to-end against a throwaway fixture
# project tree + a fake gh stub:
#
#   1. dw-lifecycle install <fixture>           -> writes .dw-lifecycle/config.json
#   2. dw-lifecycle debt-report                 -> markdown across three sections
#   3. dw-lifecycle debt-report --json          -> valid JSON shape
#   4. dw-lifecycle triage-issues propose ...   -> writes proposal JSON
#   5. dw-lifecycle promote-deferrals propose ..-> writes proposal JSON
#   6. dw-lifecycle close-shipped --dry-run     -> four-source merge runs
#   7. dw-lifecycle archive-branch --dry-run    -> preflight passes
#   8. dw-lifecycle worktree-report --json      -> JSON scan parses
#   9. dw-lifecycle dismantle-worktrees propose -> writes proposal JSON
#  10. dw-lifecycle dismantle-worktrees apply   -> all-skip round-trip exits 0
#
# Exits 0 on full success with "OK" on the last line. Exits 1 with a
# specific error otherwise.
#
# Honors $SMOKE_HYGIENE_TMPDIR for the fixture root; otherwise mktemp.

set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")/.." rev-parse --show-toplevel)"
DW_BIN="$ROOT/plugins/dw-lifecycle/bin/dw-lifecycle"

if [ ! -x "$DW_BIN" ]; then
  echo "FAIL: dw-lifecycle bin not found or not executable at $DW_BIN" >&2
  exit 1
fi

# Fixture root (honor SMOKE_HYGIENE_TMPDIR override).
if [ -n "${SMOKE_HYGIENE_TMPDIR:-}" ]; then
  FIXTURE="$SMOKE_HYGIENE_TMPDIR"
  rm -rf "$FIXTURE"
  mkdir -p "$FIXTURE"
else
  FIXTURE="$(mktemp -d -t smoke-hygiene-XXXXXX)"
fi

GH_LOG="$FIXTURE/gh-invocations.log"

cleanup() {
  if [ -z "${SMOKE_HYGIENE_TMPDIR:-}" ]; then
    rm -rf "$FIXTURE"
  fi
}
trap cleanup EXIT

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

# Wrapper for fixture-local git invocations: hardcoded identity, no
# gpg signing (the operator's global ~/.gitconfig may set
# tag.gpgSign=true / commit.gpgSign=true, which would otherwise refuse
# the fixture's unsigned commits/tags).
g() {
  git -c user.email=smoke@example.com -c user.name=smoke \
      -c commit.gpgSign=false -c tag.gpgSign=false "$@"
}

# -------- 1. Build the fixture tree --------

echo "== smoke-hygiene: build fixture at $FIXTURE =="

mkdir -p "$FIXTURE/docs/1.0/001-IN-PROGRESS/sample"
mkdir -p "$FIXTURE/bin"

# Seed workplan with bare TBD markers + a checked workplan item linking
# to issue #1 (close-shipped's workplan-checkbox walker consumes this
# shape). Also seed a `defer` marker + a `follow-up:` marker so the
# debt-report TBD scanner finds multiple categories.
cat > "$FIXTURE/docs/1.0/001-IN-PROGRESS/sample/workplan.md" <<'WORKPLAN'
---
slug: sample
targetVersion: "1.0"
date: 2026-05-28
---

# Workplan: Sample

## Phase 1: Sample phase  ·  [#2](https://github.com/example/repo/issues/2)

- [x] Step 1: Closed via issue. * [#1](https://github.com/example/repo/issues/1)
- [ ] Step 2: TBD: needs design.
- [ ] Step 3: defer until we know more.
- [ ] Step 4: follow-up: see issue tracker.
- [ ] Step 5: out of scope for v1.
WORKPLAN

cat > "$FIXTURE/docs/1.0/001-IN-PROGRESS/sample/prd.md" <<'PRD'
---
slug: sample
targetVersion: "1.0"
date: 2026-05-28
---

# PRD: Sample
PRD

cat > "$FIXTURE/docs/1.0/001-IN-PROGRESS/sample/README.md" <<'SAMPLEREADME'
---
slug: sample
targetVersion: "1.0"
parentIssue: "#1"
---

# Feature: Sample
SAMPLEREADME

# Seed audit-log with a fixed-SHA entry (close-shipped's audit-log
# walker consumes Status: fixed-<sha>). Real SHA gets backfilled below
# once the fixture repo has commits.
cat > "$FIXTURE/docs/1.0/001-IN-PROGRESS/sample/audit-log.md" <<'AUDITLOG'
# Audit log: sample

## AUDIT-20260528-01

Finding: issue #2 surfaced during dogfood.
Status: fixed-PLACEHOLDER_SHA_A
AUDITLOG

# Seed tooling-feedback with a Closed entry referencing issue #1.
cat > "$FIXTURE/docs/1.0/001-IN-PROGRESS/sample/tooling-feedback.md" <<'TF'
# Tooling feedback: sample

## TF-001
Repro: ...
Workaround: ...
Suggested fix: ...
Status: Closed | PLACEHOLDER_SHA_B | references #1
TF

# -------- 2. Build a git repo --------

cd "$FIXTURE"
git init -q -b main
g add -A
g commit -q -m "Initial fixture (refs #1)"
SHA_A="$(git rev-parse HEAD)"

# Second commit referencing #2.
echo "// touch" > touch.txt
g add touch.txt
g commit -q -m "fix: address #2 (Closes #2)"
SHA_B="$(git rev-parse HEAD)"

# Tag both for close-shipped's --from-tag / --to-tag walk.
g tag v0.1.0 "$SHA_A"
g tag v0.2.0 "$SHA_B"

# Backfill placeholder SHAs in audit-log / tooling-feedback so the
# walkers' `git tag --contains <sha>` checks pass.
AUDIT_FILE="$FIXTURE/docs/1.0/001-IN-PROGRESS/sample/audit-log.md"
TF_FILE="$FIXTURE/docs/1.0/001-IN-PROGRESS/sample/tooling-feedback.md"
python3 - "$AUDIT_FILE" "$TF_FILE" "$SHA_A" "$SHA_B" <<'PY'
import sys
from pathlib import Path
audit_path, tf_path, sha_a, sha_b = sys.argv[1:]
for path, placeholder, sha in (
    (audit_path, "PLACEHOLDER_SHA_A", sha_a),
    (tf_path, "PLACEHOLDER_SHA_B", sha_b),
):
    p = Path(path)
    p.write_text(p.read_text().replace(placeholder, sha))
PY

# Re-commit the backfilled files so the tree stays clean.
g add -A
g commit -q -m "Backfill audit-log + tooling-feedback SHAs"

# -------- 3. Build a fake gh stub --------

# The stub:
#   - Logs every invocation to $GH_LOG.
#   - Emits canned responses keyed off the first positional arg.
#   - Returns 0 for the read commands hygiene verbs issue.
cat > "$FIXTURE/bin/gh" <<'GHSTUB'
#!/usr/bin/env bash
set -euo pipefail
echo "gh $*" >> "${GH_LOG:-/dev/null}"
verb="${1:-}"
shift || true
case "$verb" in
  auth)
    # `gh auth status` -> success.
    exit 0
    ;;
  issue)
    sub="${1:-}"
    shift || true
    case "$sub" in
      list)
        # Return a small canned JSON array. Shape mirrors what
        # `gh issue list --json` emits.
        cat <<'JSON'
[
  {"number":1,"title":"Sample stale issue","body":"","labels":[],"state":"OPEN","createdAt":"2025-01-01T00:00:00Z","updatedAt":"2025-01-01T00:00:00Z","url":"https://github.com/example/repo/issues/1","comments":[]},
  {"number":2,"title":"Sample bug","body":"","labels":[{"name":"bug"}],"state":"OPEN","createdAt":"2025-01-01T00:00:00Z","updatedAt":"2025-01-01T00:00:00Z","url":"https://github.com/example/repo/issues/2","comments":[]}
]
JSON
        exit 0
        ;;
      view)
        # Return a single-issue JSON.
        cat <<'JSON'
{"number":1,"title":"Sample","state":"OPEN","labels":[],"url":"https://github.com/example/repo/issues/1"}
JSON
        exit 0
        ;;
      *)
        exit 0
        ;;
    esac
    ;;
  api)
    # Used by some flows; return an empty array by default.
    echo "[]"
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
GHSTUB
chmod +x "$FIXTURE/bin/gh"

export GH_LOG
export PATH="$FIXTURE/bin:$PATH"

# Verify the stub takes precedence on PATH.
WHICH_GH="$(command -v gh)"
if [ "$WHICH_GH" != "$FIXTURE/bin/gh" ]; then
  fail "fake gh stub not on PATH first (got: $WHICH_GH)"
fi

# -------- 4. Exercise each hygiene verb --------

echo "== smoke-hygiene: dw-lifecycle install =="
"$DW_BIN" install "$FIXTURE" --config-overlay /dev/stdin <<'OVERLAY' >/dev/null
{"tracking":{"github":{"repo":"example/repo"}}}
OVERLAY
test -f "$FIXTURE/.dw-lifecycle/config.json" \
  || fail "install did not write config.json"

# Commit the config so dw-lifecycle reads see it.
g add .dw-lifecycle/config.json
g commit -q -m "Add dw-lifecycle config"

echo "== smoke-hygiene: debt-report (markdown) =="
DEBT_MD="$FIXTURE/debt-report.md"
"$DW_BIN" debt-report --repo example/repo > "$DEBT_MD" 2>/dev/null || true
# The three sections must all appear, even if some are empty.
grep -q -i "github issues" "$DEBT_MD" \
  || fail "debt-report markdown missing GitHub-issues section"
grep -q -i "workplan" "$DEBT_MD" \
  || fail "debt-report markdown missing workplan section"
grep -q -i "branch" "$DEBT_MD" \
  || fail "debt-report markdown missing branches section"

echo "== smoke-hygiene: debt-report --json =="
DEBT_JSON="$FIXTURE/debt-report.json"
"$DW_BIN" debt-report --json --repo example/repo > "$DEBT_JSON" 2>/dev/null || true
# Validate JSON.
python3 -c "import json,sys; json.loads(open('$DEBT_JSON').read())" \
  || fail "debt-report --json emitted invalid JSON"

echo "== smoke-hygiene: triage-issues propose =="
"$DW_BIN" triage-issues propose --bucket unlabeled --limit 5 --repo example/repo >/dev/null 2>&1 || true
PROPOSE_TRIAGE_DIR="$FIXTURE/.dw-lifecycle/triage-issues"
if [ ! -d "$PROPOSE_TRIAGE_DIR" ]; then
  fail "triage-issues propose did not create $PROPOSE_TRIAGE_DIR"
fi
# At least one proposal file should be present.
TRIAGE_PROPOSAL_COUNT="$(find "$PROPOSE_TRIAGE_DIR" -name 'proposals-*.json' 2>/dev/null | wc -l | tr -d '[:space:]')"
if [ "$TRIAGE_PROPOSAL_COUNT" = "0" ]; then
  fail "triage-issues propose did not write a proposal file"
fi

echo "== smoke-hygiene: promote-deferrals propose =="
WP="$FIXTURE/docs/1.0/001-IN-PROGRESS/sample/workplan.md"
"$DW_BIN" promote-deferrals propose --workplan "$WP" --repo example/repo >/dev/null 2>&1 || true
PROPOSE_PD_DIR="$FIXTURE/.dw-lifecycle/promote-deferrals"
if [ ! -d "$PROPOSE_PD_DIR" ]; then
  fail "promote-deferrals propose did not create $PROPOSE_PD_DIR"
fi
PD_PROPOSAL_COUNT="$(find "$PROPOSE_PD_DIR" -name 'proposals-*.json' 2>/dev/null | wc -l | tr -d '[:space:]')"
if [ "$PD_PROPOSAL_COUNT" = "0" ]; then
  fail "promote-deferrals propose did not write a proposal file"
fi

echo "== smoke-hygiene: close-shipped --dry-run =="
"$DW_BIN" close-shipped --from-tag v0.1.0 --to-tag v0.2.0 --repo example/repo --dry-run >/dev/null 2>&1 \
  || fail "close-shipped --dry-run failed (non-zero exit)"

echo "== smoke-hygiene: complete-parent-closure propose =="
# Walker integrates THREE sources (title-search, parent timeline, workplan-
# anchored). Regression for #342: pre-fix the gh api timeline call carried
# literal `{owner}/{repo}` placeholders + a `--repo` flag, and the walker
# aborted on the resulting usage error. Post-fix, the URL interpolates the
# resolved repo and the recovery contract collapses any timeline failure to
# []. The stub returns `[]` for `gh api`, so the timeline source is a no-op
# here; the proposal still gets assembled from title-search + workplan.
"$DW_BIN" complete-parent-closure propose --slug sample --repo example/repo \
  >/dev/null 2>&1 \
  || fail "complete-parent-closure propose failed (non-zero exit)"
PCP_DIR="$FIXTURE/.dw-lifecycle/complete-parent-closure"
if [ ! -d "$PCP_DIR" ]; then
  fail "complete-parent-closure propose did not create $PCP_DIR"
fi
PCP_PROPOSAL_COUNT="$(find "$PCP_DIR" -name 'proposals-*.json' 2>/dev/null | wc -l | tr -d '[:space:]')"
if [ "$PCP_PROPOSAL_COUNT" = "0" ]; then
  fail "complete-parent-closure propose did not write a proposal file"
fi

echo "== smoke-hygiene: archive-branch --dry-run =="
# Create a parked branch with novel commits so the preflight has work
# to consider. archive-branch refuses on no-novel-commits otherwise.
g checkout -q -b feature/smoke-parked
echo "parked" > parked.txt
g add parked.txt
g commit -q -m "Parked work"
g checkout -q main
"$DW_BIN" archive-branch feature/smoke-parked --dry-run --rationale "Smoke test: preserve work via annotated tag." --compare-ref main >/dev/null 2>&1 \
  || fail "archive-branch --dry-run failed (non-zero exit)"

# -------- 5. Phase 11 worktree verbs --------

# Create a worktree-base directory containing a sibling worktree of the
# fixture repo. `--worktree-base <path>` directs the scan there directly
# (auto-detect skipped). `--threshold-count 1` lowers the bar so the
# fixture worktree picks up at least one staleness signal and ends up
# in the propose set; current/main verdicts always override regardless
# of threshold.
WTREE_BASE="$FIXTURE/worktrees"
mkdir -p "$WTREE_BASE"
g worktree add -q -b feature/smoke-wtree "$WTREE_BASE/smoke-wtree" main

echo "== smoke-hygiene: worktree-report --json =="
WTREE_JSON="$FIXTURE/worktree-report.json"
"$DW_BIN" worktree-report --json --worktree-base "$WTREE_BASE" --threshold-count 1 \
    > "$WTREE_JSON" 2>/dev/null \
  || fail "worktree-report --json failed (non-zero exit)"
python3 -c "
import json, sys
data = json.loads(open('$WTREE_JSON').read())
assert isinstance(data.get('entries'), list), 'entries must be a list'
assert 'days_threshold' in data, 'days_threshold field missing'
assert 'worktree_base' in data, 'worktree_base field missing'
" || fail "worktree-report --json emitted unexpected shape"

echo "== smoke-hygiene: dismantle-worktrees propose =="
"$DW_BIN" dismantle-worktrees propose \
    --worktree-base "$WTREE_BASE" --threshold-count 1 \
    >/dev/null 2>&1 || true
DW_DIR="$FIXTURE/.dw-lifecycle/dismantle-worktrees"
test -d "$DW_DIR" \
  || fail "dismantle-worktrees propose did not create $DW_DIR"
DW_PROPOSAL_COUNT="$(find "$DW_DIR" -name 'proposals-*.json' 2>/dev/null | wc -l | tr -d '[:space:]')"
if [ "$DW_PROPOSAL_COUNT" = "0" ]; then
  fail "dismantle-worktrees propose did not write a proposal file"
fi
DW_PROPOSAL="$(find "$DW_DIR" -name 'proposals-*.json' 2>/dev/null | head -n1)"

# Edit the proposal so every entry has decision=skip + a substantive
# reason. The apply step's all-or-nothing validation requires both
# fields; skip routes through the dispatch but never actually removes a
# worktree, which keeps the smoke idempotent.
python3 - "$DW_PROPOSAL" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
data = json.loads(p.read_text())
# The proposal schema uses `items` for the per-worktree entries.
items = data.get('items', [])
if not items:
    sys.exit('smoke-hygiene: proposal has no items to disposition')
for item in items:
    item['decision'] = 'skip'
    item['reason'] = (
        'smoke-hygiene: skip-disposition all items to verify the apply '
        'round-trip without mutating the fixture worktrees.'
    )
p.write_text(json.dumps(data, indent=2))
PY

echo "== smoke-hygiene: dismantle-worktrees apply (all-skip) =="
"$DW_BIN" dismantle-worktrees apply --proposal "$DW_PROPOSAL" \
    >/dev/null 2>&1 \
  || fail "dismantle-worktrees apply (all-skip) failed (non-zero exit)"

# The sibling worktree must still be on disk + still registered with
# git after the all-skip apply. Anything else means apply mutated state
# it was told to leave alone.
test -d "$WTREE_BASE/smoke-wtree" \
  || fail "dismantle-worktrees apply with decision=skip removed a worktree"
g worktree list --porcelain | grep -q "$WTREE_BASE/smoke-wtree" \
  || fail "dismantle-worktrees apply with decision=skip unregistered a worktree from git"

# Local cleanup of the fixture worktree (the FIXTURE-level trap handles
# the tmpdir, but a registered worktree leaves the parent repo with a
# dangling admin entry until the trap fires; explicit removal keeps the
# smoke leak-free even if the operator overrode SMOKE_HYGIENE_TMPDIR).
g worktree remove --force "$WTREE_BASE/smoke-wtree" >/dev/null 2>&1 || true
g branch -D feature/smoke-wtree >/dev/null 2>&1 || true

# -------- 6. Phase 15: close-shipped scan/propose/apply round-trip --------

# Phase 17 / #412: mirror the SKILL.md's per-run project-local path
# convention so the smoke documents the canonical adopter path. Bare
# /tmp/ paths are banned (.claude/rules/file-handling.md); the SKILL.md
# uses .dw-lifecycle/close-shipped/runs/<timestamp>/{bundles,verdicts}.json.
CS_RUN_TS="$(date -u +%Y-%m-%dT%H-%M-%S-000Z)"
CS_RUN_DIR="$FIXTURE/.dw-lifecycle/close-shipped/runs/$CS_RUN_TS"
mkdir -p "$CS_RUN_DIR"

echo "== smoke-hygiene: close-shipped scan =="
CS_BUNDLES="$CS_RUN_DIR/bundles.json"
"$DW_BIN" close-shipped scan --from-tag v0.1.0 --to-tag v0.2.0 --repo example/repo \
    --output "$CS_BUNDLES" >/dev/null 2>&1 \
  || fail "close-shipped scan failed (non-zero exit)"
test -s "$CS_BUNDLES" \
  || fail "close-shipped scan produced no bundle output"
python3 -c "import json,sys; d=json.loads(open('$CS_BUNDLES').read()); assert 'bundles' in d, 'missing bundles'" \
  || fail "close-shipped scan emitted malformed BundleSet"

echo "== smoke-hygiene: close-shipped propose (with canned verdicts) =="
CS_VERDICTS="$CS_RUN_DIR/verdicts.json"
python3 - "$CS_BUNDLES" "$CS_VERDICTS" <<'PY'
import json, sys
from pathlib import Path
bundles = json.loads(Path(sys.argv[1]).read_text())
verdicts = {"verdicts": []}
for b in bundles.get("bundles", []):
    verdicts["verdicts"].append({
        "issue": b["issue"]["number"],
        "verdict": "shipped",
        "reason": "smoke fixture: marked all candidates as shipped",
    })
Path(sys.argv[2]).write_text(json.dumps(verdicts, indent=2))
PY
"$DW_BIN" close-shipped propose --bundles "$CS_BUNDLES" --verdicts "$CS_VERDICTS" >/dev/null 2>&1 \
  || fail "close-shipped propose failed (non-zero exit)"
CS_PROPOSAL="$(find "$FIXTURE/.dw-lifecycle/close-shipped" -name 'proposals-*.json' 2>/dev/null | head -n1)"
test -n "$CS_PROPOSAL" \
  || fail "close-shipped propose did not write a proposal JSON"

echo "== smoke-hygiene: close-shipped apply (all-skip via decision flip) =="
python3 - "$CS_PROPOSAL" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
data = json.loads(p.read_text())
for item in data["items"]:
    item["decision"] = "skip"
p.write_text(json.dumps(data, indent=2))
PY
"$DW_BIN" close-shipped apply --proposal "$CS_PROPOSAL" >/dev/null 2>&1 \
  || fail "close-shipped apply (all-skip) failed (non-zero exit)"

echo "OK"
