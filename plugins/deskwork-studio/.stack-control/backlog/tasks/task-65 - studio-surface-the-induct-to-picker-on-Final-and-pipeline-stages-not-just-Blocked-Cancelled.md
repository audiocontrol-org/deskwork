---
id: TASK-65
title: >-
  studio: surface the induct-to picker on Final and pipeline stages, not just
  Blocked/Cancelled
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-193
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem

The `/deskwork:induct` skill supports moving an entry to any pipeline stage from any source — including `Final → Drafting` (revoke Final-status), or going backwards from any pipeline stage to an earlier one. The skill is the documented universal-teleport verb in the deskwork lifecycle.

The studio's review surface does not expose this. The decision strip only renders the induct-to picker for entries in `Blocked` or `Cancelled` (see `packages/studio/src/lib/stage-affordances.ts:33-44`). For an entry in `Final`, or for the common case of "I want to bump this back to a prior pipeline stage to fix something," there is no UI affordance at all — the operator has to know the skill exists and type `/deskwork:induct <slug> --to <Stage>` manually into a Claude Code chat.

## Why this matters

The Final-back-to-Drafting flow is real: an operator approves Drafting → Final, then later notices something that needs further iteration before publishing. Per the skill, the answer is `/deskwork:induct <slug>` (Drafting is the default `--to` for Final sources). But discovering that the skill exists requires reading SKILL.md or the CLI help; the studio gives no hint. Same for the "I approved too eagerly, send me back to Outlining" flow from any pipeline stage.

The shape of the gap matches the THESIS Consequence 2 commitment exactly — **the studio routes commands; the skill does the work**. The induct picker is the routing UI; today it routes only from Blocked/Cancelled. Extending it to Final + pipeline stages doesn't change the architecture, it just completes the routing surface.

## Proposed fix

Extend `getAffordances` in `packages/studio/src/lib/stage-affordances.ts` so the induct picker is surfaced from every stage that the skill supports as a source:

- **Pipeline stages (Ideas, Planned, Outlining, Drafting, Final)**: add `'induct-to'` to `controls` alongside the existing pipeline controls. Picker options exclude the current stage (no-op induct) and exclude `Published` (frozen — fork-on-edit is deferred).
- **Final**: same picker, default option `Drafting` per the skill's defaults.
- **Blocked / Cancelled**: unchanged (already exposed today; defaults to `priorStage`).

The picker change-handler already builds `/deskwork:induct <slug> --to <Stage>` and routes to clipboard via `copyOrShowFallback` (per #189). No client-side wiring change is needed for the new sources — the existing handler keys off `target.name === 'induct-to'` regardless of current stage.

The picker's visual placement on a pipeline-stage decision strip needs a small design call: the strip already has Approve / Iterate / Reject / historical-stage-dropdown; adding the induct picker as a sibling control is the simplest shape and preserves the affordance-placement rule (the picker is component-attached to the decision strip, where every other stage-action affordance lives).

## Acceptance criteria

- [ ] `getAffordances` returns `'induct-to'` in `controls` for Ideas, Planned, Outlining, Drafting, Final, in addition to today's Blocked/Cancelled.
- [ ] The decision strip renders the picker on every above-listed stage, with options that exclude the current stage and `Published`.
- [ ] Selecting an option from the picker copies the corresponding `/deskwork:induct <slug> --to <Stage>` command to the clipboard, same path as today's Blocked/Cancelled picker.
- [ ] Final's default-selected option is `Drafting` (matches the skill's `From Final → Drafting` default), so the most common case is a single click + paste.
- [ ] Smoke: navigate to a Final-stage entry's review surface, see the picker; navigate to a Drafting-stage entry, see the picker; both produce the right clipboard command.
<!-- SECTION:DESCRIPTION:END -->
