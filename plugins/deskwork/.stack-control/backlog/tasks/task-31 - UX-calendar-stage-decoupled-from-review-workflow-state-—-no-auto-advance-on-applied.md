---
id: TASK-31
title: >-
  UX: calendar stage decoupled from review workflow state — no auto-advance on
  applied
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-61
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/61

## Friction surfaced during 2026-04-28 dogfood

The calendar tracks `stage` (Ideas / Planned / Outlining / Drafting / Review / Published / Paused). The review-journal tracks `workflow.state` (open / iterating / approved / applied / cancelled). These are two state machines, decoupled.

Concretely: the `source-shipped-deskwork-plan` calendar entry is in **`Drafting`** stage. Its review workflow `4180c05e-c6a3-4b3d-8fc1-2100492c3f38` is in state **`applied`** — meaning the operator approved it and `/deskwork:approve` finalized it. Yet the calendar still says it's being drafted. There's no automatic stage advance when a workflow finalizes.

This violates an adopter's reasonable expectation: *"if I approved the document, the calendar should reflect that the review is done."*

## What's missing

A defined relationship between workflow state and calendar stage. Suggested shape:

| Workflow state | Implied calendar stage |
|---|---|
| `open` (just enqueued) | Stage advances to `Review` if not already there |
| `iterating` | Stays in `Review` |
| `approved` | Stays in `Review` |
| `applied` (terminal) | Advances to `Published` (for content meant to publish) OR to a new terminal `Final` stage (for internal docs that don't publish) |
| `cancelled` (terminal) | Reverts to `Drafting` (or whatever pausedFrom recorded) |

The PRD case complicates this — internal docs don't have a `Published` step (no publication URL, no public surface), so applying a review on a PRD shouldn't try to flip it to `Published`. Either:

1. Add a generic terminal stage `Final` that internal docs go to on workflow `applied`. Published stays the externally-published-content terminal.
2. Make the post-`applied` stage a per-collection-type setting: blog → `Published`, doc → `Final` (or just `Drafting` stays, with the workflow state being the source of truth for "done").

## Acceptance

- When a review workflow transitions to `applied`, the bound calendar entry's stage advances appropriately (per collection type or terminal-stage configuration).
- When `cancelled`, the entry's stage reverts to its prior pre-Review stage (or stays in `Drafting`).
- The studio dashboard shows entries that are workflow-`applied` distinctly from entries that are still in active draft — even if the calendar stage logic above takes a release to land.
- Doctor flags entries whose calendar stage and workflow state are out of sync (e.g., `Drafting` + `applied` is a sync gap).

## Origin

Surfaced 2026-04-28 noticing the source-shipped plan calendar entry sits in `Drafting` despite its review workflow being `applied` (the operator's terminal action that finalized last session's recursive dogfood arc). The mismatch was invisible until I read the calendar to remove a different entry. Part of the Phase 23 dogfood arc.
<!-- SECTION:DESCRIPTION:END -->
