---
id: TASK-23
title: >-
  stackctl backlog promote has no inverse (un-promote / re-home) verb —
  correcting a mis-promote requires hand-editing the task
status: Done
assignee: []
created_date: '2026-06-10 21:54'
updated_date: '2026-06-22 21:07'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repro: backlog promote <id> --to <ref> records a 'promoted' label + a 'Promoted-to:' Implementation Notes line (record-only). There is no command to reverse or re-target it; re-promoting an already-promoted item is refused by the idempotent guard (promote.ts validates every id is un-promoted). So a mis-promote (wrong target, or scope changed) cannot be corrected through the verb. Workaround used (2026-06-10, narrowing specs/013): native 'backlog task edit <id> --remove-label promoted --notes ""' to strip the label + clear the Promoted-to notes, then re-promote to the correct target. This is the missing-un-promote-verb tooling gap (off-roads from the stackctl wrapper into the backlog.md binary). Suggested-fix: add 'stackctl backlog promote <id> --undo' (or 'unpromote <id>' / 're-home <id> --to <new>') that removes the promoted label + Promoted-to linkage (and optionally records a new one), mirroring the record-only promote. Note: when the promote is uncommitted, git restore works; once committed, only a hand-edit does — which is why the inverse verb is needed.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Resolved by 028 (backlog unpromote verb — the promote inverse); verified in src + backlog-unpromote.test.ts.
<!-- SECTION:NOTES:END -->
