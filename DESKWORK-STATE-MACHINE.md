---
deskwork:
  id: 7306087a-f412-4c33-901f-f0173ae36646
---
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
   Ideas ──→ Planned ──→ Outlining ──→ Drafting ──→ Final ──→ Published
                                                                  (Published is terminal:
                                                                   publicly committed and
                                                                   immutable, like an npm
                            ┌──────┐                               publish. To revise,
                  ◀━━━━━━━━━┤Blocked│━━━━━━━━━━━▶                  create a new version
                            └──────┘                               and induct it into a
                                                                   non-terminal stage.)
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
| **Final** | Content is locked — ready to publish, no further edits or iterations allowed in this stage. Approve forward to Published; induct backward to a previous stage to unlock for editing. | (same file as Drafting, frozen) |
| **Published** | Terminal stage. Publicly committed and immutable, like an npm publish — the version is locked and visible to the world, no take-backs. Can be deleted (recall) but not modified. **Every transition to Published assigns a new version** (default scheme: monotonic integer `v1`, `v2`, ...; operators may override; see § Versions and revisions). To revise: induct the working copy into a non-terminal stage, complete the work, approve forward to Published again — a new version is assigned; the prior version stays as-is in the public record. The published item's filesystem disposition is NOT part of the semantics — what matters is the public commitment + its version. | (immutable; the version IS the contract) |

### The two off-pipeline stages

| Stage | Meaning | Re-entry |
|---|---|---|
| **Blocked** | Out of pipeline; resumable. The operator paused work on this entry without abandoning it. | `induct` puts it back to any stage. |
| **Cancelled** | Out of pipeline; abandoned. Resumable but rare — the operator decided not to publish this. | `induct` puts it back to any stage. |

## The verbs

Verbs are operations the operator performs on an entry. They are not states. An entry never "is" iterating or "is" approved — those words describe what just happened.

### `iterate`

**What it means:** the agent examines the entry's content artifact for operator marginalia (margin notes left in the studio's review surface) and reacts to them — typically by editing the file to address each note.

**When it can be invoked:** on any entry whose stage permits content edits — Ideas, Planned, Outlining, Drafting. There is no "iterating state" gate; the gate is purely stage-based. NOT in Final (Final locks the content; to iterate, induct backward to Drafting first). NOT in Published (Published is immutable; create a new version + induct). NOT in Blocked / Cancelled (off-pipeline; induct back first).

**What it changes:** the content artifact on disk (per the agent's edits in response to marginalia). Bumps the entry's **revision** counter — like every other source of a revision bump (see § Versions and revisions). The agent's iterate is one of several producers of revisions; operator saves and direct filesystem edits also bump the same counter. Revisions are bookkeeping; the operator only sees them via revision history / revert flows, not in the routine drafting loop.

**Studio surfacing:** every row whose stage permits edits (Ideas / Planned / Outlining / Drafting) includes `/deskwork:iterate <slug>` (clipboard-copy). Not gated on any state — only on stage.

### `approve`

**What it means:** graduate the entry to the next stage of the linear pipeline.

**When it can be invoked:** on any entry whose current stage is on the linear pipeline AND has a next stage. The verb is universal — it works the same way at every transition. Specifically:
- Ideas → Planned: yes
- Planned → Outlining: yes
- Outlining → Drafting: yes
- Drafting → Final: yes
- Final → Published: yes — approve graduates Final to Published, same as every other linear-pipeline transition. **Always assigns a new version** per the operator's declared scheme (default: monotonic integer `v1`, `v2`, ...; see § Versions and revisions). Versioning is mandatory, not optional. (See `publish` below — it's an optional clarity-alias for approve at this transition, not a separate operation.)
- Published: NO — terminal stage; immutable. To revise a published item, induct the working copy into a non-terminal stage, iterate / edit, then approve forward back to Published — a new version is assigned. The existing version stays as-is in the public record.
- Blocked, Cancelled: NO — off-pipeline. Use `induct` to re-enter.

**What it changes:** `currentStage` advances by one position in the linear pipeline. The next stage's primary artifact is scaffolded from the just-approved file (where applicable). A `stage-transition` journal event is appended.

**Studio surfacing:** every active-pipeline row whose stage has a next stage shows `/deskwork:approve <slug>` (clipboard-copy) — including Final → Published. Not gated on any "review state."

### `cancel`

**What it means:** move the entry to Cancelled (out of pipeline; abandoned).

**When it can be invoked:** on any entry whose current stage is not already Cancelled.

**What it changes:** `currentStage` becomes `Cancelled`. A `stage-transition` journal event is appended.

**Studio surfacing:** every row whose stage isn't already Cancelled shows `/deskwork:cancel <slug>` (clipboard-copy).

### `block` (and the related `induct`)

**`block`** moves an entry to Blocked. **`induct`** moves an entry from Blocked or Cancelled back to any operator-chosen pipeline stage. These are companion verbs to `cancel` for non-monotonic transitions.

### `publish`

**`publish`** is an optional clarity-alias for `approve` at the Final → Published transition. It exists only for prose clarity — when the operator says "publish my-entry," the meaning is unambiguous. For consistency, `approve` is the universal verb and works at every transition including Final → Published; either name accomplishes the same thing. Do **not** implement `publish` as a separate operation with different semantics — Final → Published is a stage graduation like any other. The "different semantics" of Published (immutability, public commitment) live in the STAGE's contract, not in a special verb.

### `add` and `ingest`

**`add`** creates a new Ideas-stage entry from scratch. **`ingest`** backfills existing markdown content into the calendar. These are entry-creation verbs, not state-transition verbs.

## Versions and revisions

Two distinct serial numbers play different roles in deskwork. **Naming matters — they are not the same kind of thing, and conflating them is a category error.** This section establishes the canonical names.

### Version (public)

The **version** is the public identifier of the entry-as-published. **Every Published entry has a version. There is no such thing as an unversioned Published entry.** A version is assigned at every Final → Published transition (the act of publishing IS the act of assigning a version).

**Default scheme: monotonic integer** — `v1`, `v2`, `v3`, .... The first Publish event assigns `v1`; each subsequent Publish increments. The operator gets versioning automatically with no setup, prompt, or opt-in. This is the deliberate default so casual content (one-off blog posts) can be published without ceremony — they still have versions, the operator just doesn't have to think about them.

**Operators may override the scheme** for content that needs formal versioning (semver, date-based, custom). The mechanism is reserved (per-site config / per-entry frontmatter / TBD; Phase 0.2 audit will design it). Override is opt-in; declaring a scheme replaces the default for that site or entry. **The default cannot be opted out of** — there's always a version.

In operator-facing prose, "version" alone always means the public version.

### Revision (internal)

The **revision** is a per-entry counter that bumps **any time the working content changes**. It exists for working history — so prior working states can be reconstructed, journals can be filtered, the operator can view revision history and revert to a previous revision (Google Docs / Wikipedia analogue).

A revision is "a working draft on the way to becoming a version." Many revisions accumulate; at each Publish event, the current state is anointed as a new version.

#### Sources of a revision bump

Every change to the working content produces a new revision. The producers are:

- **`add` / `ingest`** — entry creation. The first revision (`r1`) captures the scaffolded or ingested content as the entry's initial working state.
- **Agent `iterate`** — the agent reads operator marginalia and rewrites the file in response; a new revision records the result.
- **Operator save** — any save through the studio's editor surface produces a new revision; the operator's direct edits are first-class and append the same way an agent iterate does.
- **Direct filesystem edits** — when the operator (or any tool) writes the working file outside the studio, the next deskwork operation that observes the change produces a revision capturing it. The system never silently drops a working state.

Each revision records **who originated it** (agent vs operator) and **when**, so revision history surfaces a coherent record of who-changed-what across the lifetime of the entry. The counter is a single per-entry sequence regardless of who or what triggered the bump.

#### When the operator sees revisions

The operator sees revisions when:
- Viewing revision history (the studio's "View History" surface — TBD)
- Reverting to a previous revision (`/deskwork:revert <slug> --to-revision N` — TBD; reverting creates a NEW revision identical to the old one; history is append-only)

The operator does not see revisions in the routine drafting flow — only when explicitly inspecting history.

### Why the names matter

Two operator audiences benefit from the separation:

- **Casual content (one-off blog post):** the operator publishes, gets `v1` automatically, never thinks about it. If they revise later they get `v2` automatically. Zero mental overhead.
- **Formal content (software license, versioned essay, compositor's manual):** the operator declares a scheme, controls the version label per their conventions, and sees the version on every external-facing surface.

In both cases the **revision** counter ticks invisibly; it surfaces only when the operator wants history or revert.

### How they interact

Typical flow:

1. Entry created at Ideas. Revision 1.
2. Iterate / approve through stages. Revision bumps on each iterate.
3. Reach Final → approve. **Version `v1` assigned (default scheme).** Entry is now Published.
4. To revise the published entry: induct to a non-terminal stage (e.g., Drafting). Iterate / edit. Revisions keep bumping. Approve to Final, then approve to Published. **Version `v2` assigned.**
5. The previous version (`v1`) stays in the public record — published items are immutable; revising creates a new version, not an in-place edit.

The revision counter is one per-entry sequence that keeps incrementing throughout. The version is a separate sequence that increments only at Publish events. Many revisions roll up into one version.

### Implementation status

The current implementation has only revisions (the per-stage iteration counter, which has been called `iterationByStage` historically). Versions (public, mandatory, with default-scheme + override) are committed in this spec but **not yet implemented**. The Phase 0.2 audit will surface where to add:

1. A `version: string` field on the entry sidecar, assigned in `approveEntryStage` at the Final → Published transition.
2. A scheme-override mechanism (per-site config? per-entry frontmatter? to be designed). Default: monotonic integer, applied when no override is declared.
3. Read-path surfacing: the studio's Published-stage view shows the version; revisions are surfaced only via the View History surface.

The `/deskwork:revert <slug> --to-revision N` verb (or equivalent) is also reserved for implementation — it produces a new revision with the content of revision N, preserving the append-only history.

Until public versioning lands, operator-facing prose may still say "iteration count" in places — that's a historical artifact. New code should use the names "version" (public) and "revision" (internal) per this section.

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

Any code that branches on something other than `entry.currentStage` to decide whether a stage transition is allowed is wrong. Legitimate branches: stage gates (e.g., approve refuses on Published since it's terminal; iterate refuses on Final since the content is locked; cancel refuses on Cancelled since it's already there). Illegitimate branches: gating on `reviewState`, on iteration count, on "is this entry approved", on any inferred state.

### II. Verbs are universal.

Any verb (iterate, approve, cancel) that is conditionally hidden / gated / disabled because of any property other than the entry's stage is a violation. Stage-based gates ARE legitimate (per Commandment I); state-based gates are not. Specifically:
- The dashboard's iterate button is **not** gated on `reviewState === 'iterating'`. Iterate is available on rows whose stage permits edits (Ideas / Planned / Outlining / Drafting).
- The dashboard's approve button is **not** gated on `reviewState === 'approved'`. Approve is available on any active-pipeline row whose stage has a next stage — INCLUDING Final → Published.
- The dashboard's cancel button is **not** gated on any reviewState. Cancel is available on any row whose stage isn't already Cancelled.
- Induct is gated by stage (Blocked / Cancelled only — induct re-enters the pipeline from off-pipeline; alternative use is to back out a Final entry to Drafting for further iteration).

### III. Review state is retired. Never surface it.

No UI element on any studio surface (mobile or desktop) renders a label like "In review", "Iterating", "Approved" as a description of an entry's state. No row carries a state badge. No masthead carries a "X in review" stat. No tile carries a "X · 3 in review" sub-count.

The desktop's existing `.er-stamp` rotated rubber-stamps that show **stage** (e.g., "Drafting") on the entry-review hero strip stay — they describe the stage, which IS user-facing. Stamps that show review state ("In review", etc.) go.

### IV. Iterate-as-verb means "the agent reads marginalia and reacts."

The skill prose for `/deskwork:iterate` describes this exact loop: read margin notes, edit the file in response to each note, advance any per-stage iteration counter for telemetry, journal what was addressed. There is no "set reviewState to 'iterating'" step. There is no "wait until reviewState is 'iterating' before iterate is allowed" precondition.

### V. Approve-as-verb means "graduate the stage."

The skill prose for `/deskwork:approve` describes this exact action: load the sidecar, validate the stage gate (linear pipeline + has-next-stage), advance `currentStage`, scaffold the next-stage artifact from the just-approved file, journal a `stage-transition` event, regenerate the calendar. The verb works at every transition — including Final → Published — and behaves the same way each time. There is no "set reviewState to 'approved'" step. There is no "approve only if reviewState is 'approved'" gate. There is no "publish does something different on Final" — `publish` is an optional name for `approve` at that transition; the operation is the same stage graduation.

### VI. The schema's `ReviewState` type is vestigial — kill on sight where harmless.

Where `ReviewState` is referenced ONLY for:
- Reading legacy sidecars: keep, but mark `@deprecated — vestigial for sidecar back-compat only`
- Writing journal events of kind `review-state-change`: kill the writer, leave the historical reader so old journals parse.

Where `ReviewState` is referenced AT ALL in user-facing rendering, gating, or skill prose: kill it.

### VII. The studio is a routing surface; verbs run in the agent.

(Restated from THESIS Consequence 2 because state machine compliance and clipboard-copy compliance are joined at the hip.) The studio's per-row buttons clipboard-copy `/deskwork:<verb> <slug>`. The skill in the operator's Claude Code session is what does the work. The studio does NOT mutate sidecars on click; the studio does NOT set reviewState anywhere because reviewState doesn't exist as a thing the system tracks meaningfully.

### VIII. Mockups must comply.

A mockup that surfaces review-state labels, gates verbs on review state, or otherwise contradicts this document is misleading and is to be retired. Refer to `docs/studio-design-standards.md` for additional conformance constraints; the state machine spec is upstream of the studio design standards (the studio standards inherit from this document).

### IX. Every Published entry has a version. Every iterate bumps a revision.

Versions (public) and revisions (internal) are distinct serial numbers; see § Versions and revisions. Two non-negotiable invariants:

1. **There is no such thing as an unversioned Published entry.** Every Final → Published transition assigns a version per the operator's scheme (default: monotonic integer). Code that allows a Publish without assigning a version is a violation. UI that shows a Published entry without its version is a violation.
2. **Revision and version are not interchangeable.** Code or prose that uses one name for the other concept is a violation. "Revision" never means the public identifier; "version" never means the working counter.

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
- 2026-05-09 v2 — Iteration response to operator marginalia (comments `40fcf89c` and `a7fb88d4`). Two corrections: (a) Final is NOT terminal — approve works at Final → Published, same as every other linear-pipeline graduation. Final's contract is "content locked; only stage transitions allowed (approve forward, induct backward)" — iterate / edit are not allowed in Final, but the stage itself is forward-traversable. (b) Published has npm-publish semantics — terminal, publicly committed, immutable; revisions create new versions inducted into a non-terminal stage; filesystem disposition is decoupled from the published semantic. The `publish` verb is reframed as an optional clarity-alias for `approve` at the Final→Published transition rather than a separate operation. Iterate's stage gate is now explicit (Ideas/Planned/Outlining/Drafting only).
- 2026-05-09 v3 — Iteration response to operator marginalia (comment `acfec3b7`). Added a § Versioning section distinguishing two version concepts: **internal version** (iteration counter; bookkeeping; bumps on every iterate) and **public version** (assigned at Publish; increments only at Publish events; what external consumers refer to). Updated Published stage description and approve verb gates to reference public version assignment. Implementation note: public versioning is committed in this spec but not yet implemented; Phase 0.2 audit will surface where to add it (likely a `publicVersion` field on the sidecar, incremented in approve when transitioning to Published).
- 2026-05-09 v4 — Iteration response to operator chat-direct guidance on naming + version mandatory-ness. Three changes: (a) **Renamed** the version-concepts section to "Versions and revisions" with explicit naming as the central point. **version** = public, the canonical user-facing identifier; **revision** = internal counter, bumped by iterate, surfaced only via revision history / revert flows (Google Docs / Wikipedia analogue). (b) **Versioning is mandatory** — every Published entry has a version. Default scheme = monotonic integer (`v1`, `v2`, ...) so operators get versioning automatically without setup. Operators MAY override with semver / date-based / custom schemes; opt-out is not allowed. (c) Added Commandment IX codifying the two non-negotiables: every Publish assigns a version; revision and version are not interchangeable names. Phase 0.2 inventory will need to add: scheme-override mechanism, `/deskwork:revert <slug> --to-revision N` verb, View History studio surface.
- 2026-05-09 v5 — Iteration response to operator marginalia (comment `94699c3c`): "Doesn't saving direct user edits require a revision bump, as well?" Yes. Expanded the Revision subsection to enumerate all four sources of a revision bump: `add`/`ingest` (initial revision), agent `iterate`, operator save through the studio editor, direct filesystem edits. Each revision records originator (agent vs operator) and timestamp; the counter is a single per-entry sequence regardless of who triggered the bump. Iterate verb's "what it changes" updated to acknowledge it's one of several producers, not the only one.
