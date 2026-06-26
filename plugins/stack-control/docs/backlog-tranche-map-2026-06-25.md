# Backlog tranche map — 2026-06-25

Burn-down plan for the stack-control backlog (the `.stack-control/backlog/` slush store), produced by the 2026-06-25 orchestrator/triage session and used to drive the hygiene burndown. Promoted from session scratchpad into the repo so it survives across sessions (the burndown journal flagged it as ephemeral-but-needed).

## Status (updated as tranches land)

- **2026-06-25 — issue-backed Tier-1 SHIPPED in v0.55.2** (PR #508): G1 + P1–P5, 9 items, RED-first, no governance. TASK-389/116/451/453/452/449/188/450/409/448 closed; gh-499/500/501/502/505/506 closed with release evidence. Backlog 139 → 131 open.
- **2026-06-25 (cont.) — H7/H6/H3/H4/H1 burned on `feature/stack-control-hygiene`, RED-first, unreleased:**
  - **H7** (7) doc/comment sweep — `1a8a5273`.
  - **H6** (3) capability reconcile/usage help — `136b1f91`.
  - **H3** (3) fleet floor-vs-outage single-sourced marker + recovery + contract test — `c1d380fa`.
  - **H4** (2) — **WONTFIX** (`TASK-113/77`): fleet-knowledge already scaffolded + setup-verified + fail-loud point-of-use validated; phase-checkpoints moot post-030; a doctor rule would only duplicate. — `4c…`.
  - **H1** (10) degraded quiet-section contract: stale comments/JSDoc + 3 diagnostic/annotation fixes + 3 test gaps — `901321a1`.
  - Backlog 131 → **111 open**.
- **Remaining:** **H2** next (liveness/timeout — note TASK-324/354 carry an operator-owned calibration decision), then H5 → H9→H10 → H8 → … → K1 keystone, + TASK-444. Burn order below.

Triage method: 149 open To-Do items triaged across 6 thematic slices via parallel sub-agents, cross-referenced against task bodies + specs + audit-logs. Re-verify each item's cited symbol/file before fixing — source moves.

---

## TIER 0 — mechanical backlog cleanup (DONE 2026-06-25)

Closed last session: TASK-447 (already-fixed) + 9 same-defect dedup collapses (453→451, 409→450, 339→356, 354→324, 340/342→351, 162→163, 106→108, 113→77). The remaining dedup collapses below are folded into their H-tranche canonical and close when that tranche lands — they are NOT separate work.

13 already-promoted items excluded from the hygiene queue (execute via their spec/roadmap, do NOT triage as loose):
- → `specs/016-anchor-unification`: TASK-56, 22, 49, 50, 51, 52, 53, 55, 47 (9)
- → roadmap (audit fleet): TASK-75, 76
- → roadmap (lifecycle mechanization): TASK-134, 135

---

## TIER 1 — point-fix hygiene tranches (RED-first TDD, NO governance, burn on this branch)

ISSUE-BACKED (the 6 friction issues) — **✅ SHIPPED v0.55.2:**
- ~~P1 convergence-record SHA fidelity — TASK-450(+409,397) — gh-502 (HIGH)~~ ✅
- ~~P2 tasks-complete manual-acceptance marker — TASK-451(+453) — gh-501/499~~ ✅
- ~~P3 design-to-spec solution-space counter — TASK-452 — gh-500~~ ✅
- ~~P4 sibling-verb arg parsing (--spec/--at) — TASK-449(+188) — gh-505~~ ✅
- ~~P5 roadmap reconcile --unorphan dup node — TASK-448 — gh-506~~ ✅
- ~~G1 typecheck + hermetic fixtures — TASK-389, 116~~ ✅

AUDIT-MIGRATED hygiene (no gh; clustered by code surface) — **REMAINING:**
- **H1 renderQuietSection degraded cleanup + tests** — TASK-351(+340,342),350,344,356(+339),345,336,355 — M
- **H2 liveness/timeout payload-scaling + config assertions** — TASK-324(+354),329,330,328,319,320,321 — M
- **H3 fleet floor-vs-outage split** — TASK-119,126,127 — S
- **H4 fleet-knowledge schema/doctor** — TASK-77(+113) — S
- **H5 help-nondrift + descriptor test hardening** — TASK-276(+283),280(+281,286),268(+282,269,271),274,275,284,285,287,302,308,309,311 — L
- **H6 capability.ts reconcile/usage help** — TASK-167(+168,172) — S
- **H7 cheap doc/comment-staleness sweep** — TASK-261,262,313,314,325,63 — S (zero-risk prose)
- **H8 capability-mediation parser refactor** — TASK-163(+162) — L
- **H9 no-backend-writes harness rewrite** — TASK-230(+234,236,238) — M
- **H10 mediate-check test-surface rewiring** — TASK-235(+240,237),228 — M
- **H11 front-door marker hygiene + linchpin spike** — TASK-164(spike),165,243,239,218,220 — M
- **H12 fence-grammar CommonMark hardening** — TASK-406(+420),17,402(+404) — M
- **H13 govern boundary/empty-phase** — TASK-108(+106),410,99,110 — M
- **H14 small CLI correctness** — TASK-1,3,158,418,419 — S
- **H15 check-* scaffold DRY extraction** — TASK-11 — M
- **H16 convergence-loop coverage holes** — TASK-414,415 — M
- **H17 override-graduate + low test gaps** — TASK-377,380,395,396 — S
- **H18 close/ship status coherence** — TASK-445(+446?) — M
- **H19 workflow-CLI derive-from-doc** — TASK-140,142,143 — M
- **H20 purity/typing/DI hygiene** — TASK-226,227,166,312,187,182 — S/M
- **H21 release-helper first-release path** — TASK-66 — S
- **H22 misc** — TASK-20,296,432 — S
- **TASK-444** — 031 node parent-ref hardening (batch partial-failure + multi Node-ref supersession)

KEYSTONE / BLOCKED:
- **K1 end-govern-pipeline wiring** — TASK-413 (decompose+wire keystone) → then 417,421,422 — L. H16 (414/415) and parts of P1 sit downstream.

---

## TIER 2 — feature-shaped (route to roadmap + define, NOT hygiene burn)

Already formalized to the roadmap 2026-06-25:
- **F-autonomous-loop** — `impl:feature/autonomous-loop` (TASK-150, 424)
- **F-spec-governance** — `design:feature/spec-governance` (TASK-138)
- **F-migrate-audit-barrage** — `multi:feature/migrate-audit-barrage` (TASK-443)
- **F-scope-discovery-v2** — `design:gap/scope-discovery-v2-expansion` (TASK-6 seed; 7,8,9,296 linked; TASK-10 parked on upstream Claude Code dep)
- **F-anchor** — `specs/016-anchor-unification` (9 promoted items)
- **F-lifecycle-mechanization / F-audit-fleet-autonomy** — TASK-134/135/76 (promoted)

---

## Recommended burn order (remaining)

H7 (cheap sweep) → H6 → H3/H4 → H1→H2 → H5 → H9→H10 → H8 → H11 → H12→H13 → H14→H20→H21→H22 → H17→H18→H19 → H15 → H16 → K1 last (largest, downstream-enabling).
Route TIER 2 to roadmap/define in parallel (operator-owned).
