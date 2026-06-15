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
#
# Anchoring contract (specs/installation-isolation): every argument is forwarded
# verbatim to `stackctl govern` ("$@" below) — pass `--at <dir>` (the installation
# enclosing <dir>) to anchor explicitly, or run with the cwd inside the
# installation (the default walk-up start). GOVERN_REPO_ROOT is retired (R2):
# setting it is a loud FATAL, never a silent no-op.
set -euo pipefail

# Resolve the bundled stackctl from the repo root so this shim works BOTH in the
# plugin tree AND when copied into .specify/extensions/ by the Spec Kit installer
# (the two sit at different depths, so a BASH_SOURCE-relative path breaks in the
# install copy). GOVERN_STACKCTL overrides (tests / non-standard layout).
# (Adopter packaging — locating an npm-installed stackctl from an installed
# extension — is tracked under design/migrate-scope-discovery.)
STACKCTL="${GOVERN_STACKCTL:-$(git rev-parse --show-toplevel 2>/dev/null)/plugins/stack-control/bin/stackctl}"
[ -x "${STACKCTL}" ] || { echo "govern shim: FATAL — bundled stackctl not found at '${STACKCTL}' (set GOVERN_STACKCTL)." >&2; exit 2; }

exec "${STACKCTL}" govern --mode implement "$@"
