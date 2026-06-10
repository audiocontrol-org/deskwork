#!/usr/bin/env bash
# Advisory clone snapshot (path ii — interim until the full clone-detector is
# vendored into stack-control under design/migrate-scope-discovery).
#
# Runs jscpd scoped to ONE codebase (default plugins/stack-control) so the
# intentional cross-plugin vendored copies (dw-lifecycle <-> stack-control
# audit-barrage) do NOT count — per-codebase scoping makes the signal usable
# (whole-repo: 327 clone groups; plugins/stack-control: 3 real intra-plugin).
#
# Fired from the session-start / session-end skill bodies (so code written
# OUTSIDE the /speckit-implement flow — quick fixes, routine donkey work — still
# gets clone-checked every session) and ad-hoc. Advisory: reports, exit 0; full
# baseline/disposition/NEW-gating arrives with the vendored detector.
#
# Usage: clone-snapshot.sh [scope-path]   (default: plugins/stack-control)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SCOPE="${1:-plugins/stack-control}"
REPORT="reports/duplication/jscpd-report.json"

npx jscpd "${SCOPE}" --silent >/dev/null 2>&1 || true
if [ ! -f "${REPORT}" ]; then
  echo "clone-snapshot [${SCOPE}]: jscpd produced no report (nothing scanned?)."
  exit 0
fi

N="$(jq -r '.duplicates | length' "${REPORT}")"
echo "clone-snapshot [${SCOPE}]: ${N} clone group(s) (ts/tsx/sh/bash; .specify excluded)"
if [ "${N}" -eq 0 ]; then
  echo "  (clean — no duplication within ${SCOPE})"
  exit 0
fi
jq -r '.duplicates[] | "  \(.format): \(.firstFile.name):\(.firstFile.start) <=> \(.secondFile.name):\(.secondFile.start)  (\(.lines) lines)"' "${REPORT}"
echo "  (ADVISORY — review NEW clones; refactor or justify. Full baseline/disposition gating arrives with the vendored clone-detector.)"
