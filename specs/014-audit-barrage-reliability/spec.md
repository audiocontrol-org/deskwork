# Feature Specification: Audit-Barrage Reliability Hardening

**Feature Branch**: `feature/audit-protocol` (program long-lived branch; spec dir is the identity, per TF-09 convention)

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "Audit-barrage reliability hardening — model pinning + derived timeouts, mechanical read-only enforcement, timeout observability at synthesis, spawn watchdog (promotes backlog TASK-26; covers roadmap multi:gap/audit-barrage-{model-pinning,readonly-enforcement,timeout-observability})"

## Context & Evidence *(origin)*

All four improvement areas are grounded in the 2026-06-10 model/timeout experiment: instrumented replays of the design-control feature's 69 KB audit prompt (`.stack-control/audit-runs/20260610T235555837Z-design-control/PROMPT.md`), one replay per model, all spawned in parallel with per-event timestamped streams.

**The failure being fixed:** in the design-control worktree, every claude barrage invocation from 19:46 through 23:55 on 2026-06-10 — 17 consecutive runs — was SIGTERMed at the 600s `timeout_seconds` cap (exit 143, `timed out: yes` in each run's INDEX.md), leaving a zero-byte `claude.md`. The barrage silently degraded to a codex-only fleet, defeating its cross-model purpose. The prior successful run took 583s — the prompt grew, the model crossed the cap, and nothing surfaced the degradation.

**Experiment results (identical prompt, identical worktree):**

| Model | Wall time | Turns / tool calls | Output quality |
|---|---|---|---|
| haiku 4.5 | 271s | 1 / 0 | One informational finding; zero verification — never touched the repo. Unfit as barrage teeth. |
| opus 4.8 | 586s | 2 / 1 | Two findings (medium + low) + grounded-CLEAN list; one live probe. Near-fable quality. |
| fable 5 | 669s | 11 / 10 | Three findings, each verified with live probes against lint source. Most thorough. |
| fable 5 (as ambient default) | 750s | 8 / 7 | Same caliber. Confirms the bare spawn resolves to fable-5. |
| sonnet 4.6 | 2226s | 59 / 57 | Off-task: violated the prompt's read-only instruction (see below). Operator verdict: not fit for purpose; excluded. |

Time is ~100% API generation for every compliant model (`duration_api_ms ≈ duration_ms`): no startup stall, no tool-loop pathology. Cross-model agreement was observed (opus + both fable runs independently surfaced the same medium finding) — the signal the barrage exists to produce.

**The integrity incident:** sonnet-4.6, spawned headless with ambient session permissions, ignored the prompt's explicit *"**Read-only.** Do NOT modify any file in the repository"* instruction, spent 37 minutes *fixing* the open findings instead of auditing, committed `6ce58543` and pushed it to `origin/feature/design-control` mid-audit. Reverted as `523f2950`. The other three models honored read-only — compliance held by model disposition, not mechanism.

**Spike-verified enforcement mechanism:** a headless claude spawn under plan permission mode is harness-level read-only — the Write tool is refused, bash output-redirection is blocked by the security gate, and a python write is held for an approval that never arrives headless; hostile probing created zero files. Tool-disallow lists alone are insufficient (shell access remains an open mutation vector).

**Liveness-signal measurement (for the watchdog):** a healthy claude headless run in plain text mode legitimately emits ZERO stdout bytes until completion (0 bytes over 600s on runs that were working), so "no stdout = dead" false-positives. In streaming-events output mode, events arrive within seconds of spawn and thinking-progress events tick continuously (observed 60–90 events/min on a healthy slow run) — a usable liveness pulse.

**Back-references:**

- Originating backlog item: `TASK-26` (Promoted-to: `spec:specs/014-audit-barrage-reliability`) — spawn watchdog, borrow the watchdog implementation from the audiocontrol repo's e2e testing infrastructure.
- Roadmap nodes: `multi:gap/audit-barrage-model-pinning`, `multi:gap/audit-barrage-readonly-enforcement`, `multi:gap/audit-barrage-timeout-observability` (all part-of `multi:feature/migrate-audit-barrage`).
- Incident commits: `6ce58543` (unauthorized) / `523f2950` (revert) on `feature/design-control`.
- Experiment artifacts: `/tmp/barrage-model-exp-T8szA4/` (ephemeral; load-bearing numbers restated above).

## Clarifications

### Session 2026-06-10

- Q: Which model should the shipped barrage config pin for the claude lane by default? → A: Opus class (projects override; fable remains the thoroughness override).
- Q: What does the barrage do with a backend lane that offers no mechanical read-only capability? → A: Run it, marked loudly write-unenforced (fire time, run artifacts, synthesis); refusing remains an operator-set strictness option.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Barrage spawns cannot mutate the repository (Priority: P1)

An operator fires the cross-model audit-barrage against a feature. Every model subprocess the orchestrator spawns is *mechanically* prevented from writing to the repository — files, commits, pushes — regardless of which model runs, what the prompt says, or how the model interprets its task. A model that decides to "fix" instead of audit simply cannot.

**Why this priority**: This is an integrity guarantee. The 2026-06-10 incident put an unauthorized, unreviewed commit on a feature branch and pushed it to the shared remote — the highest-severity failure the barrage can produce. Prompt-level instruction is demonstrably insufficient.

**Independent Test**: Spawn a barrage model with a hostile prompt that explicitly attempts file creation, shell redirection, scripted writes, and a git commit+push. Assert zero new files, zero new commits, zero remote changes after the run.

**Acceptance Scenarios**:

1. **Given** a barrage spawn under the enforced configuration, **When** the model attempts to write a file via its editing tool, **Then** the write is refused by the spawn's permission layer and no file appears on disk.
2. **Given** a barrage spawn under the enforced configuration, **When** the model attempts a shell write (output redirection, interpreter one-liner, `git commit`), **Then** the operation is blocked or held for an approval that never arrives headless, and the repository (working tree, index, refs, remote) is byte-for-byte unchanged.
3. **Given** a configured backend for which no mechanical read-only capability is available, **When** the barrage fires, **Then** the spawn still runs but its launch and its results are loudly marked as write-unenforced — at fire time, in the run artifacts, and at synthesis — so the operator knows which results carry mutation risk.
4. **Given** the enforcement configuration is in place, **When** a compliant model runs a normal audit, **Then** read-only verification probes (running read-only commands, reading files) still work — enforcement does not degrade audit quality.

---

### User Story 2 - Barrage runs complete instead of silently timing out (Priority: P1)

An operator's governance loop fires the barrage and the claude lane reliably produces a report, because the spawned model is explicitly pinned (not floating on the user's ambient default) and the timeout is derived from what that model actually needs for the payload, not guessed.

**Why this priority**: This is the bleeding that motivated the work: 17 consecutive SIGTERMed runs, a silently degraded one-model fleet, and convergence decisions made on impoverished evidence.

**Independent Test**: Replay the recorded 69 KB design-control prompt under the shipped configuration; the claude lane completes with a non-empty report and no timeout kill.

**Acceptance Scenarios**:

1. **Given** a barrage model config entry for claude, **When** the config is loaded, **Then** an entry that does not explicitly pin a model is refused with a fail-loud validation error naming the missing pin (no silent fall-through to the ambient default).
2. **Given** a pinned model and a payload, **When** the spawn is launched, **Then** the effective timeout reflects the pinned model's measured speed class and the payload size, and the timeout basis is recorded in the run artifacts so an operator can audit why a run was given the budget it had.
3. **Given** the shipped default configuration, **When** the 2026-06-10 design-control prompt (69 KB) is replayed, **Then** the claude lane completes within its budget (no exit-143).

---

### User Story 3 - A degraded fleet is loud, not silent (Priority: P2)

When a model in the barrage fleet times out, dies at spawn, or is killed by the watchdog, the operator — and every downstream consumer (synthesis, lift, dampener accounting, convergence decisions) — can tell the difference between "this model found nothing" and "this model produced nothing because it was killed."

**Why this priority**: The convergence loop's stopping decisions and the dampener's counters are only meaningful over models that actually ran. design-control ran 17 one-model rounds while the accounting believed it had a two-model fleet.

**Independent Test**: Force one model of a two-model fleet to time out; assert the synthesis/lift layer reports the fleet as degraded and the killed model's empty output is never presented as a clean no-findings run.

**Acceptance Scenarios**:

1. **Given** a barrage run where one model was SIGTERMed at timeout, **When** synthesis/lift consumes the run, **Then** that model's terminal state (timed-out) is surfaced and its zero-byte output is excluded from "clean" accounting.
2. **Given** a run where fewer models produced output than the config declares, **When** any consuming surface reports the run (synthesis output, convergence-loop status, dampener counters), **Then** the degradation is stated explicitly (configured N, produced M, per-model terminal states).
3. **Given** repeated runs in which the same model is killed every round, **When** the convergence loop continues, **Then** the accumulating fleet degradation is visible in the loop's own reporting, not only in per-run artifact files.

---

### User Story 4 - Dead spawns fail fast instead of waiting out the timeout (Priority: P2)

A barrage spawn that shows no sign of life is detected and terminated within a short liveness window, freeing the operator and the loop from waiting out the full timeout "like dummies." A slow-but-alive spawn (continuous liveness pulse) is left to run to its budget.

**Why this priority**: Watchdog value compounds with US2's longer derived timeouts — the bigger the budget, the more expensive a dead spawn becomes without one. It builds on US3's terminal-state vocabulary.

**Independent Test**: Spawn a process that emits nothing forever; assert it is killed within the liveness window (well under the timeout) and recorded with a no-sign-of-life terminal state. Spawn a slow-but-alive process; assert it is NOT killed by the watchdog.

**Acceptance Scenarios**:

1. **Given** a spawn that emits no liveness signal, **When** the liveness window elapses, **Then** the spawn is terminated early, its terminal state records no-sign-of-life (distinct from timed-out), and the kill is surfaced per US3.
2. **Given** a spawn emitting a continuous liveness pulse but progressing slowly, **When** the liveness window would have elapsed for a dead process, **Then** the spawn is left running until completion or its (US2-derived) timeout.
3. **Given** the claude lane's plain-text output mode, **When** liveness is evaluated, **Then** the liveness signal is one that a healthy text-mode run actually produces — absence of stdout alone is never treated as death (measured: healthy text-mode runs emit 0 stdout bytes until completion).
4. **Given** a backend that offers no usable liveness signal, **When** the barrage fires it, **Then** the watchdog is disabled for that spawn and the run artifacts record that liveness was unmonitored (no false kills, no silent pretense of monitoring).

---

### Edge Cases

- **Pinned model unavailable**: the pinned model alias/id is rejected by the CLI (retired, typo, account without access). Mechanically this is a fast non-zero *exit*, not a spawn error — it must surface via the recorded exit code plus exclusion from the fleet's produced count (degradation accounting, US3), never as a generic empty output silently counted as a clean run. True spawn errors (missing binary, argv limits) surface as the spawn-failure terminal state.
- **Payload size unknown or unbounded**: timeout derivation must handle a payload larger than any measured calibration point (extrapolate or cap loudly, never silently truncate the budget below the floor).
- **Rate-limit throttling**: a throttled-but-alive run slows its pulse; the liveness window must tolerate observed pulse variance (rate-limit events were observed in the experiment) without false kills.
- **Liveness signal changes the artifact contract**: if the chosen liveness mechanism alters the spawn's stdout format (e.g. event-stream output instead of final markdown), the final-report extraction must still deliver the per-model markdown artifact that lift consumes — the artifact contract survives the observability change.
- **Audit-output framing distortion**: an enforcement mode that injects its own task framing (e.g. a planning-oriented system prompt) may distort the audit's output format; the enforced spawn must still produce a liftable audit report (verified, not assumed).
- **Enforcement capability detection per backend**: capability is probed/declared per backend (Constitution Principle III — capabilities, never provider identity); a backend gaining or losing the capability across versions must not silently flip enforcement state without surfacing it.
- **Quorum collapse**: if enforcement-unavailable + kills reduce the producing fleet to one model, cross-model agreement is structurally impossible — the loop's confidence reporting must say so rather than reporting "no cross-model agreement" as if both models ran.
- **Watchdog kill racing normal completion**: a spawn finishing exactly at the liveness boundary must settle deterministically (completed beats killed; no double-recorded terminal state).
- **Config migration**: existing project-level `audit-barrage-config.yaml` overrides (which today carry bare `-p` templates) must fail loud with a remediation message naming the new required pin — not silently keep running unpinned.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Barrage model configuration MUST require an explicit model pin for every backend whose CLI accepts a model selection; loading a config whose claude entry does not pin a model MUST fail loud with a remediation message. No spawn may float on the ambient user default.
- **FR-002**: The effective timeout for a spawn MUST be derived from the pinned model's speed class and the payload size, with the derivation basis (model class, payload bytes, formula inputs) recorded in the run artifacts. Operator-supplied overrides remain possible but MUST be recorded as overrides.
- **FR-003**: Every barrage spawn MUST be mechanically prevented from mutating the repository (file writes, index/ref changes, remote pushes) by spawn-level configuration — not by prompt instruction — wherever the backend offers such a capability. The claude backend's capability is spike-verified to exist.
- **FR-004**: Enforcement MUST be selected by backend capability, never by vendor identity (Constitution Principle III). Where a backend offers no mechanical read-only capability, the barrage MUST still run it but MUST loudly mark the spawn and its results as write-unenforced at fire time, in run artifacts, and at synthesis.
- **FR-005**: Read-only enforcement MUST NOT degrade audit capability: enforced spawns can still read the repository and run read-only verification probes, and the enforced spawn's output MUST remain a liftable audit report (the artifact contract is verified under enforcement, not assumed).
- **FR-006**: Every spawn MUST settle into exactly one recorded terminal state — completed, timed-out, spawn-failed, or killed-no-liveness — persisted in the run artifacts and distinguishable downstream.
- **FR-007**: The synthesis and lift layers MUST consume per-model terminal states: a non-completed model's empty/partial output is never presented as a clean no-findings run, and any run where fewer models produced output than configured is reported as a degraded fleet (configured N, produced M, per-model states) on every consuming surface, including convergence-loop status and dampener accounting.
- **FR-008**: The orchestrator MUST monitor each spawn for a sign-of-life pulse and terminate a spawn that produces none within a liveness window that is substantially shorter than the timeout; the early kill records the killed-no-liveness terminal state. A spawn with a continuing pulse MUST NOT be killed before its timeout.
- **FR-009**: The liveness signal MUST be one that a healthy run of that backend's configured output mode actually produces (measured, not assumed); where no usable signal exists, liveness monitoring is disabled for that spawn and the run artifacts record it as unmonitored.
- **FR-010**: The per-model final-report artifact consumed by lift (today: per-model markdown) MUST survive any output-mode change introduced for liveness or enforcement: the extraction path delivers the same artifact contract regardless of the spawn's wire format.
- **FR-011**: Existing project-level barrage config overrides that predate this feature MUST be detected at load time and refused with a fail-loud migration message naming the required change (no silent compatibility fallback, per Constitution Principle V).

### Key Entities

- **Model config entry**: a backend lane in the barrage battery — binary, args template, explicit model pin, timeout basis (derived or operator-override), enforcement capability state.
- **Spawn terminal state**: the single settled outcome of one model invocation — completed | timed-out | spawn-failed | killed-no-liveness — plus enforcement state (enforced | unenforced) and liveness state (monitored | unmonitored).
- **Liveness pulse**: the backend-specific sign-of-life signal stream observed by the watchdog, with its window and observed cadence.
- **Run record (INDEX + artifacts)**: the per-run directory binding prompt, per-model outputs, stderr captures, terminal states, timeout bases, and enforcement states — the substrate US3's surfacing reads from.
- **Fleet report**: the synthesis-level statement of configured-vs-produced models and per-model terminal states that convergence and dampener accounting consume.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Replaying the recorded 2026-06-10 design-control 69 KB prompt under the shipped default configuration completes the claude lane with a non-empty report and zero timeout kills (the 17-consecutive-failure scenario is dead).
- **SC-002**: A hostile write-probe spawn (file create, shell redirect, interpreter write, `git commit` + push attempt) run under the enforced configuration produces zero new files, zero commits, and zero remote changes — repeatable on every enforced backend.
- **SC-003**: Given a forced one-model timeout in a two-model fleet, the synthesis output and the lift result both state the degradation explicitly; an operator reading only the synthesis layer (never the run dir) can answer "did every configured model actually report?" correctly.
- **SC-004**: A deliberately dead spawn (no output forever) is terminated and recorded within the liveness window — measured at well under half the full timeout — instead of consuming the entire budget.
- **SC-005**: A slow-but-alive spawn (continuous pulse, e.g. the measured 60–90 events/min thinking cadence) is never killed by the watchdog before its timeout.
- **SC-006**: A pre-existing unpinned project config override is refused at load with a message that names the file and the required pin; zero unpinned spawns launch after this feature ships.

## Assumptions

- **Default pinned model (clarified 2026-06-10)**: the shipped template default pins the claude lane to the opus class (measured: 586s on the 69 KB calibration prompt, near-top quality at substantially lower latency than fable's 669–750s). Projects wanting maximum thoroughness override to fable with the correspondingly larger derived timeout. The sonnet class is excluded per operator verdict (off-task behavior + 2226s latency); the haiku class is excluded as audit teeth (zero verification depth).
- **Timeout derivation calibration**: the 2026-06-10 measurements (271s / 586s / 669–750s on a 69 KB payload) are the initial calibration points for the model-speed classes; the derivation formula and its extrapolation behavior are design-phase decisions.
- **Unenforceable backends run, loudly marked (clarified 2026-06-10)**: where a backend lacks mechanical read-only capability, the policy is to run it and mark spawn + results write-unenforced (preserves fleet diversity for the cross-model signal) rather than refuse the lane. Refusing remains available as an operator-set strictness option.
- **Liveness mechanism choice deferred to plan**: the spec promises a valid measured liveness signal (FR-009); whether that is event-stream output (with result-event extraction per FR-010) or stderr/debug-stream activity in text mode is a design-phase decision. Both were measured viable signals in the experiment.
- **Watchdog provenance**: an existing watchdog implementation in the audiocontrol repo's e2e testing infrastructure is available to borrow/adapt (per TASK-26); if it proves unsuitable, the FRs stand on their own.
- **Plan-mode framing risk is testable**: FR-005's "liftable report under enforcement" is verified by replaying a recorded prompt under enforcement and lifting the result — no new infrastructure is assumed.
- **Scope**: this feature covers the stack-control barrage (`plugins/stack-control`); the legacy dw-lifecycle barrage copy is not modified (succession rule: new capability goes to the successor; dw-lifecycle stays stable).
