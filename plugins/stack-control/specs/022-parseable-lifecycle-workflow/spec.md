# Feature Specification: Parseable lifecycle workflow engine

**Codename**: `multi/parseable-lifecycle-workflow` (part-of `multi:feature/lifecycle-industrialization`)

**Feature Branch**: `feature/stack-control` (session-pinned; not a per-spec branch)

**Created**: 2026-06-16

**Status**: Draft

**Input**: User description: author the spec from the converged design record at `plugins/stack-control/docs/superpowers/specs/2026-06-15-parseable-lifecycle-workflow-strawman.md`.

## Context

This spec graduates **TASK-136** — sharpened in conversation from "document the workflow" to a **parseable, deterministic workflow engine** that drives roadmap items through gated lifecycle phases. The authoritative design record is the converged strawman at `plugins/stack-control/docs/superpowers/specs/2026-06-15-parseable-lifecycle-workflow-strawman.md` (read it for the full reasoning, the worked examples, and the rejected alternatives). This spec is the capture of that design into Spec Kit form.

The closing/reconciling half of the stack-control lifecycle has no momentum of its own — it runs on operator stamina. The roadmap reasoner can answer DAG questions but has no concept of *phase*; `session-start` and `roadmap reconcile` derive phase informally and incompletely; advancing an item is a sequence of discretionary hand-steps (advance status, remember to commit, notice the unblocked dependents). This feature makes the lifecycle **mechanical and queryable**: an item's phase is derived from artifacts that already exist, every stage gate is a debate-free true/false predicate published in one governed document, and advancing fires a fixed, atomic effect manifest with zero agent discretion.

### Originating + sibling backlog inputs

- **TASK-136** — the seed (parseable/deterministic workflow engine).
- **TASK-19** — governance-graduation has no on-disk record; pulled INTO this feature's scope (see ratified decisions).
- **TASK-137** — `roadmap reparent` verb; the precedent for "a missing effect means add a verb."

## Ratified framing decisions (2026-06-16, settled — do not relitigate)

These were operator decisions that gated converging the design record; they are inputs, not open questions. Full text in the design record's "Ratified 2026-06-16" section.

1. **Engine shape**: a NEW `workflow` verb family that CONSUMES the roadmap node-reader — not phase-awareness bolted onto the `roadmap` reasoner. `roadmap` stays focused on the DAG; `workflow` owns phases / transitions / effects.
2. **Unit**: the roadmap node (`<phase>:<kind>/<slug>`); the spec dir is a mid-phase artifact the node produces.
3. **TASK-19 scope**: the governance-graduation record is delivered BY this feature, together with every gate that reads it (the full back-half `governing → shipped` mechanical exit). No report-only interim for the back half.
4. **Installation-anchor invariant**: every artifact the workflow authors lands inside the configuration domain (the installation tree rooted at the dir owning `.stack-control/config.yaml`), never the adopter's repo root. This is the constitution's installation-anchor invariant (installation-isolation FR-010) applied to every new artifact this feature introduces.

## Clarifications

### Session 2026-06-16

- Q: Where does the governed `WORKFLOW.md` live — bundled default vs per-installation authored? → A: **Plugin-bundled default, per-install overridable.** The canonical stack-control lifecycle (phase vocabulary + gate criteria) ships with the plugin; an installation may override it via the customize seam (the same override-resolution as built-in templates / doctor rules — installation copy wins, else the bundled default). The lifecycle stays universal but tailorable.
- Q: Should `spec-govern` convergence (the `specifying → implementing` signal) be recorded the same way as TASK-19's impl-govern record? → A: **Symmetric — one govern-convergence record mechanism, two modes.** Both `govern --mode spec` and impl govern write a durable on-disk convergence record (keyed by mode); the phase-derivation function reads both symmetrically, so `specifying → implementing` is mechanical too, not agent say-so.
- Q: Where is the recorded operator-approval marker (for judgment gates) stored? → A: **A field on the roadmap node** (e.g. `design-approved:`), co-located with the `design:` / `spec:` pointers — one governed surface, consistent with node-is-the-unit.

#### Workflow-policy decision 2026-06-16 — spec audit-barrage parked from the default workflow

- **Decision (operator):** spec-document audit-barrage (`govern --mode spec`) is **removed from the default workflow until the spec-audit protocol's kinks are worked out**; **implementation audit-barrage stays** (the `after_implement` deskwork-governance hook is unchanged). This refines the symmetric-record clarification above.
- **Consequence for the design (park the gate, keep the mechanism):**
  - The symmetric, mode-keyed govern-convergence-record **mechanism is retained** (so re-enabling spec governance later is a flag flip, not a re-design).
  - The `specifying → implementing` exit gate is **NOT** a default-required spec-govern gate. By default it derives from **`speckit-analyze`-clean** (the spec-chain completion signal). The spec-govern convergence record + gate is **opt-in** (available when the operator chooses to run `govern --mode spec`), never default-required, while parked.
  - The `governing → shipped` impl-govern gate **remains required and mechanical** — implementation audit-barrage is unchanged.
- **Temporary:** this is a park, not a deletion. Re-enabling spec audit-barrage as a default-required gate is tracked as a backlog follow-up (see Assumptions).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mechanical, queryable stage gates (Priority: P1) 🎯 MVP

The operator asks, about any roadmap item, "are we done with this stage?", "how much more before the next stage?", and "can we move to {stage} yet?" — and gets a deterministic, debate-free answer derived from artifacts that already exist, **without advancing anything**. This is the heart of the feature and the foundation every other story builds on; the query engine has standalone value independent of driving.

**Why this priority**: The whole feature exists to replace "the agent says we're done" with a mechanical predicate. The query surface delivers that on its own — even before any automated advancing exists.

**Independent Test**: Given fixture items at known artifact states, `workflow status {item}` reports the current stage's exit criteria as met / not-met and enumerates the unmet ones (M of N); `workflow can-enter {item} {stage}` reports the target stage's entrance criteria and what's missing; re-running with no on-disk change produces byte-identical output. No item advances.

**Acceptance Scenarios**:

1. **Given** an item whose artifacts place it mid-stage, **When** `workflow status {item}` runs, **Then** it derives exactly one current phase and reports each exit criterion as a definite true/false, naming the unmet ones.
2. **Given** an item that does not yet meet a target stage's entrance criteria, **When** `workflow can-enter {item} {stage}` runs, **Then** it reports `false` and enumerates the specific missing criteria.
3. **Given** any item, **When** a query verb runs twice with no intervening on-disk change, **Then** both runs write nothing and produce identical output (read-only, deterministic).
4. **Given** a stage criterion that encodes a judgment ("is the design good?"), **When** the engine evaluates it, **Then** it checks a recorded operator-approval marker (true/false), never a subjective evaluation.

---

### User Story 2 - The current phase is derived, never stored (Priority: P1)

An item's current phase is a pure function of artifacts that already exist (backlog presence, roadmap node status, the `design:` and `spec:` pointers, spec-govern convergence, `tasks.md` completion, the governance-graduation record, a release tag). There is no new stored phase field and no second source of truth to drift.

**Why this priority**: Storing phase as state would reintroduce exactly the drift this feature exists to kill. Derivation must be total (every observable state maps to one phase) and monotonic before any gate or advance can be trusted.

**Independent Test**: Drive a fixture item through each artifact state in the derivation table and assert the derived phase matches; confirm no phase field is ever written to the node or any sidecar.

**Acceptance Scenarios**:

1. **Given** an item in the backlog with no roadmap node, **When** the phase is derived, **Then** it is `captured`.
2. **Given** a node with `status: planned`, a `design:` pointer set, and no `spec:` field, **When** the phase is derived, **Then** it is `designing` — keyed on the pointer, not on whether the design file has been written yet.
3. **Given** a node whose `tasks.md` is 100% complete with no governance-graduation record, **When** the phase is derived, **Then** it is `governing`.
4. **Given** any item, **When** the phase is derived, **Then** exactly one phase (or one terminal side-state) is returned — the mapping is total and unambiguous.

---

### User Story 3 - A governed WORKFLOW.md is the single source of truth (Priority: P1)

The phase vocabulary, the derive predicates, every gate criterion, and every transition's effect manifest live in one governed, grammar-parsed `WORKFLOW.md` (the document-primitives pattern — third use after `ROADMAP.md` and `DESIGN-INBOX.md`). The document is the published single source; the rendered/human view is one projection, never a second authority. No criterion lives in skill prose or anyone's head.

**Why this priority**: "Published, unambiguous, debate-free" requires a single readable source every agent and session reads identically. If criteria live in code or prose, they drift and become arguable.

**Independent Test**: Parse a fixture `WORKFLOW.md` under the grammar; assert the engine reads phases, criteria, and effects from it (mutating the doc changes engine behavior; the engine hardcodes none of them).

**Acceptance Scenarios**:

1. **Given** a `WORKFLOW.md` conforming to the grammar, **When** the engine loads it, **Then** it exposes each phase's derive predicate, work, entrance + exit criteria, and `next`, and each transition's codename, exit-gate, and ordered effects.
2. **Given** a malformed `WORKFLOW.md`, **When** the engine loads it, **Then** it fails loud naming the grammar violation (no silent fallback to defaults).
3. **Given** a criterion changed in `WORKFLOW.md`, **When** a query re-runs, **Then** the new criterion governs the answer — proving the doc, not code, is the source.

---

### User Story 4 - Deterministic, atomic advance with a fixed effect vocabulary (Priority: P1)

`workflow advance {item}` (dry-run → `--apply`) reads the transition's effect manifest and fires the declared effects in order, atomically, with zero agent discretion over which docs or statuses change. Every effect is a call to a governed verb from a fixed vocabulary, never a prose instruction.

**Why this priority**: This converts the discretionary hand-sequence (advance, commit, reconcile, notice ripples) into one mechanical transaction — the second half of the feature's value after the query engine.

**Independent Test**: Run `workflow advance --apply` on a fixture transition and assert every declared effect fired in order and was captured by a single trailing commit; inject a failure mid-manifest and assert the working tree is restored to its pre-advance state with nothing committed.

**Acceptance Scenarios**:

1. **Given** a transition with an effect manifest, **When** `workflow advance {item}` runs without `--apply`, **Then** it previews the exact ordered effects and writes nothing.
2. **Given** `--apply` on a clean tree, **When** advance runs, **Then** all non-commit bookkeeping effects are applied to the working tree and a single `commit` fires LAST as the atomic boundary.
3. **Given** an effect that fails before the commit, **When** advance runs `--apply`, **Then** the advance-touched paths are restored (`git restore`) and nothing is committed — no partial application.
4. **Given** a dirty working tree on the advance-touched paths, **When** `--apply` runs, **Then** it refuses loud (never clobbering uncommitted operator work) rather than proceeding.
5. **Given** a transition needing an effect that is not in the fixed vocabulary, **When** the manifest is authored, **Then** the resolution is to ADD A VERB (a new governed verb), never to write a prose effect.

---

### User Story 5 - The designing phase: an opinionated frontend over a swappable backend (Priority: P1)

A new `designing` phase sits before `specifying`. Its work is free-form exploration producing a **design record** (problem domain, solution space including rejected alternatives, decisions, open questions, provenance). It is surfaced by `/stack-control:design` — a new opinionated frontend over a swappable backend (default `superpowers:brainstorming`, selected by capability never vendor identity). The frontend bends the backend at the seam (its output contract + the gate that enforces it), suppressing the backend's generic opinions where they conflict with stack-control rules.

**Why this priority**: The front of the spine is currently undocumented convention left to operator memory. Formalizing it as a named, gated phase — with the design record as a required, mechanically-verifiable artifact — is core to the feature's thesis (heavy up-front design, industrialized execution).

**Independent Test**: Run `/stack-control:design` against a fixture roadmap item; assert it sets the `design:` pointer on entry, drives the backend in-session, writes the design record at the installation-anchored convention path with all required sections, and that the `design-to-spec` exit gate verifies those sections + a recorded approval marker before the transition can fire.

**Acceptance Scenarios**:

1. **Given** the `open-design` transition fires, **When** the item enters `designing`, **Then** the node's `design:` pointer is set immediately (before the backend writes the file), so phase-derivation reports `designing`.
2. **Given** the backend's default opinion to "YAGNI ruthlessly", **When** the frontend drives it, **Then** the frontend re-injects "capture, don't cut" at the backend's scope-check step and the `design-to-spec` exit gate mechanically requires a solution-space section with ≥2 alternatives.
3. **Given** the backend's hardcoded terminal handoff (`writing-plans`), **When** the design phase completes, **Then** the frontend routes the handoff to Spec Kit (`/stack-control:define`) instead.
4. **Given** a design record missing a required section, **When** the `design-to-spec` exit gate evaluates, **Then** it reports the gate unmet and names the missing section.
5. **Given** a backend other than the default that satisfies the backend contract, **When** it is selected, **Then** the workflow drives it without any branch on the backend's vendor identity.

---

### User Story 6 - Governance graduation is recorded on disk (Priority: P2)

Governance graduation produces a durable on-disk govern-convergence record so the `governing → shipped` exit criterion is mechanical (impl-govern convergence **recorded ∧ converged**), not agent say-so. Today no such record exists, so `roadmap reconcile` falls back to tasks-completion as the shipped signal (TASK-19).

**Why this priority**: Without a recorded convergence fact the back-half exit gate cannot be mechanical — it falls back to "the agent says it's governed," exactly the debate this feature kills. It is P2 only because the front-half query/advance value lands first; it is in scope, not deferred.

**Independent Test**: Run governance to convergence on a fixture and assert a durable record is written at the installation-anchored path; assert the `governing` exit gate reads the record (passes only when recorded ∧ converged) and that no agent assertion can substitute.

**Acceptance Scenarios**:

1. **Given** a govern run that converges, **When** it completes, **Then** a durable govern-convergence record is written inside the installation domain.
2. **Given** an item whose `tasks.md` is 100% but with no convergence record, **When** the `governing` exit gate evaluates, **Then** it reports unmet (graduation blocked) — never inferring shipped from tasks-completion alone.
3. **Given** a convergence record present and converged, **When** the `governing` exit gate evaluates, **Then** it reports met.

---

### User Story 7 - Every authored artifact stays inside the installation domain (Priority: P2)

In any repo stack-control operates on — especially an adopter's — every artifact the workflow authors (the governed `WORKFLOW.md`, the design record, the governance-graduation record, any checkpoint / effect bookkeeping) lands inside the configuration domain: the installation tree rooted at the directory owning `.stack-control/config.yaml`. The tool never writes to the adopter's repo root.

**Why this priority**: This is the constitution's installation-anchor invariant (installation-isolation FR-010). Roadmap, backlog, journal, audit-runs, and Spec Kit `specs/` already obey it; the design record was the one new artifact the design record originally proposed in violation. Every new artifact this feature adds must obey it.

**Independent Test**: An adopter-repo fixture (an installation nested below a repo root) runs the full workflow surface; a probe asserts that no authored artifact path resolves outside the installation tree — mirroring the existing `installation-isolation-probe`.

**Acceptance Scenarios**:

1. **Given** an installation nested below an adopter repo root, **When** any workflow verb authors an artifact, **Then** the artifact path resolves inside the installation tree.
2. **Given** the same nested installation, **When** the design record is written, **Then** its path is `<install-root>/docs/superpowers/specs/...`, never the adopter repo root.
3. **Given** no enclosing installation, **When** a state-writing workflow verb runs, **Then** it refuses loud (directing to `stackctl setup`), consistent with every other state-writing verb.

---

### User Story 8 - Mid-stream re-design re-entry (Priority: P3)

Design also happens AFTER specifying / implementing (the `/frontend-design` rule, the `feature-extend` re-design case). Re-entry to `designing` from a later phase is a real transition: it re-opens / appends a revision to the design record, marks the affected downstream phase checkpoints stale (reusing 021's checkpoint-staleness machinery), and preserves the existing spec dir as a new revision rather than discarding it.

**Why this priority**: It is real and must be captured (per capture-mode), but it is the thinnest part of the design and its interaction with checkpoint-staleness and spec-revisioning likely needs its own focused pass during planning. P3 reflects design maturity, not whether it is in scope.

**Independent Test**: From a fixture item in `implementing`, trigger a `* → designing` re-entry and assert: a new design-record revision is opened; the affected downstream checkpoints are marked stale; the existing spec dir is preserved as a revision (not discarded).

**Acceptance Scenarios**:

1. **Given** an item in a phase later than `designing`, **When** a `* → designing` re-entry fires, **Then** the design record gains a new revision rather than being overwritten.
2. **Given** the same re-entry, **When** it completes, **Then** the downstream phase checkpoints whose scope the re-design touches are marked stale and must re-derive.
3. **Given** the same re-entry, **When** it completes, **Then** the existing spec dir is preserved as a new revision, not discarded.

### Edge Cases

- A spec has only one meaningful phase; the workflow still derives a phase and publishes its gates.
- An item enters `designing` but the backend has not yet written the design file — derivation must still report `designing` (keyed on the `design:` pointer, not file existence).
- `WORKFLOW.md` references a `work` skill/verb that does not exist — the engine must surface this rather than silently treat the transition as inert.
- `workflow advance --apply` is interrupted (process killed) mid-manifest before the commit — on the next run the tree must be restorable to pre-advance (no half-applied, uncommitted residue treated as success).
- A transition's effect names a governed verb that fails its own precondition (e.g. `roadmap advance` on an item not in the expected status) — advance must fail loud and restore, not partially apply.
- The backend emits a design record that structurally satisfies the sections but the operator judges the capture incomplete — the operator-review gate (a recorded marker) is the backstop; the structural gate alone cannot catch silent scope-cutting.
- An item is in a terminal side-state (`blocked` / `cancelled` / `retired`) — queries report the side-state; the linear `next` is not offered until the item is inducted back.

## Requirements *(mandatory)*

### Functional Requirements

**Phase derivation**

- **FR-001**: The system MUST derive an item's current phase as a pure function of artifacts that already exist; it MUST NOT introduce a stored phase field or any second source of truth for phase.
- **FR-002**: The derivation MUST be total — every observable artifact state maps to exactly one phase or one terminal side-state — and MUST be deterministic (identical inputs → identical phase).
- **FR-003**: The system MUST derive `designing` from the presence of the node's `design:` pointer (not from whether the design file has been written), so derivation stays monotonic from the moment the phase is entered.
- **FR-004**: The system MUST recognize the terminal side-states `blocked`, `cancelled`, and `retired`, reachable from any phase via an induct-style move.

**Governed WORKFLOW.md**

- **FR-005**: The phase vocabulary, derive predicates, gate criteria, and transition effect manifests MUST live in a single governed, grammar-parsed `WORKFLOW.md`; the engine MUST read them from the document and MUST NOT hardcode them.
- **FR-005a**: `WORKFLOW.md` MUST be a **plugin-bundled default** (the canonical stack-control lifecycle) that an installation MAY override via the customize seam; the engine MUST resolve it through the existing override-resolution order (installation copy wins, else the bundled default) — the same pattern as built-in templates and doctor rules. *(Clarified 2026-06-16.)*
- **FR-006**: `WORKFLOW.md` MUST support two unit kinds — **phase** (publishing derive predicate, work, entrance criteria, exit criteria, next) and **transition** (publishing codename, exit-gate, ordered effects).
- **FR-007**: A malformed `WORKFLOW.md` MUST fail loud naming the grammar violation; the engine MUST NOT fall back to built-in defaults.

**Stage gates**

- **FR-008**: Every entrance and exit criterion MUST be a computable true/false predicate over artifacts that already exist (e.g. file exists, section present, count ≥ N, tasks 100%, tree clean, recorded approval marker present).
- **FR-009**: A criterion that encodes a judgment MUST be expressed as a check of a recorded operator decision (an approval marker), never as a subjective evaluation performed at evaluation time. The approval marker MUST be stored as **a field on the roadmap node** (e.g. `design-approved:`), co-located with the `design:` / `spec:` pointers — one governed surface. *(Clarified 2026-06-16.)*
- **FR-010**: In v1, gates MUST be evaluated and REPORTED but MUST NOT be enforced as refusals (no hard gating). The criteria themselves are not softened — only the refusal is deferred.

**Query surface (read-only)**

- **FR-011**: `workflow status {item}` MUST report whether the current stage's exit criteria are all met and MUST enumerate the unmet criteria (M of N met).
- **FR-012**: `workflow can-enter {item} {stage}` MUST report whether the target stage's entrance criteria are met and MUST enumerate what is missing.
- **FR-013**: `workflow next {item}` MUST derive the current phase, name the next transition and the WORK skill/verb that performs it, and preview the effects that an advance would fire.
- **FR-014**: All query verbs MUST be read-only — writing nothing and producing identical output on re-run with no on-disk change.

**Advance + effects**

- **FR-015**: `workflow advance {item}` MUST support a dry-run preview (default) and an `--apply` mode; the preview MUST write nothing and show the exact ordered effects.
- **FR-016**: `--apply` MUST be atomic: it requires the advance-touched paths to be clean (refusing loud on a dirty tree so uncommitted operator work is never clobbered), validates that every effect can fire, applies all non-commit bookkeeping mutations, then fires `commit` LAST as the transaction boundary; on any failure before the commit it MUST restore the advance-touched paths.
- **FR-017**: `workflow advance` MUST fire only lightweight bookkeeping effects; heavy or interactive phase work (the design backend, the Spec Kit chain, `execute`, `govern`, `release`) MUST NOT be an advance effect — it is the explicit skill the agent runs, named by `workflow next`.
- **FR-018**: Every effect MUST be a call to a governed verb from a fixed vocabulary, never a prose instruction. The v1 palette is: `roadmap advance {item} --to {status}`; `roadmap reconcile`; `journal append {message}`; `doc set-status-field {path} {field} {value}`; `workflow link-design {item} {design-doc}`; `workflow link-spec {item} {spec-dir}`; `commit {templated-message}` (always last).
- **FR-019**: The system MUST provide the new governed verbs `workflow link-design` (set the node `design:` pointer) and `workflow link-spec` (set the node `spec:` pointer).
- **FR-020**: When a transition needs an effect not in the fixed vocabulary, the resolution MUST be to add a governed verb, never to author a prose effect.

**Designing phase + frontend over backend**

- **FR-021**: The system MUST provide `/stack-control:design` — an opinionated frontend that drives a swappable design backend selected by capability (default `superpowers:brainstorming`), with NO branch on the backend's vendor identity.
- **FR-022**: The design backend MUST run in-session (the design conversation is interactive); it MUST NOT be isolated in a non-interactive sub-agent or shelled out.
- **FR-023**: The backend contract (capability-selected) MUST be: conduct a structured exploration → emit a design record at the installation-anchored convention path with the required sections → support an approval gate → be drivable in-session.
- **FR-024**: The frontend MUST declare its opinion once as a named house-rules block that is both injected into the backend conversation AND checked by the `design-to-spec` exit gate.
- **FR-025**: The frontend's opinion MUST: (a) override the backend's YAGNI with capture-everything (re-injected at the backend's scope-check step); (b) redirect the backend's terminal handoff to Spec Kit (`/stack-control:define`), never `writing-plans`; (c) anchor to a roadmap item and set the `design:` pointer on entry; (d) enforce a required-section contract the exit gate can mechanically verify.
- **FR-026**: The design record MUST contain the required sections: problem domain, solution space (including rejected alternatives), decisions, open questions, and provenance.
- **FR-027**: The `design-to-spec` exit gate MUST verify the required sections are present, the solution-space section lists ≥2 alternatives, and a recorded operator-approval marker is present.

**Governance-graduation record (TASK-19)**

- **FR-028**: The system MUST provide a durable on-disk govern-convergence record **mechanism** — a single symmetric mechanism keyed by mode able to record BOTH `govern --mode spec` (spec-govern convergence) and impl govern (impl-govern convergence), written inside the installation domain. The **mechanism** is retained for both modes; whether a given mode's gate is *enforced by default* is governed by FR-029. *(Clarified 2026-06-16; mechanism symmetric, gate enforcement per the workflow-policy decision.)*
- **FR-029**: The `governing → shipped` exit criterion MUST be decided by the **impl-govern** convergence record (recorded ∧ converged) — required and mechanical; it MUST NOT infer convergence from tasks-completion or any agent assertion. The `specifying → implementing` signal MUST, **by default**, derive from `speckit-analyze`-clean (spec-chain completion); the **spec-govern** convergence record is an **opt-in** stricter gate (used only when the operator runs `govern --mode spec`), never default-required while spec audit-barrage is parked (workflow-policy decision 2026-06-16). The spec-govern gate MUST be re-enableable as default without re-design (FR-028 mechanism retained).

**Installation-anchor invariant**

- **FR-030**: Every artifact the workflow authors (governed `WORKFLOW.md`, design record, govern-convergence record, checkpoint / effect bookkeeping) MUST be anchored inside the nearest-enclosing installation; it MUST NOT default to the adopter's repo root.
- **FR-031**: A state-writing workflow verb run with no enclosing installation MUST refuse loud (directing to `stackctl setup`), consistent with every other state-writing verb.

**Mid-stream re-design**

- **FR-032**: The system MUST support a `* → designing` re-entry transition that (a) opens a new revision of the design record rather than overwriting it, (b) marks the affected downstream phase checkpoints stale (reusing the existing checkpoint-staleness machinery), and (c) preserves the existing spec dir as a new revision rather than discarding it. *(Design depth for this requirement is the thinnest in the feature — see Assumptions / Open questions; the planning phase is expected to expand its interaction with checkpoint-staleness and spec-revisioning.)*

### Key Entities

- **Workflow phase**: a vocabulary unit in `WORKFLOW.md` — derive predicate, work, entrance criteria, exit criteria, next.
- **Workflow transition**: an edge unit in `WORKFLOW.md` — codename, exit-gate, ordered effect manifest.
- **Phase derivation inputs**: the pre-existing artifacts the phase is a function of (backlog presence, node status, `design:` pointer, `spec:` pointer, spec-govern convergence, `tasks.md` completion, govern-convergence record, release tag).
- **Gate criterion**: a computable true/false predicate over existing artifacts; a judgment criterion is the check of an approval marker.
- **Effect**: a call to a governed verb from the fixed v1 vocabulary; the ordered set is an effect manifest.
- **House-rules block**: the frontend's named, single-source opinion — injected into the backend AND checked by the exit gate.
- **Design record**: the `designing`-phase artifact (problem domain, solution space incl. rejected alternatives, decisions, open questions, provenance), written at the installation-anchored convention path.
- **Govern-convergence record**: a durable on-disk record that governance converged — a single mode-keyed mechanism covering both spec-govern (the `specifying → implementing` signal) and impl-govern (the `governing → shipped` gate input; TASK-19).
- **Approval marker**: a recorded operator decision that makes a judgment criterion mechanical, stored as a field on the roadmap node (e.g. `design-approved:`), co-located with the `design:` / `spec:` pointers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every fixture item at a known artifact state, the engine derives exactly one phase, deterministically (identical inputs → identical phase) — 100% of fixture cases.
- **SC-002**: Querying a stage reports the exact set of unmet criteria; re-running a query with no on-disk change produces identical output and zero writes, in every covered path.
- **SC-003**: Every gate criterion published in a fixture `WORKFLOW.md` evaluates to a definite true/false on fixtures; no criterion requires human judgment at evaluation time (judgment criteria resolve to an approval-marker check).
- **SC-004**: `workflow advance --apply` leaves either all effects applied and captured in a single commit, or the working tree restored with nothing committed — verified by fault injection at each effect position, 100% of injected-failure cases.
- **SC-005**: In an adopter-repo fixture, no artifact the workflow authors resolves outside the installation tree (isolation probe green).
- **SC-006**: The `governing → shipped` gate is decided by the on-disk govern-convergence record in 100% of governed fixtures; no fixture reaches `shipped` on tasks-completion or agent assertion alone.
- **SC-007**: A design record missing any required section, or with fewer than 2 solution-space alternatives, or lacking the approval marker, fails the `design-to-spec` exit gate 100% of the time.
- **SC-008**: The full workflow surface needed to author and run the *next* feature can be exercised through these verbs without manual re-assembly (self-hosting evidence, consistent with `define`/`extend`/`execute`).

## Assumptions

- **Terminology**: "stage" and "phase" are used interchangeably throughout this spec for the same lifecycle unit (a `phase` unit in `WORKFLOW.md`). The query verb `workflow can-enter {item} {stage}` and the derived "current phase" refer to the same concept; there is no distinction between a stage and a phase.
- The roadmap node remains the unit; the `roadmap` node-reader is consumed by the `workflow` family rather than reimplemented (ratified decision 1/2).
- Existing `tasks.md` phases and the 021 checkpoint / staleness machinery remain the implementation substrate for phase-scope and freshness; this feature layers phase-awareness and the governed gates on top rather than replacing them.
- The document-primitives grammar engine (`ROADMAP.md`, `DESIGN-INBOX.md`) is reused for `WORKFLOW.md` (third use), not built anew.
- `superpowers:brainstorming` is the default design backend and already supplies the 2–3-alternatives method, the user-review gate, the self-review, and the hard-gate; the frontend adds the mechanical required-section exit gate and the stack-control opinion overrides on top.
- v1 gate teeth are report-only (no refusals); enforcement-as-refusal is a later, explicit operator decision, not assumed here.
- **Spec audit-barrage is parked from the default workflow** (workflow-policy decision 2026-06-16): `specifying → implementing` derives from `speckit-analyze`-clean by default; the spec-govern gate is opt-in. Re-enabling spec audit-barrage as a default-required gate, once the spec-audit protocol's kinks are worked out, is tracked as **TASK-138**. Implementation audit-barrage is unchanged.
- **Open question carried to planning (FR-032 / US8)**: the precise interaction of `* → designing` re-entry with checkpoint-staleness invalidation scope and spec-dir revisioning is the least-designed area and is expected to be expanded during `/speckit-plan`; it is captured here as a requirement with known open depth, not cut.
- **Open question carried to planning**: whether the side-state induct transitions (`blocked`/`cancelled`/`retired`) are authored as first-class `WORKFLOW.md` transitions in v1 or inherited from the existing roadmap status moves — captured, to be settled in planning, not silently scoped out.
