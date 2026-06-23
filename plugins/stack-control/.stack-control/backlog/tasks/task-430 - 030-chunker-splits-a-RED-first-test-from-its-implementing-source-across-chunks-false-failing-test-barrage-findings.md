---
id: TASK-430
title: >-
  030 chunker splits a RED-first test from its implementing source across chunks
  -> false 'failing test' barrage findings
status: Done
assignee: []
created_date: '2026-06-22 09:03'
updated_date: '2026-06-23 06:09'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - specs/030-chunked-end-govern/audit-log.md#chunker-test-source-split
ordinal: 430000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
META-FINDING from 030's own govern dogfood: findings -09/-12/-13 were FALSE POSITIVES (all 14 tests pass) because the chunker placed RED-first tests in one chunk and their implementing source in sibling chunk a689a8ac. The model auditing the test-only chunk read stale TDD-era comments ('FAILS today') and reported a failing test, blind to the fix. Fix direction: coupling should keep a test file in the same chunk as its implementing source (or seam/manifest should surface 'source for this test is in chunk X').
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: verified in formally-installed release v0.53.2 (PR #497); fix present in installed cache + clean boot
<!-- SECTION:NOTES:END -->
