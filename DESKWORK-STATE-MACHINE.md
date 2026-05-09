<!--
  Canonical state machine spec for deskwork (and transitively, deskwork-studio).
  THIS DOCUMENT IS THE ONE SOURCE OF TRUTH. Code, skill prose, mockups, and
  documentation that contradict it are bugs to be fixed — not alternative
  framings to be reconciled.
-->

# Deskwork state machine

## Status

This document is **load-bearing**. It is THE canonical spec for how the deskwork plugin's state machine works. The deskwork-studio plugin is a UI surface over this state machine and inherits it transitively. Code, skill prose, mockups, and documentation that contradict this document are bugs.

If the state machine needs to change: amend this document FIRST, get operator agreement, then update implementations to match. Don't drift the implementation away and call it "the way it works now."

## TL;DR

There is **one state machine**: the entry's **stage**. Eight stages — six on a linear pipeline (Ideas → Planned → Outlining → Drafting → Final → Published) and two off-pipeline (Blocked, Cancelled). That is the entire state space.

There are three universal **verbs**: `iterate`, `approve`, `cancel`. They are operations the operator performs on an entry, not states the entry inhabits. They work at any time on any entry regardless of any other condition.

> **`iterate`** — the agent examines the entry's content for operator marginalia and reacts to them (revising the file in response).
>
> **`approve`** — graduate the entry to the next stage of the pipeline.
>
> **`cancel`** — move the entry to Cancelled (out of pipeline; resumable via `induct`).

There is no "review state." There is no "in review" state. There is no "iterating" state. There is no "approved" state. **These are not states. They are descriptions of what the operator (or agent) is doing or just did. The state machine is the stages; the verbs are what move entries between stages or revise them in place.**

## The stages — the only state machine

```
                                                  ┌───────────┐
   Ideas ──→ Planned ──→ Outlining ──→ Drafting ──→ Final ──→ Published
       \         \          \           \         \         \
        \         \          \           \         \         \
         \         \          \           \         \         \
                            ┌──────┐                          (Published is terminal
                            │      │                           — the published file
                  ◀━━━━━━━━━┤Blocked│━━━━━━━━━━━▶              is on disk; the entry
                            │      │                           does not advance further.)
                            └──────┘
                            ┌─────────┐
                  ◀━━━━━━━━━┤Cancelled│━━━━━━━━━━▶
                            └─────────┘
```

### The six pipeline stages (linear, forward-only by default)

| Stage | Meaning | Primary artifact |
|---|---|---|
| **Ideas** | Captured pitch, no commitment to publish | `idea.md` (or equivalent) |
| **Planned** | Committed to publish; pre-outline groundwork | (varies) |
| **Outlining** | Outline drafted; structural review | `outline.md` |
| **Drafting** | Body of the entry being written | `draft.md` (or final filename) |
| **Final** | Body is done; final pre-publication editorial pass | (same file as Drafting) |
| **Published** | Published to the destination collection / website | The on-disk file |

### The two off-pipeline stages

| Stage | Meaning | Re-entry |
|---|---|---|
| **Blocked** | Out of pipeline; resumable. The operator paused work on this entry without abandoning it. | `induct` puts it back to any stage. |
| **Cancelled** | Out of pipeline; abandoned. Resumable but rare — the operator decided not to publish this. | `induct` puts it back to any stage. |

## The verbs

Verbs are operations the operator performs on an entry. They are not states. An entry never "is" iterating or "is" approved — those words describe what just happened.

### `iterate`

**What it means:** the agent examines the entry's content artifact for operator marginalia (margin notes left in the studio's review surface) and reacts to them — typically by editing the file to address each note.

**When it can be invoked:** on any entry at any time. There is no "iterating state" gate. If the entry has marginalia, iterate addresses it. If the entry has no marginalia, iterate is a no-op.

**What it changes:** the content artifact on disk (per the agent's edits in response to marginalia). May also bump an iteration counter for telemetry / journal purposes (NOT a user-facing state).

**Studio surfacing:** every active-pipeline row's affordance set includes `/deskwork:iterate <slug>` (clipboard-copy). Not gated on any state.

### `approve`

**What it means:** graduate the entry to the next stage of the linear pipeline.

**When it can be invoked:** on any entry whose current stage is on the linear pipeline AND has a next stage. Specifically:
- Ideas → Planned: yes
- Planned → Outlining: yes
- Outlining → Drafting: yes
- Drafting → Final: yes
- Final → Published: NO — `publish` is the verb for graduating to Published. Approve refuses on Final.
- Published: NO — terminal stage.
- Blocked, Cancelled: NO — off-pipeline. Use `induct` to re-enter.

**What it changes:** `currentStage` advances by one position in the linear pipeline. The next stage's primary artifact is scaffolded from the just-approved file. A `stage-transition` journal event is appended.

**Studio surfacing:** every active-pipeline row whose stage has a next stage shows `/deskwork:approve <slug>` (clipboard-copy). Not gated on any "review state."

### `cancel`

**What it means:** move the entry to Cancelled (out of pipeline; abandoned).

**When it can be invoked:** on any entry whose current stage is not already Cancelled.

**What it changes:** `currentStage` becomes `Cancelled`. A `stage-transition` journal event is appended.

**Studio surfacing:** every row whose stage isn't already Cancelled shows `/deskwork:cancel <slug>` (clipboard-copy).

### `block` (and the related `induct`)

**`block`** moves an entry to Blocked. **`induct`** moves an entry from Blocked or Cancelled back to any operator-chosen pipeline stage. These are companion verbs to `cancel` for non-monotonic transitions.

### `publish`

**`publish`** is a specialized form of approve for the Final → Published transition. It exists separately from `approve` because Published has different semantics (the file gets pushed to the destination collection). The verb name disambiguates.

### `add` and `ingest`

**`add`** creates a new Ideas-stage entry from scratch. **`ingest`** backfills existing markdown content into the calendar. These are entry-creation verbs, not state-transition verbs.

## What was retired (and why this document exists)

### The retired "review state" concept

Before the 2026-04-30 pipeline redesign, deskwork had **two parallel state machines**:

1. The **calendar stage** — set by `add → plan → outline → draft → publish`.
2. The **review workflow state** — set by `review-start → iterate → approve → applied`. Values: `'in-review'`, `'iterating'`, `'approved'`.

The two ran independently and decoupled in confusing ways: an entry could be in `Drafting` while its longform review workflow had been `applied` for days. The `Review` calendar stage was unreachable. `approve` only changed the review workflow to `applied` — disk content stayed put, calendar stage stayed put. Approval was a free-floating state marker with no consequence on the pipeline.

**The redesign collapsed the two state machines into one.** Stage is the state. Approve graduates the stage. Iterate edits the file. There is no parallel review machine.

The vestigial `ReviewState = 'in-review' | 'iterating' | 'approved'` type that may still exist in the schema is **decision detritus** — a backwards-compat artifact for sidecar parsing, not a meaningful concept. It has no operational meaning. It does not gate any verb. It does not appear in any user-facing surface.

### What the migration commits established

The migration happened in three stages and is mostly already implemented:

1. **`5687404` (2026-04-30)** — the design spec. Names the collapse; defines universal verbs.
2. **`07ac8dc` (2026-05-04)** — drops the `reviewState === 'approved'` and similar gates from the skill prose. Rationale: the studio's buttons clipboard-copy slash commands; they don't mutate sidecar state. The "wait for the studio to set reviewState" gate was unreachable.
3. **`ca7f785` (2026-05-08)** — drops the `reviewState === 'approved'` gate from the dashboard's Approve button. Operator framing: *"I want to be able to approve or cancel an item, regardless of its review state."*

This document closes the loop: the schema's `ReviewState` is the last remaining vestige, and any code or documentation that references it as a meaningful concept is to be removed.

## Commandments

These are the operational rules derived from the framing above. Violations are bugs.

### I. The state is the stage. Nothing else is state.

Any code that branches on something other than `entry.currentStage` to decide whether a stage transition is allowed is wrong. Legitimate branches: stage gates (e.g., approve refuses on Final). Illegitimate branches: gating on `reviewState`, on iteration count, on "is this entry approved", on any inferred state.

### II. Verbs are universal.

Any verb (iterate, approve, cancel) that is conditionally hidden / gated / disabled because of any property other than the entry's stage is a violation. Specifically:
- The dashboard's iterate button is **not** gated on `reviewState === 'iterating'`. Iterate is available on any active-pipeline row.
- The dashboard's approve button is **not** gated on `reviewState === 'approved'`. Approve is available on any active-pipeline row whose stage has a next stage.
- The dashboard's cancel button is **not** gated on any reviewState. Cancel is available on any row whose stage isn't already Cancelled.
- Cross-cutting affordances (publish on Final, induct on Blocked/Cancelled) are gated by stage only.

### III. Review state is retired. Never surface it.

No UI element on any studio surface (mobile or desktop) renders a label like "In review", "Iterating", "Approved" as a description of an entry's state. No row carries a state badge. No masthead carries a "X in review" stat. No tile carries a "X · 3 in review" sub-count.

The desktop's existing `.er-stamp` rotated rubber-stamps that show **stage** (e.g., "Drafting") on the entry-review hero strip stay — they describe the stage, which IS user-facing. Stamps that show review state ("In review", etc.) go.

### IV. Iterate-as-verb means "the agent reads marginalia and reacts."

The skill prose for `/deskwork:iterate` describes this exact loop: read margin notes, edit the file in response to each note, advance any per-stage iteration counter for telemetry, journal what was addressed. There is no "set reviewState to 'iterating'" step. There is no "wait until reviewState is 'iterating' before iterate is allowed" precondition.

### V. Approve-as-verb means "graduate the stage."

The skill prose for `/deskwork:approve` describes this exact action: load the sidecar, validate the stage gate (linear pipeline + has-next-stage), advance `currentStage`, scaffold the next-stage artifact from the just-approved file, journal a `stage-transition` event, regenerate the calendar. There is no "set reviewState to 'approved'" step. There is no "approve only if reviewState is 'approved'" gate.

### VI. The schema's `ReviewState` type is vestigial — kill on sight where harmless.

Where `ReviewState` is referenced ONLY for:
- Reading legacy sidecars: keep, but mark `@deprecated — vestigial for sidecar back-compat only`
- Writing journal events of kind `review-state-change`: kill the writer, leave the historical reader so old journals parse.

Where `ReviewState` is referenced AT ALL in user-facing rendering, gating, or skill prose: kill it.

### VII. The studio is a routing surface; verbs run in the agent.

(Restated from THESIS Consequence 2 because state machine compliance and clipboard-copy compliance are joined at the hip.) The studio's per-row buttons clipboard-copy `/deskwork:<verb> <slug>`. The skill in the operator's Claude Code session is what does the work. The studio does NOT mutate sidecars on click; the studio does NOT set reviewState anywhere because reviewState doesn't exist as a thing the system tracks meaningfully.

### VIII. Mockups must comply.

A mockup that surfaces review-state labels, gates verbs on review state, or otherwise contradicts this document is misleading and is to be retired. Refer to `docs/studio-design-standards.md` for additional conformance constraints; the state machine spec is upstream of the studio design standards (the studio standards inherit from this document).

## Reference materials

- **`docs/superpowers/specs/2026-04-30-deskwork-pipeline-redesign-design.md`** — the original design that motivated the collapse. Read for the "why."
- **`THESIS.md`** — the agent-as-primary-tool architectural thesis. State machine compliance + studio clipboard-copy compliance both derive from THESIS Consequence 2.
- **`docs/studio-design-standards.md`** — the studio design standards. Inherits this document; restate redundancies are allowed but should not contradict.

## Migration commits referenced

- `5687404` — pipeline redesign spec
- `07ac8dc` — skill prose drops reviewState gates
- `c21b8b9` — studio mutation endpoints retired
- `ca7f785` — dashboard Approve button ungated

## Change log

Append a one-line entry every time this document is updated.

- 2026-05-09 — Initial draft. Captures the post-2026-04-30-redesign canonical state machine and explicitly retires every form of "review state" surfacing. Operator-prompted after a design session in which retired patterns kept being re-introduced because the spec wasn't written down anywhere.
