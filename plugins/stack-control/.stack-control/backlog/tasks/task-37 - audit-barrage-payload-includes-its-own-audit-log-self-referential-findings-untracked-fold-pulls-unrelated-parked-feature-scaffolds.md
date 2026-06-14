---
id: TASK-37
title: >-
  audit-barrage payload includes its own audit-log -> self-referential findings;
  untracked-fold pulls unrelated parked-feature scaffolds
status: Done
assignee: []
created_date: '2026-06-11 00:50'
updated_date: '2026-06-13 19:03'
labels:
  - agent-found
  - 'type:bug'
  - promoted
dependencies: []
references:
  - gh-431
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
audit-barrage payload includes its own audit-log, generating self-referential findings; the untracked-fold also pulls unrelated parked-feature scaffolds into the diff. Owning surface: multi:feature/migrate-audit-barrage. Migrated 2026-06-11 from roadmap node multi:fix/audit-barrage-self-referential (originating issue gh-431, closed).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/014-audit-protocol-reliability

specs/014 US5 implemented: implement payload excludes the feature root audit-log from BOTH diff arms (pathspec + fold skip) and scopes the untracked fold to the feature under audit. Commits c5cb3a7b/9927de3a (RED/fix).

Verified 2026-06-13 in the current stack-control worktree: `npx vitest run src/__tests__/govern-payload-self-reference.test.ts src/__tests__/govern/payload-exclusion.test.ts` passed (16 tests). Marked Done on that basis.
<!-- SECTION:NOTES:END -->
