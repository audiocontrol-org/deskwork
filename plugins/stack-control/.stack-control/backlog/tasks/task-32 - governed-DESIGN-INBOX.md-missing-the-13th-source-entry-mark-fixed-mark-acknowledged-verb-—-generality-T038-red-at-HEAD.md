---
id: TASK-32
title: >-
  governed DESIGN-INBOX.md missing the 13th source entry
  (mark-fixed/mark-acknowledged verb) — generality T038 red at HEAD
status: Done
assignee: []
created_date: '2026-06-11 00:50'
updated_date: '2026-06-11 01:06'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-433
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Governed DESIGN-INBOX.md is missing the 13th source entry (the mark-fixed/mark-acknowledged verb); generality T038 is red at HEAD. Re-migrate or reconcile the inbox against its source. Owning surface: design:feature/document-primitives. Migrated 2026-06-11 from roadmap node design:fix/inbox-migration-drift (originating issue gh-433, closed).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed 2026-06-11: stale — generality T038 (lossless migration, FR-013) is green at HEAD (4/4 in tests/document-primitives/generality.test.ts) and DESIGN-INBOX.md contains the mark-fixed/mark-acknowledged verb entry (line 114). The 13th-entry drift was fixed before gh-433 was closed on 2026-06-10.
<!-- SECTION:NOTES:END -->
