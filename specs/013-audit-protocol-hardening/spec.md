# Feature Specification: Audit-Protocol Hardening

**Feature Branch**: `feature/stack-control` (one-long-lived-branch convention; spec dir resolved via the CLAUDE.md SPECKIT marker, not the branch — see `/stack-control:define` step 3)

**Created**: 2026-06-10

**Status**: Draft

**Input**: User direction (2026-06-10 session): "the most important friction issues are the broken audit protocol problems. The audit protocol is critical to implementation quality and, when it's broken, everything else is even *more* broken." Harden the audit/governance protocol so the implementation-quality signal the whole stack-control regime depends on is computed correctly, enforced mechanically (not by agent discipline), and never silently drops a finding — per the program thesis that failure states must be **mechanically impossible**.

## Context — origin and navigability

This feature graduates up from the backlog. It consolidates six related, live defects in the audit/governance protocol. The originating backlog items (recorded here for bidirectional navigability per the promotion seam) and their durable references:

| User Story | Origin item | External ref | Class |
|---|---|---|---|
| US1 | TASK-18 | gh-432 / audit-log AUDIT-20260608-01 | bug (convergence gate) |
| US2 | TASK-12 | gh-440 | bug (lift finding-merge) |
| US3 | TASK-2 | audit-log AUDIT-20260609-19 | migrated-finding (slush walk divergence) |
| US4 | TASK-13 | gh-441 | bug (first-barrage stranding) |
| US5 | TASK-19 | gh-434 | gap (graduation record) |
| US6 | roadmap `multi:fix/audit-barrage-self-referential` | gh-431 | bug (barrage input hygiene) |

> The referenced GitHub issues are closed `NOT_PLANNED` (migrated into the backlog); their bodies have been recovered into the backlog task descriptions. They remain the canonical narrative for each defect.

**Why one feature, not six fixes:** these are not independent bugs that happen to share a directory. They are the failure surface of a single thesis-level promise — *the audit protocol is a trustworthy, non-discretionary quality signal*. The convergence gate (US1) decides when work is done; the finding-integrity defects (US2, US3) determine whether the findings the gate counts are complete; the first-barrage gap (US4) determines whether the very first audit even reaches the ledger; the graduation record (US5) is the durable artifact the gate's verdict must leave behind; and barrage input hygiene (US6) determines whether the findings being counted are about the work under review at all. A fix to any one while the others stand leaves the promise broken.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — The convergence gate computes its stop signal correctly and enforces it mechanically (Priority: P1)

An operator (or an unattended execution loop) runs the spec-governance / implement-governance convergence loop. The loop must terminate **exactly** at the point the protocol defines as converged — never earlier because a run's findings were administratively reclassified, and never later because a human-in-the-loop chose to keep going. The stop decision is computed from what the audit actually found, and the loop cannot continue past a stop verdict.

**Why this priority**: This is the keystone. The gate is the mechanism that makes "done" mean "the quality bar was met." Today it graduates at the **first 0-HIGH run** because the FR-015 slush flips that run's open MED/LOW to `acknowledged-slush-pile` *before* the dampener counts open findings — so post-slush `mediumCount` is always 0 and the `single-run-clean` branch degenerates to "0 open HIGH," collapsing FR-010 branch (a) (a genuinely clean run) into branch (b) (2 consecutive 0-HIGH runs). Field evidence: a run with **0 HIGH / 4 MED** graduated as `converged, single-run-clean`. Worse, even a correct verdict is **non-binding**: FR-014's "the gate bounds the loop" lives as prose in the govern skill body, so the agent is simultaneously the fixer and the loop controller — a deterministic stop becomes discretionary (the field loop ran to R9 when the protocol's terminal was R5). A mis-computed stop signal that is also unenforced is the deepest possible break: the regime's definition of "done" is neither correct nor honored.

**Independent Test**: Drive a governance loop over a fixture whose runs surface a known severity trajectory (e.g. R1 = 2 HIGH/1 MED, R2 = 0 HIGH/4 MED, R3 = 0 HIGH/0 MED, R4 = 0 HIGH/0 MED). Assert the gate does NOT report converged at R2 (raw 4 MED), and that a code-level driver — not the agent — terminates the loop at the protocol's defined terminal and refuses to run a further round once a stop verdict is returned.

**Acceptance Scenarios**:

1. **Given** a run that surfaced 0 HIGH and ≥1 MED at barrage time, **When** the gate evaluates branch (a) (genuinely-clean), **Then** branch (a) does NOT engage (it is computed on the run's **raw, pre-slush** found-severity, not the post-slush open count).
2. **Given** two consecutive runs each with 0 HIGH (MEDs legitimately slushed within that window), **When** the gate evaluates branch (b), **Then** branch (b) engages and the loop graduates, and the verdict is labeled with the rule that actually fired (not mislabeled `single-run-clean`).
3. **Given** the gate returns a stop verdict (`converged` or `overridden`), **When** the convergence loop is driven, **Then** a code driver terminates the loop and returns control — no further round can be initiated by the fixer.
4. **Given** the gate returns `blocked` (not converged), **When** the loop is driven, **Then** the driver continues to the next round (fix-dispatch happens only inside a not-yet-converged loop).
5. **Given** a stochastic late HIGH appears in a round after a prior 0-HIGH run, **When** branch (b)'s 2-consecutive-0-HIGH rule is applied, **Then** the late HIGH resets the stability window (the loop does not graduate over an un-absorbed HIGH).

---

### User Story 2 — Finding lift preserves every distinct-mechanism finding (Priority: P1)

A fixer reads the audit-log after a barrage to know what to fix. Every distinct defect the models found must be independently represented and independently closeable. Two findings that point at the same file/surface but describe **different mechanisms** must never be folded into a single entry that documents only one of them.

**Why this priority**: Finding integrity is a precondition for the gate (US1) to mean anything — the gate counts entries, so a lift that loses entries makes the count a lie. Today `audit-barrage-lift` uses cross-model agreement at the same *surface* as a merge key, collapsing distinct *mechanisms*. Observed **twice in a row** (systematic): 9 structured findings collapsed to 4 entries; five distinct mechanisms merged under one ID whose body described only one. A fixer fixes 1 of 5 real defects, marks the entry `fixed`, and silently drops 4. This is silent data loss in the exact ledger the regime treats as ground truth.

**Independent Test**: Feed lift a run-dir whose per-model outputs contain N findings that share a surface but describe distinct mechanisms. Assert the lifted audit-log contains N independently-identified, independently-closeable entries (merge occurs only for same-root-cause findings, not same-surface).

**Acceptance Scenarios**:

1. **Given** two findings at the same file/line that describe different mechanisms (e.g. "scheme-regex boundary" vs "mixed-rel `<link>` bypass"), **When** lift runs, **Then** they produce two distinct audit-log entries, each closeable on its own.
2. **Given** two findings that are the same root cause reported by two models, **When** lift runs, **Then** they are merged into one entry whose `Finding-ID` line records the cross-model agreement (the legitimate merge case is preserved).
3. **Given** a merged entry, **When** a reader inspects its body, **Then** the body fully describes every mechanism the entry represents (no mechanism is represented only in a discarded per-model file).

---

### User Story 3 — Slush migrates exactly the findings it reports (Priority: P1)

When the dampener parks (slushes) residual MED/LOW findings, the set it *says* it will migrate (dry-run) and the set it *actually* migrates (apply) must be identical. No finding may be reported-as-migrated yet left `open`, and none may be silently dropped.

**Why this priority**: This is the other half of finding integrity (with US2) and it directly attacks the gate's core invariant. Today `slush-findings`' apply path derives its migration set from a *second, independent* walk of the audit-log (`findFindingsByStatus` filtered by `flipIds`) while the dry-run reports from a different set (`res.flips`). A keying divergence between the two walks makes the dry-run print "would migrate N" while apply migrates fewer — leaving the unmigrated finding `open` with exit 0 and a success message, **silently breaking the "0 open MEDIUM at graduation" convergence invariant** the gate (US1) depends on. Cross-model finding.

**Independent Test**: Construct an audit-log where the dampener decides to flip a set S, but the recompute walk's keying (id canonicalization / status-line matching) would diverge for at least one member of S. Assert dry-run count == applied count == |S|, and that every reported finding's on-disk status actually transitions (no member left `open`).

**Acceptance Scenarios**:

1. **Given** the dampener decides to slush a set S of findings, **When** dry-run runs, **Then** the reported count equals |S|.
2. **Given** the same S, **When** apply runs, **Then** exactly the members of S transition to `acknowledged-slush-pile` (or the configured destination) and zero members are left `open`.
3. **Given** a finding whose id format or status line would fail the recompute walk's matcher, **When** apply runs, **Then** the tool either migrates it (because the migration set is carried from the dampener decision, not re-derived) or fails loud naming it — never silently drops it with exit 0.

---

### User Story 4 — Every feature's first barrage lifts cleanly (Priority: P2)

The first end-of-task barrage of a brand-new feature must land its findings in the feature's audit-log just like every subsequent barrage — with no manual scaffolding step.

**Why this priority**: A new feature's first audit is the one most likely to surface foundational defects, and today it is the one guaranteed to be lost: the barrage fires cleanly but `audit-barrage-lift` aborts with "audit-log not found" because `setup`/`define` never create the feature `audit-log.md`, and the no-new-diff guard then prevents a re-lift (tip unchanged). The findings strand in the run-dir until hand-recovered. P2 rather than P1 only because the loss is loud (an abort, not a silent success) and currently hand-recoverable — but it defeats the unattended-execution thesis.

**Independent Test**: Run the end-of-task barrage + lift against a feature whose `audit-log.md` does not yet exist. Assert the lift scaffolds the audit-log from the canonical header and lands the fired barrage's findings, with no manual step and no abort.

**Acceptance Scenarios**:

1. **Given** a feature with no `audit-log.md`, **When** the first barrage fires and lift runs, **Then** lift scaffolds the audit-log from the canonical header (the same auto-scaffold-on-first-use pattern the backlog store already uses) and writes the findings.
2. **Given** a barrage already fired but un-lifted (run-dir present, tip unchanged), **When** lift is re-run for that run-dir, **Then** the no-new-diff guard does not strand the already-fired findings (lift can complete against an explicit run-dir).

---

### User Story 5 — Governance graduation leaves a durable on-disk record (Priority: P2)

When the convergence gate graduates a spec, it writes a durable, per-spec record of that graduation. Downstream consumers (e.g. roadmap reconcile) can require that record as the authoritative "shipped" signal instead of inferring it.

**Why this priority**: The gate's verdict is currently ephemeral — it prints `true`/`false` and persists nothing — so `roadmap reconcile` falls back to tasks-completion as the shipped signal (the strongest *available* real signal, per the no-fallbacks rule). The 006 data-model already specifies the shipped signal as including a governance-graduation record that does not exist. P2 because reconcile already degrades honestly (it only proposes, never mutates); this closes the gap so graduation — not a proxy — is the signal.

**Independent Test**: Drive the gate to a graduation verdict for a spec. Assert a durable per-spec graduation record is written, and that `roadmap reconcile`'s on-disk derivation can read and require it.

**Acceptance Scenarios**:

1. **Given** the gate graduates a spec, **When** graduation completes, **Then** a durable per-spec graduation record is written (capturing at minimum: the spec dir, the terminal rule that fired, and the run identity that produced the verdict).
2. **Given** a spec with a graduation record, **When** `roadmap reconcile` derives its on-disk "shipped" proposal, **Then** it uses the graduation record as the shipped signal rather than tasks-completion.
3. **Given** a spec whose tasks are all checked but which has NOT graduated, **When** reconcile runs, **Then** it does not assert "shipped" on tasks-completion alone (the record is required, not optional).

---

### User Story 6 — The barrage audits the work under review, not itself (Priority: P3)

The cross-model barrage's input payload must contain the work under review and exclude artifacts that generate self-referential or unrelated findings — specifically the audit-log itself and untracked parked-feature scaffolds pulled in by the diff.

**Why this priority**: The barrage payload includes its own audit-log, so models generate findings *about prior findings*, and the untracked-fold pulls unrelated parked-feature scaffolds into the diff — both poison the audit **input**, inflating finding counts the gate (US1) then has to converge against. P3 because it degrades signal-to-noise rather than dropping real findings, but it is a sibling root cause of the convergence-loop-runs-too-long symptom and belongs in the same hardening pass.

**Independent Test**: Assemble a barrage payload for a feature whose tree contains its own audit-log and an untracked unrelated scaffold. Assert the payload excludes the audit-log and the unrelated untracked files, and includes the work under review.

**Acceptance Scenarios**:

1. **Given** a feature whose docs tree contains its own `audit-log.md`, **When** the barrage payload is assembled, **Then** the audit-log is excluded from the payload.
2. **Given** an untracked unrelated parked-feature scaffold present in the working tree, **When** the diff/payload is assembled, **Then** the unrelated scaffold is not folded into the audited diff.

---

### Edge Cases

- **Slush-before-branch-(a) interaction (US1×US3):** the FR-015 MED auto-slush is itself intended behavior — the defect is its *ordering* relative to branch (a)'s genuineness check. The fix must preserve slush's support for branch (b) while preventing it from subverting branch (a). What is the canonical evaluation order, and is it identical in spec-mode and implement-mode governance (FR-006, one gate / two phases)?
- **Late HIGH after stability (US1):** a HIGH that appears in round N after round N-1 was 0-HIGH must reset branch (b)'s 2-consecutive window — the loop must not have already graduated.
- **Empty barrage (US1/US4):** a run that surfaces zero findings — does it count toward branch (b)'s consecutive-0-HIGH window, and does US4's scaffold-on-first-use still create the audit-log even when there is nothing to write?
- **Merge ambiguity (US2):** two findings at the same surface whose mechanism-distinctness is itself uncertain — what is the default (keep separate vs. merge), and does the regime err toward over-preservation (never silently drop)?
- **Recompute-walk keying drift (US3):** the dampener (`slushRemaining`) is a frozen module whose id format / flip predicate this code does not control — the fix must not depend on the two walks agreeing by coincidence.
- **Overlapping diff for US6:** distinguishing "untracked unrelated scaffold" from "untracked legitimate new work under review" — the exclusion must not drop real new work.
- **Graduation record divergence (US5):** a spec that graduated, then regressed (new HIGH on a later barrage) — is the prior graduation record stale, and how does reconcile treat it?
- **Cross-mode consistency:** every requirement that touches the gate or the loop must hold identically for spec-mode (`govern --mode spec`) and implement-mode (after_implement) governance, since FR-006 specifies one gate across two phases.

## Requirements *(mandatory)*

### Functional Requirements

**Convergence gate (US1)**
- **FR-001**: The gate MUST compute branch (a) (genuinely-clean) on each run's **raw, pre-slush** found-severity, so branch (a) engages only on a run that surfaced 0 HIGH and 0 MED at barrage time.
- **FR-002**: The gate MUST keep the FR-015 MED auto-slush available to support branch (b) (2 consecutive 0-HIGH runs) without letting it subvert branch (a)'s genuineness.
- **FR-003**: The gate MUST label each graduation verdict with the terminal rule that actually fired; it MUST NOT report `single-run-clean` for a run whose MEDs were slushed.
- **FR-004**: The convergence loop MUST be driven by a code driver that calls the protocol chain (barrage → lift → slush → gate) and, on a stop verdict, terminates the loop and returns control. The fixer agent MUST NOT hold the "re-run?" decision.
- **FR-005**: On a `blocked` verdict the driver MUST continue to the next round; on `converged`/`overridden` it MUST stop. A stochastic late HIGH MUST reset branch (b)'s stability window.
- **FR-006**: All gate/loop requirements MUST hold identically in spec-mode and implement-mode governance (one gate, two phases).

**Finding integrity — lift (US2)**
- **FR-007**: Lift MUST produce one independently-identified, independently-closeable audit-log entry per distinct *mechanism*, even when findings share a surface.
- **FR-008**: Lift MUST merge findings only when they are the same root cause; cross-model agreement at the same surface MUST NOT be used as a merge key across distinct mechanisms.
- **FR-009**: A merged entry's body MUST fully describe every mechanism it represents; no mechanism may survive only in a discarded per-model file.

**Finding integrity — slush (US3)**
- **FR-010**: The set of findings reported by `slush-findings` dry-run MUST be identical to the set migrated by apply.
- **FR-011**: The migration set MUST be carried from the dampener decision rather than re-derived by an independent second walk, so dry-run and apply cannot disagree.
- **FR-012**: A finding the dampener decided to migrate MUST either be migrated or cause a loud failure naming it — it MUST NOT be left `open` with exit 0 and a success message.

**First-barrage lift (US4)**
- **FR-013**: `audit-barrage-lift` (or the hook) MUST scaffold the feature `audit-log.md` from the canonical header when it is absent, rather than aborting.
- **FR-014**: An already-fired-but-un-lifted barrage MUST be liftable against its explicit run-dir without the no-new-diff guard stranding it.

**Graduation record (US5)**
- **FR-015**: Graduation MUST write a durable per-spec record capturing at minimum the spec dir, the terminal rule, and the run identity.
- **FR-016**: `roadmap reconcile`'s on-disk "shipped" derivation MUST be able to require the graduation record as the shipped signal instead of inferring from tasks-completion.

**Barrage input hygiene (US6)**
- **FR-017**: The barrage payload MUST exclude the feature's own `audit-log.md`.
- **FR-018**: Diff/payload assembly MUST NOT fold untracked unrelated (parked-feature) scaffolds into the audited diff, while still including legitimate new work under review.

**Cross-cutting**
- **FR-019**: No requirement in this feature may be satisfied by a fallback or mock outside test code; a missing precondition MUST fail loud with a descriptive error (project no-fallbacks rule + Constitution Principle V — surface the underlying error verbatim).
- **FR-020**: Every behavioral fix MUST be pinned by a RED-first test that exercises the defect before the fix (project TDD-for-fixes rule); the convergence-loop, lift-merge, and slush-walk fixes each carry a regression test reproducing their field-observed failure.

### Key Entities

- **Finding**: a single distinct defect identified by the barrage, with a stable Finding-ID, a mechanism, a surface (file/line), a severity (HIGH/MED/LOW), and a status (`open` / `fixed` / `acknowledged-slush-pile` / migrated). The unit whose integrity US2/US3 protect.
- **Audit-log**: the per-feature ordered ledger of Findings; ground truth for the gate. Subject of US2 (lift writes to it), US3 (slush transitions statuses in it), US4 (scaffolded if absent), US6 (excluded from its own audit input).
- **Run**: one barrage execution producing a run-dir of per-model outputs and a found-severity profile (the raw pre-slush counts US1/FR-001 must read).
- **Convergence verdict**: the gate's output — `converged` / `blocked` / `overridden`, the terminal rule that fired, and the run identity. Persisted durably by US5.
- **Graduation record**: the durable per-spec artifact US5/FR-015 introduces; consumed by roadmap reconcile (FR-016).
- **Barrage payload**: the assembled input to the cross-model barrage; US6 governs what it includes/excludes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a governance loop over a run trajectory containing a 0-HIGH/≥1-MED run, the gate reports `converged` at the protocol-correct terminal in 100% of runs and never at the first 0-HIGH-but-MED-present run (0% premature graduations across the regression fixture set).
- **SC-002**: A convergence loop cannot run a further round after a stop verdict — there exists no path by which the fixer initiates a post-`converged` round (enforced by the code driver, verified by test).
- **SC-003**: For any barrage run-dir containing N distinct-mechanism findings at a shared surface, lift produces exactly N independently-closeable entries (no distinct mechanism is dropped; merge occurs only for same-root-cause findings).
- **SC-004**: `slush-findings` dry-run count equals apply count equals the dampener-decided set size in 100% of cases, including keying-divergence fixtures; zero findings are left `open` after a reported migration.
- **SC-005**: A brand-new feature's first barrage lands its findings in the audit-log with zero manual scaffolding steps (the hand-recovery workaround is no longer needed).
- **SC-006**: Every graduated spec has a durable on-disk graduation record, and roadmap reconcile uses it (not tasks-completion) as the shipped signal in 100% of graduated specs.
- **SC-007**: A barrage payload assembled for a feature contains zero self-referential findings attributable to its own audit-log and zero findings attributable to unrelated untracked scaffolds.
- **SC-008**: Every behavioral change ships with a RED-first regression test reproducing the original field-observed failure; the suite fails on the pre-fix code and passes on the post-fix code.

## Assumptions

- The audit/governance code under change lives in stack-control (`src/govern/`, `src/scope-discovery/promote-findings/`, `src/subcommands/slush-findings.ts`, the barrage-lift surface, and the roadmap `reconcile` derivation). The behavior — not a specific module layout — is what these requirements bind.
- Spec 004 (spec-governance) FR-010/FR-014/FR-015 are the canonical statements of the convergence rule; this feature amends their *implementation* to match their *intent*. Where 004's spec text is itself ambiguous about ordering, the amendment clarifies it (capture surfaced this; the operator scopes the wording).
- The `slushRemaining` dampener is a frozen module (004 D5); US3's fix carries the dampener's decision forward rather than modifying the frozen module.
- The gate/loop migrate under `multi:feature/migrate-audit-barrage` in the roadmap; this feature is the correctness pass that migration must carry forward, not a throwaway.
- "Convergence loop as a code driver" (FR-004) replaces the current skill-body prose loop; the agent's role narrows to fix-dispatch inside a not-yet-converged loop.
- Scope boundary is the operator's to set in a later pass: this spec captures all six defects (capture-don't-cut). If US6 (barrage input hygiene) is better carried by its existing roadmap node `multi:fix/audit-barrage-self-referential`, that is an explicit scoping decision, not assumed here.

## Dependencies

- **Spec 004 (spec-governance)** — US1/US5 amend its FR-010/FR-014/FR-015 implementation; the graduation record (US5) is the artifact 004's gate must emit.
- **Spec 006 (roadmap-protocol)** — US5/FR-016 strengthen its `reconcile` on-disk derivation to require the graduation record.
- **Roadmap `multi:feature/migrate-audit-barrage`** — the eventual home of the gate/loop/barrage code; this hardening must survive that migration.
- **Roadmap `multi:fix/audit-barrage-self-referential` (gh-431)** — US6's existing tracking node; folding it in here is an operator scoping decision.
