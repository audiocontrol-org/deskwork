# Feature Specification: ship-stage — a mediated ship waypoint that makes recording status:shipped non-optional

**Feature Branch**: `032-ship-stage` (spec dir; this program runs on one long-lived branch, no per-feature branch)

**Created**: 2026-06-23

**Status**: Draft

**Input**: Approved design record `docs/superpowers/specs/2026-06-23-ship-stage-design.md` (operator-approved 2026-06-23); roadmap node `multi:feature/ship-stage`; folds backlog TASK-445.

## Clarifications

### Session 2026-06-23

- Q: How should the off-rail backstop detect that a specific item is merged, given items share the single `feature/stack-control` branch (no per-item ancestry) and detection must be independent of whether ship ran? → A: Git signal — the item's per-item govern **convergence record is reachable from the default branch (`origin/main`)** while the recorded `status:` is still `in-flight`. Portable (any git remote, no gh-API), per-item, independent of the ship skill having run.
- Q: How should `/stack-control:ship` gate the merge on CI being green, given CI here is brutally slow and the merge is operator-owned? → A: **Operator confirmation** — ship surfaces the PR/CI link and asks the operator to confirm CI is green before merging (no long poll; portable; matches operator-owned merge).

## User Scenarios & Testing *(mandatory)*

The "users" are (a) the **operator** driving a feature to completion and (b) the **adopting agent** that must stay on-rail. The "system" is the stack-control lifecycle engine (governed `WORKFLOW.md` + gate-eval + compass + skills).

### User Story 1 - Shipping welds merge to recording shipped (Priority: P1)

The operator finishes governing a feature and runs `/stack-control:ship`. The skill confirms the work is govern-converged, opens the PR, merges it when CI is green, and — as one welded operation at merge — records `status: shipped` (plus reconcile + journal + commit). There is no way to perform the merge through the skill without the recording following.

**Why this priority**: This is the core of the feature. Without the weld, recording `status:shipped` stays a separate skippable step — the exact defect (work merged + released while status stayed `in-flight`, caught only by luck) that motivated the feature.

**Independent Test**: Take a govern-converged item through `/stack-control:ship`; verify the PR is merged AND the recorded roadmap `status:` becomes `shipped` with a journal entry + commit, in a single invocation, with no operator step between merge and recording.

**Acceptance Scenarios**:

1. **Given** an item whose work is govern-converged (the `graduate-impl` gate is green), **When** the operator runs `/stack-control:ship` and CI is green, **Then** the PR merges and `status: shipped` is recorded (+ reconcile + journal + commit) without any further operator action.
2. **Given** an item that is NOT govern-converged, **When** the operator runs `/stack-control:ship`, **Then** the skill refuses loud (compass/precondition), names the missing step, and records nothing.
3. **Given** `/stack-control:ship` mid-run after a merge, **When** the graduate recording would be skipped or deferred, **Then** no such branch exists — the skill offers no skip/defer/shortcut option for the recording.

### User Story 2 - The compass and the close gate never disagree in the ship window (Priority: P1)

Across the whole governing→closed span, the phase the compass/`workflow status` reports and the phase the close gate enforces agree. There is no window where the compass says "shipped, next is close" while `advance --to closed` refuses because the recorded status is still `in-flight` (the TASK-445 divergence).

**Why this priority**: The coherence half is core to the feature's purpose. The divergence is the bug that let the broken state ship unnoticed; eliminating it structurally (not by patching the close gate) is the point.

**Independent Test**: At each point between govern-converge and closed, compare the phase derived by the compass against what the close gate would enforce from the recorded status; confirm they agree at every step, including the post-govern-pre-merge window (now `merging`) and the post-merge window (now `shipped`/`validating`).

**Acceptance Scenarios**:

1. **Given** an item that has govern-converged but is not yet merged, **When** the compass is consulted, **Then** it reports phase `merging` (work: `/stack-control:ship`) — not `shipped` — and the close gate agrees the item is not closeable.
2. **Given** an item just merged via `/stack-control:ship`, **When** the compass and the close gate are both consulted, **Then** both read the recorded `status: shipped` from the same source and agree the item is post-merge (no divergence).
3. **Given** any item in any post-merge phase, **When** the derived phase is computed and the close gate is evaluated, **Then** they never contradict (derived phase is a function of recorded status + the `validated` marker).

### User Story 3 - The backstop catches an off-rail merge (Priority: P2)

If a merge happens off-rail (a deliberate raw `gh pr merge` outside `/stack-control:ship`), the recorded status is left at `in-flight` while the work is merged. The next forward lifecycle step at any workflow waypoint refuses, names the dangling item, and directs the operator to the reconcile command. Running the reconcile clears the refusal. session-start and session-end never refuse — they only surface the divergence.

**Why this priority**: The honest-boundary residual. The weld (US1) makes the on-rail path safe; the backstop is the load-bearing guarantee for the path the weld cannot police.

**Independent Test**: Produce a merged-but-status-in-flight item by hand (simulate an off-rail merge); attempt a forward lifecycle step (e.g. `close`, or `design`/`define`/`execute` on any item) and confirm it refuses and names the item; run the reconcile and confirm forward motion resumes; run session-start/session-end and confirm they complete with an advisory only.

**Acceptance Scenarios**:

1. **Given** a merged-but-status-in-flight item, **When** the operator runs a compass-gated workflow step (close, or the next lifecycle step on any item), **Then** the step refuses, names the dangling item, and prints the reconcile command.
2. **Given** the same dangling item, **When** the operator runs the reconcile (advance the item to shipped), **Then** the reconcile is NOT blocked and, once run, the refusal clears.
3. **Given** the same dangling item, **When** the operator runs `/stack-control:session-start` or `/stack-control:session-end`, **Then** the skill completes (never refuses) and surfaces the divergence as a non-blocking advisory.

### User Story 4 - Adopter-defined validating before close (Priority: P2)

After an item is shipped (merged), it enters a `validating` phase before `closed`. The bundled default requires an operator-confirm `validated` marker (matching today's pre-close confirm); the engine defines only the phase + the marker, while an adopter defines what "validating" *means* by overriding the workflow.

**Why this priority**: Makes the verify-before-close discipline first-class and adopter-tailorable. Default behavior is unchanged from 031, so it is additive, not a regression — but it is a distinct, independently testable slice.

**Independent Test**: Ship an item and confirm it lands in `validating`; confirm `closed` is reached only after the `validated` marker is recorded; confirm an adopter `WORKFLOW.md` override can change validating's exit criteria, with the bundled default behaving as an operator-confirm before close.

**Acceptance Scenarios**:

1. **Given** a just-shipped item, **When** the phase is derived, **Then** it is `validating` (not yet `closed`) until the `validated` marker is recorded.
2. **Given** a shipped item with no `validated` marker, **When** the operator attempts to close it, **Then** close is gated on the `validated` marker (default: operator-confirm), matching 031's pre-close behavior.
3. **Given** an adopter who overrides validating's exit criteria in their `WORKFLOW.md`, **When** an item reaches validating, **Then** the adopter's criteria are honored instead of the bundled default, with no engine code change.

### Edge Cases

- **CI never goes green / red CI**: `/stack-control:ship` must not merge a red/pending PR; the merge is gated on the operator confirming CI is green (FR-019). If the operator does not confirm green, ship does not merge and records nothing.
- **Off-rail merge detection with a shared branch**: items ship on the single `feature/stack-control` branch via sequential PRs, so there is no per-item branch to test git-ancestry against. The backstop instead keys on the item's govern convergence record being reachable from `origin/main` while status ≠ shipped (FR-012) — a per-item, git-only signal that needs the default-branch ref fetched but no gh-API.
- **Multiple dangling items**: more than one merged-but-status-in-flight item exists at once — the backstop must name all (or at least surface that >1 exists) and not deadlock once one is reconciled.
- **Reconcile of a dangling item is itself a forward step**: the backstop must allow the reconcile transition (advance-to-shipped) even though it refuses other forward motion, or the divergence is unfixable.
- **Item shipped but never validated**: an item that sits in `validating` indefinitely is surfaced (advisory) but not force-closed; closure stays operator-confirmed.
- **Adopter with no validation process**: the adopter sets `validated` by a bare confirm (the default), so validating collapses to "operator confirms, then close" — never a hard blocker requiring machinery the adopter lacks.
- **Release vs merge**: `shipped` means merged; the monorepo release (bump/tag/publish) is a separate downstream skill, and `closed` still requires verified-in-release — now fronted by the `validating` phase.

## Requirements *(mandatory)*

### Functional Requirements

**The ship skill (US1)**

- **FR-001**: The system MUST provide a single sanctioned on-rail ship step (`/stack-control:ship`) that runs only when the item is govern-converged (the `graduate-impl` gate is green), refusing loud otherwise via a compass precondition.
- **FR-002**: `/stack-control:ship` MUST open the PR, merge it when CI is green (the merge decision is operator-owned), and — as one welded operation at merge — fire `transition:graduate` to record `status: shipped` plus reconcile, journal, and commit. No path through the skill MUST be able to merge without the recording following.
- **FR-003**: `/stack-control:ship` MUST NOT present any skip / defer / shortcut option for the graduate recording (no agent-offered protocol bypass).
- **FR-004**: `/stack-control:ship` MUST be a separate operator-invoked skill; `/stack-control:execute` MUST NOT auto-chain into ship (merge timing is operator-owned).

**The phase model + coherence (US2)**

- **FR-005**: The governed `WORKFLOW.md` MUST define a `merging` phase between `governing` and `shipped`, whose work is `/stack-control:ship` and which is derived from "govern-converged AND status ≠ shipped".
- **FR-006**: `shipped` MUST mean merged: `transition:graduate` (which records `status: shipped`) fires at merge, not at govern-converge; govern-converge becomes ship's precondition, not the event that records shipped.
- **FR-007**: `phase:shipped` and every post-merge phase MUST derive from the recorded `status:` (plus the `validated` marker) — the same source the close gate reads — so that for any item the derived phase equals what the recorded status implies.
- **FR-008**: The system MUST make the "graduated-but-status-in-flight" divergence impossible on the on-rail path: there MUST be no state in which the compass/`workflow status` report a post-merge phase that the close gate's recorded-status read contradicts (folds TASK-445).

**The backstop (US3)**

- **FR-009**: The system MUST provide a backstop invariant that refuses forward lifecycle motion — at the close step AND at the compass precondition every workflow skill calls — while any merged-but-status-in-flight item exists, naming the dangling item and printing the reconcile command.
- **FR-010**: The backstop MUST NOT block the reconcile transition itself (advancing the dangling item to shipped); the reconcile MUST always be runnable.
- **FR-011**: The backstop MUST NOT live in `/stack-control:session-start` or `/stack-control:session-end`; those skills MUST never refuse on this condition and MAY only surface it as a non-blocking advisory (per `.claude/rules/session-skills-never-block.md`).
- **FR-012**: The backstop MUST detect merged-ness INDEPENDENTLY of whether `/stack-control:ship` ran, so that an off-rail raw `gh pr merge` is still caught. The detection signal is a **git signal**: an item is merged-but-status-in-flight when its per-item govern **convergence record is reachable from the default branch (`origin/main`)** while its recorded `status:` is still `in-flight`. This is portable (any git remote; no gh-API dependency), per-item (the convergence record is item/feature-keyed), and independent of the ship skill having run.
- **FR-013**: The on-rail ship weld (FR-002) MUST NOT require a GitHub remote to record `status: shipped`; only the off-rail backstop detection (FR-012) MAY rely on remote-derived signals where present.

**The validating phase (US4)**

- **FR-014**: The governed `WORKFLOW.md` MUST define a `validating` phase between `shipped` and `closed`; the bundled default exit MUST be an operator-confirm `validated` approval-marker, and the default end-to-end behavior MUST match 031's current pre-close operator-confirm.
- **FR-015**: The engine MUST define only the `validating` phase and the `validated` marker; the *meaning* of validation MUST be adopter-defined via the `WORKFLOW.md` override (no hardcoded install/validation semantics in the engine).
- **FR-016**: An adopter override of `validating`'s exit criteria MUST be honored by the same override-resolution mechanism used for other phases (bundled default is overridable, no engine code change required).

**The honest boundary + one-unit delivery**

- **FR-017**: The feature MUST NOT claim to prevent a deliberate raw `gh pr merge` performed outside the skill surface; the load-bearing guarantee MUST be the backstop gate (FR-009/FR-012), not interception of the merge.
- **FR-018**: The phase-model changes (`merging` + `validating`), the `ship` skill, the graduate rewire, the backstop invariant, and the coherence fix MUST be delivered as ONE unit — no partial increments that leave the shipped↔closed surfaces in an inconsistent intermediate state.
- **FR-019**: The CI-green precondition on the merge MUST be enforced (no merge of a red/pending PR). `/stack-control:ship` MUST surface the PR/CI link and require **operator confirmation** that CI is green before merging (no long poll; the merge is operator-owned).

### Key Entities *(include if feature involves data)*

- **`/stack-control:ship` skill**: the on-rail ship step; precondition = govern-converged; effect = merge-then-graduate (welded).
- **`merging` phase**: governed-WORKFLOW.md phase between governing and shipped; work = ship; derived from govern-converged & status ≠ shipped.
- **`validating` phase**: governed-WORKFLOW.md phase between shipped and closed; exit = `validated` marker (operator-confirm default; adopter-overridable meaning).
- **`validated` marker**: a node approval-marker recorded by the operator (or the adopter's process) to exit validating.
- **`transition:graduate` (rewired)**: now fires at merge (driven by ship), records `status: shipped` + reconcile + journal + commit; gate includes "merged".
- **Backstop invariant**: a compass-level refusal predicate keyed on "any merged-but-status-in-flight item exists".
- **merged-but-status-in-flight condition**: an item whose work is merged but whose recorded `status:` is still `in-flight` — the divergence the feature eliminates (on-rail) and catches (off-rail).
- **Recorded `status:` field**: the single source post-merge phase derivation and the close gate both read (coherence).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every item shipped through the on-rail step has recorded `status: shipped` immediately after merge — zero merged-but-status-in-flight items result from the on-rail path (100% of on-rail ships record shipped without a separate operator step).
- **SC-002**: At every point between govern-converge and closed, the phase the compass reports and the phase the close gate enforces agree — there is no observable divergence window (the TASK-445 reproduction no longer reproduces).
- **SC-003**: A merged-but-status-in-flight item (produced off-rail) causes the next forward lifecycle step at any workflow waypoint to refuse and name the item; running the reconcile clears the refusal and forward motion resumes.
- **SC-004**: `/stack-control:session-start` and `/stack-control:session-end` complete (never refuse) even when a merged-but-status-in-flight item exists, surfacing it as advisory only.
- **SC-005**: An adopter can change what `validating` requires by overriding `WORKFLOW.md`, with the bundled default behaving as an operator-confirm before close (verified by overriding the criteria and observing the new gate without an engine change).
- **SC-006**: Recording `status: shipped` on the on-rail path succeeds without a GitHub remote dependency (the recording does not break in a no-remote installation).
- **SC-007**: The entire feature (merging + validating phases, ship skill, graduate rewire, backstop, coherence fix) is present after a single delivery, with the full test suite green and the governed `WORKFLOW.md` parsing cleanly.

## Assumptions

- Govern-converge (the `graduate-impl` gate) is the ship precondition; per-phase and whole-feature governance (025 unskippable-workflow-protocol, shipped; 030 chunked end-govern) already run before ship.
- The substrate is the governed `WORKFLOW.md` + the 022 gate-eval + the 024 compass + the 031 terminal-closure (`closed` stage + close gate + operator-confirm guard); this feature extends them, it does not replace them.
- "Merged" means the feature PR is merged to `main`; the monorepo release (bump/tag/publish) is a separate downstream skill (`/stack-control:release`), and `closed` still requires verification in a formally-installed release — now fronted by the `validating` phase.
- This program runs on one long-lived branch (`feature/stack-control`); items share that branch via sequential PRs (relevant to off-rail merge detection, FR-012).
- The `WORKFLOW.md` override mechanism (`<install-root>/.stack-control/WORKFLOW.md` wins over the bundled default) already exists and is the adopter-extension surface for `validating`'s meaning.
- ship records `status: shipped`; the close discipline ("issue closure requires verification in a formally-installed release; the agent posts evidence, the operator decides") is unchanged — `validating` makes it a first-class phase.
- Roadmap lineage: ship-stage `depends-on multi:feature/unskippable-workflow-protocol` (shipped) and is `part-of multi:feature/lifecycle-industrialization` (edges recorded at design approval).
