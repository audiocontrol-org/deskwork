# Spec-Audit Failure Modes & Diminishing-Returns Log

> **Well-known, append-only log.** Discoveries about how the cross-model audit-barrage behaves when pointed at a **spec** (`stackctl govern --mode spec`) rather than code. Read this before/while running a spec-governance convergence loop; **append a new entry after each substantial spec audit.** The operational rule that points here is [`.claude/rules/spec-audit-diminishing-returns.md`](../../../../.claude/rules/spec-audit-diminishing-returns.md); the loop driver is [`commands/speckit.spec-governance.govern-spec.md`](./commands/speckit.spec-governance.govern-spec.md).

## Why this log exists

Auditing **code** has a crisp convergence floor: 0 findings means done, and a clean diff is objectively clean. Auditing a **spec** does not. A spec is prose — inherently incomplete — so a sufficiently aggressive cross-model barrage can **always** surface another under-specified edge in any non-trivial spec. There is no "0 findings is obviously correct" floor. That makes **knowing when you've hit diminishing returns genuinely fuzzy** — harder than for code. This log captures the recurring failure modes and the heuristics for detecting the plateau, so each spec audit gets smarter instead of re-learning them.

## Failure modes (catalog)

- **FM-1 — Fix-debt compounding.** A remediation round introduces new findings *on the fix text itself*. Fresh-context per-finding dispatch (the govern-spec discipline) *reduces* this but does not eliminate it: a genuinely under-thought concept added in round N spawns several findings in round N+1.
- **FM-2 — Mechanism-over-specification generator (the big one).** When a spec tries to fully specify an *implementation mechanism* in prose (e.g. a crash-safe two-file write/rollback protocol), the barrage correctly refuses every incomplete prose attempt, and each attempt spawns or resurfaces a finding. This is a **generator**: it emits a steady stream of HIGHs that patching cannot exhaust. Root cause: the spec crossed the **"promises before mechanism"** line. The fix is **not** more prose — it is to *remove the mechanism from the spec*, state the operator-facing **promise**, and defer the protocol to `plan`/`contracts` + RED tests.
- **FM-3 — Same-issue resurfacing under a new ID.** A partially-fixed deep issue reappears with a fresh finding ID (a relaxation that still contains the original impossibility). Signal that the fix addressed the *symptom*, not the *root*.
- **FM-4 — No crisp floor.** (Meta.) Unlike code, "0 spec findings" is not a stable state; expect the barrage to keep finding *something* until you consciously decide the spec captures the promises + decisions and the residual is implementation detail.

## Diminishing-returns detection (the fuzzy part — heuristics, not a hard rule)

You are likely at the plateau when **two or more** of these hold across consecutive rounds:

1. **HIGH count stops monotonically decreasing** — it plateaus or oscillates (e.g. `…→1→5→5`), instead of trending to 0.
2. **A meaningful fraction of new findings are fix-debt** (FM-1) — consequences of the prior round's edits, not pre-existing defects.
3. **A root issue resurfaces** under a new ID (FM-3).
4. **Findings shift altitude** — from contradiction/promise-level ("FR-X contradicts SC-Y") down to implementation-mechanism-level ("the rollback protocol is unspecified"). The spec is being asked to *be the code* (FM-2).

Cross-model agreement remains the **HIGH-confidence** signal regardless — a multi-model finding is almost always a genuine deep tension, even at the plateau.

## When the plateau is detected — the playbook

**Stop patching instances** (the 004-dogfood lesson: don't chase a generator). Do one of:

- **(A) Structural root-fix.** Remove the generator, don't feed it. De-specify the over-specified mechanism → replace with a promise + defer to contracts/TDD (FM-2); or DRY-collapse a rule restated in N places (the 004 convergence blocker). One structural change can collapse many findings at once.
- **(B) Override & graduate.** Record a substantive `GOVERN_OVERRIDE`: the spec captures the promises + all major design decisions; residual mechanism detail is pinned by `plan`/`contracts` + RED tests at implement time. Legitimate once findings are all implementation-altitude.
- **Do NOT** simply raise the ceiling and keep patching — that burns barrage cycles feeding a generator.

Operator owns the (A)-vs-(B) call and any genuine design forks surfaced at the plateau.

---

## Log entries

### 2026-06-07 — `design/document-primitives` (specs/005) — first self-hosted spec-governance dogfood

**Run:** `stackctl govern --mode spec` (claude + codex) over `spec.md` + `plan.md` at `after_plan`. Spec had already passed `/speckit-clarify` + a 27-item engine-rigor checklist.

**HIGH trajectory:** `7 → 5 → 2 → 1 → 5 → 5 → 1` (iterations 1–7; ceiling raised 5→8 after iter-5 hit `non-converged`).

**What each failure mode looked like here:**
- **FM-2 (mechanism generator) — the dominant one.** The spec tried to promise `archive --apply` was "atomic all-or-nothing across both files (live doc + sibling archive)." No two-file atomic commit exists, so every prose attempt (atomic-rename → "rolls back cleanly" → …) was correctly rejected and resurfaced: **AUDIT-29 → 39 → 40**. This drove the `1→5→5` plateau.
- **FM-1 (fix-debt).** Iteration-4's freshly-added "preamble" concept spawned AUDIT-31/34 next round; an "append-only" wording slip spawned AUDIT-33; "must pass curate" (a migration fix) spawned AUDIT-37.
- **FM-3 (resurfacing).** AUDIT-40 was AUDIT-29 wearing a new ID — the relaxation still claimed a mechanically-impossible "clean normal-path rollback."

**The break.** At iteration 6→7 we stopped patching and applied a **structural root-fix (playbook A)**: removed *all* two-file atomicity/rollback mechanism from the spec, replaced it with the promise — *"an interrupted `--apply` never silently loses content; documents are version-controlled so any inconsistency is recoverable (revert + re-run), and the curate coherence check detects it"* — and deferred the write/recovery protocol to `plan`/`contracts` + RED tests. **HIGH dropped 5 → 1 in one round.** The plateau *was* the generator; removing it (not feeding it) converged it. (Operator's framing: *"version control is like a write journal… it lets you recover from corruption."*)

**Genuine deep tensions found at the plateau (not noise):** AUDIT-30 (cross-model, 5 citations) — title-as-identifier vs the non-ordinal denylist; resolved by narrowing the rule to *positional-index* shapes. AUDIT-29 — the durability over-promise above.

**Process note:** remediations ran as **fresh-context per-finding sub-agent dispatches with whole-artifact scope** (the govern-spec discipline), after an initial lapse where the orchestrator hand-authored fixes (caught + corrected). Fresh-context dispatch reduced but did not eliminate FM-1.

**Outcome: graduated via `GOVERN_OVERRIDE` (playbook B) at iteration 8.** Full HIGH trajectory `7→5→2→1→5→5→1→4`. The structural fix broke the durability generator (5→1), but iter-8 re-spiked to 4 HIGH — a *second* plateau, this time **diffuse fix-debt with no common generator** (each iter-6/7 fix's boundary conditions: out-of-domain order value, reinsertion-into-unordered, archive schema evolution, manual-edit uniqueness evasion, zero-live-Unit unarchive, durability attribution). Verify-premise: all implementation-mechanism-altitude, no new design forks. Per playbook B the operator graduated via recorded override; the 7 residual were dispositioned `acknowledged-deferred-impl-20260608` and scoped into `tasks.md` Phase 8 (RED-first). **39 findings fixed across 8 iterations.**

**Lessons added to the catalog from this run:**
- **Two distinct plateau shapes.** (i) A *single generator* (the durability mechanism, 29→39→40) — broken by a structural root-fix (playbook A). (ii) *Diffuse fix-debt with no common generator* (iter-8's seven) — NOT fixable by one structural change; the signal for playbook B (override + defer to TDD). Distinguishing them is the key judgment: does one change collapse many findings, or are they seven unrelated boundary conditions?
- **A clean fix still spawns ~N boundary findings next round.** Even a correct, contained fix (the iter-7 ordering-relation fix) surfaced its own edge cases (out-of-domain values, etc.). This is intrinsic to specifying behavior in prose — it is the floor of FM-1, and a reason convergence to literal-zero is often not the right goal for a spec.
- **The override is the honest terminal state for a spec**, not a failure. Recorded with a substantive reason + deferred findings scoped into the task list, it is playbook B working as designed — distinct from `converged` (which would falsely claim zero residual).

---

## Experiments

### 2026-06-08 — Spec-mode audit lens (mode-aware prompt) — H1 validated

**Hypothesis (H1):** the barrage prompt's mode-agnostic, code-oriented "What to look for" checklist (it literally lists *"operator interrupt mid-operation," "concurrent calls," "files growing past a cap"*) was *instructing* the auditor to litigate implementation in the spec — the FM-2 generator. Fix: a spec-mode lens that scopes the audit to promise/decision/contradiction/ambiguity altitude (WHAT-not-HOW litmus), shipped in the adopter-facing template + payload modules (not a project override).

**Method:** controlled A/B on the *unchanged* 005 spec (its iter-8 mechanism issues were deferred, not fixed, so they were still present). Control = iteration 8 (code lens): **4 HIGH, all mechanism-altitude** (out-of-domain values, reinsertion protocol, schema evolution, uniqueness mechanism). Treatment = iteration 9 (spec lens), same spec.

**Result — validated on altitude (count is the wrong metric).** Treatment surfaced 8 findings, **7 of 8 at promise/decision/contradiction/consistency altitude**: an FR-vs-FR contradiction (FR-003 parse-only vs FR-005 uniqueness), a migration manual-vs-automated missing-decision, two unachievable-promise/ambiguity findings, a scenario-needs-uncommitted-fixture contradiction, leftover-inconsistent-wording, a project-rule hygiene hit. The mechanism-litigation class (interrupt-atomicity protocol, concurrent calls, file layouts, "specify the algorithm") **disappeared entirely**. Same artifact, only the prompt varied → the delta is the lens.

**Over-suppression guard (passed in situ):** the lens caught a textbook FR-vs-FR contradiction + 4 other genuine contradictions — it is NOT blind to real spec defects. No separate seeded-defect run was needed.

**Convergeability:** the treatment findings are *finite* real contradictions (several left by the rushed override remediation) that resolve when fixed — unlike the mechanism *generator*, which was unbounded. So the lens is expected to also fix the *non-convergence*, not just the altitude.

**Caveat — H2 (severity cap) under-fired.** The lens's instruction to self-tag stray mechanism findings `[mechanism — defer to contracts/tests]` and cap them at MEDIUM produced **0 tags**; one borderline-mechanism finding (AUDIT-14, unreadable-ledger vs corrupt-body) slipped through at HIGH. Lesson: **altitude-scoping the lens (H1) is load-bearing; model self-tagging the severity cap (H2) is weak.** If a hard cap is wanted, make it mechanical (lift/gate downgrades mechanism-tagged findings), not a prompt instruction the model may ignore.

**Disposition:** H1 adopted into the shipped prompt (`feat(audit-barrage): mode-aware audit lens`). Follow-ups: (a) decide whether to do a real convergence pass on 005 with the lens (the 8 are genuine), (b) consider mechanizing H2.

## Entry format (for future audits)

```
### <date> — <feature codename> (specs/NNN) — <one-line context>
**Run:** <command / models / checkpoint>
**HIGH trajectory:** <n → n → …>
**Failure modes observed:** <FM-1/2/3/4 + the concrete finding IDs>
**Plateau? structural root-fix or override?** <what broke it / how it closed>
**Genuine deep tensions (vs noise):** <cross-model / real design forks>
**Outcome:** <converged / overridden + reason>
```
