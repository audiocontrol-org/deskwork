---
id: TASK-34
title: >-
  scope-discovery: design + implement scope-widen verb (Phase 6 Task 1 + Phase 7
  Task 1)
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-292
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

Implement `dw-lifecycle scope-widen "<complaint>"` — the operator-driven widening verb that takes a free-text complaint ("the feature didn't catch X", "we missed Y when implementing Z") and runs a targeted re-inventory against the project's source tree to produce additional pattern matches that would have caught the missed scope.

Tracks Phase 6 Task 1 (subcommand) + Phase 7 Task 1 (skill prose). Both were marked DEFERRED because the subcommand contract isn't yet fixed; authoring without the design would be premature scope.

Tracks the parent feature [#273](https://github.com/audiocontrol-org/deskwork/issues/273).

## Context

The scope-discovery protocol exposes two main verbs for the inventory side:

- `/dw-lifecycle:scope-inventory <slug>` runs the standard 4-agent fan-out + Phase 4 config-activated agents against a PRD.
- `/dw-lifecycle:scope-widen "<complaint>"` (this issue) would take operator feedback — "we missed X" or "the feature didn't catch Y" — and run a targeted re-inventory that produces additional pattern matches that would have surfaced the gap.

The widening is operator-driven by design: the complaint becomes the input to a focused pattern-hunter pass that tries to enumerate every existing instance of the missed concept. The output extends the project's pattern-matrix override or the anti-patterns registry so the gap is caught next time.

## Why deferred

scope-widen needs design work before implementation. Open questions:

1. How does the verb tokenize the complaint? PRD-themed pattern hunter handles PRD frontmatter + body; scope-widen handles arbitrary operator text. Same tokenizer or different?
2. Does scope-widen output a new pattern-matrix entry, or does it propose registry entries the operator commits to? (The proposal-vs-direct-write boundary is the design call.)
3. Does scope-widen accept multiple complaints in one pass, or is it strictly one-complaint-per-invocation?
4. How does scope-widen interact with `regime-holdout-detector` (Phase 4)? Likely they share infrastructure, but the activation contract needs spelling.

These design questions warrant a focused design dispatch — likely via `/frontend-design`'s parallel-mockup approach but for CLI verb semantics — before implementation begins.

## Acceptance criteria

- [ ] Design dispatch produces 2-3 verb-semantic alternatives for the operator to pick.
- [ ] Picked design lands as a subcommand + library API + skill prose + commands/<name>.md mirror.
- [ ] Tests against a synthetic complaint + a fixture project tree.
- [ ] Documentation explains where scope-widen output lands (registry update vs proposal).
- [ ] Integration with `/dw-lifecycle:implement` flow (per Phase 7 Task 2 deferred items).

## Suggested approach

- Run `/frontend-design` to enumerate verb-semantic alternatives (proposal-vs-direct-write, single-vs-multi-complaint, integration shape).
- Land the design as a workplan extension.
- Implement against the agreed design.
<!-- SECTION:DESCRIPTION:END -->
