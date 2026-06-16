# Feature Specification: Lifecycle Compass — an un-skippable workflow

**Codename**: `multi/lifecycle-compass` (part-of `multi:feature/lifecycle-industrialization`)

**Feature Branch**: `feature/stack-control` (session-pinned; not a per-spec branch)

**Created**: 2026-06-16

**Status**: Draft

**Input**: Author the spec from the approved design record at
`plugins/stack-control/docs/superpowers/specs/2026-06-16-lifecycle-compass-design.md`
(read it for the full reasoning, the weighed alternatives, and the verified
blockers). This spec captures that design into Spec Kit form.

## Context

The 022 parseable-lifecycle-workflow engine derives an item's phase and *reports*
gate state — but **enforces nothing** (FR-010: gates reported, never refused). A
lifecycle that can be bypassed guarantees nothing. This was proven, not theorized:
while dogfooding, the agent built feature 023 **idea → spec.md → code → PR with no
roadmap node ever created** — the workflow was blind to the whole feature; the
orphan was caught only because the agent happened to run `reconcile`.

The governing operator constraint (the thesis applied):

> **Compliance must be mechanical — it cannot depend on operator vigilance OR on
> agent discipline.** You don't fix agents by yelling (rules); you make the failure
> state mechanically impossible.

This feature makes the workflow the **driver**, not a passive observer, via a single
orientation-and-enforcement primitive — the **compass** — that every lifecycle skill
consults, so an agent following its own skills cannot skip a step.

### Originating inputs

- The 022 engine (derivation, gate-eval, governed `WORKFLOW.md`) this extends.
- **TASK-83 / AUDIT-20260614-28** — backtick code-span misread as a governed path
  crashes the govern payload assembler (reproduced this session); a prerequisite.
- **TASK-139** — convergence-record basename collision; the same feature-identity
  question this feature must settle.

## Ratified framing decisions (2026-06-16, settled — do not relitigate)

These were operator decisions captured in the design record; they are inputs, not
open questions.

1. **Mechanical, not vigilant.** The mechanism may not rely on the operator watching
   or the agent remembering. Enforcement lives in skill bodies + CLI verbs (per
   `.claude/rules/enforcement-lives-in-skills.md`), never git hooks or CI.
2. **The compass is the single enforcement brain.** One primitive, consulted by every
   lifecycle skill — not per-skill bespoke gate logic (which would drift).
3. **A gate cannot enforce a step that cannot run.** Making govern runnable on the
   session-pinned branch (+ TASK-83) is in scope as a prerequisite, because the
   back-half gate depends on it.
4. **Honest boundary.** The mechanism makes the *agent* (which follows its skills)
   unable to skip; a human with raw `git`/`gh` can override. This is acceptable — the
   threat model is agent drift, not deliberate human bypass — and MUST be recorded,
   not overclaimed.

## Clarifications

### Session 2026-06-16

- Q: Is the compass intent vocabulary a fixed enumeration, or free-form NL mapped
  heuristically? → A: **Fixed enumeration of lifecycle skill/verb names; an unknown
  intent refuses (fail-loud).** A heuristic NL→phase mapping would reintroduce the
  agent-judgment the feature exists to remove; the verdict must be mechanical.
- Q: Is the FR-010 report-only retirement global or phased? → A: **Phased — enforce
  the entry gate (orphan/capture) and the back-half `governing → shipped` gate first;
  mid-pipeline gates stay advisory in the *engine's* `advance` path.** Order is still
  enforced mid-pipeline by the compass embedded in the skills (US2/FR-006); FR-010 is
  only about the engine's own advance path, and a global flip risks blocking legit
  in-flight work before the govern fixes are proven.
- Q: Do the govern-runnability + canonical-identity fixes ship as separate
  prerequisite features, or fold into this spec? → A: **One spec — but the
  govern-runnability fixes (FR-011/FR-012) and the canonical identity (FR-013) are the
  FIRST task phases**, so the compass enforcement builds on an already-runnable govern
  ("can't enforce a step that can't run").

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The compass orients and diffs intended action (Priority: P1) 🎯 MVP

An agent, about to act on a roadmap item, invokes the compass against that item with
its intended action and gets a deterministic verdict on whether that action is the
legitimate next move — *before* it acts, not after.

**Why this priority**: This is the primitive every other story consumes. It has
standalone value: even before any skill embeds it, an agent can self-orient and catch
its own skips.

**Independent Test**: Given fixture items at known artifact states, `compass <item>`
reports the derived phase, the single legitimate next action, and the gate state;
`compass <item> --intent <action>` returns `on-course` / `ahead` / `behind` /
`off-rail` with a gating exit code, deterministically and read-only.

**Acceptance Scenarios**:

1. **Given** an item in `planned` and an intended action that belongs to a later
   phase (e.g. authoring a spec), **When** the compass diffs it, **Then** it returns
   `ahead`, **names the skipped step** (`open-design`), and exits non-zero.
2. **Given** an item and the intended action that *is* its legitimate next move,
   **When** the compass diffs it, **Then** it returns `on-course` and exits zero.
3. **Given** an item with no roadmap node (an orphan spec dir), **When** the compass
   runs, **Then** it returns `off-rail` and exits non-zero, naming the missing node.
4. **Given** any item, **When** the compass runs twice with no on-disk change,
   **Then** it writes nothing and produces identical output (read-only, deterministic).

---

### User Story 2 - Every lifecycle skill refuses an off-rail action (Priority: P1)

Each lifecycle skill (`define`, `execute`, the `after_implement` govern hook, `ship`,
`release`, `session-end`) opens by consulting the compass for its own item + intent;
a non-zero verdict is a hard refusal naming the violated invariant. An agent following
its skills therefore cannot skip a step.

**Why this priority**: This is what turns the compass from an advisory map into the
enforcement surface. Without it, the compass is just another report the agent can skip.

**Independent Test**: Driving a lifecycle skill on an item whose compass verdict is
`ahead`/`off-rail` refuses loud (non-zero, names the missing prior step) and performs
none of the skill's work; on an `on-course` item it proceeds.

**Acceptance Scenarios**:

1. **Given** an item in `planned` (no design record), **When** the agent invokes the
   spec-authoring skill on it, **Then** the embedded compass verdict is `ahead` and
   the skill refuses, naming the skipped `designing` step.
2. **Given** an orphan spec dir (spec, no node), **When** any lifecycle skill resolves
   it, **Then** the compass verdict is `off-rail` and the skill refuses.
3. **Given** an item whose compass verdict is `on-course`, **When** the skill runs,
   **Then** it proceeds normally (the gate is transparent on the happy path).

---

### User Story 3 - Capture is fused to authoring; orphans are impossible through the front door (Priority: P1)

Authoring a spec creates its roadmap node in the same move. A spec dir cannot come to
exist (through the supported path) without a node, and an orphan spec dir is a hard
error the compass reports — not a `reconcile` footnote.

**Why this priority**: The demonstrated failure was an orphan. Closing the front door
to orphans is the entry-half of "un-skippable."

**Independent Test**: Authoring a spec through the front door yields both a spec dir
and a roadmap node at a consistent phase; a hand-created orphan spec dir is flagged as
a hard error by the compass and by every verb that resolves specs.

**Acceptance Scenarios**:

1. **Given** the spec-authoring path, **When** a new spec is created, **Then** a
   roadmap node referencing it exists at a consistent phase in the same operation.
2. **Given** a spec dir with no roadmap node, **When** the compass (or any
   spec-resolving verb) runs against it, **Then** it is a hard error (not a passive
   reconcile note).

---

### User Story 4 - Govern is runnable on the session-pinned branch (Priority: P1)

`govern` resolves the feature from the item's recorded spec pointer / the SPECKIT
marker, not the branch slug — so it works on the long-lived `feature/stack-control`
branch that carries many features — and TASK-83 no longer crashes the payload
assembler. The back-half gate the compass enforces is therefore satisfiable.

**Why this priority**: A gate cannot enforce a step that cannot run. Today
`govern --mode implement` FATALs "feature not found" on this branch, and even with an
explicit feature it crashes on `/stack-control:*` backtick spans. Without this, the
`governing → shipped` gate would block all work instead of enforcing the step.

**Independent Test**: On the session-pinned branch, `govern` for an item resolves its
feature from the spec pointer / SPECKIT marker (no branch-slug FATAL) and assembles a
payload without misreading a backtick skill-reference span as a governed path.

**Acceptance Scenarios**:

1. **Given** the session-pinned branch and an item with a `spec:` pointer, **When**
   govern runs for that item, **Then** it resolves the feature without a branch-slug
   "feature not found" FATAL.
2. **Given** a spec/tasks doc containing a `` `/stack-control:define` `` backtick span,
   **When** govern assembles the payload, **Then** the span is not treated as a
   governed filesystem path (no "escapes the installation root" FATAL).

---

### User Story 5 - Gates are refusals, not reports (Priority: P2)

The 022 v1 report-only posture (FR-010) is retired where enforcement applies: the
compass verdict is enforced by the embedding skills, and the workflow's own
`advance`/transition path refuses on an unmet gate rather than only reporting it.

**Why this priority**: The teeth. Report-only is why skipping was free. P2 because the
compass + skill embedding (US1/US2) already deliver enforcement at the skill surface;
this story extends it into the engine's own advance path.

**Independent Test**: An `advance`/transition with an unmet exit gate refuses loud
(not merely prints the unmet criteria) on the enforced gates.

**Acceptance Scenarios**:

1. **Given** an item whose current-phase exit gate is unmet, **When** an enforced
   transition is attempted, **Then** it refuses loud naming the unmet criteria.
2. **Given** an item whose exit gate is met, **When** the transition runs, **Then** it
   proceeds.

---

### User Story 6 - One canonical feature identity across compass, govern, and close-related (Priority: P2)

The roadmap node, its spec dir, and govern's notion of "the feature" share **one
canonical identity** so the compass, govern, the convergence record, and
`close-related` all resolve the same item the same way — eliminating the
basename-collision class (TASK-139) and the branch-slug mismatch (US4).

**Why this priority**: The resolution bugs (US4) and the convergence-record collision
(TASK-139) are the same root: three subsystems identify a feature three different ways
(branch slug vs spec-dir basename vs node id). P2 because US4 delivers the immediate
unblock; this story makes the identity principled rather than patched.

**Independent Test**: Two items whose spec dirs share a basename do not collide on any
identity-keyed artifact; the compass, govern, and `close-related` resolve each to its
own item.

**Acceptance Scenarios**:

1. **Given** two items with distinct specs that share a spec-dir basename, **When**
   each is governed, **Then** their convergence records do not collide.
2. **Given** an item, **When** the compass, govern, and `close-related` resolve it,
   **Then** all three agree on the same canonical identity.

### Edge Cases

- An item in a terminal side-state (`blocked`/`cancelled`/`retired`): the compass
  reports the side-state and refuses linear advancement until inducted back.
- A terminal `shipped` item: the compass reports it `shipped` (terminal); lifecycle
  skills that author/advance refuse (there is no legitimate forward move).
- An intended action the compass does not recognize (unknown intent): the compass MUST
  fail loud (refuse) rather than guess a phase — an unrecognized action is not a
  license to proceed. *(See FR-004 / clarification.)*
- A lifecycle skill invoked with no item argument and no resolvable active item: the
  compass cannot orient → the skill refuses loud, directing the agent to capture/name
  the item.
- The agent writes code/files directly (not via any skill): no verb embeds the compass
  there, so the backstop is that the *finishing* skills (`ship`/`release`/
  `session-end`) refuse without the full recorded evidence chain. *(Sufficiency of
  this backstop is a clarification.)*

## Requirements *(mandatory)*

### Functional Requirements

**The compass primitive**

- **FR-001**: The system MUST provide a `workflow compass <item>` orientation surface
  that derives the item's current phase, names the single legitimate next action (the
  phase's work skill + the next transition), and reports the current gate state —
  read-only and deterministic.
- **FR-002**: `workflow compass <item> --intent <action>` MUST classify the intended
  action's phase and return a verdict against the live state: `on-course` (the
  legitimate next move), `ahead` (the action belongs to a later phase — naming the
  skipped step), `behind` (an earlier phase — re-entry/redundant), or `off-rail` (no
  node / a terminal side-state).
- **FR-003**: The verdict MUST be exposed as a process exit code (zero = proceed,
  non-zero = refuse) so a skill body can gate on it without parsing prose.
- **FR-004**: The intent vocabulary MUST be a fixed enumeration of lifecycle
  skill/verb names, each mapped to the phase it belongs to. An intended action not in
  the enumeration MUST fail loud (treated as a refusal), never silently classified as
  `on-course` and never mapped heuristically. *(Clarified 2026-06-16.)*
- **FR-005**: The compass MUST be read-only (writing nothing; identical output on
  re-run with no on-disk change).

**Enforcement embedding**

- **FR-006**: Every lifecycle skill — at minimum `define`, `execute`, the
  `after_implement` govern hook, `ship`, `release`, `session-end` — MUST open by
  consulting the compass for its item with its own action as `--intent`, and MUST
  refuse loud (performing none of its work) on a non-zero verdict, naming the violated
  invariant.
- **FR-007**: The lifecycle rules the compass enforces MUST live in exactly one place
  (the compass + the governed `WORKFLOW.md`), not be re-encoded per skill.

**Capture fusion (no orphans)**

- **FR-008**: Authoring a new spec through the supported path MUST create the
  corresponding roadmap node in the same operation; a spec dir MUST NOT be producible
  through that path without a node.
- **FR-009**: An orphan spec dir (a spec with no roadmap node) MUST be a hard error
  reported by the compass and by every verb that resolves specs — not a passive
  reconcile note.

**Gates are refusals**

- **FR-010**: The report-only retirement MUST be phased: the **entry gate**
  (orphan/capture, US3) and the back-half **`governing → shipped`** gate are enforced
  as refusals first; mid-pipeline gates remain advisory in the engine's own `advance`
  path during migration. Mid-pipeline ORDER is still enforced by the compass embedded
  in the skills (FR-006) — FR-010 governs only the engine's advance path.
  *(Clarified 2026-06-16.)*

**Govern runnable (prerequisite)**

- **FR-011**: `govern` MUST resolve the feature from the item's recorded spec pointer
  / the CLAUDE.md SPECKIT marker (not the branch slug), so it runs on the session-
  pinned branch without a "feature not found" FATAL.
- **FR-012**: The govern payload assembler MUST NOT misread a backtick code-span (e.g.
  `` `/stack-control:define` ``) as a governed filesystem path (TASK-83); a
  skill-reference span MUST NOT crash payload assembly.

**Canonical identity**

- **FR-013**: The roadmap node, its spec dir, and govern's feature notion MUST share
  one canonical feature identity that the compass, govern, the convergence record, and
  `close-related` all resolve through — eliminating the basename-collision class
  (TASK-139) and the branch-slug mismatch.

**Honest boundary**

- **FR-014**: The system MUST NOT claim to prevent a deliberate human bypass (raw
  `git`/`gh`); documentation MUST record that enforcement binds the agent (which
  follows its skills), not a human with direct tooling.

**Scope / sequencing**

- **FR-015**: The govern-runnability fixes (FR-011/FR-012) and the canonical-identity
  change (FR-013) MUST be the FIRST implementation phases of this spec — the compass +
  skill embedding (FR-001/FR-006) build on an already-runnable, identity-consistent
  govern. They are not separate features, but they sequence first because the
  back-half gate's enforceability depends on them. *(Clarified 2026-06-16.)*

### Key Entities

- **Compass verdict**: the classification of an intended action against an item's live
  phase — `on-course` | `ahead` | `behind` | `off-rail` — plus the named skipped step
  (when `ahead`) and a gating exit code.
- **Intent**: the action an agent declares it is about to take, mapped to the lifecycle
  phase that action belongs to.
- **Lifecycle skill precondition**: the embedded compass consultation that gates a
  skill's execution.
- **Canonical feature identity**: the single key the roadmap node, spec dir, govern,
  convergence record, and `close-related` all resolve a feature through.
- **Orphan spec dir**: a spec with no roadmap node — a hard error, not a passive note.

## Success Criteria *(mandatory)*

- **SC-001**: For every fixture (item state × intended action), the compass returns
  exactly one verdict, deterministically, with a matching exit code — 100% of cases;
  a skip (`ahead`) always names the jumped step.
- **SC-002**: An agent that follows the lifecycle skills cannot reach a later phase
  without the prior phase's recorded evidence — every embedded-skill fixture refuses
  an off-rail/ahead action and proceeds only on-course (no skill performs work on a
  non-zero verdict).
- **SC-003**: No spec dir can be produced through the supported authoring path without
  a roadmap node; an orphan spec dir is a hard error in 100% of resolving-verb fixtures.
- **SC-004**: On the session-pinned branch, govern resolves a feature and assembles a
  payload (no branch-slug FATAL, no backtick-span crash) in 100% of governed fixtures,
  including a spec containing a `/stack-control:*` backtick span.
- **SC-005**: Two specs sharing a spec-dir basename never collide on any
  identity-keyed artifact (convergence record, compass resolution).
- **SC-006**: Re-running the demonstrated failure (author a feature without capture)
  through the lifecycle skills is refused at the first skipped step — the 023-class
  failure is mechanically impossible for an agent following its skills.

## Assumptions

- **Capture everything; scope later.** Per the project's capture-don't-cut rule, this
  spec records the full surface (compass + embedding + capture-fusion + govern
  runnability + canonical identity + report-only retirement). The sequencing within it
  is settled by FR-015 (govern-runnability + identity lead).
- **Capture-fusion mechanics** (default applied): the spec-authoring front door
  (`define` / `speckit-specify` path) creates the node; the node id derives from the
  canonical feature identity (FR-013) so it round-trips with the spec dir.
- **Legacy migration** (default applied, not a blocking clarification): the
  orphan-is-hard-error gate applies to new work; the 21+ already-shipped nodes (now
  reported `shipped` via the terminal-status derivation fix) are grandfathered, and
  existing in-flight items are reconciled (flagged for backfill), not refused
  retroactively.
- The 022 engine (derivation, gate-eval, governed `WORKFLOW.md`, the convergence
  record) is the substrate this composes; the compass reuses derivation + gate-eval
  rather than reimplementing phase logic.
- Enforcement lives in skill bodies + CLI verbs (`enforcement-lives-in-skills.md`);
  no git-hook or CI enforcement is introduced.
- The honest boundary (FR-014) is a documentation requirement, not a capability gap to
  close.
