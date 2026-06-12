---
slug: audit-protocol-convergence
targetVersion: ""
---

# Audit log — audit-protocol-convergence

## 2026-06-12 — audit-barrage lift (20260612T011812439Z-audit-protocol-convergence-after_clarify)

### AUDIT-20260612-01 — Per-phase scoping is applied only to untracked files — committed phase work is unscoped AND untracked sibling files are silently dropped

Finding-ID: AUDIT-20260612-01
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    plugins/stack-control/src/govern/payload-implement.ts:149,164-175 + src/govern/incremental-audit.ts:88 + src/subcommands/govern.ts (buildImplementVars pathScope)

US4's premise is "shrink the audited unit" (SC-006). But `diffScope.files` flows into `assembleImplementPayload` only as `pathScope`, and `pathScope` gates **only** the untracked fold (line 164). The committed `git diff base` (line 149) is never phase-scoped — so for committed phase work (the normal commit-per-task flow) `--phase` audits the whole `git diff HEAD~1`, not the phase. Separately, `phase.files` is the exact set of paths *named in task lines*, and `inPathScope`'s `startsWith(prefix + '/')` arm never fires for a concrete `*.ts` prefix — so an untracked file the implementer created but didn't name verbatim in a task line is **silently excluded from the audited payload**. `per-phase-timeout.test.ts` / `payload-exclusion.test.ts` only exercise untracked files at the exact scoped prefix, masking both gaps, yet quickstart-results records SC-006 PASS citing them — the "test the mechanism, not the contract" trap. Fix: scope the committed diff (`git diff base -- <files>`) and test a *committed* phase + an unnamed untracked sibling.

### AUDIT-20260612-02 — Cross-lane agreement floor can de-inflate a genuine single-lane HIGH to informational — inverse of SC-003

Finding-ID: AUDIT-20260612-02
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/src/scope-discovery/promote-findings/cluster-severity.ts:60-72

`highestLevelWithAtLeastTwoAtOrAbove` has no floor: a two-lane cluster `[high, informational]` returns **informational**. So when one model flags a real HIGH and a second that clustered onto the same surface rated it informational/low, the gate counts 0 HIGH and 0 MEDIUM, single-run-clean can engage, and an unattended loop graduates past a defect one model called HIGH. SC-003 only pins `[high,high]→high`; no test covers wide disagreement. This is the dangerous direction (unbounded *lowering*) for a gate feeding an unattended build. Add a disagreement floor (route ≥2-level spreads to `adjudicate`) or at least a test pinning the intended behavior.

### AUDIT-20260612-03 — `dispatchFix` is a no-op; raising the documented `--ceiling` re-barrages with no fix between rounds

Finding-ID: AUDIT-20260612-03
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/src/subcommands/govern.ts:432-438 + USAGE "--ceiling <N>"

In govern, `dispatchFix` only writes a stderr line. `--ceiling` is advertised as "Convergence iteration ceiling," but setting it `>1` runs N identical barrage passes against an unchanged tree (no fix applied), staying BLOCKED and burning N multi-model runs for nothing. The candor lives in a code comment, not the operator-facing USAGE. Gate `--ceiling > 1` behind a real fixer, or mark it inert in USAGE — as written it's a cost footgun.

### AUDIT-20260612-04 — "Code-driven loop replaces agent-held prose loop" overstates the shipped default

Finding-ID: AUDIT-20260612-04
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    commit 1bb6eb2 + speckit.deskwork-governance.govern.md + govern.ts resolveCeiling default 1

SC-004 / the new prose claim the agent "no longer holds the iterate/stop decision." True *per invocation* — but default ceiling is 1 and `dispatchFix` can't edit in-process, so each run does one pass and the command md tells the agent to "fix the surfaced findings & re-invoke govern." The real cross-round loop is still agent-paced. A fresh agent reading the commit/SKILL prose can conclude convergence is unattended when it isn't. Honest framing: the driver owns the stop decision for one pass; the operator/agent still drives re-invocation until a real in-process fixer lands.

### AUDIT-20260612-05 — `runConvergenceLoop` never reads `unit`; the govern-side `unit` and `overridden` outcome are dead in production

Finding-ID: AUDIT-20260612-05
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    plugins/stack-control/src/govern/convergence-loop.ts:24-26,43-66 + src/subcommands/govern.ts

`unit` is documented "carried for the per-attempt record," but the loop never references it and no record is written — inert parameter. govern constructs a fallback `unit` only to satisfy the type. `override` is never passed to the driver (handled in the gate → `converged`), so `OverriddenOutcome` is test-only. Dead-code smells the next barrage will re-flag; either wire `unit`/override through or drop them.

### AUDIT-20260612-06 — quickstart-results.md reports T034 "run the full suite green" while the suite has 7 failures

Finding-ID: AUDIT-20260612-06
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    specs/015-audit-protocol-convergence/quickstart-results.md + tasks.md T034

T034 is checked "Run the full suite **green**" but the doc records "1297 passed … 7 failed" (attributed to pre-existing env-only files). The prose is honest; only the "green" headline/checkbox overstates. Per AUDIT-04 arithmetic discipline, state "green except N named pre-existing env failures" in the criterion itself.

---

The full report (with verification notes) is saved to the plan file. Note: I was dispatched as an audit-barrage reviewer, so these findings — not an implementation plan — are the deliverable; I emitted them in the barrage block format above for triage.

I've completed the audit — this was a review/analysis task (not an implementation plan), so per ExitPlanMode's own guidance I won't call it. The six findings are delivered above in barrage block format and persisted to the plan file for triage.

**Summary for triage:** the one finding I'd prioritize is **claude-01 (high)** — the per-phase audit unit doesn't actually shrink committed work and can *silently drop* untracked files not named in a task line, while the tests only cover the untracked-at-exact-prefix happy path. That's an audit-coverage hole the green test suite hides. The two `medium` design findings (claude-02 unbounded severity de-inflation, claude-03 `--ceiling` footgun) are the next tier; claude-04 is a prose accuracy gap; claude-05/06 are low hygiene.

---

## 2026-06-12 — disposition (operator: fix-01-plus-cheap-valid + add-disagreement-floor)

This run was **single-lane (claude/opus only)** — fleet configured 1, produced 1; cross-model quorum was impossible (the gate BLOCKED on a single-model HIGH). The operator reviewed the triage and chose to fix AUDIT-01 + the cheap-valid set now (TDD-first), add a disagreement floor for AUDIT-02, and fold in AUDIT-04. All six are addressed in this branch:

- **AUDIT-20260612-01 — FIXED (TDD).** `assembleImplementPayload` now scopes the committed `git diff base` to the unit's `pathScope` (`git diff base -- <files>`), not just the untracked fold. RED-first test added in `payload-exclusion.test.ts` (`committed diff is scoped to the unit path scope`): a committed in-scope change is audited, a committed out-of-scope change is excluded, and an unnamed untracked sibling is excluded (the per-phase contract). The second-half "silent drop of unnamed siblings" is now an asserted, intentional behavior.
- **AUDIT-20260612-02 — FIXED (TDD + spec note).** `mergeCluster` routes a wide-spread `agreement` cluster (dominant lane ≥2 levels above the agreement floor, e.g. `[high, informational]`) through `adjudicate` on the dominant lane's body, so a real single-lane HIGH is never silently floored to `informational`. A 1-level `[high, medium]→medium` spread is unaffected. RED-first tests in `extract-barrage-findings.test.ts`; spec note in `contracts/cluster-severity.md` § Disagreement floor.
- **AUDIT-20260612-03 — FIXED.** The `--ceiling` USAGE now states that govern applies no in-process fix between rounds, so N>1 re-barrages an unchanged tree and stays BLOCKED (cost footgun) — the caveat is operator-facing, not just a code comment.
- **AUDIT-20260612-04 — FIXED (prose).** The govern command md now distinguishes the within-pass driver-owned stop decision from the still-agent-paced cross-round loop at default ceiling 1.
- **AUDIT-20260612-05 — FIXED (removal).** The driver's inert `unit` param and the redundant `override`/`overridden` short-circuit are removed (override is a gate concern that graduates as `converged` with a barrage record). Types, govern wiring, data-model state machine, contract, and the convergence-loop test updated to the two-terminal driver.
- **AUDIT-20260612-06 — FIXED.** The T034 criterion states "green except the named pre-existing env failures" rather than an unqualified "green"; `quickstart-results.md` carries the `1297→1301 (+4)` reconciliation.

Full suite after fixes: **1301 passed, 8 skipped, 7 failed** (the 7 are the same pre-existing env-only trio — git commit-signing 400 + a hardcoded SHA absent in a fresh clone — verified in isolation). `tsc --noEmit` clean. Closing transition (open→resolved) is the operator's call per project discipline; the evidence is above + in the branch diff.
