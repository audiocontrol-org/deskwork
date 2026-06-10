---
id: TASK-18
title: >-
  Architectural: single document evolves; scrapbook accumulates approved
  snapshots (instead of per-stage files + stage-aware UI)
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-222
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/222

## Architectural feature: stage-aware review surface — single document evolves; scrapbook accumulates approved snapshots

### The problem

Today the studio review surface reads `entry.artifactPath` (single static field on the sidecar) to decide what file to show. The iterate CLI writes per-stage artifact files (`scrapbook/outline.md` at Outlining, `index.md` at Drafting) via `--kind`. The two disagree:

- The CLI snapshots the right content per-stage into the right file
- The studio renders a single static file (whatever `artifactPath` was set to during ingest/migration)
- Result: an entry at Outlining stage with iterate v2 of an outline written to `scrapbook/outline.md` shows only frontmatter on the studio review surface, because `artifactPath` still points at the empty `index.md`

The operator can't see what they're supposed to be reviewing. The version journal records the right content; the UI doesn't render it.

### Two ways to fix

**Option A — make the studio stage-aware.** `currentStage === 'Outlining'` → render `scrapbook/outline.md`; `currentStage === 'Drafting'` → render `index.md`. Files are stable on disk; nothing moves on stage transition. Each per-stage file accumulates its own version-history journal that doesn't interleave.

**Option B — single document evolves; snapshot on approve.** `index.md` is always "the document under review." On `/deskwork:approve` at the Outlining→Drafting boundary, the backend snapshots `index.md` (the approved outline) to `scrapbook/outline.md` and leaves `index.md` ready to be transformed into draft body on the first Drafting iterate (by the agent or operator). Same pattern at every stage transition that produces a new artifact kind.

### Recommendation: Option B with the hybrid refinement

The hybrid refinement: **snapshot but don't auto-rewrite**. On approve:
1. Atomically copy `index.md` → `scrapbook/<prior-stage>.md` (write + fsync target before claiming success)
2. Leave `index.md` unchanged
3. The first iterate at the new stage is responsible for rewriting `index.md` as the new artifact (draft body for Drafting, etc.) — using the snapshot as reference

Why B + hybrid is the right call:

- **Studio UI stays dumb.** Always reads `index.md`. No per-stage routing logic. Every surface that needs "the document right now" gets a single answer.
- **Matches the operator's mental model.** "The article evolves. Old versions of itself live in scrapbook." Scrapbook accumulating frozen prior-stage artifacts is what scrapbook is *for*.
- **LLM agents are tolerant of edge cases.** When the agent picks up an entry at Drafting with `index.md` still containing the approved outline, it can read both `index.md` and `scrapbook/outline.md` and produce the draft. Rules-based UI cannot do this; agent-as-backend can. Push the hard logic to the agent; keep the surface simple.
- **One-shot snapshot at approve is well-defined.** Atomic-write discipline is solvable (fsync the snapshot before mutating anything else). The continuous obligation in Option A — every studio surface staying stage-aware forever — is harder to get right and stay right.
- **Per-stage history journals can still exist.** The journal tracks `(entryId, stage, version)` — moving file paths doesn't break this. The journal already has `markdown` content per version; it's the stage-attributed source of truth for "what was approved at what stage."

### Trade-offs accepted

- **Stage transitions become destructive.** Mitigated by atomic-write + the snapshot existing in scrapbook before any change to `index.md`.
- **Version history at Drafting starts from a different file than at Outlining.** Per-stage journal entries handle this; the journal is keyed on `(entryId, stage, version)`, not on file path.
- **Operator who manually edits `scrapbook/outline.md` after approve gets divergent state.** That file is "frozen." If it needs to change, the operator should re-block, re-iterate, re-approve. Document this in the manual.

### Implementation plan

1. **`approve` becomes the snapshot point.** Where it transitions stage, also: read the current artifact's path → resolve the prior-stage's snapshot path → atomic copy → fsync.
   - `Outlining → Drafting`: snapshot `index.md` → `scrapbook/outline.md`
   - `Planned → Outlining`: snapshot `index.md` → `scrapbook/plan.md`
   - `Ideas → Planned`: snapshot `index.md` → `scrapbook/idea.md`
   - `Drafting → Final`: snapshot `index.md` → `scrapbook/drafting.md`
   - `Final → Published`: no snapshot (Published is terminal; index.md IS the artifact)
2. **Sidecar `artifactPath` collapses to always-`<contentDir>/<slug>/index.md`** for blog entries (or whatever the singular per-entry artifact is for non-blog content kinds). The field becomes effectively static; could be derived from contentDir + slug rather than stored.
3. **The studio review surface drops the `entry.artifactPath` lookup** in favor of resolving from `<contentDir>/<slug>/index.md` directly. (The studio's data layer continues to pull margin notes / annotation positions from the per-version journal — which is keyed on entry id, not file path, so this doesn't change.)
4. **The iterate CLI's `--kind` flag becomes redundant for content kinds** that follow the single-document-evolution model (longform / outline). It might still be needed for shortform (which has multiple platform/channel sub-files) — keep it as opt-in.
5. **Migration for existing v0.16.0 entries:**
   - Detect entries with `artifactPath` pointing at `scrapbook/outline.md` (or any per-stage scrapbook file)
   - Move that content back into `index.md` if `index.md` is empty/placeholder
   - If `index.md` already has content (rare: only when something else wrote to both), surface as a doctor finding rather than auto-merging
6. **The first-iterate-at-stage handles the "blank canvas vs. carry-over" question** — agent reads `index.md`, reads any scrapbook snapshot from prior stages, decides whether to keep, transform, or replace. That's a one-line skill instruction, not a backend mode.

### Acceptance

- Studio review surface for an entry at any stage shows the operator's actual work-in-progress without needing to update `artifactPath`
- `/deskwork:approve` at any stage boundary preserves the prior-stage's content as a frozen scrapbook snapshot
- Atomic-write discipline: kill-power mid-approve doesn't lose the work-in-progress (snapshot is durable on disk before any further mutation)
- Existing v0.16.0 entries with separated `scrapbook/outline.md` artifacts migrate cleanly to the consolidated model
- Version history journal continues to work; per-stage iterations remain queryable via `(entryId, stage, version)`

### Out of scope

- Auto-drafting the next stage's content from the prior stage's snapshot (agent's job, not backend's)
- Branching: multiple parallel "drafts" from one approved outline. (If needed: stays Option A for those entries; the model can coexist via a sidecar flag.)

### Origin

Surfaced 2026-05-06 mid-session producing a worked-example dispatch about the Roland MC-500mkII MIDI-to-MCU bridge. Drafted full longform body at Outlining stage (`--kind longform`) — operator's correction "you didn't write an outline" landed; switched to `--kind outline` and wrote outline to `scrapbook/outline.md`. The studio review surface continued to render the empty `index.md` because `artifactPath` was still set there from the migration. Worked around by manually flipping `artifactPath` in the sidecar JSON. The architectural fix is what this issue proposes.

Related:
- audiocontrol#386 — VO-to-overlay subtitle pipeline + named themes (the parent feature this dispatch is part of)
- deskwork#218 — missing legacy-calendar-to-sidecars migration rule
- deskwork#219 — `missing-frontmatter-id` false positives on Ideas/non-blog entries
<!-- SECTION:DESCRIPTION:END -->
