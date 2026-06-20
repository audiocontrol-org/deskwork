# Feature Specification: govern-operability — make cross-model governance operable end-to-end

**Feature Branch**: `029-govern-operability` (authored on the long-lived `feature/stack-control` branch; the spec dir, not the branch, is the unit — TF-09)

**Created**: 2026-06-19

**Status**: Draft

**Input**: Burn down the entire `multi:feature/govern-operability` umbrella in one feature — nine user stories, default per-phase granularity (operator decision 2026-06-19), no scope cuts. Authoritative design record: `docs/superpowers/specs/2026-06-19-govern-operability-design.md`.

## Context

The cross-model audit-barrage convergence loop already converges (specs/015, shipped) and its per-phase substrate is mechanically enforced (specs/021, shipped). This feature does **not** re-specify that work. It fixes the **residual operability friction** discovered while live-using those shipped features across the 027 and 028 dogfoods — the friction that still makes per-phase governance cost operator attention rather than running as a deterministic gate. Each user story closes one or more recorded backlog tasks; together they retire the `govern-operability` umbrella.

The "user" throughout is the **operator** (and the autonomous agent acting on their behalf) running `stackctl govern` per phase during `/stack-control:execute`. "Operable" means: the loop converges reliably, stays cheap to run, fails observably, never manufactures work that defeats its own purpose, and honors the operator's sanctioned escape hatch.

User stories are listed in **build order** (sharpen-the-saw: the phases that make our own per-phase govern of this feature bearable land first). Priority (P1/P2/P3) reflects value/criticality and is largely aligned with that order.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fleet reliability foundation (Priority: P1)

The audit fleet completes within its budget instead of silently timing out. The no-grounding Anthropic-lane configuration (text-only pass, no file-grounding tool-loop) becomes the shipped template default so every adopter and fresh install inherits the fast, reliable lane — not just this project's local override. The codex lane emits genuine liveness pulses during reasoning so the watchdog can keep a tight window instead of being blinded by a 300s widening.

**Why this priority**: A degraded/timing-out fleet forces overrides and makes every later phase's own governance unreliable. This is the foundation the rest of the feature is built and governed on.

**Independent Test**: Run a per-phase barrage on a real payload with the shipped default config; confirm the Anthropic lanes complete via a text-only pass (no grounding tool-loop, read-only by construction) within the timeout floor, and the codex lane emits a liveness pulse within the tight window. Deliverable value: governance runs to completion without manual config patching.

**Acceptance Scenarios**:

1. **Given** a fresh installation using the shipped `templates/audit-barrage-config.yaml`, **When** a per-phase barrage runs on a real (~14–24KB) payload, **Then** the Anthropic lanes complete read-only within the timeout floor with no `--permission-mode plan` grounding loop, and no lane is killed for exceeding budget on grounding.
2. **Given** the codex lane on a real payload that reasons silently for >60s under the old config, **When** liveness emission is enabled, **Then** the lane emits a stderr/liveness pulse within the tight liveness window and is not killed `killed-no-liveness`.
3. **Given** the config change, **When** the fleet *composition* is inspected, **Then** the opus+codex+sonnet 3-lane set is unchanged (only grounding config + liveness + timeout floor changed).

---

### User Story 2 - Fleet observability: degraded is never convergence (Priority: P1)

When a lane is SIGTERMed, times out, or produces a zero-byte artifact, that degraded state is surfaced at synthesis and at lift, and a run containing a degraded lane is **never** counted as a quiet/clean run by the convergence dampener. The fleet can no longer silently degrade into a false "0 findings → converged."

**Why this priority**: Convergence determinism (US3) is only sound if a degraded run cannot masquerade as a quiet one. This is a correctness prerequisite for the dampener.

**Independent Test**: Force a lane to time out (zero-byte stdout, exit 143); confirm synthesis/lift report the per-lane degraded state explicitly and the dampener does not increment its quiet-run streak for that run. Value: a killed fleet stops the loop honestly instead of graduating on a phantom quiet.

**Acceptance Scenarios**:

1. **Given** a barrage run where one lane is killed (exit 143, zero-byte artifact), **When** synthesis and lift process the run, **Then** the per-lane terminal state (timed-out / killed-no-liveness / killed-external / zero-byte) is surfaced distinctly from "completed with no findings".
2. **Given** a run with a degraded lane and no findings from the surviving lanes, **When** the dampener evaluates convergence, **Then** that run does NOT count toward the consecutive-quiet streak (it is not a clean run).
3. **Given** a fully-healthy run with zero findings, **When** the dampener evaluates, **Then** it DOES count as a quiet run (no false negative introduced).

---

### User Story 3 - Severity & convergence determinism (Priority: P1)

The convergence dampener stops ringing on unchanged code. A finding's gate impact is keyed to its **identity** across rounds, and severity is stabilized with cross-round hysteresis, so a finding re-rated LOW→HIGH on code that did not change cannot reset the consecutive-quiet streak. The loop terminates in a bounded number of rounds when work is genuinely clean.

**Why this priority**: Severity non-determinism is the root cause of the 20-round rings (TASK-146/gh-482). It is the headline operability win and the prerequisite for the dampener's terminal branch to be reachable.

**Independent Test**: Replay a fixture where the same finding is rated LOW in one round and HIGH in a later round with no intervening code change; confirm the dampener still converges (the re-rating does not reset the streak). Value: clean code graduates instead of ringing indefinitely.

**Acceptance Scenarios**:

1. **Given** a previously-seen finding on unchanged code that a later round re-rates LOW→HIGH, **When** the dampener evaluates, **Then** the re-rated finding does not reset the consecutive-quiet streak (it is the same identity, already accounted).
2. **Given** a genuinely new, previously-unseen HIGH finding, **When** the dampener evaluates, **Then** it DOES block/reset (real signal preserved — no false convergence).
3. **Given** a run of N rounds on clean code, **When** the loop runs, **Then** it converges within the bounded ceiling rather than ringing on severity jitter alone.

---

### User Story 4 - Loop hygiene: never lift the done, override is terminal (Priority: P1)

Two operator-named frictions (2026-06-19). **(a) Never lift the already-fixed:** an audit finding already resolved (`fixed-<sha>`, whether fixed in-loop or by a prior commit) is **never** lifted into the backlog — the lift/slush consults finding status and skips the done before it creates any task; MEDIUM migration is deferred to the loop terminal; a backlog task auto-reconciles when its finding flips fixed; a `backlog done` verb exists; cross-run finding-signature dedup is the safety net. **(b) Override is terminal:** when the operator supplies `--override` (the sanctioned diminishing-returns escape), govern **short-circuits the barrage entirely** — records the reason and graduates, firing NO render→barrage→lift→slush pass.

**Why this priority**: Both are explicit operator requirements. (a) keeps the backlog free of noise (tasks for work already done); (b) makes the ringing-escape actually escape instead of buying one more round. They compound: (b)'s spurious final pass was itself a source of (a)'s noise.

**Independent Test**: (a) Run a loop where a finding is fixed mid-loop; confirm zero backlog tasks are created for it. (b) Supply `--override` to a ringing govern invocation; confirm it graduates with zero new barrage runs recorded. Value: the loop stops manufacturing work that defeats its own purpose.

**Acceptance Scenarios**:

1. **Given** a finding marked `fixed-<sha>` (in-loop or prior-commit), **When** lift/slush runs, **Then** no backlog task is created for that finding.
2. **Given** MEDIUM residuals being fixed within the same loop, **When** the loop has not yet reached its terminal, **Then** those residuals are NOT migrated to the backlog mid-loop.
3. **Given** a finding whose backlog task already exists and whose audit-log entry flips to `fixed-<sha>`, **When** reconciliation runs, **Then** the backlog task is closed/reconciled (a `backlog done` verb is available for this).
4. **Given** the same finding surfaced across multiple runs, **When** lift runs, **Then** it is deduped by finding-signature and does not produce near-duplicate tasks.
5. **Given** a govern invocation with `--override "<reason>"`, **When** govern runs, **Then** it records the override reason in the audit trail and graduates WITHOUT firing any render/barrage/lift/slush pass (zero new barrage runs).
6. **Given** an override, **When** the audit trail is inspected, **Then** the reason is recorded and the graduation is attributable to the override (not to a phantom convergence).

---

### User Story 5 - Payload-scoping correctness (Priority: P2)

Per-phase govern feeds the auditor a complete, correctly-scoped payload so it stops raising false HIGHs that are harness artifacts rather than code defects. The per-phase payload audits the **union** of the phase's changed files across **all** its commits (not just the `HEAD~1` delta), and findings about referenced-but-out-of-window files are eliminated by widening the payload to the referenced dependencies AND teaching the prompt that out-of-window = not-in-scope-this-phase.

**Why this priority**: Critical-path under the default-per-phase decision (US6). False HIGHs from incomplete/over-narrow payloads forced repeated overrides in 027/028 (TASK-263, TASK-316).

**Independent Test**: Run per-phase govern on a phase whose impl and test landed in separate commits, and whose findings reference a file outside the phase window; confirm no "the diff omits the fix" or "file absent/not-imported" false HIGH is raised. Value: per-phase findings reflect real code state.

**Acceptance Scenarios**:

1. **Given** a phase whose changed files span multiple commits, **When** per-phase govern assembles the payload, **Then** it includes the union of all the phase's changed files (diff-base = pre-phase commit), not only the `HEAD~1` delta.
2. **Given** a finding that references a file outside the current phase window which is in fact present and correct, **When** the barrage runs, **Then** no false HIGH is raised claiming the referenced file is absent/not-imported (the payload includes the referenced dep and/or the prompt treats out-of-window as not-this-phase-scope).
3. **Given** a genuinely missing implementation, **When** the barrage runs, **Then** a real HIGH is still raised (no real-signal suppression).

---

### User Story 6 - Audit-granularity switch (Priority: P2)

The graduate gate becomes an **either-of** gate: a feature graduates when all per-phase checkpoints are current **OR** when a whole-feature convergence record exists. The **default remains per-phase**; full-audit-at-end becomes the opt-in escape hatch for features (e.g. shared-file ones) where it fits. The 025 "compose, reject augment" clarify record is amended to reflect the re-admission of the whole-feature path.

**Why this priority**: Restores the operator's flexibility removed in 025 without changing the default. It gives shared-file features an O(n) escape while keeping per-phase as the common path (so US5/US7 remain critical-path).

**Independent Test**: Graduate one feature via current per-phase checkpoints and another via a whole-feature convergence record; confirm both pass the gate, and the default (no opt-in) path is per-phase. Value: either trustworthy path graduates.

**Acceptance Scenarios**:

1. **Given** a feature with all per-phase checkpoints current, **When** the graduate gate evaluates, **Then** it graduates (unchanged default behavior).
2. **Given** a feature with a whole-feature convergence record but not per-phase checkpoints, **When** the operator has opted into full-audit-at-end, **Then** the gate graduates via the whole-feature path.
3. **Given** no opt-in, **When** a feature is governed, **Then** the per-phase path is the default and is required to graduate.
4. **Given** the 025 clarify record, **When** the amendment lands, **Then** it documents the re-admission of the whole-feature graduate path (no stale "reject augment" claim).

---

### User Story 7 - Checkpoint staleness O(n²) fix (Priority: P2)

Per-phase checkpoints are fingerprinted at **hunk** granularity (each phase's own changes), not whole-file content, so a later phase editing a file an earlier phase also touched no longer re-stales the earlier checkpoint. A shared-file N-phase feature governs in O(n), not O(n²).

**Why this priority**: Critical-path because per-phase stays the default (US6). The whole-file fingerprint forced re-governing 1..N−1 at each new phase in 027 (TASK-289).

**Independent Test**: Govern an N-phase feature whose phases share files, editing a shared file in a later phase; confirm earlier checkpoints are NOT re-staled by the unrelated later-phase hunks, and total governance work is linear in N. Value: shared-file features stop paying quadratic governance cost.

**Acceptance Scenarios**:

1. **Given** phases 2 and 4 both edit the same file but in different hunks, **When** phase 4's edits land, **Then** phase 2's checkpoint is NOT marked stale (its own hunks are unchanged).
2. **Given** a later phase edits the SAME hunk an earlier phase owned, **When** the fingerprint is recomputed, **Then** the earlier checkpoint IS correctly marked stale (no missed real change).
3. **Given** an N-phase shared-file feature, **When** governed phase-by-phase, **Then** each phase requires governing only its own unit (O(n) total), not re-governing all earlier phases.

---

### User Story 8 - Process & protocol discipline (Priority: P3)

The structural drivers of myopic convergence (TASK-60) are codified into the skill bodies and barrage prompt templates: a channel-enumeration step for fixes that add to an allowlist/surface; an invariant-first boundary discipline for scope dispositions; a round-0 self-red-team pass over the fix diff before re-firing; fleet-degradation pricing (now backed by US2 observability); and severity-rubric anchoring (backed by US3).

**Why this priority**: These reduce round count and fix-induced surface growth, but they are guidance/prompt changes that depend on the mechanical fixes (US2/US3) existing first.

**Independent Test**: Verify the audit/implement skill bodies and barrage prompt templates contain the five drivers and that a surface-adding fix triggers the channel-enumeration prompt. Value: the loop converges in fewer rounds with less fix-debt.

**Acceptance Scenarios**:

1. **Given** a fix that adds an entry to an allowlist/surface, **When** the audit/implement guidance runs, **Then** it prompts for enumeration of the value/state/multiline/composition channels the fix opens (with fixtures) before re-firing.
2. **Given** a finding dispositioned as a scope boundary, **When** the guidance is followed, **Then** the boundary is stated as the mechanism's invariant plus an in-scope exception, not as exclusion of a counterexample.
3. **Given** a degraded fleet, **When** the round runs, **Then** the expected cost is surfaced and convergence claims are priced accordingly (US2).

---

### User Story 9 - 027 residual hygiene (Priority: P3)

The low-stakes residuals deferred during 027 to avoid the staleness cascade are cleared: test non-null assertions replaced with a get-or-throw helper (TASK-290); the roadmap `cluster`/`group` verb documented in its SKILL.md (TASK-291); uniform list-flag stray-comma handling + removal of a dead `--part-of` branch (TASK-292); fence-aware `rewriteEdgeLine` in decompose (TASK-293); and tooling-feedback guidance corrected to route adopter friction to GitHub issues against `audiocontrol-org/deskwork` rather than an invisible local file (TASK-294/gh-488).

**Why this priority**: Independent, low-stakes cleanup; bundled last so it cannot re-trigger staleness mid-feature.

**Independent Test**: Each residual has a targeted check (no `!` in the named test; SKILL.md mentions cluster/group; list-flag guards are uniform; a fenced edge example is not rewritten by decompose; the tooling-feedback guidance names GitHub issues). Value: the 027 tail is closed.

**Acceptance Scenarios**:

1. **Given** `tests/roadmap/cluster.test.ts`, **When** inspected, **Then** it contains no non-null `!` assertions (uses the get-or-throw helper).
2. **Given** the roadmap SKILL.md, **When** inspected, **Then** it documents the `cluster`/`group` verb alongside the other mutation verbs.
3. **Given** `--depends-on`, `--into`, `--children`, `--part-of`, **When** given an empty/stray-comma id, **Then** all fail loud uniformly; the dead `--part-of` zero-length branch is removed.
4. **Given** a unit with a fenced depends-on/part-of example, **When** decompose `rewriteEdgeLine` runs, **Then** the fenced example is NOT rewritten.
5. **Given** the tooling-feedback guidance, **When** an adopter follows it, **Then** they file a GitHub issue against `audiocontrol-org/deskwork`, not only a local file.

---

### Edge Cases

- **Override on already-clean code**: `--override` short-circuits regardless of current findings — it always graduates without a barrage (the operator's explicit intent), even if the tree would have converged anyway.
- **Degraded lane + override**: an override skips the barrage entirely, so a degraded lane is moot at override time (no pass runs).
- **Finding re-surfaces after its backlog task was reconciled**: dedup keys on the finding-signature so a re-surfaced-then-refixed finding reuses/closes the same task rather than spawning a new one.
- **Hunk fingerprint vs. file rename within a phase**: a rename that moves a phase's hunks must not be read as "all earlier checkpoints stale" (interacts with 021's rename-aware scoping).
- **Whole-feature opt-in (US6) interacting with hunk fingerprint (US7)**: the either-of gate must evaluate the whole-feature record path without requiring per-phase hunk fingerprints, and vice-versa.
- **A genuinely-quiet run that the operator nonetheless overrides**: recorded as override-graduation, attributable, not conflated with convergence.

## Requirements *(mandatory)*

### Functional Requirements

US1 — Fleet reliability:
- **FR-001**: The shipped `templates/audit-barrage-config.yaml` MUST run the Anthropic lanes without `--permission-mode plan` (no file-grounding tool-loop) and MUST enforce read-only by construction (no file-mutating/Read/Grep tools available to those lanes).
- **FR-002**: The shipped template MUST set a timeout floor with headroom above observed successful-run durations for the no-grounding lanes.
- **FR-003**: The codex lane MUST emit a liveness signal during reasoning (e.g. reasoning summaries) such that the watchdog can use a tight liveness window without false `killed-no-liveness`.
- **FR-004**: The installation config and the shipped template MUST be updated in lockstep so adopters inherit the reliable config (not only this project's local override).
- **FR-005**: The fleet *composition* (the opus+codex+sonnet 3-lane set) MUST NOT be changed by this work — only grounding config, liveness, and timeout floor.

US2 — Observability:
- **FR-006**: Synthesis and lift MUST surface each lane's terminal state (completed / timed-out / killed-no-liveness / killed-external / zero-byte) distinctly.
- **FR-007**: A barrage run that contains a degraded lane MUST NOT be counted as a quiet/clean run by the convergence dampener.
- **FR-008**: A fully-healthy run with zero findings MUST still be counted as a quiet run (no regression to the clean-convergence path).

US3 — Determinism:
- **FR-009**: The dampener MUST key a finding's gate impact on its identity (a finding-signature), distinguishing previously-seen findings from new ones.
- **FR-010**: A previously-seen finding re-rated to a higher severity on unchanged code MUST NOT reset the consecutive-quiet streak.
- **FR-011**: A genuinely new HIGH finding MUST still block/reset the streak (real signal preserved).
- **FR-012**: Severity MUST be stabilized across rounds via hysteresis — a finding's gate-counted severity MUST reflect persistence across recent runs rather than a single run's rating (default: a HIGH must persist across the same window as the existing 2-consecutive-quiet threshold; the exact window is tunable in `/speckit-plan`).

US4 — Loop hygiene:
- **FR-013**: Lift/slush MUST skip any finding already marked `fixed-<sha>` (in-loop or prior-commit) and create no backlog task for it.
- **FR-014**: MEDIUM-residual migration MUST be deferred until the loop reaches a terminal (converged or overridden); findings fixed within the loop MUST never be migrated.
- **FR-015**: When a finding's audit-log entry flips to `fixed-<sha>`, any backlog task referencing it MUST be reconciled/closed; a `backlog done` (close) verb MUST exist for this.
- **FR-016**: Lifted findings MUST be deduped across runs by finding-signature so convergence iterations do not multiply near-duplicate tasks.
- **FR-017**: When `--override` is supplied, govern MUST short-circuit the convergence pass entirely — record the override reason in the audit trail and graduate, firing NO render/barrage/lift/slush pass.
- **FR-018**: An override graduation MUST be attributable in the audit trail (distinguishable from a convergence graduation) [NEEDS CLARIFICATION: should an override also PERSIST — a fingerprint-keyed marker so later govern invocations on unchanged code also skip the barrage, invalidated when code changes — or is the per-invocation short-circuit sufficient?].
- **FR-019**: The finding-signature MUST be defined once and shared between the dampener identity-key (FR-009) and the lift dedup (FR-016) [NEEDS CLARIFICATION: canonical finding-signature definition — candidate is normalized heading + primary file path, mirroring the existing ≥12-char heading-overlap cluster merge].

US5 — Payload correctness:
- **FR-020**: Per-phase govern MUST assemble the payload from the union of the phase's changed files across all its commits (diff-base resolved to the pre-phase commit), not only the `HEAD~1` delta.
- **FR-021**: Per-phase govern MUST eliminate false "absent/not-imported" HIGHs about referenced-but-out-of-window files by (a) widening the payload to include the referenced dependencies AND (b) instructing the auditor that out-of-window = not-in-scope-this-phase.
- **FR-022**: Real missing-implementation findings MUST still be raised (no real-signal suppression from the wider payload/prompt).

US6 — Granularity:
- **FR-023**: The graduate gate MUST accept EITHER all-phase-checkpoints-current OR a whole-feature convergence record (either-of).
- **FR-024**: Per-phase MUST remain the default; full-audit-at-end MUST be an explicit opt-in.
- **FR-025**: The 025 "compose, reject augment" clarify record MUST be amended to document the re-admitted whole-feature graduate path.

US7 — Staleness:
- **FR-026**: Per-phase checkpoint fingerprints MUST be computed at hunk granularity (the phase's own changes), so unrelated later-phase edits to a shared file do not stale an earlier checkpoint [NEEDS CLARIFICATION: hunk-fingerprint unit — hunk boundaries vs line-range vs per-symbol — that stays stable without missing a real later edit to the same region].
- **FR-027**: A later-phase edit to the SAME region an earlier phase owned MUST correctly stale the earlier checkpoint (no missed real change).
- **FR-028**: Governing a shared-file N-phase feature MUST be O(n) (each phase governs only its own unit), not O(n²).

US8 — Process discipline:
- **FR-029**: The audit/implement skill bodies + barrage prompt templates MUST include: channel-enumeration for surface-adding fixes; invariant-first boundary disposition; a round-0 self-red-team pass over the fix diff; fleet-degradation pricing; severity-rubric anchoring.

US9 — Hygiene:
- **FR-030**: `tests/roadmap/cluster.test.ts` MUST contain no non-null `!` assertions (uses a get-or-throw helper).
- **FR-031**: The roadmap SKILL.md MUST document the `cluster`/`group` verb.
- **FR-032**: List-flag empty/stray-comma handling MUST be uniform across `--depends-on`, `--into`, `--children`, `--part-of`; the dead `--part-of` zero-length branch MUST be removed.
- **FR-033**: decompose `rewriteEdgeLine` MUST be fence-aware (it must not rewrite a fenced edge example).
- **FR-034**: The tooling-feedback guidance MUST instruct adopters to file a GitHub issue against `audiocontrol-org/deskwork` (not only a local file).

### Key Entities

- **Finding**: a single audit-barrage result with a heading, body, severity, primary file, and status (`open` / `migrated-to-backlog <id>` / `fixed-<sha>`).
- **Finding-signature**: the canonical identity key for a finding, shared by the dampener identity-gate and the lift dedup (definition is FR-019).
- **Audit run**: one barrage invocation producing per-lane artifacts + an INDEX; carries per-lane terminal state.
- **Lane terminal state**: completed / timed-out / killed-no-liveness / killed-external / zero-byte.
- **Convergence streak**: the dampener's consecutive-quiet-run count; only fully-healthy zero-new-HIGH runs increment it.
- **Per-phase checkpoint**: the persisted record (hunk-granularity fingerprint, governed paths, audited files, audit-log section) that gates phase advancement.
- **Override marker**: the recorded operator escape (reason + attribution) that short-circuits the barrage and graduates.
- **Graduate gate**: the either-of condition (all-phase-checkpoints-current OR whole-feature record-converged).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a converged, unchanged tree, the loop graduates without operator intervention across repeated runs — severity re-rating on unchanged code never re-opens a converged unit.
- **SC-002**: An operator `--override` graduates the unit while recording **zero** new barrage runs (no further audit round fires).
- **SC-003**: A finding fixed within the loop produces **zero** backlog tasks; repeated runs of the same finding produce **at most one** backlog task.
- **SC-004**: A SIGTERMed/timed-out/zero-byte lane is reported distinctly from "clean, no findings" in 100% of degraded runs, and never increments the convergence streak.
- **SC-005**: Governing a shared-file N-phase feature requires governing each phase's own unit once (linear in N) — editing a later phase's shared file does not re-stale earlier phases' checkpoints unless the same region changed.
- **SC-006**: A fresh installation governs a real per-phase payload to completion using only the shipped default config (no local override, no manual config patching) with the fleet completing read-only within the timeout floor.
- **SC-007**: A feature can graduate via EITHER current per-phase checkpoints OR a whole-feature convergence record, with per-phase the default when no opt-in is given.
- **SC-008**: Per-phase govern raises zero false "diff omits the fix" / "file absent/not-imported" HIGHs on a phase whose changes span multiple commits and whose findings reference present out-of-window files, while still raising real missing-implementation findings.
- **SC-009**: All 17 referenced backlog tasks (TASK-60, 145, 146, 149, 154, 263, 288, 289, 290, 291, 292, 293, 294, 316, 317, 318) and the two gap nodes are closed by this feature.

## Assumptions

- **Build sequencing**: user stories are implemented in listed order (US1→US9), sharpen-the-saw: fleet reliability + observability + determinism first (they make this feature's own per-phase governance bearable), then loop hygiene + payload correctness, then granularity + staleness, then process + hygiene. US5 and US7 are critical-path because per-phase stays the default (US6).
- **No re-implementation of 015/021**: the convergence loop driver, severity-agreement substrate, per-phase units, checkpoint persistence, fleet negotiation, and terminal reporting already exist and are the surfaces this feature extends.
- **codex liveness lever**: `model_reasoning_summary=detailed` (stderr pulses) is the chosen first lever; the `--json` streamed-events extractor is a deferred follow-up considered only if reasoning-summary pulses prove insufficient on real payloads (not in this feature's default scope).
- **opus no-grounding calibration**: opus remains in the fleet (Decision 5); only sonnet's no-grounding profile is wall-clock-validated. opus no-grounding is calibrated during US1; if it cannot meet the timeout envelope, a fleet-composition decision is escalated to the operator (composition is not changed unilaterally).
- **Governed per phase as we build**: this feature is itself implemented TDD-first and governed per-phase at each `tasks.md` boundary, with commit+push per boundary; the US6 opt-in does not change this feature's own governance cadence.
- **One long-lived branch**: authored on `feature/stack-control` with the numbered spec dir as the unit (TF-09); no per-feature branch.
- **Adopter routing (US9)**: GitHub issues against `audiocontrol-org/deskwork` are the system of record for adopter tooling friction; a local pointer may remain but is not authoritative.
- **Hysteresis window default (FR-012)**: absent a different choice in `/speckit-plan`, severity hysteresis uses the same window as the existing 2-consecutive-quiet threshold (a HIGH must persist across that window to gate-count).
