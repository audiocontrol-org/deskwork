## Design: deskwork pipeline redesign — entry-centric calendar with universal verbs

**Status:** drafted 2026-04-30 (brainstorming)
**Implementation:** pending

**Process note:** This redesign is not running through the deskwork plugin's review pipeline (per operator directive — running broken-or-being-rearchitected tools on a foundational redesign is too risky). Plain markdown, plain `git diff`, plain chat-based iteration. Once stable, this doc plus its writing-plans output drive a major release that ships the new model.

### Revision history

- **v1 (2026-04-30)** — initial design from brainstorming; nine-section spine plus open sub-decisions captured.

### Background and motivation

The current deskwork pipeline conflates two distinct state machines into one calendar surface, with the result that the dashboard hides truth and several stages are vestigial:

1. **Calendar stages and review-workflow states are different things.** Calendar stage is set by `add → plan → outline → draft → publish`. Review state is set by `review-start → iterate → approve → applied`. The two run independently. An entry can sit in `Drafting` while its longform review workflow has been `applied` for days — the dashboard renders it identically to a freshly-drafted entry that's never been reviewed. This was observed first-hand during the session that produced this design (this project's own PRD sat in Drafting after `applied`; the post-release-acceptance-design entry sat in Ideas after `applied`).

2. **The `Review` calendar stage is unreachable.** No CLI verb writes to it. `publish` advances directly from Drafting → Published. The Lifecycle subcommand list jumps `draft → publish`, skipping Review entirely. The slot exists in the dashboard for legacy reasons but no operation populates it.

3. **`Paused` is not actually a stage.** It's a process — *"I'm setting this aside; resume restores prior stage."* Modeling it as a stage in the linear chain creates ambiguity (is a Paused entry "before" or "after" some other stage?).

4. **Approve doesn't graduate, so what does it mean?** The current `approve` helper transitions only the review workflow to `applied` — disk content stays put, calendar stage stays put. *"This document has been approved"* and *"this document has advanced in the editorial pipeline"* are decoupled, with no other CLI verb tying them together. So approval is a free-floating state marker with no consequence on the pipeline.

5. **Per-stage verbs (`plan`, `outline`, `draft`) bake the pipeline shape into the CLI surface.** Adding a Final stage means a new `deskwork final` subcommand. Adding Cancellation means a `cancel` verb. Verb proliferation tracks pipeline shape too closely.

### The architectural fix

Collapse the two state machines into one **entry-centric pipeline** where:

- Every pipeline stage has its own primary markdown artifact.
- `iterate` is the universal verb for within-stage edits — works the same way at every stage.
- `approve` is the universal verb for stage graduation — graduating IS the act of approval. No "I approve this version" without "...and I'm advancing it."
- Off-pipeline states (`Blocked`, `Cancelled`) are discrete stages but outside the linear chain.
- A small constellation of off-pipeline verbs (`block`, `cancel`, `induct`) handle non-monotonic transitions; `induct` is the universal teleport to an operator-chosen stage.

This rebuilds the calendar from "two state machines with surface symptoms" to "one state machine with clear semantics."

### Scope

**In scope:**

- Calendar schema (per-entry JSON sidecars + calendar.md as a scannable index)
- CLI verb shape (most helpers retire; `iterate` stays as the multi-write hot path; `doctor` grows substantially)
- Studio review-surface URL keying (entry-uuid instead of workflow-uuid)
- Doctor validation coverage (substantially expanded; LLM-as-judge added via sub-agent dispatch)
- Migration of existing calendars (one-time `--repair` invocation)

**Out of scope:**

- Studio review-surface UX (editor, margin notes, save/iterate/approve buttons preserved as-is per operator review)
- Shortform's separate review-workflow model (deferred — works today, leaves alone; revisit if the two-abstractions split starts hurting)
- Renderer integration (Astro/Hugo/etc. — they read calendar.md and per-entry sidecars; if reading well today, keep reading well)
- Future fork-on-edit model for Published entries (deferred to a later design)

### Conceptual model

**Pipeline:**

```
                      approve         approve          approve         approve         publish
   Ideas ───────► Planned ──────► Outlining ──────► Drafting ──────► Final ────────► Published
                                                                       │ ▲              (frozen)
                                                            re-induct  │ │
                                                                       ▼ │
                                                                  (any earlier stage)

                                  block             induct             cancel
                Pipeline ──────► Blocked ──────► Pipeline           ──────► Cancelled
                                                                              (preserved)
```

**Stages.** Eight in total: six linear-pipeline stages + two off-pipeline stages.

| Stage | Pipeline? | Mutability | Primary artifact |
|---|---|---|---|
| Ideas | ✓ | mutable | `<contentDir>/<slug>/scrapbook/idea.md` |
| Planned | ✓ | mutable | `<contentDir>/<slug>/scrapbook/plan.md` |
| Outlining | ✓ | mutable | `<contentDir>/<slug>/scrapbook/outline.md` |
| Drafting | ✓ | mutable | `<contentDir>/<slug>/index.md` (canonical longform body path) |
| Final | ✓ | mutable | (same file as Drafting; label gate) |
| Published | ✓ | **frozen** | (same file as Drafting; immutable) |
| Blocked | off | mutable (state preserved while Blocked) | (whichever artifact corresponds to `priorStage`) |
| Cancelled | off | mutable | (whichever artifact corresponds to `priorStage`) |

Mutability rules:

- All pipeline stages except Published are mutable. Final's "ready for publishing" label can be revoked by re-induction; only Published is truly frozen.
- Blocked and Cancelled preserve the entry's prior stage's artifact. Re-induction picks up that artifact at whichever stage the operator targets.
- Published is the only stage that forbids edits. Re-inducting Published is the future fork-on-edit question — explicitly deferred.

**Verbs.**

| Verb | Implementation | Purpose |
|---|---|---|
| `add` | skill-prose | Create a new Ideas entry: scaffold sidecar, append calendar row, scaffold idea.md |
| `ingest` | skill-prose | Backfill existing markdown into a chosen stage |
| `iterate` | **CLI helper** | Within-stage edit: snapshot artifact, bump iteration counter, journal a version event, atomic |
| `approve` | skill-prose | Graduate to next stage: gate on reviewState=approved, advance currentStage, scaffold next stage's artifact, journal stage-transition |
| `publish` | skill-prose | Final → Published: write publication frontmatter, set currentStage=Published, freeze |
| `block` | skill-prose | Move to Blocked: record priorStage in sidecar, set currentStage=Blocked |
| `cancel` | skill-prose | Move to Cancelled: record priorStage, set currentStage=Cancelled |
| `induct` | skill-prose | Teleport to operator-chosen stage; preserves iterationByStage[<destination>] if present |
| `doctor` | **CLI helper** | Validate calendar; helper-side schema + reconciliation only. Skill-side adds LLM-as-judge sub-agent dispatch |
| `status` | skill-prose | Per-entry summary (currentStage, iteration counts, reviewState) — successor to `review-help` |

**Retired** (in this redesign): `plan`, `outline`, `draft`, `pause`, `resume`, `review-start`, `review-cancel`, `review-help`, `review-report`. Old invocations get a stable error message pointing at MIGRATING.md.

**Retained for the deferred shortform model:** `shortform-start`, `distribute`. Their workflow-object semantics stay unchanged.

**Within-stage state machine.**

Each pipeline stage has its own embedded review-state machine while the entry is in that stage:

```
       (no state)
            │
        first iterate
            │
            ▼
        in-review ◄────────────┐
            │                  │
       operator clicks         │
       "Request iteration"     │
            │                  │
            ▼                  │
        iterating              │
            │                  │
        agent runs iterate     │
            │                  │
            └──────────────────┘
                              ◄──── operator clicks "Approve"
                              ┌────
                              ▼
                        approved
                              │
                       agent runs approve
                              │
                              ▼
                       (entry advances; reviewState resets)
```

State lives on the entry, scoped to the entry's `currentStage`. There is no separate workflow object for the linear pipeline. The journal records all state transitions.

### Data model

**Per-entry JSON sidecar.** Path: `.deskwork/entries/<entry-uuid>.json`.

```typescript
interface Entry {
  // Identity
  uuid: string;                  // matches frontmatter.deskwork.id
  slug: string;                  // hierarchical, e.g. "deskwork-plugin/prd"
  title: string;
  description?: string;
  keywords: string[];
  source: 'manual' | 'ingested' | string;

  // Pipeline state
  currentStage: Stage;
  priorStage?: Stage;            // populated only while currentStage is Blocked or Cancelled
  iterationByStage: Partial<{ [s in Stage]: number }>;
  reviewState?: 'in-review' | 'iterating' | 'approved';

  // Editorial
  targetVersion?: string;
  datePublished?: string;        // populated on Published transition

  // Distribution (deferred — shortform model)
  shortformWorkflows?: { [platform: string]: string };

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

type Stage =
  | 'Ideas' | 'Planned' | 'Outlining' | 'Drafting' | 'Final' | 'Published'
  | 'Blocked' | 'Cancelled';

type ReviewState = 'in-review' | 'iterating' | 'approved';
```

Three pinned design points:

- `iterationByStage` is sparse. Presence of a key means the entry has been at that stage.
- `priorStage` is set only for Blocked/Cancelled. Re-induction back into the linear pipeline clears it.
- No `applied` reviewState. Applied is the moment of stage transition — transient. After approve fires, `currentStage` advances and `reviewState` resets.

**Calendar.md format** (the scannable index, regenerated on every CLI write):

```markdown
# Editorial Calendar

## Ideas
| UUID | Slug | Title | Description | Keywords | Source | Updated |
|------|------|------|------|------|------|------|
| <uuid> | <slug> | <title> | <description> | <kw1, kw2> | <source> | <iso8601> |

## Planned
...
## Outlining
...
## Drafting
...
## Final
...
## Published
...
## Blocked
...
## Cancelled
...

## Distribution
(reserved for shortform DistributionRecords — separate model)
```

Eight stage sections (was seven). New: Final, Blocked, Cancelled. Removed: Review (vestigial). Renamed: Paused → Blocked. Distribution stays as a separate-model surface for shortform.

The `Updated` column gives at-a-glance staleness without opening sidecars.

Calendar.md is a render. Operators can hand-edit but doctor reconciles against sidecars (sidecar wins; calendar.md is regenerated to match).

**Journal event schema** (audit trail; append-only).

Path: `.deskwork/review-journal/{pipeline,history,ingest}/<timestamp>-<event-id>.json`.

```typescript
type JournalEvent =
  | { kind: 'entry-created'; at: string; entryId: string; entry: EntrySnapshot }
  | { kind: 'entry-ingested'; at: string; entryId: string; sourcePath: string; targetStage: Stage }
  | { kind: 'iteration'; at: string; entryId: string; stage: Stage; version: number; markdown: string }
  | { kind: 'annotation'; at: string; entryId: string; stage: Stage; version: number; annotation: Annotation }
  | { kind: 'review-state-change'; at: string; entryId: string; stage: Stage; from: ReviewState | null; to: ReviewState | null }
  | { kind: 'stage-transition'; at: string; entryId: string; from: Stage; to: Stage; reason?: string; metadata?: Record<string, unknown> };

interface Annotation {
  id: string;
  type: 'comment';
  range: { start: number; end: number };
  text: string;
  category?: string;
  anchor?: string;
  disposition?: 'addressed' | 'deferred' | 'wontfix';
  dispositionReason?: string;
  createdAt: string;
}
```

`stage-transition` is universal. Forward graduation, induction, block, cancel, publish — all one kind, distinguished by comparing `from` and `to`. `metadata` carries mode-specific data (e.g., `{ datePublished }` for Final → Published).

`iteration` events embed markdown content — the version snapshot. Doctor cross-checks: latest iteration event's content for stage S should match the on-disk artifact when `currentStage === S`.

**Path conventions for primary artifacts.**

| Stage | Path |
|---|---|
| Ideas | `<contentDir>/<slug>/scrapbook/idea.md` |
| Planned | `<contentDir>/<slug>/scrapbook/plan.md` |
| Outlining | `<contentDir>/<slug>/scrapbook/outline.md` |
| Drafting | `<contentDir>/<slug>/index.md` |
| Final | (same as Drafting) |
| Published | (same as Drafting; frozen) |
| Blocked / Cancelled | (priorStage's artifact) |

**Frontmatter shape on stage artifacts.**

```yaml
---
title: <title>
description: <description>
deskwork:
  id: <entry-uuid>
  stage: <Stage>          # mirrors sidecar.currentStage; doctor reconciles
  iteration: <number>     # mirrors sidecar.iterationByStage[currentStage]
---
```

Three sources to keep in sync: sidecar (source of truth), calendar.md (rendered index), file frontmatter (self-describing). Doctor reconciles all three.

### CLI surface

**The retained helper: `iterate`.**

Multi-write transactional operation; the only piece of CLI tooling beyond doctor.

```typescript
// iterate(entryId, options) — invoked via `deskwork iterate <entry-id-or-slug>`
//
// Operations (in order):
//  1. Read sidecar at .deskwork/entries/<uuid>.json
//  2. Read on-disk artifact for sidecar.currentStage
//  3. Read pending operator annotations from journal; resolve dispositions if --dispositions <path> given
//  4. Compute version = (sidecar.iterationByStage[stage] ?? 0) + 1
//  5. Append iteration event to journal: { kind: 'iteration', entryId, stage, version, markdown, at }
//  6. Append annotation events for any disposition updates
//  7. Update sidecar: bump iterationByStage[stage]; set reviewState='in-review'; bump updatedAt
//  8. Update file frontmatter: deskwork.iteration matches sidecar
//  9. Schema-validate sidecar pre-write; reject malformed sidecar before writing
// 10. Output: { entryId, stage, version, reviewState, addressedAnnotations }
//
// Atomicity: events appended to journal first (orphan-event tolerable; doctor reconciles).
// Then sidecar via temp+rename. Then frontmatter edit. If interrupted partway,
// doctor's reconciliation pass catches the drift on next run.
```

This stays a helper because:

- Five file mutations to coordinate
- Schema-validating the sidecar pre-write is much easier in TS than in skill prose
- Annotation-disposition mapping is fiddly enough that prose-driven implementation invites bugs

**Everything else is skill prose + doctor.**

For each non-iterate verb, the SKILL.md prescribes: read inputs → validate gates → make changes (Edit/Write tool calls in deterministic order) → run `deskwork doctor` to validate. The agent walks the runbook; doctor catches drift.

Sample prose for `approve`:

```markdown
## /deskwork:approve <slug>

1. Resolve <slug> → entry UUID via .deskwork/entries/index.json (or by scanning sidecars).
2. Read .deskwork/entries/<uuid>.json into sidecar.
3. Validate gates:
   - sidecar.reviewState === 'approved'. If not, refuse: "click Approve in the studio first."
   - sidecar.currentStage is in [Ideas, Planned, Outlining, Drafting].
   - If sidecar.currentStage === 'Final': refuse: "use /deskwork:publish for Final → Published."
   - If sidecar.currentStage in ['Blocked', 'Cancelled', 'Published']: refuse with state-specific message.
4. Compute nextStage from the linear-pipeline successor map.
5. Scaffold next stage's primary artifact at the canonical path with seeded frontmatter.
6. Update sidecar:
   - currentStage: nextStage
   - iterationByStage[nextStage]: preserve if present (re-induction case); else 0
   - reviewState: undefined
   - priorStage: undefined
   - updatedAt: now
7. Append journal event: { kind: 'stage-transition', entryId, from: <prior>, to: <next>, at: now }
8. Regenerate calendar.md from current sidecars.
9. Run `deskwork doctor` to validate. If doctor fails, surface the failure; operator decides on revert.
```

Same pattern for every non-iterate verb: read sidecar → validate gates → make edits → journal an event → regenerate calendar → run doctor.

**Skill prose vs helper trade — what we accept.**

By making approve / publish / block / cancel / induct skill-prose driven:

- Mid-operation drift is possible if the agent crashes between Edit calls. Doctor catches; operator/agent reconciles manually.
- Schema evolution requires updating SKILL.md prose alongside the schema in `@deskwork/core`. Easy to forget; doctor's schema validation surfaces the symptom but not the SKILL prose drift.
- No unit tests for these operations. Coverage shifts to integration tests against fresh project trees.

Reversible decision: if approve / publish / etc. generate bugs at meaningful frequency in practice, promote them to helpers later. Iterate's status as helper is committed because of its multi-write transactional shape; the others can flip if cost shows up.

### Studio review surface

**The renderer UX stays as-is.** CodeMirror editor, margin-note panel, save/iterate/approve buttons, two-key destructive shortcuts, manual-copy fallback — all preserved.

**What changes is the URL keying and what the renderer reads.**

Today's URL: `/dev/editorial-review/<workflow-uuid>` — workflow-uuid keys the workflow object, which binds to one specific artifact.

New URL: `/dev/editorial-review/<entry-uuid>` — entry-uuid keys the calendar entry. Renderer reads:

1. `.deskwork/entries/<entry-uuid>.json` → entry state, currentStage, iterationByStage, reviewState
2. The on-disk artifact for `currentStage` → markdown body to display
3. Journal events for this entry → annotations, iteration history, stage-transition history

The renderer is **stage-aware**: affordances chosen based on `currentStage`:

| `currentStage` | Editor mutable? | Visible controls |
|---|---|---|
| Ideas / Planned / Outlining / Drafting / Final | Yes | Save, Iterate, Approve, Reject (= Iterate with note), historical-stage dropdown |
| Published | No (read-only) | View only; "fork to revise" placeholder for future model |
| Blocked / Cancelled | No (read-only stash) | "Induct to..." dropdown showing pipeline stages |

**Historical-stage view.**

Each entry's lifecycle accumulates frozen artifacts at every stage it's passed through. These are accessible read-only via:

`/dev/editorial-review/<entry-uuid>?stage=<stage>&v=<iteration>`

Where `stage` is any stage the entry has reached and `v` is any iteration version recorded in the journal. Surfaced as a dropdown in the chrome — "view: current Drafting v7" with options for prior stages and iterations. Makes the chrysalis visible.

**Dashboard changes** (`/dev/editorial-studio`):

- Eight stage sections instead of seven. Add Final, Blocked, Cancelled. Remove Review. Rename Paused → Blocked. Distribution stays as a separate (non-stage) section.
- Per-row state surfacing: stage + iteration count + review-state badge for pipeline entries; published date + public host URL for Published rows; prior stage + "induct →" affordance for Blocked/Cancelled rows.
- Action buttons inline on rows: "advance →" when reviewState=approved; "iterate →"; "block →"; "cancel →".
- Empty-stage collapse: low-volume calendars with empty stages collapse them by default.

**Other studio surfaces:**

| Surface | Change |
|---|---|
| `/dev/content` (content tree) | No change |
| `/dev/editorial-help` (Compositor's Manual) | **Substantial rewrite.** New vocabulary: stages renamed; verbs renamed; workflow concept retires for linear pipeline |
| `/dev/` (index page) | Mostly unchanged; entry under "Longform reviews" links to entry-uuid keyed URL |
| `/dev/editorial-review-shortform` | No change. Shortform's separate workflow-object model stays |
| `/dev/scrapbook/<site>/<path>` | Unchanged for the linear pipeline; new stage-frozen artifacts (idea.md, plan.md) appear naturally |

**Old workflow-uuid URLs.** Per operator's "we're the only customer; breaking changes acceptable" stance, old URLs become 404s after migration. MIGRATING.md documents the change.

### LLM-as-judge in doctor

**Architecture.** The judge is a sub-agent invocation orchestrated by the SKILL — not a doctor-helper API call. The doctor helper (CLI) is pure schema + reconciliation; no LLM access, no API keys, no token economics.

When an agent in Claude Code runs `/deskwork:doctor`:

1. SKILL invokes the helper, reads its structured output
2. SKILL dispatches a sub-agent for the judgment pass via Claude Code's Agent tool with `subagent_type: 'general-purpose'` and `model: <configured-model>`
3. SKILL aggregates verdicts; reports combined output to operator

**Cost model.** Operator's existing Claude Code subscription. No SDK calls, no API keys, no token math.

**Configuration.** `.deskwork/config.json`:

```json
{
  "judge": {
    "policy": "advisory",
    "subagentModel": "haiku"
  }
}
```

`subagentModel` defaults to `haiku` (Claude Haiku 4.5). Operator can swap to `sonnet` or `opus` per project.

**What the judge evaluates.** The skill embeds into the sub-agent's prompt:

```typescript
interface JudgeInput {
  entry: Entry;                         // current sidecar
  recentJournalEvents: JournalEvent[];  // latest ~10 events for this entry
  artifactPreview: {
    stage: Stage;
    path: string;
    firstChars: string;                 // first 500 chars of file
    lastChars: string;                  // last 500 chars
    byteSize: number;
  };
}

interface JudgeOutput {
  verdict: 'pass' | 'warn' | 'fail';
  explanation: string;
  concerns: string[];
}
```

System prompt (heavily prompt-cached at the sub-agent level — caching is automatic for repeated identical prefixes):

```
You are a deskwork pipeline auditor. The deskwork pipeline has these stages,
in order: Ideas → Planned → Outlining → Drafting → Final → Published. Off-pipeline:
Blocked, Cancelled. Invariants: (lists ~15 invariants — stage advancement is
one-step, iterationByStage matches journal counts, etc.). Your job: read the
entry's state and recent journal trail, and report whether the sequence is coherent.

Output JSON: {verdict, explanation, concerns}.
verdict 'pass' = no concerns. 'warn' = unusual but not necessarily wrong.
'fail' = concrete inconsistency.
```

**Doctor exit codes.**

The helper-side `deskwork doctor` exit code reflects only schema + reconciliation:

- 0 — healthy or all repairs applied
- 1 — schema/reconciliation failure
- 2 — usage error

The skill-side `/deskwork:doctor` reports judge results separately. The agent surfaces them but they don't affect the helper's exit code. If `judge.policy: blocking` and the judge fails, the agent communicates that to the operator and refuses the next mutation in skill prose; helper is unaware.

**Failure modes.**

- Sub-agent dispatch fails → skill catches, reports "judge unavailable", helper exit code unaffected
- Sub-agent returns malformed JSON → skill logs warning, treats as unavailable
- Operator running `deskwork doctor` directly from a shell → judge simply doesn't run

**Latency.** Each sub-agent dispatch ~5-30s. Doctor parallelizes (cap concurrency at 5-10) so a 50-entry calendar with judge invoked per recent-activity entry takes O(seconds), not minutes. Most entries are dormant; doctor only judges entries with recent activity (filtered by journal-events-since-last-run).

**Future tuning option (deferred).** Auto-escalate to Sonnet when Haiku verdict is `warn` with low confidence. Not v1; add later if false-positive rates show it'd help.

### Doctor full validation surface

The new doctor is substantially more thorough than today's. With most CLI verbs going skill-prose-driven, doctor is the safety net.

**Validation categories.**

| # | Category | What it catches |
|---|---|---|
| 1 | Schema validation | Per-entry sidecar fails zod schema (typo in stage name, malformed iterationByStage, unexpected enum value) |
| 2 | Calendar.md ↔ sidecar consistency | Stage-section in calendar.md disagrees with sidecar.currentStage; row missing for an existing entry; orphan calendar row without sidecar |
| 3 | Frontmatter ↔ sidecar consistency | File frontmatter `deskwork.id`, `deskwork.stage`, `deskwork.iteration` disagree with sidecar |
| 4 | Journal ↔ sidecar consistency | Latest stage-transition event's `to` doesn't match sidecar.currentStage; latest review-state-change doesn't match sidecar.reviewState; journal lacks `entry-created` event |
| 5 | Iteration history completeness | sidecar.iterationByStage[s] = N implies exactly N journal `iteration` events exist for that (entry, stage) |
| 6 | File presence | Each entry's currentStage's primary artifact file exists on disk; orphan scrapbook files without an entry that visited that stage |
| 7 | Stage-specific invariants | Final/Published share the longform body file; Blocked/Cancelled have priorStage set; iterationByStage[Published] never bumps after first set |
| 8 | Cross-entry invariants | Slug uniqueness within a site; UUID uniqueness across all entries |
| 9 | Migration drift | After in-place migration, no Review-section entries remain; no Paused-section entries remain; all sidecars exist for calendar rows |

**Repair classes** (`--repair` opt-in flag).

| Class | Repair action |
|---|---|
| Calendar.md out of sync with sidecars | Regenerate calendar.md from sidecar contents |
| Frontmatter out of sync with sidecar | Update frontmatter `deskwork.stage` and `deskwork.iteration` to match sidecar |
| Orphan iteration journal events | Surface to operator; require explicit confirmation (destructive) |
| Missing iteration events | Surface to operator; cannot synthesize missing snapshots |
| Latest stage-transition event missing | Append synthetic stage-transition event with `metadata.synthesized: true` |
| Missing artifact file for currentStage | Cannot synthesize content; surface for operator to either induct backwards or run iterate |
| Old-schema calendar | One-time migration; rename Paused → Blocked; drop Review section; create Final + Cancelled empty sections; backfill sidecars from existing rows |

Repairs that destroy data NEVER auto-fire; operator confirms explicitly.

**Flags.**

```
deskwork doctor                    # schema + reconciliation; exit 0 healthy, 1 failure
deskwork doctor --repair           # apply non-destructive repairs; report destructive
deskwork doctor --check            # read-only; same report as default minus repairs
deskwork doctor --quiet            # silent on healthy (existing SessionStart-hook contract)
deskwork doctor --json             # machine-readable output (back-compat no-op kept)

# Skill-side adds:
/deskwork:doctor                   # helper run + judge sub-agent dispatch
/deskwork:doctor --no-judge        # helper run only
/deskwork:doctor --audit           # helper run + judge sub-agent + cross-entry global judge
```

**Stable contract.** Per `agent-discipline.md`, the new doctor preserves existing flag surface (`--quiet`, `--check`, `--dry-run` aliased to `--check`, `--json` no-op for back-compat) and exit-code contract. Adopter SessionStart hooks calling `repair-install.sh` continue to work.

### Migration

**State of this project's calendar at migration time:**

| Section today | Entries | Migration target |
|---|---|---|
| Ideas | 1 | → Ideas (no change) |
| Planned | 0 | → Planned (no change) |
| Outlining | 0 | → Outlining (no change) |
| Drafting | 3 | → Drafting (no change) |
| Review | 0 | section dropped |
| Paused | 0 | section renamed to Blocked (empty) |
| Published | 0 | → Published (no change) |
| (new) Final | n/a | section created (empty) |
| (new) Cancelled | n/a | section created (empty) |

Total: 4 sidecars to generate. No Paused entries to rename. No Review entries to collapse. This calendar is the lowest-friction migration scenario.

For audiocontrol.org's calendar (other adopter), the same `--repair` invocation works.

**Migration mechanic.**

A single command:

```
deskwork doctor --repair
```

When doctor detects pre-redesign schema (calendar.md has `## Review` or `## Paused` section, or `.deskwork/entries/` doesn't exist), it routes to the migration repair class.

Migration steps:

1. Read every existing calendar.md row.
2. For each row, read journal events keyed to that entry.
3. Build a sidecar:
   - Identity (uuid, slug, title, description, keywords, source) from the row
   - currentStage from row's stage section (Paused → Blocked mapping)
   - priorStage populated for migrated-to-Blocked entries (best-effort from journal)
   - iterationByStage: count `iteration` and `version`-kind events from journal
   - reviewState from latest journal `state` or `workflow-state` event
   - createdAt from earliest journal event; updatedAt from latest
   - targetVersion, datePublished from frontmatter or row
4. Write sidecar to `.deskwork/entries/<uuid>.json`.
5. Update file frontmatter to match sidecar.
6. Regenerate calendar.md with new column layout and eight-stage section structure.
7. Append journal event: `{ kind: 'entry-migrated', entryId, at, fromSchema: 'v1', toSchema: 'v2' }`.

**Existing journal events.** Stay in place; new code reads them as historical records. Pre-migration `version` events get mapped to the new `iteration` shape during sidecar build but are NOT rewritten on disk. Journal stays append-only.

**Studio surface during migration.** Old workflow-uuid URLs become 404s after migration. New URLs are entry-uuid keyed.

**Pre-migration dry-run** via `deskwork doctor --check`. Operator reviews preview.

**Post-migration verification** via `deskwork doctor`. Should report all-green.

**Helper retirement.** Old per-stage helpers print stable error pointing at MIGRATING.md.

**Sequencing.** Ships as a major release (e.g., v0.11.0). Release notes + MIGRATING.md prominently feature the migration step.

### Sub-decisions resolved with default recommendations

These are tactical decisions that came up during brainstorming. Each is independent of the architectural spine. Recommendations carry forward unless operator decides otherwise during design review or implementation.

**Group A — Scaffolding behaviors:**

- **S1 (graduation scaffolding):** Hybrid per-stage. Ideas → Planned: seed (plan IS the idea expanded). Planned → Outlining: seed. Outlining → Drafting: seed (draft expands outline bullets). Drafting → Final: same file (already covered). Concrete rules per transition documented in implementation plan.
- **S2 (`deskwork add` initial state):** Calendar row + sidecar + scaffolded idea.md ready for first iterate.
- **S3 (template content):** Default to structured templates; per-project overridable via `.deskwork/templates/<name>.ts`.
- **S4 (frontmatter shape):** Flat — `deskwork.stage`, `deskwork.iteration` directly under `deskwork:`.

**Group B — Verb behaviors:**

- **B1 (hand-edit divergence):** Hybrid. Doctor surfaces "disk diverged at <stage>" warning; operator runs `deskwork iterate` to capture or `deskwork doctor --repair --capture-divergence` to auto-capture.
- **B2 (re-induction default destination):** Defaults exist (Final → Drafting; Blocked → priorStage; Cancelled → priorStage); operator overrides with `--to <stage>`.
- **B3 (verb name `induct`):** Keep `induct` unless it doesn't survive operator gut-check at design review.
- **B4 (`deskwork ingest` target stage):** Hybrid. Frontmatter-as-default; explicit `--stage <Stage>` override.

**Group C — Migration edges:**

- **C1 (in-flight workflows):** Mirror the workflow state. `reviewState` populated from current workflow's state. Continuity for in-progress work.
- **C2 (cancel cascading to shortform):** Don't cascade. Shortform's separate model means independent lifecycle. Future work could cascade-cancel; YAGNI for v1.

**Group D — Vocabulary / cosmetic:**

- **D1 (Compositor's Manual rewrite scope):** Rewrite as part of release. Manual is the primary onboarding doc; shipping with stale Manual is a known failure mode.
- **D2 (status command):** Include `deskwork status` in scope. Successor to `review-help`.

### Acceptance criteria

The redesign is complete when:

- All eight stages exist in the calendar; entries can move through the linear pipeline, into Blocked/Cancelled, and be inducted back.
- All listed CLI verbs work via skill prose (or as the `iterate` helper); retired verbs print stable error messages.
- Doctor's nine validation categories all run; `--repair` handles the non-destructive classes.
- LLM-as-judge sub-agent dispatch fires from `/deskwork:doctor` with the operator's configured model.
- Migration of this project's calendar (and audiocontrol.org's, if the operator opts in) succeeds via `deskwork doctor --repair`.
- Studio dashboard renders eight stages with stage-aware row affordances.
- Studio review surface keys URLs by entry-uuid.
- Compositor's Manual rewritten with new vocabulary.
- MIGRATING.md ships with the major release naming the breaking changes and migration steps.
- All existing in-tree tests pass; new validation logic has integration coverage against fresh project trees.

### Maturity stance

The deskwork project is pre-1.0. This redesign explicitly accepts breaking changes — old workflow-uuid URLs return 404, retired CLI verbs print errors, in-flight workflows preserved but operator may need to manually verify post-migration. Adopters: just this project and audiocontrol.org. The breaking-changes posture is appropriate at this scale.

The redesign is foundational for the next phase of deskwork's trajectory: dw-lifecycle integration. Once dw-lifecycle gains customizable lifecycle stages, the new model here becomes the migration target for the stop-gap features (`/release`, `/post-release:*`) that currently live inside the deskwork plugin.

### Implementation order (preview — actual plan via writing-plans)

1. **Schema + migration (foundation).** Sidecar JSON schema in `@deskwork/core`; doctor's migration repair class; one-shot migration of this project's calendar; verify post-migration state.
2. **`iterate` helper rewrite.** New entry-centric iterate helper; passes existing review-pipeline tests; integration tests for the multi-write atomicity.
3. **Skill-prose verbs.** `add`, `approve`, `block`, `cancel`, `induct`, `publish`, `status`. Each with explicit step-by-step prose and doctor-as-validator.
4. **Doctor expansion.** All nine validation categories; repair classes; new flag surface.
5. **LLM-as-judge.** Skill-side `/deskwork:doctor` orchestrates sub-agent dispatch; system prompt + invariants; result aggregation.
6. **Studio dashboard rework.** Eight-section layout; per-row state surfacing; inline action buttons; empty-stage collapse.
7. **Studio review surface re-routing.** Entry-uuid keyed URLs; stage-aware affordances; historical-stage view.
8. **Compositor's Manual rewrite.** New vocabulary; new verb prose; updated walk through the lifecycle.
9. **MIGRATING.md authoring.** Adopter-facing migration walkthrough.
10. **Major release.** Bundle + smoke + ship via existing `/release` skill.

This is a sketch. The actual implementation plan comes via `superpowers:writing-plans`.
