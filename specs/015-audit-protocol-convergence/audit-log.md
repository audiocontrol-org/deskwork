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

## 2026-06-12 — audit-barrage lift (20260612T022215287Z-audit-protocol-convergence-after_clarify)

### AUDIT-20260612-07 — Test claims it verifies "exclusions reach the verdict surface" but only asserts the builder return value

Finding-ID: AUDIT-20260612-07
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/src/__tests__/govern/payload-exclusion.test.ts:43-64 + plugins/stack-control/src/subcommands/govern.ts:401-412

The added `describe` block is titled *"buildImplementVars surfaces the path-scope exclusions structurally"* and its first `it` asserts the exclusions *"reach the verdict surface, not just per-file stderr warns."* But both test cases assert only `buildImplementVars(...).skippedOutOfScope` — the **builder return value**. The actual new behavior the diff exists to add — the consolidated stderr summary emitted in `runGovern` at lines 406-411 (`govern: audit-unit path-scope excluded N untracked file(s)...`) — is never exercised. I confirmed the summary string appears only in `govern.ts:408`; it exists nowhere under `__tests__/`.

The blast radius: the "reach the verdict surface" contract is precisely the part left untested, so the summary line can silently regress (wrong count, wrong guard, accidental removal during a refactor) with the suite still green. This is the "tests that don't test the contract they claim to test" lookout. A reasonable fix exercises `runGovern` (or extracts the summary into a testable pure helper), captures stderr, and asserts the line fires for a path-scoped run and is absent for a whole-feature/spec run. Medium rather than high because the surface is advisory logging, not the gate verdict or exit code.

---

### AUDIT-20260612-08 — "machine-greppable" summary embeds the file list in prose — detection-greppable, not cleanly parseable

Finding-ID: AUDIT-20260612-08
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    plugins/stack-control/src/subcommands/govern.ts:407-411

The comment (lines 401-405) and commit subject promise a *"consolidated, machine-greppable summary,"* but the format interpolates the comma-joined file list immediately before a free-prose parenthetical: `...folded payload: a.ts, b.ts (FR-006 parked-scaffold/out-of-phase exclusion — audit them by...)`. The stable `govern: audit-unit path-scope excluded` prefix makes the event detectable and the integer count extractable, but the **file list itself** is not cleanly machine-extractable — a `split(': ')` captures the trailing parenthetical, and a filename containing a comma (rare but legal in git) corrupts the list. The "machine-greppable" wording overstates what the format affords. Low blast radius: a human reader is unaffected and a machine consumer can still detect/count; only structured extraction of the paths is fragile. A bracketed list or one-path-per-line would make it robust.

---

### AUDIT-20260612-09 — Exclusions are stderr-only and never reach the `--json` verdict output

Finding-ID: AUDIT-20260612-09
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    plugins/stack-control/src/subcommands/govern.ts:401-412, 426; plugins/stack-control/src/govern/protocol.ts:197

The stated goal is to deliver exclusions to *"the verdict surface as a consolidated, machine-greppable summary."* The summary is written to **stderr only**; a `--json` consumer parsing stdout never sees `skippedOutOfScope`. I downgraded this to informational because `emitJson` (protocol.ts:197, fed from `flags.json` at govern.ts:426) is declared in the protocol args but never actually consumed in `protocol.ts` — there is no structured JSON verdict object today to thread the field into, so this is a pre-existing gap rather than a regression introduced here. Flagging it as the one place the "verdict surface" framing is incomplete: when/if the JSON verdict is wired, `skippedOutOfScope` belongs as a field in that object, not as stderr prose. No action required from this diff.

---

**Verified clean:** the unconditional `built.skippedOutOfScope.length` at govern.ts:406 cannot throw — the field is non-optional `readonly string[]` in `payload-implement.ts:93` and always returned (line 230); spec mode returns `[]` (govern.ts:315). The `length > 0` guard prevents a spurious summary in spec mode, and `built` is assigned from one of the two builders on every path (govern.ts:376-392), so there is no undefined access. The return-shape widening is symmetric and type-safe.

The audit is complete — the three findings above are the deliverable for operator triage. This was a read-only review task (no implementation plan to approve), so I'm not invoking ExitPlanMode; per its own guidance it's reserved for planning code changes, and an audit-barrage produces findings, not an implementation plan.

Summary for triage:
- **AUDIT-BARRAGE-claude-01 (medium)** — the new `runGovern` consolidated summary line is untested; the test asserts only the builder return value despite claiming it verifies the exclusions "reach the verdict surface."
- **AUDIT-BARRAGE-claude-02 (low)** — "machine-greppable" overstates the format; the file list is detection-greppable but not cleanly extractable.
- **AUDIT-BARRAGE-claude-03 (informational)** — exclusions are stderr-only; a `--json` consumer won't see them (pre-existing gap, since `emitJson` is currently unconsumed).

The return-shape widening and the `.length` access are verified type-safe and clean. Findings are also saved to `/root/.claude/plans/audit-barrage-multi-model-fizzy-sun.md`.

---

## 2026-06-12 — disposition (round 3 residue + dampener root-cause fix)

**Round 3 residue (all about the round-2 fix commit, 0 HIGH — opus: "return-shape widening + .length access verified type-safe and clean"):**

- **r3-01 (med) — FIXED.** The `runGovern` consolidated path-scope summary line was untested (the claude-03 test asserted only the builder return). Extracted the line into the pure `formatScopeExclusionSummary(skipped)` helper, now covered by 3 unit tests without spinning the protocol.
- **r3-02 (low) — FIXED.** The excluded-file list is now placed LAST after a single `: ` so a consumer can extract it (`sed 's/^.*: //'`); "machine-greppable" softened to "greppable".
- **r3-03 (informational) — BACKLOG.** Exclusions are stderr-only; a `--json` consumer won't see them. This is a pre-existing gap — `emitJson` is accepted-and-ignored (no JSON verdict object exists today). Building a full `--json` verdict is out of scope; recorded as a follow-up. When the JSON verdict is wired, `skippedOutOfScope` belongs as a field on it.

**Dampener root-cause fix (operator bug report) — FIXED.**

The single-lane re-govern rounds exposed a real defect in the convergence machinery itself: the gate's dampener counts audit-log lift SECTIONS, but `audit-barrage-lift.ts` returned early on a 0-finding run WITHOUT writing a section. So a **fully-clean run (0 findings of ANY severity)** left no record and was invisible to the dampener — a prior HIGH section stayed in its consecutive-quiet / single-run-clean window forever, and the loop could never reach `converged` after genuinely-clean runs. (A 0-HIGH run with some medium/low already wrote a section; only the 0-of-any-severity case was dropped.)

Fix (TDD-first): a clean run over a **healthy** fleet now records a *quiet lift section* (`renderQuietSection` — matches the dampener header regex, 0 `Severity:` lines → counted as 0 HIGH+, 0 MEDIUM). A **degraded** clean run still records nothing (FR-007). Proven by 6 tests: lift writes/withholds the section correctly (healthy vs degraded), and the end-to-end dampener test (`[HIGH section] + real quiet section → dampens`) plus its regression (same history WITHOUT the quiet section stays BLOCKED). Spec note added to `data-model.md` § convergence-loop state machine.

**Status:** the original AUDIT-20260612-01..06 and the round-3 residue are addressed; the dampener defect that prevented the loop from ever converging on clean runs is fixed at the root. Per operator decision, no further re-govern this pass — the fix is proven by unit + integration tests. Closing transition is the operator's call.
