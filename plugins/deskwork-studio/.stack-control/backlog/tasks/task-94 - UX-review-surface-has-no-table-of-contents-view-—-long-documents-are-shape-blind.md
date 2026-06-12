---
id: TASK-94
title: >-
  UX: review surface has no table of contents view — long documents are
  shape-blind
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-73
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## UX gap surfaced during 2026-04-29 PRD review

The unified review surface at `/dev/editorial-review/<workflow-id>` renders the document body inline with no table of contents view. For long documents (PRDs, multi-phase plans, anything past ~500 lines), the operator can't see the document's overarching shape — they have to scroll the body to discover what's there.

Concretely: reviewing the omnibus deskwork-plugin PRD (workflow `d05ebd7d-…`) in the studio. The PRD has many H2 / H3 sections (Problem Statement, Solution, Acceptance Criteria, Out of Scope, plus Phase-by-Phase extensions added over time). To know whether a particular phase is covered, scope is current, or a section is stale, the operator has to scroll-and-read instead of seeing the structure.

## What's missing

A table of contents view alongside the body — anchored to H1 / H2 / H3 headings in the document, scrollable as a sidebar (or collapsible), with click-through to scroll the body to that section.

## Suggested shape

- **Sidebar TOC** rendered next to the body (or as a collapsible panel): heading text + indentation reflecting H1 / H2 / H3 nesting.
- **Click-through:** clicking a TOC entry scrolls the body to that heading (anchor-based; native `id="<slug-of-heading>"` on each heading + smooth scroll).
- **Active-section highlighting** as the operator scrolls — the TOC entry corresponding to the heading currently in view gets a visual marker.
- **Optional: section-level margin-note count** on each TOC entry — *"§ 3 notes"* — so the operator sees which sections have unresolved comments at a glance.

The first two bullets are the minimum useful version; #3 and #4 are polish.

## Acceptance

- The review surface for any document longer than the viewport (rough threshold: 5+ headings) renders a TOC sidebar (or collapsible panel) reflecting the heading hierarchy.
- Clicking a TOC entry scrolls the body to that heading.
- The body's existing edit / margin-note / decision-control affordances remain unaffected — TOC is additive.

## Origin

Surfaced 2026-04-29 reviewing the omnibus deskwork-plugin PRD via `/dev/editorial-review/d05ebd7d-6b2a-4875-b537-5189003114c0`. Operator's framing: *"there's no table of contents view in the review UI so we can't see the overarching shape of the document."*

Filed for triage; not addressed in this session per operator direction.
<!-- SECTION:DESCRIPTION:END -->
