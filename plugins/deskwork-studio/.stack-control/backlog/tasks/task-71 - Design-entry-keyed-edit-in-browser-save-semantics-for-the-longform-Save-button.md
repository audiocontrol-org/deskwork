---
id: TASK-71
title: >-
  Design: entry-keyed edit-in-browser save semantics for the longform Save
  button
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-174
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Layer 2 of Phase 34a (#171) ships the longform edit toolbar with Save as new version disabled because the entry-keyed model has no defined edit-in-browser save semantics.

The legacy workflow-keyed save POSTed the new markdown to `/api/dev/editorial-review/version`, which wrote a new version JSON to the workflow journal. The entry-keyed equivalent (`/api/dev/editorial-review/entry/:entryId/version`) calls `iterateEntry`, which reads the on-disk file rather than accepting a request body. This means the studio's edit-in-browser then save flow has no entry-keyed endpoint that combines write-to-disk plus iterate-record.

Operator decision needed: should the entry-keyed version endpoint accept an optional markdown body, write it to `entry.artifactPath`, then call `iterateEntry`? Or should the studio's edit mode require the operator to save through their editor (Cmd+S in their IDE, etc.) and the studio's Save button just calls iterate against the resulting on-disk content? Until decided, the Save button stays disabled and tooltipped.

The current Layer 2 ship: edit mode renders the source pane and the Markdown preview, but Save is inert pending this design decision.
<!-- SECTION:DESCRIPTION:END -->
