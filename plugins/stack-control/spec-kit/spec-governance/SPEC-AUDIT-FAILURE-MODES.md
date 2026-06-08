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

**Outcome:** loop continued past the plateau toward convergence after the structural fix (≤1 HIGH at iter-7). [Update with final disposition — converged / overridden — when the loop closes.]

---

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
