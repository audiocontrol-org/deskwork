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
#   GOVERN_REPO_ROOT     RETIRED (specs/installation-isolation R2): setting it is a
#                        loud FATAL; pass `--at <dir>` (the installation enclosing <dir>)
#   GOVERN_MODELS        (optional; comma-list passed to audit-barrage --models)
#   GOVERN_CEILING       (optional; convergence iteration ceiling, FR-014)
#   GOVERN_OVERRIDE      (optional; recorded override reason, FR-010)
#   GOVERN_NO_SLUSH      (optional; =1 disables the slush step)
#   GOVERN_PAYLOAD_BUDGET (optional; soft byte budget for the fold)
#   GOVERN_BARRAGE_BIN   (optional; the barrage entrypoint; default: bundled stackctl) — test seam
set -euo pipefail

# Resolve the bundled stackctl from the repo root so this shim works BOTH in the
# plugin tree AND when copied into .specify/extensions/ by the Spec Kit installer
# (different depths; a BASH_SOURCE-relative path breaks in the install copy).
# GOVERN_STACKCTL overrides (tests / non-standard layout). Adopter packaging is
# tracked under design/migrate-scope-discovery.
STACKCTL="${GOVERN_STACKCTL:-$(git rev-parse --show-toplevel 2>/dev/null)/plugins/stack-control/bin/stackctl}"
[ -x "${STACKCTL}" ] || { echo "govern shim: FATAL — bundled stackctl not found at '${STACKCTL}' (set GOVERN_STACKCTL)." >&2; exit 2; }

exec "${STACKCTL}" govern --mode spec "$@"
