---
id: TASK-135
title: >-
  Mechanize backlog->roadmap promotion — one-move propose-create-and-link
  instead of hand-running roadmap add + backlog promote
status: To Do
assignee: []
created_date: '2026-06-15 20:50'
updated_date: '2026-06-15 20:55'
labels:
  - agent-found
  - 'type:gap'
  - promoted
dependencies: []
references:
  - >-
    motivated by the 2026-06-15 manual promotion of TASK-134 (two hand steps);
    relates to TASK-134
ordinal: 135000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today promoting TASK-134 into the roadmap took two hand-driven steps: (1) stackctl roadmap add with a manually-chosen identifier (phase:kind/slug), status, depends-on edges, --ref TASK-id, and a hand-written --scope description, then (2) stackctl backlog promote --to roadmap:<node> to record the linkage. The promote verb is deliberately record-only (never creates the target), so the create step is always a separate manual act that relies on the operator remembering the convention and hand-authoring the node. Desired: a single mechanical move (e.g. stackctl backlog promote --create-roadmap, or a roadmap promote-from-backlog verb) that, given a backlog item, PROPOSES the roadmap node derived from the item — phase/kind inferred from labels/type, slug from the title, status planned, candidate depends-on edges, ref=<TASK-id> back-reference, description seeded from the item body — shows the proposed node + linkage as a dry-run, and on --apply CREATES the node AND records the promote linkage in one atomic move. Preserves the record-only-promote precedent's intent (bidirectional navigability, no lost thread) while removing the stamina-dependent hand-authoring. Sibling of TASK-134 (post-release resolution cycle) under the same mechanize-the-lifecycle-ceremony theme.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** roadmap:multi:feature/backlog-promotion-mechanization
<!-- SECTION:NOTES:END -->
