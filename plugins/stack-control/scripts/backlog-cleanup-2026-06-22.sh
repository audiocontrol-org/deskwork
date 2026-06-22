#!/usr/bin/env bash
# Batch backlog cleanup — apply dispositions from backlog-cleanup-review-2026-06-22.md
# Run from plugins/stack-control/ directory.
set -euo pipefail

MOOT_030="Moot — 030 US2 deleted the per-phase checkpoint mechanism this targets (verified absent from source); govern-at-end audits the committed whole-feature diff. No code remains to reproduce against."

WONTFIX_72="Wontfix — directly conflicts with settled .claude/rules/governed-markdown-foundation.md; governed markdown (roadmap/inbox) is the foundation (operator decision 2026-06-18)."

close() {
  local id="$1"; local reason="$2"
  echo "==> closing $id"
  stackctl backlog done "$id" --reason "$reason" --apply
}

# ── Moot by 030 per-phase deletion ──────────────────────────────────────────
close TASK-70  "$MOOT_030"
close TASK-73  "Moot — 030 US2 deleted per-phase mechanism (verified absent); also closed upstream gh-469."
close TASK-97  "$MOOT_030"
close TASK-184 "Moot-by-030 — checkpoint-state type predicate at capability-reconcile.ts:64-66 gone; reconcile now uses isImplFeatureConverged."
close TASK-186 "$MOOT_030"
close TASK-189 "Moot-by-030 — three-branch per-phase checkpoint gate gone; graduate-impl collapsed to single criterion."
close TASK-245 "Moot-by-030 — govern --phase and per-phase payload scoping deleted; govern audits whole committed feature diff."
close TASK-264 "Moot-by-030 — 030 chunking bounds each chunk to renderBudgetBytes (FR-027); the unbounded whole-feature payload that caused 311s timeout no longer exists."
close TASK-301 "$MOOT_030"
close TASK-353 "Moot-by-030 — per-phase re-stale loop + hunk-fingerprints gone; whole-feature govern-at-end IS the batch-graduate path."
close TASK-366 "Moot-by-030 — writeResolvedPhaseCheckpoint and per-phase checkpoint mechanism deleted; record-first FATAL survives in new form in govern-arms.ts."
close TASK-367 "Moot-by-030 — per-phase govern exit-code inconsistency cited the deleted payload-implement.ts / per-phase govern path."
close TASK-369 "Moot-by-030 — deferred-work marker in the deleted per-phase govern comment block; grep govern.ts shows 0 deferred/TODO/for-now hits."
close TASK-379 "Moot-by-030 — phase-checkpoint writing deleted; live record-first guard already in govern-arms.ts:146."
close TASK-408 "Wontfix per operator decision 2026-06-21 — single-file-over-envelope fails loud (never FATAL-bypass); spec corrected."
close TASK-411 "Wontfix per operator decision 2026-06-21 — split-file wording removed; only SplitClusterMarker (multi-file cluster sub-split) exists in the entity model."
close TASK-412 "Resolved — 030 US2 deleted per-phase modules; compose-convergence/phase-checkpoint-status/checkpoint-state/incremental-audit absent from src/govern/ (verified). govern.ts now 333 lines."

# ── Source-verified resolved ─────────────────────────────────────────────────
close TASK-151 "Resolved — govern.ts decomposed to 333 lines by 030 (under 300-500 cap); dup of TASK-413."
close TASK-48  "Moot — payload-implement.ts deleted by 030 US8 (verified absent from source)."

# ── Closed upstream ──────────────────────────────────────────────────────────
close TASK-58  "Closed upstream — gh-458 CLOSED; verify fix in installed release per closure rule."
close TASK-59  "Closed upstream — gh-455 CLOSED; verify fix in installed release per closure rule."
close TASK-295 "Closed upstream — gh-487 CLOSED; runJscpd returns null on zero-files scan (jscpd-runner.ts:55-62 cites TASK-295/#487); language-awareness remnant tracked in TASK-296."

# ── Likely resolved (spec shipped + fix evidence) ───────────────────────────
close TASK-12  "Likely resolved — promoted to 014-audit-barrage-reliability (shipped); lift union-key = heading agreement, commits e15e77a5/6b241c9b."
close TASK-15  "Likely resolved — promoted to 012-backlog-promotion-seam (shipped)."
close TASK-24  "Likely resolved — promoted to 014 (shipped); US7 routes six sites through resolveFeatureRoot (scope-inventory.ts:40), commits 4897d7e4/a6323b59/518070dd."
close TASK-26  "Likely resolved — promoted to 014-audit-barrage-reliability (shipped); timed-out/zero-byte runs observable and recoverable. (Watchdog item — TASK-442 carries the --help collision, a separate still-valid gap.)"
close TASK-28  "Likely resolved — promoted to 014 (shipped); US6 scope-widen auto-seeds missing scope-discovery state, commits 04f457d4/65f51790."
close TASK-30  "Likely resolved — promoted to 014 (shipped); legacy dw-lifecycle notice present in config-loader.ts:79/165/190."
close TASK-41  "Likely resolved — promoted to 021-friction-burndown (shipped); end-govern-runtime.ts:189-196 machine-distinguishes fleet-floor-shortfall vs barrage-outage."
close TASK-45  "Likely resolved — impl:feature/installation-isolation shipped; --repo-root retired (clean-break-absence.test.ts asserts unknown-flag); govern anchors installation.root."
close TASK-54  "Likely resolved — promoted to 021 (shipped); empty-diff downgrade message absent from non-test src/."
close TASK-69  "Likely resolved — README.md Codex section (lines 55-79) documents clean-session install path."
close TASK-130 "Likely resolved — chain-position.ts:79-104 isFullyImplemented() returns null for a finished spec (TASK-130 comment present)."
close TASK-133 "Likely resolved — reconcile --unorphan flag exists (roadmap.ts:71-73 with apply:true)."
close TASK-137 "Likely resolved — 027 shipped; move-edge verb present (roadmap.ts:126); node text absorbs TASK-137."
close TASK-144 "Likely resolved — impl:feature/terminal-closure (specs/023) is shipped in ROADMAP.md."
close TASK-147 "Likely resolved — skills/session-start/SKILL.md:28 now quotes bare stackctl session-start (not source-repo path); gh-480 still open — post evidence, operator closes."
close TASK-148 "Likely resolved — roadmap advance <id> --to exists (roadmap.ts:80,229-231,388) as part of shipped 027; gh-472 still open — post evidence, operator closes."
close TASK-174 "Likely resolved — capability-reconcile.ts has isDirectorySafe (line 31) + per-entry try/catch (line 67) covering the opaque-throw-on-non-dir gap."
close TASK-416 "Likely resolved — GOVERN_CHECKPOINT rejection is now mode-scoped: govern.ts:134 if (flags.mode === 'implement'); spec mode retains checkpoint label."
close TASK-423 "Likely resolved — non-audit-trim retains trimmed files as coverageOnlyFiles; all-non-audit cluster emits coverage-only chunk with marker:null (envelope-binpack.ts:45-115, FR-028)."

# ── Wontfix per rule ─────────────────────────────────────────────────────────
close TASK-72  "$WONTFIX_72"

echo ""
echo "Done. Re-scoping and uncertain items require separate edits."
