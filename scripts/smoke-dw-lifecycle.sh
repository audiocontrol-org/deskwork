#!/usr/bin/env bash
# Local smoke test for dw-lifecycle. Not in CI per the deskwork repo's
# no-CI-testing rule. Run before tagging a release.
#
# Two adjustments from the workplan T44 verbatim spec, both required
# for the script to exercise the real flow correctly:
#   1. Commit .dw-lifecycle/config.json after install. git worktree
#      add only checks out committed content, so an uncommitted
#      config.json is invisible inside the new worktree and the
#      subsequent setup/transition lookups fail.
#   2. cd into $WORKTREE before transition. transition resolves the
#      docs tree against repoRoot(), which depends on cwd. Setup
#      scaffolds inside the worktree, so transition must run from
#      there too.

set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
TMP=$(mktemp -d)
WORKTREE_PARENT="$(dirname "$TMP")"
WORKTREE_NAME="$(basename "$TMP")-smoke-feature"
WORKTREE="$WORKTREE_PARENT/$WORKTREE_NAME"

cleanup() {
  if [ -d "$WORKTREE" ]; then
    git -C "$TMP" worktree remove "$WORKTREE" --force 2>/dev/null || true
    rm -rf "$WORKTREE"
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "== smoke: setup temp repo =="
cd "$TMP"
git init -b main >/dev/null
git -c user.email=smoke@example.com -c user.name=smoke commit --allow-empty -m "init" >/dev/null

echo "== smoke: install =="
"$ROOT/plugins/dw-lifecycle/bin/dw-lifecycle" install "$TMP" >/dev/null
test -f "$TMP/.dw-lifecycle/config.json" || { echo "FAIL: config not written"; exit 1; }

echo "== smoke: commit config =="
git -c user.email=smoke@example.com -c user.name=smoke add .dw-lifecycle/config.json >/dev/null
git -c user.email=smoke@example.com -c user.name=smoke commit -m "add dw-lifecycle config" >/dev/null

echo "== smoke: setup =="
"$ROOT/plugins/dw-lifecycle/bin/dw-lifecycle" setup smoke-feature --target 1.0 --title "Smoke" >/dev/null
test -f "$WORKTREE/docs/1.0/001-IN-PROGRESS/smoke-feature/prd.md" || { echo "FAIL: prd.md missing"; exit 1; }
test -f "$WORKTREE/docs/1.0/001-IN-PROGRESS/smoke-feature/workplan.md" || { echo "FAIL: workplan.md missing"; exit 1; }

echo "== smoke: transition =="
cd "$WORKTREE"
"$ROOT/plugins/dw-lifecycle/bin/dw-lifecycle" transition smoke-feature --from inProgress --to complete --target 1.0 >/dev/null
test -d "$WORKTREE/docs/1.0/003-COMPLETE/smoke-feature" || { echo "FAIL: not transitioned"; exit 1; }
test ! -d "$WORKTREE/docs/1.0/001-IN-PROGRESS/smoke-feature" || { echo "FAIL: source still present"; exit 1; }

echo "== smoke: doctor =="
"$ROOT/plugins/dw-lifecycle/bin/dw-lifecycle" doctor "$TMP" >/dev/null || true

echo "== smoke: PASS =="
