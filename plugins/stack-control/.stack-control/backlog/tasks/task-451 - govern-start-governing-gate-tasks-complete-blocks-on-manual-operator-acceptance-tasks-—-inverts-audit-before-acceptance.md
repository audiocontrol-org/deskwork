---
id: TASK-451
title: >-
  govern start-governing gate (tasks-complete) blocks on manual
  operator-acceptance tasks — inverts audit-before-acceptance
status: To Do
assignee: []
created_date: '2026-06-25 19:02'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-501
ordinal: 450000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

The `start-governing` exit gate (`tasks-complete spec`) counts **every** `- [ ]` checkbox in
`tasks.md`, including tasks that are inherently **manual, operator-executed acceptances** that should
run *after* the cross-model govern pass — not before it. This inverts audit-before-acceptance and
blocks `stackctl govern --mode implement` on work the implementing agent cannot (and should not) do.

## Where

- `src/workflow/gate-eval.ts` → `tasksComplete()` matches `^\s*-\s+\[( |x|X)\]` and requires
  `done === total`.
- The `governing` phase entry refuses with `verdict 'ahead' ... exit gate is unmet (tasks-complete spec)`
  while any checkbox is unchecked.

## Concrete case (offing, spec 007 capture-fidelity)

`specs/007-capture-fidelity/tasks.md` ended with T001–T014 (the full hermetic implementation,
committed + suite-green) plus **T015 = "Operator live re-bless (manual, read-only) ... Final
acceptance (SC-005)"** — a live-production operation the operator runs by hand. With T015 unchecked,
`stackctl govern --mode implement` refused (`tasks-complete` unmet), even though the *code* was ready
to audit. The code audit logically belongs **before** the operator spends a live-prod run; the gate
forced the opposite order.

## Workaround used

Relocated T015 out of the gated checkbox list into a non-checkbox "Acceptance (operator-executed,
post-govern)" section, clearly marked **PENDING** (not faked-done, not deleted). This satisfied the
gate honestly (all *implementation* tasks complete) without `--override`. It works, but it relies on
authors knowing the gate only counts `- [ ]` lines — fragile and non-obvious.

## Suggested fix

Give `tasks.md` a first-class way to mark a task as a **manual/operator acceptance** that the
`tasks-complete` gate excludes — e.g. a recognized marker (`- [~]` deferred / `- [manual]`) or a
designated "Acceptance" section the parser skips — so audit-before-live-acceptance is the default and
authors don't have to hand-roll a non-checkbox bullet to avoid gaming the count.
<!-- SECTION:DESCRIPTION:END -->
