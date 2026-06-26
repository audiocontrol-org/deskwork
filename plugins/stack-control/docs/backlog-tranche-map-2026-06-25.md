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
  - **H2** (7) payload-scaled liveness window (deriveLivenessWindowSeconds, lockstep with kill-cap) + reliability test hardening — `9303221b`. TASK-354 was already closed (dup of 324).
  - Backlog 131 → **104 open**.
- **2026-06-26 (cont.) — H5 burned on `feature/stack-control-hygiene`, RED-first, unreleased:**
  - **H5 production** (3) `3f84f610`: TASK-308 selfHandlesHelp descriptor field replaces the SELF_HELP_VERBS denylist (clean break); TASK-311 descriptor artifact carries `shortFlag`; TASK-309 inferChainPosition single-sources the `tasks.md` path via `artifactRelPath` (+ suppression-path coverage).
  - **H5 test-hardening** (14) `83ead572`: parser-adapter error shapes (268 concrete-member, 271 `roadmap:` prefix, 269 single-sourced `unknownSubactionFlagMessage`); help-surface structural per-row summary (274/287) + explicit advance status-vocabulary contract (284); help-nondrift robustness (275 mkdtemp cleanup, 276/283 tightened+unit-tested `shownFlags` anchor, 281 check (3b) boolean-flag acceptance + completeness guard, 282 positive reconcile exit-2 reason, 285 phantom-entry guard, 280/286 honest spot-check titles/comment).
  - **TASK-302 left OPEN** — re-verified still blocked on T013 (roadmap value-flags still carry empty commander descriptions; extending assertSurfaceComplete would throw for every roadmap flag). Correctly scoped into T013 (028 feature work), not this hygiene burn.
  - Tests 2645 → **2705**; backlog 105 → **88 open** (17 H5 items closed; 302 deferred).
- **2026-06-26 (cont.) — H9 burned on `feature/stack-control-hygiene`, RED-first, unreleased:**
  - **H9** (4) `b76eee6a`: no-backend-writes consolidated onto a shared content-hash, removal-aware snapshot primitive — new `snapshotTree(root, exemptRel)` in `_isolation-harness.ts` (content-sha1, dir-aware); `snapshotOutsideInstallation` delegates to it (all 13 isolation-probe importers gain same-size-edit detection for free); the divergent `listFiles`/`changed` deleted; exit-time marker removal now exercises the removal-aware diff; new `isolation-harness-snapshot.test.ts` pins the deletion + same-size-same-mtime blind spots. TASK-230/234/236/238.
  - **Code review** surfaced + captured **TASK-456** (3 other test files still carry their own `size:mtime` snapshot copies — out-of-scope follow-up sweep); refuted a "same-size edit untested" finding (pinned by the new harness unit test); softened an overstated doc claim.
  - Tests 2705 → **2709**; backlog 89 → **86 open** (4 H9 closed; TASK-456 newly filed; net −3).
- **2026-06-26 (cont.) — H10 burned on `feature/stack-control-hygiene`, RED-first, unreleased:**
  - **H10** (4) `18512631`: rewired the capability-mediation isolation + cross-vendor parity tests to drive the REAL CLI verbs (`front-door`/`mediate-check`/`intercept`) through installation fixtures via `runCli` (now with a stdin `input` option), instead of pure cores / low-level marker writers. A MUTATING identity (`backlog capture`) + the refuse-unmarked/permit-marked + inside-vs-outside contrasts make each assertion load-bearing (proves `--at` resolved a real install, not the FR-020 no-install default-permit). TASK-235/237/240/228.
  - **Code review** clean — verified each rewired test fails under a real regression (`--at` ignored → permit; marker anchored to cwd → outer-tree leak).
  - Tests 2709 → **2709** (net rewrite — 2 pure-core tests replaced by 2 real-verb tests); backlog 86 → **82 open** (4 H10 closed).
- **Remaining:** **H8** next, then H11 → H12→H13 → H14→H20→H21→H22 → H17→H18→H19 → H15 → H16 → K1 keystone, + TASK-444 (+ TASK-456 snapshot-copy sweep). Burn order below.

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
- ~~**H5 help-nondrift + descriptor test hardening** — TASK-276(+283),280(+281,286),268(+282,269,271),274,275,284,285,287,308,309,311~~ ✅ `3f84f610`+`83ead572` (TASK-302 still OPEN — blocked on T013)
- **H6 capability.ts reconcile/usage help** — TASK-167(+168,172) — S
- **H7 cheap doc/comment-staleness sweep** — TASK-261,262,313,314,325,63 — S (zero-risk prose)
- **H8 capability-mediation parser refactor** — TASK-163(+162) — L
- ~~**H9 no-backend-writes harness rewrite** — TASK-230(+234,236,238)~~ ✅ `b76eee6a` (consolidated onto shared content-hash `snapshotTree`; TASK-456 follow-up filed for the other size:mtime copies)
- ~~**H10 mediate-check test-surface rewiring** — TASK-235(+240,237),228~~ ✅ `18512631` (drive the real front-door/mediate-check/intercept verbs via runCli; load-bearing permit/refuse contrasts)
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
