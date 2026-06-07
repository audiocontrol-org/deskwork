#!/usr/bin/env bash
# deskwork governance orchestration (T007) — THIN SHIM.
#
# The audit-protocol orchestration is single-sourced in `stackctl govern`
# (govern consolidation). This shim resolves the bundled stackctl and execs
# `stackctl govern --mode implement`, forwarding every flag and the GOVERN_*
# env the TS side reads.
#
# Branches only on the diff + feature slug, NEVER on which tool authored/executed
# the plan (constitution III / spec FR-003) — that logic now lives in the
# single-sourced TS orchestration. Fails loudly if the barrage capability is
# absent — no silent skip (constitution V / spec FR-005 edge).
#
# Env (read by the TS side; documented here for the shim's adopters):
#   GOVERN_FEATURE_SLUG  (optional override; else derived from feature/<slug>)
#   GOVERN_DIFF_BASE     (default: HEAD~1) — git ref the implemented work is diffed against
#   GOVERN_BARRAGE_BIN   (optional; the barrage entrypoint; default: bundled stackctl) — test seam
set -euo pipefail

# Resolve the script dir + the bundled stackctl BEFORE any `cd`, so the relative
# BASH_SOURCE stays valid. scripts/bash -> deskwork-governance -> spec-kit ->
# stack-control.
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# GOVERN_BARRAGE_BIN overrides the dispatched barrage entrypoint (tests). The TS
# side reads it directly; the shim resolves the bundled stackctl as the verb host.
STACKCTL="$(cd "${_SCRIPT_DIR}/../../../.." && pwd)/bin/stackctl"

exec "${STACKCTL}" govern --mode implement "$@"
