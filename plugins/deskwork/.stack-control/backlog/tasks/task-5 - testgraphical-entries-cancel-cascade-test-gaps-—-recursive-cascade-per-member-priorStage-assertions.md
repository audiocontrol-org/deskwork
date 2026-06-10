---
id: TASK-5
title: >-
  test(graphical-entries): cancel-cascade test gaps — recursive-cascade +
  per-member priorStage assertions
status: To Do
assignee: []
created_date: '2026-06-10 18:59'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-363
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/363

## Summary

Step 7.2.7's per-commit Track 3 code-quality review of `4e3b911` flagged two test-coverage gaps in `packages/core/test/entry/cancel-cascade.test.ts`. Both are low/medium-severity test-coverage shortfalls — not active bugs — but the missing assertions would prevent the existing test suite from catching specific regression classes in the cascade walker.

## Gap 1 — recursive-cascade not exercised (medium)

The walker recursively invokes itself when a cascaded member is itself a group (`packages/core/src/entry/cancel.ts:198-205`), and the result-flattening logic on lines 212-217 specifically handles nested `cascadedMembers` / `skippedMembers` arrays. None of the four cascade tests in `cancel-cascade.test.ts` exercise this path — they only test flat 3-member groups.

Doctor's `group-recursive` rule (Task 7.5.1, not yet shipped) will refuse recursive groups at lint time, but the cancel code path still has to handle the shape gracefully if a recursive group ever exists on disk (e.g., pre-doctor migration state).

### Regression test to add

Seed `group-top` → `group-mid` → `[leaf-a, leaf-b]`, cascade-cancel the top group, and assert:

- All four entries (top + mid + 2 leaves) transitioned to `Cancelled`.
- `regenerateCalendar` called exactly once.
- The top-level `result.cascadedMembers` array contains all three downstream entries (flattened from the nested walker call's result).

## Gap 2 — `priorStage` not asserted for cascaded members (low)

The cascade test asserts `currentStage === 'Cancelled'` for the head + cascaded members but does not assert `priorStage` is preserved on the cascaded members (`memberA` / `memberB` / `memberC`). The legacy single-entry test (`packages/core/test/entry/cancel.test.ts:31`) covers `priorStage` for the head entry only.

A regression that dropped `priorStage` writing inside the cascade walker (or wrote it incorrectly — e.g., wrote the head's `priorStage` instead of the member's) would not be caught by the current suite.

### Regression test to add

Extend an existing cascade test (or add a small one) with per-member `priorStage` assertions:

```ts
expect((await readSidecar(projectRoot, memberA)).priorStage).toBe('Drafting');
expect((await readSidecar(projectRoot, memberB)).priorStage).toBe('Outlining');
```

## Why this is filed instead of fixed in the Step 7.2.7 review-action commit

Both gaps are test-coverage shortfalls, not bugs. The Step 7.2.7 review-action commit landed two trivial fixes (test docblock drift + one-line code comment); extending the test suite with recursive-cascade seeding + per-member `priorStage` assertions is a wider change appropriate for its own commit. Filing here per `.claude/rules/agent-discipline.md`'s two-track recording requirement so the deferral is visible alongside Phase 7's other test-coverage debt.

## Acceptance criteria

- [ ] Recursive-cascade test added: 3-level group nesting; top-level cancel propagates correctly; regenerate exactly once; flattened `cascadedMembers` array contains all downstream entries.
- [ ] Per-member `priorStage` assertions added to the existing 3-member cascade test (or a new variant).
- [ ] Tests live in `packages/core/test/entry/cancel-cascade.test.ts` alongside the existing four cases.
- [ ] AUDIT-20260529-23 + AUDIT-20260529-24 (the audit-log entries that surface these gaps) flip to `fixed-<sha>` when the work lands.

## Surfaced by

Step 7.2.7 Track 3 code-quality review of `4e3b911`. Audit-log entries `AUDIT-20260529-23` (recursive-cascade gap, medium) and `AUDIT-20260529-24` (priorStage gap, low) at `docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md`.

## Out of scope

- Refactoring the existing four cascade tests for any reason other than adding the missing assertions.
- Adding tests for sibling verbs (`approve` / `block` / `induct` / `publish`) — none of those have cascade behavior in v1.

## Defer-rationale

The two gaps are coverage shortfalls, not active bugs. The walker's behavior for recursive groups + cascaded-member `priorStage` is correct by code reading; the missing tests would catch future regressions but no regression exists today. Filing as a tracked debt item under Phase 7's testing follow-ups so the Phase 7 closeout (`/dw-lifecycle:complete`) has explicit visibility on the deferred items. The Step 7.2.7 review-action commit absorbs only the two trivial fixes; widening the test suite is its own commit.
<!-- SECTION:DESCRIPTION:END -->
