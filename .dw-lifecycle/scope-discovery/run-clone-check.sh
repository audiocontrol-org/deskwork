#!/usr/bin/env bash
# Re-runnable clone-detector smoke: run jscpd over the whole codebase with the
# fixed config (ts/tsx/sh/bash) and summarize, focusing on whether the bash
# orchestration duplication is now detected.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

REPORT="reports/duplication/jscpd-report.json"
echo "== running jscpd (config: .jscpd.json) over the codebase =="
npx jscpd . --silent >/dev/null 2>&1 || true

[ -f "$REPORT" ] || { echo "NO REPORT at $REPORT"; exit 1; }

echo
echo "== format coverage (statistics.formats keys) =="
jq -r '.statistics.formats | keys[]' "$REPORT" 2>/dev/null || echo "(none)"

echo
echo "== total clones detected =="
jq -r '.duplicates | length' "$REPORT"

echo
echo "== clones by format =="
jq -r '.duplicates | group_by(.format)[] | "\(.[0].format): \(length)"' "$REPORT" 2>/dev/null || echo "(none)"

echo
echo "== bash clones (the previously-invisible class) =="
jq -r '.duplicates[] | select(.format=="bash") | "\(.firstFile.name):\(.firstFile.start)  <=>  \(.secondFile.name):\(.secondFile.start)  (\(.fragment | length) chars)"' "$REPORT" 2>/dev/null || echo "(none)"

echo
echo "== does it catch the govern.sh <=> govern-spec.sh duplication? =="
jq -r '.duplicates[] | select((.firstFile.name|test("govern")) and (.secondFile.name|test("govern"))) | "HIT: \(.firstFile.name) <=> \(.secondFile.name) — \(.lines) lines / \(.tokens) tokens"' "$REPORT" 2>/dev/null || echo "(no govern pair found)"
