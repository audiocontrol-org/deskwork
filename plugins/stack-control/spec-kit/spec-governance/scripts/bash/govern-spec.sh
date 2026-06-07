#!/usr/bin/env bash
# spec-governance orchestration (T007/T008/T009/T014/T019) — THIN SHIM.
#
# The audit-protocol orchestration is single-sourced in `stackctl govern`
# (govern consolidation). This shim resolves the bundled stackctl and execs
# `stackctl govern --mode spec`, forwarding every flag and the GOVERN_* env the
# TS side reads. The spec-mode payload (spec + plan fold, checkpoint scoping),
# slush, and convergence gate all live in the single-sourced TS orchestration.
#
# Branches only on the spec text + feature slug, NEVER on which tool authored
# the spec (Principle III / FR-003). Fails loud if the audit capability is
# absent — no silent skip (Principle V / FR-005).
#
# Env (read by the TS side; documented here for the shim's adopters):
#   GOVERN_FEATURE_SLUG  (optional override; else derived from feature/<slug>)
#   GOVERN_SPEC_PATH     (optional; else derived from the CLAUDE.md SPECKIT marker)
#   GOVERN_PLAN_PATH     (optional; when set — the after_plan checkpoint — the plan is folded; FR-013)
#   GOVERN_CHECKPOINT    (optional; checkpoint label; defaulting GOVERN_CHECKPOINT > after_plan-if-plan > after_clarify)
#   GOVERN_REPO_ROOT     (optional; else git toplevel) — testability
#   GOVERN_MODELS        (optional; comma-list passed to audit-barrage --models)
#   GOVERN_CEILING       (optional; convergence iteration ceiling, FR-014)
#   GOVERN_OVERRIDE      (optional; recorded override reason, FR-010)
#   GOVERN_NO_SLUSH      (optional; =1 disables the slush step)
#   GOVERN_PAYLOAD_BUDGET (optional; soft byte budget for the fold)
#   GOVERN_BARRAGE_BIN   (optional; the barrage entrypoint; default: bundled stackctl) — test seam
set -euo pipefail

# Resolve the script's own dir + the bundled stackctl BEFORE any `cd` — the
# relative BASH_SOURCE is only valid in the original cwd.
# scripts/bash -> spec-governance -> spec-kit -> stack-control
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACKCTL="$(cd "${SCRIPT_DIR}/../../../.." && pwd)/bin/stackctl"

exec "${STACKCTL}" govern --mode spec "$@"
