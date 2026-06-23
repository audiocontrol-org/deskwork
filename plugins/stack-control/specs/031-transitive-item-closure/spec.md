# Feature Specification: Transitive item closure + the post-ship terminal stage

**Feature Branch**: `031-transitive-item-closure` (spec-dir numbering on the long-lived branch; no per-spec branch)

**Created**: 2026-06-23

**Status**: Draft

**Input**: User description: design record `docs/superpowers/specs/2026-06-23-transitive-item-closure-design.md` (operator-approved 2026-06-23); roadmap item `multi:gap/transitive-item-closure`.

> Capture mode (project rule "capture everything; scoping is a later pass"): this
> spec records the full known surface. Scoping into phases is `tasks.md`'s job
> after `/speckit-plan`. No YAGNI cuts are inserted here.

## Clarifications

### Session 2026-06-23

- Q: Which surface carries the operator-confirm for closing + advancing an item to the terminal `closed` phase? → A: `advance --to closed` is the single move — it shows the full transitive cascade as a dry-run, and an explicit `--apply` runs the cascade and sets status `closed` (one operator-confirmed action; no new skill; reuses the dry-run/`--apply` discipline).
- Q: When the `part-of` subtree contains a child that is NOT yet terminal, what should the cascade do? → A: Skip-and-report — close the terminal parts, list the skipped in-flight child(ren) in the dry-run, and let the parent still advance to `closed`. An in-flight sibling does not block closing resolved work.
- Q: Should the cascade also run a closure pass over `cancelled`/`retired` members it encounters in the subtree? → A: Yes — uniform terminal handling: descend through them and close their recorded `closes:` ids too (with a reason reflecting their terminal status), then continue to their children.

## User Scenarios & Testing *(mandatory)*

The actors are the **operator** and the **agent** acting on the operator's behalf,
working on any stack-control installation (the project's own self-hosting *and*
generic adopters governing a markdown collection with no install/release step).

### User Story 1 — Close a shipped item and everything it contains, in one confirmed move (Priority: P1)

When a roadmap item ships, the operator wants to close it **and** everything it
contains — its own resolved backlog ids and the resolved ids of every item in its
`part-of` subtree — without hand-closing each task. Today this is a manual,
N-edit chore (16 ids were hand-closed at the `govern-030-hardening` closeout).

**Why this priority**: This is the feature's core value — the "one mechanical move"
the roadmap item names. It delivers value even before the terminal-stage wiring
(US3) exists, run as an explicit verb against a node whose `closes:` is populated.

**Independent Test**: On a fixture roadmap with a parent node that records
`closes:` ids and has `part-of` children that each record their own `closes:` ids,
run the cascade closer in dry-run; confirm it lists the full transitive set of
backlog ids (deduped across multiple parents); apply; confirm every listed id is
`Done` and a re-run reports "already closed" without error.

**Acceptance Scenarios**:

1. **Given** a terminal parent node with `closes: TASK-1, TASK-2` and a `part-of`
   child recording `closes: TASK-3`, **When** the operator runs the cascade closer
   in dry-run, **Then** the output lists TASK-1, TASK-2, TASK-3 (and the child node)
   and changes nothing on disk.
2. **Given** the same fixture, **When** the operator confirms and applies, **Then**
   TASK-1, TASK-2, TASK-3 are all set to the terminal `Done` state with their
   closure reason recorded.
3. **Given** a node reachable from the root via two distinct `part-of` parents,
   **When** the cascade runs, **Then** that node and its ids are visited exactly once
   (no double-close, no error).
4. **Given** a `closes:` id that is already `Done`, **When** the cascade runs,
   **Then** it is reported as already-closed and the run still succeeds (idempotent).

---

### User Story 2 — Record a node's resolved backlog ids without hand-editing markdown (Priority: P1)

The transitive closer can only close ids that are recorded in a node's `closes:`
set (the auditable recorded-set contract — closure never infers from prose). Today
nothing populates `closes:`: `add-edge` refuses it (it is a prose comma-list, not a
unit-reference edge), so the only way to record resolved ids is editing the
markdown by hand — roughly the same effort as closing the tasks.

**Why this priority**: Without a population path, US1 has nothing to close on a
real (prose-bullet) umbrella. The two together are what make closure near-zero-touch.

**Independent Test**: Run the population verb to add and remove ids on a node and
confirm the `closes:` set reflects the change; close a backlog task that carries a
parent-node ref and confirm the closing id is auto-back-linked into that node's
`closes:`.

**Acceptance Scenarios**:

1. **Given** a node with no `closes:`, **When** the operator runs the resolve verb
   with `--add TASK-7 TASK-8`, **Then** the node records `closes: TASK-7, TASK-8`.
2. **Given** a node recording `closes: TASK-7, TASK-8`, **When** the operator runs
   the resolve verb with `--remove TASK-7`, **Then** the node records `closes: TASK-8`.
3. **Given** a backlog task carrying a parent-node ref to node N, **When** that task
   is closed (`backlog done`) or promoted, **Then** the task's id is added to node
   N's `closes:` set automatically.
4. **Given** the resolve verb invoked in dry-run, **When** it runs, **Then** it
   reports the would-be change and writes nothing until `--apply`.

---

### User Story 3 — The terminal stage makes post-ship closure un-forgettable but operator-confirmed (Priority: P1)

A shipped item is not actually finished — its contained work still needs closing,
and (for projects that release an artifact) the release still needs validating.
Today both rely on the agent remembering. The operator wants the lifecycle itself
to surface "this shipped item is not closed yet" as the pending next move, while
never closing automatically — closure is always operator-confirmed.

**Why this priority**: This is the "so that we don't forget to do it" requirement
and the home for the offing-deadlock fix. It turns US1/US2 from an optional verb
into a surfaced lifecycle step.

**Independent Test**: On a fixture installation with a `shipped` item, confirm the
status/compass report the item as **not yet terminal** with `closed` as the legitimate
next move; confirm advancing to `closed` runs the transitive cascade only after an
explicit operator confirmation and never automatically; confirm an item with no
release/install step reaches `closed` with no validation criterion blocking it.

**Acceptance Scenarios**:

1. **Given** an item at `shipped`, **When** the operator queries status / compass /
   session-start, **Then** the item is reported as not yet closed, with `closed` as
   the legitimate next move (shipped is no longer treated as terminal).
2. **Given** an item at `shipped`, **When** the operator initiates the close, **Then**
   the full transitive closure is presented as a dry-run and nothing is closed and
   the status does not advance until the operator confirms.
3. **Given** the operator confirms the close, **When** it applies, **Then** the
   transitive cascade runs and the item's status advances to the new terminal
   `closed`.
4. **Given** an item from an installation with no install/release step, **When** the
   operator closes it, **Then** closure proceeds with no validation criterion and no
   "install" assumption blocking it (install-agnostic).
5. **Given** the compass, **When** asked for the move into `closed` from a phase
   other than `shipped`, **Then** it refuses (`closed` is only reachable from
   `shipped`).

---

### User Story 4 — Post-ship validation never deadlocks the audit (Priority: P2)

The offing team hit a deadlock: cross-model govern/audit only runs once every
`tasks.md` task is complete, but a post-install validation step was authored as a
`tasks.md` task — and it cannot pass until the artifact is published, which only
happens after shipping. The operator wants this structurally impossible.

**Why this priority**: It is a correctness/process guarantee that follows from US3's
design (validation is an operator-confirm guard at the terminal stage, not a task or
a criterion). Captured as its own story so it is independently verifiable.

**Independent Test**: Confirm that governance over a feature never waits on a
publish-dependent validation step, because no such step exists in `tasks.md` or as a
phase entrance criterion; the only post-ship "validation" is the operator's
confirmation at close time.

**Acceptance Scenarios**:

1. **Given** a feature whose work is complete and governed clean, **When** the audit
   runs, **Then** it does not block on any post-install/publish-dependent task
   (there is none to block on).
2. **Given** the terminal stage, **When** the operator closes the item, **Then** any
   release validation they choose to perform happens at the operator-confirm guard
   and is not modeled as a workflow criterion or a `tasks.md` task.

---

### Edge Cases

- **Partial subtree** — a `part-of` child in the subtree is NOT in a terminal
  status yet (still in-flight). Resolved (2026-06-23): the cascade **skips and
  reports** the non-terminal child (listed clearly in the dry-run), closes the
  terminal parts, and the parent still advances to `closed`. An in-flight sibling
  does not block closing resolved work; in-flight children remain tracked.
- **Cancelled/retired members of the subtree** — Resolved (2026-06-23): **uniform
  terminal handling** — the cascade descends through `cancelled`/`retired` members,
  closes their recorded `closes:` ids too (with a reason reflecting their terminal
  status), and continues to their children.
- **Already-closed ids** — a `closes:` id already `Done` is a no-op; the run reports
  "already closed" and still succeeds.
- **Empty `closes:` on a node in the subtree** — a node that records no ids
  contributes none; the walk continues to its children.
- **Cyclic / diamond `part-of`** — a multi-parent node reachable by two paths is
  visited once (visited-Set); the walk terminates.
- **Unknown id in `closes:`** — an id recorded on a node that the backlog does not
  know is surfaced as an error in dry-run (consistent with today's `close-related`
  fail-loud), before any apply.
- **Re-run after a partial apply** — re-running the cascade is safe and converges
  (idempotent); ids already closed are reported, not re-errored.
- **Auto-back-link when no parent-node ref exists** — closing a task with no
  parent-node ref simply does not back-link (no error); the explicit resolve verb
  remains the path to record it.

## Requirements *(mandatory)*

### Functional Requirements

**Transitive closure**

- **FR-001**: The system MUST provide a cascade closure operation that, from a
  starting roadmap node, walks the node's `part-of` subtree and closes every node's
  recorded `closes:` backlog ids.
- **FR-002**: The cascade MUST dedup across the subtree (a node reachable via
  multiple `part-of` parents is processed exactly once) and MUST terminate on
  diamond/multi-parent graphs.
- **FR-003**: The cascade MUST default to a dry-run that lists the full transitive
  set (nodes + backlog ids) and writes nothing, and MUST require an explicit apply to
  mutate (mirrors the existing `close-related` dry-run/`--apply` discipline).
- **FR-004**: Closing a backlog id MUST be idempotent — an already-`Done` id is
  reported as already-closed and does not fail the run.
- **FR-005**: The cascade MUST preserve the auditable recorded-set contract (023
  FR-003): it closes only ids recorded in `closes:`/`ref:`, never inferred from prose.
- **FR-006**: The system MUST provide a reverse-edge `part-of`-children lookup
  (children of a given parent) that the cascade walks, consistent with the existing
  reverse-edge reasoning pattern.
- **FR-007**: The cascade MUST apply **uniform terminal handling**: it descends
  through `cancelled`/`retired` members of the subtree and closes their recorded
  `closes:` ids (with a reason reflecting their terminal status), then continues to
  their children.
- **FR-007a**: When the subtree contains a non-terminal (in-flight) child, the
  cascade MUST **skip and report** that child (surface it in the dry-run) and still
  close the terminal parts; a non-terminal child MUST NOT block the parent's
  closure or its advance to `closed`.

**`closes:` population**

- **FR-008**: The system MUST provide a verb to record resolved backlog ids onto a
  node's `closes:` set — adding and removing ids — without requiring a hand-edit of
  the markdown, and without misusing the unit-reference-edge machinery that refuses
  the prose `closes:` field.
- **FR-009**: The population verb MUST default to dry-run and require an explicit
  apply to write.
- **FR-010**: Backlog tasks MUST support an optional parent-node reference recording
  the roadmap node a task belongs to.
- **FR-011**: Closing a task (`backlog done`) or promoting it MUST auto-back-link the
  task's id into its parent node's `closes:` set when the task carries a parent-node
  ref; absence of the ref MUST be a no-op (not an error).

**The terminal stage**

- **FR-012**: The lifecycle workflow MUST gain a new terminal phase `closed` after
  `shipped`, and the roadmap status vocabulary MUST gain a matching terminal status
  `closed` (joining `shipped`/`cancelled`/`retired` in the terminal set).
- **FR-013**: `shipped` MUST no longer be treated as the lifecycle's terminal phase;
  status/compass/session-start MUST surface a `shipped` item as not yet closed, with
  `closed` as the legitimate next move ("don't forget" surfaced mechanically).
- **FR-014**: Phase-derivation MUST map roadmap status → phase by name (retiring the
  `status === shipped → last-phase` special-case) so `shipped` and `closed` derive to
  their own phases.
- **FR-015**: The compass MUST treat `shipped → closed` as the legitimate next move
  and MUST refuse `closed` from any phase other than `shipped`.
- **FR-016**: Entering `closed` MUST be guarded by an explicit operator confirmation;
  the transitive cascade MUST NOT fire automatically. Resolved (2026-06-23): the
  confirm surface is the **`advance --to closed` move** — it presents the full
  transitive cascade as a dry-run and requires an explicit `--apply` to run the
  cascade and set status `closed` (the lifecycle advance and the closure are one
  operator-confirmed action; no new skill). Per `enforcement-lives-in-skills.md` the
  firing surface is this CLI verb + the skill body that drives it, never a git hook.
- **FR-017**: There MUST be NO post-install/release validation entrance criterion on
  `closed` (or any stage), and NO assumption that an install/release step exists.
  Whatever the operator inspects before confirming is project-specific and outside
  the workflow's contract.

**Deadlock prevention**

- **FR-018**: Post-ship validation MUST NOT be representable as a blocking workflow
  criterion or a `tasks.md` task that governance waits on; the only post-ship
  validation is the operator-confirm guard at close time, so governance never blocks
  on a publish-dependent step.

### Key Entities

- **Roadmap node** — a unit of work with a `status`, `part-of` parents, and a
  `closes:` set (a prose comma-list of backlog ids). Gains the new terminal status
  `closed`.
- **`closes:` set** — the auditable, recorded list of backlog ids a node resolves;
  the only ids the closer touches.
- **Backlog task** — a found-work item with a status (`To-Do`/`In-Progress`/`Done`);
  gains an optional parent-node reference enabling auto-back-link.
- **Lifecycle phase** — the derived workflow position; gains the terminal `closed`
  phase after `shipped`.
- **Cascade plan** — the dry-run artifact: the transitive set of nodes + backlog ids
  the close would touch, presented for operator confirmation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Closing a shipped umbrella and its entire `part-of` subtree takes a
  single confirmed operation, replacing the per-id hand-closing it requires today
  (the `govern-030-hardening` closeout's 16 hand-closed ids would have been one move).
- **SC-002**: Recording a node's resolved ids takes a single verb call, with no
  hand-edit of the roadmap markdown.
- **SC-003**: After a feature ships, the operator is shown — without prompting — that
  the item is not yet closed and that `closed` is the next move; the obligation is
  never silently dropped.
- **SC-004**: Closure never occurs without an explicit operator confirmation (zero
  automatic closes).
- **SC-005**: An installation with no install/release step can take an item all the
  way to `closed` with no validation step blocking it.
- **SC-006**: Governance/audit never blocks on a post-install/publish-dependent
  step (the offing deadlock cannot recur).
- **SC-007**: Re-running a cascade close is safe (idempotent) — already-closed ids
  are reported, never errored.

## Assumptions

- **Single-branch numbering**: This program runs on one long-lived branch with
  numbered spec dirs (`specs/NNN-…`); the `before_specify` git.feature branch hook is
  not used (consistent with the 30 existing specs and the succession-rule in-tree
  model). The spec dir is resolved via the `<!-- SPECKIT … -->` marker in `CLAUDE.md`.
- **OQ3 default (parent-node ref shape)**: a single optional scalar ref on the
  backlog task naming the roadmap node id; `promote` sets it as part of recording the
  promotion linkage; `capture` may accept it but does not require it; `done` reads it
  to perform the auto-back-link. Refined in `/speckit-plan`.
- **OQ4 default (close surface)**: the close is surfaced by the same skill that runs
  the cascade (the resolution of FR-016 picks the exact surface); for self-hosting,
  the operator validates the installed plugin at that confirm step. Per
  `enforcement-lives-in-skills.md` the firing surface is a skill body + CLI verb.
- **OQ8 default (idempotence)**: closure is idempotent and a cascade re-run converges;
  this is assumed, not an open fork.
- **OQ9 default (decomposition)**: one feature spec, with `tasks.md` phases (1) `closed`
  phase/status + derivation/compass, (2) `roadmap resolves` + auto-back-link + task
  parent-node ref, (3) cascade closer + reverse-edge helper, (4) operator-confirm
  close wiring. Confirmed/adjusted in `/speckit-plan` + `/speckit-tasks`.
- **Backend assumption**: the backlog backend's close operation already sets the
  terminal `Done` state and records a closure reason; the cascade reuses it.
- **Rejected directions are not re-proposed** (recorded in the design record):
  two-phase `validating→closed`; transition-effect bundling; task→node data-flow
  inversion; validation-as-entrance-criterion; config-gated verification criterion;
  automated smoke framework.
