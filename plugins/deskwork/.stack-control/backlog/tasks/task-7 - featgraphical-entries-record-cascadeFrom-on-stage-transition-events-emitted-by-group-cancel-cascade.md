---
id: TASK-7
title: >-
  feat(graphical-entries): record cascadeFrom on stage-transition events emitted
  by group cancel --cascade
status: To Do
assignee: []
created_date: '2026-06-10 18:59'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-359
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/359

## Summary

Group cancel `--cascade` walks `members[]` and recursively cancels each one (or skips the member if it's already off-pipeline / terminal). Today the cascade emits one `stage-transition` journal event per affected entry, but the events do NOT carry the originating group's entry id — there's no `metadata.cascadeFrom` linkage.

Result: the audit trail of "which cancels were part of which cascade" is only reachable via the cancel-time stdout JSON result (the `cascadedMembers[]` / `skippedMembers[]` arrays). Once the operator's terminal scrollback is gone, the journal events look identical to single-entry cancels.

## Why this matters

- **Audit recovery.** A future doctor rule or studio surface that wants to ask "which cancels were caused by which group cascade?" can't answer the question today — the only durable record of the cascade is the timestamp clustering, which is fragile.
- **Operator UX.** The studio's cancel-affordance could surface "this cancel was part of a `<group-slug>` cascade" if the linkage existed, giving operators context when reviewing recent activity.
- **Test fixture readability.** Cascade tests today assert on the structural cancel-result; assertions against journal events would be more durable if they could grep for cascade source.

## Recommended shape

Extend `StageTransitionEvent` (`packages/core/src/schema/journal-events.ts`) with an optional `metadata: { cascadeFrom?: string }` field. The cascade walk in `cancel.ts:193` would pass `cascadeFrom: <originatingGroupUuid>` through to each recursive `cancelEntry` call, and `cancelEntry` would attach it to the emitted event.

Backward compat: pre-existing journal events without `metadata.cascadeFrom` continue to parse cleanly (`metadata` is optional; `cascadeFrom` is optional within).

## Surfaced by

Track 3 code-quality review of `15dd424` (Phase 7 Task 7.2 commit). Audit-log entry AUDIT-20260529-17.

## Out of scope

- Cascade for other universal verbs (block, induct, approve, publish) — those don't have cascade today.
- Bi-directional linkage (group → list of cancelled members on the group's own event). The cascade result already includes that via `cascadedMembers[]`; the journal-event side just needs the reverse linkage.

## Acceptance criteria

- [ ] `StageTransitionEvent` schema extended with optional `metadata.cascadeFrom`.
- [ ] Group cancel `--cascade` populates `metadata.cascadeFrom` on every cascaded member's event.
- [ ] Cancel without `--cascade` does NOT populate it (no behavior change for the default path).
- [ ] Cascade tests assert the cascadeFrom presence + value.
- [ ] `journal-events.ts` docblock above the group-* events restored to claim the `cascadeFrom` linkage (the current docblock — post-AUDIT-20260529-17 fix — explicitly says the linkage does NOT exist today).
<!-- SECTION:DESCRIPTION:END -->
