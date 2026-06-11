---
id: TASK-72
title: 'Design: entry-keyed reject semantics for the longform decision strip'
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-173
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Layer 2 of Phase 34a (#171) ships the longform decision strip with `reject` disabled because the entry-centric model has no defined `reject` action yet (workflow-keyed `reject` wrote a journal annotation; the entry-centric equivalent is undecided). Operator decision needed: should `reject` block the entry, set a `reviewState: 'rejected'` flag, file a margin annotation, or something else? Until decided, the button stays disabled and tooltipped.
<!-- SECTION:DESCRIPTION:END -->
