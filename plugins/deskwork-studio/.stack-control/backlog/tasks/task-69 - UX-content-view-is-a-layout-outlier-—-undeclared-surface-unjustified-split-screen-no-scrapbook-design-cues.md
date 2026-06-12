---
id: TASK-69
title: >-
  UX: content view is a layout outlier — undeclared surface, unjustified
  split-screen, no scrapbook design cues
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-179
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Child of #158 (Phase 34d split).

## Trigger

Operator-noted in #158: "The 'Content' page is a weird outlier that doesn't declare what it is and the layout is confusing and a lot different than the other pages. It also has a split screen layout that doesn't appear to be *for* anything. This is a very strange page. It's supposed to be a sort of birds-eye view of the content and doesnt seem to be that. Also, it should probably share design cues with the redesigned scrapbook."

## Three sub-concerns within one surface

1. **Undeclared surface.** The page doesn't have a clear purpose statement / kicker / header that names what the operator is looking at.
2. **Unjustified split-screen.** Two-pane layout doesn't earn its complexity — operators don't have an obvious mental model for what each pane is for.
3. **Aesthetic divergence from scrapbook.** Should share the redesigned scrapbook's design vocabulary (`.scrap-*` patterns, aside-left + main-right composition, per-kind ribbons, etc.) — they're conceptually adjacent surfaces (content tree vs. per-entry scrapbook) and should feel like the same family.

## Surface

- `/dev/content` (and the per-site `/dev/content/<site>` variant)

## Candidate fix

- Add a kicker + heading naming the surface ("Content view — birds-eye browse" or similar).
- Reconsider the split-screen: either make each pane's purpose explicit (e.g. tree on left, drilldown detail on right) or collapse to a single column.
- Adopt the scrapbook redesign's design tokens / classes for visual continuity.

This is the largest of the four #158 children — likely warrants a `/frontend-design` review pass since it touches composition.

## Filed under

Phase 34d's #158 split. Operator-driven design pass.
<!-- SECTION:DESCRIPTION:END -->
