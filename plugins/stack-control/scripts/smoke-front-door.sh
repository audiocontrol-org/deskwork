#!/usr/bin/env bash
# smoke-front-door.sh — 028 US4 T118 (FR-034/035; SC-006/SC-007).
#
# The local pre-PR front-door regression gate. BORN WIRED (moved here from the
# superseded T003 skeleton per 028 Phase 1 govern AUDIT-BARRAGE-codex-01: a skeleton
# smoke gate is inherently misleading — exit 0 is a false green). This runs the two
# real checks and exits non-zero on ANY gap:
#
#   1. `stackctl check-front-door` — the four-assertion guard over the fronted-operations
#      registry (every op's skill exists, every verb/sub-action has working --help, every
#      mutating op is mediation-registered, skill<->verb parity both directions).
#   2. `scripts/smoke-interceptor-loaded.sh` — proves the PreToolUse interceptor is
#      registered (auto-discovered via the plugin manifest) and firing.
#
# LOCAL pre-PR ONLY — never a CI job (project rule: no test infrastructure in CI).
#
# Usage: bash plugins/stack-control/scripts/smoke-front-door.sh

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACKCTL="$PLUGIN_ROOT/bin/stackctl"

printf 'smoke-front-door: 1/2 — stackctl check-front-door\n'
"$STACKCTL" check-front-door || {
  printf 'smoke-front-door: FAIL — check-front-door reported a gap (see above)\n' 1>&2
  exit 1
}

printf 'smoke-front-door: 2/2 — interceptor-loaded smoke\n'
bash "$PLUGIN_ROOT/scripts/smoke-interceptor-loaded.sh" || {
  printf 'smoke-front-door: FAIL — interceptor-loaded smoke failed (see above)\n' 1>&2
  exit 1
}

printf 'smoke-front-door: PASS — front door complete and interceptor firing\n'
