---
id: TASK-6
title: >-
  audit-barrage payload includes its own audit-log -> self-referential findings
  (AUDIT-28/42/48 generator); untracked-fold pulls unrelated parked-feature
  scaffolds
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - bug
  - enhancement
dependencies: []
references:
  - gh-431
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Surfaced:** repeatedly during the `design/document-primitives` (005) implement-phase governance loop — the same non-finding re-fired across rounds 1, 2, and 7 as **AUDIT-20260608-28 -> -42 -> -48**, and the audit protocol's own dampener kept slushing it.

## The generator

`stackctl govern --mode implement` diffs the implemented work against a base ref and folds the result (including untracked-but-not-ignored files) into the barrage payload. The payload therefore includes the **feature's own `audit-log.md`** (it lives under the feature docs tree and is part of the diff range). Because earlier findings quote file paths in their prose, each subsequent barrage round re-reads the prior round's quoted paths *inside the audit-log* and "re-discovers" them as if they were new repository files.

Concretely: AUDIT-28 described a hallucinated re-rooted path `Users/orion/.../specs/002-.../plan.md` (the absolute worktree path the auditor imagined from an untracked-file diff rendering). That prose entered the audit-log; rounds 2 and 7 (AUDIT-42, AUDIT-48) then re-flagged the *same string* as "actually present", each insisting prior rounds wrongly dismissed it. Verified 3x: `git ls-files`, `git diff --name-only <base>..HEAD`, and `find` all show **no such path** tracked, in-diff, or on disk — every occurrence is audit-log prose.

This is a **non-convergent generator**: the audit-log grows each round (more dispositions quoting the path), so the self-reference strengthens. It cannot be resolved within a feature; it is a govern-payload design issue.

## Also folded: unrelated parked-feature scaffolds

The untracked `specs/002-parallel-execution-engine/plan.md` (a blank `/speckit-plan` template for the *parked* 002 feature, unrelated to 005) was folded into every 005 barrage payload by the indiscriminate untracked-fold, producing recurring out-of-scope findings (AUDIT-29).

## Suggested fixes (for `multi/migrate-audit-barrage`)

1. **Exclude the feature's own `audit-log.md`** (and ideally the whole governance-bookkeeping surface) from the barrage payload/diff — the barrage should audit *implementation*, not its own findings ledger.
2. **Scope the untracked-fold** to the feature under audit (or exclude other features' `specs/<n>/` scaffolds) so a parked feature's blank templates don't pollute an unrelated feature's payload.

Without (1), a thorough multi-round implement-phase governance loop cannot reach a clean zero-finding floor — the audit-log self-reference is an inexhaustible finding source.
<!-- SECTION:DESCRIPTION:END -->
