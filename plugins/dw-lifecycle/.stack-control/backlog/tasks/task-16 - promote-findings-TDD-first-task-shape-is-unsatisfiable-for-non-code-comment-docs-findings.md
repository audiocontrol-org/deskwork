---
id: TASK-16
title: >-
  promote-findings: TDD-first task shape is unsatisfiable for non-code
  (comment/docs) findings
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-392
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`promote-findings --auto` (the disposition path the `/dwi` end-of-task audit-barrage hook runs when the dampener is NOT engaged) stamps a **uniform TDD-first task shape** onto every audit finding it scopes into a workplan: Step 1 "write failing test exercising the bug" + acceptance criteria "`npx vitest run <test-file-path>` exits 0".

That shape is **unsatisfiable for non-code findings** (comment-only, docs, pointer-naming, config). Those fixes have no vitest contract, so the generated `[ ] Failing test exists` / `[ ] npx vitest run exits 0` criteria can never legitimately be checked — and `check-fix-task-tdd` (the commit-msg gate) would refuse the `Closes AUDIT-<id>` commit, or force the operator to close on partial criteria.

Surfaced by audit-barrage on the `decompose-agent-discipline` feature (finding AUDIT-20260602-08, severity low):

- Task 7 (AUDIT-02): fix was a comment-only maintenance guardrail in `frontmatter.ts` — no test possible.
- Task 10 (AUDIT-05): fix was pointer-naming + a repo-wide grep — documentation, no test.

Both show `[x] Audit-log Status flipped to fixed-<sha>` while their `[ ]` test criteria sit permanently unchecked.

## Proposed fix

`promote-findings` should classify a finding's likely fix-shape and emit an alternate acceptance shape for non-code findings — e.g. a "verified-by-inspection" disposition or a doc-assertion criterion — rather than a phantom vitest path. At minimum, `check-fix-task-tdd` should recognize a non-code fix-task marker and not demand a test file for it.

## Provenance

- Source feature: `docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/audit-log.md` § AUDIT-20260602-08 (slushed: `acknowledged-slush-pile-2026-06-02`).
- This is a dw-lifecycle tooling gap (promote-findings / check-fix-task-tdd), not a bug in the decompose-agent-discipline feature.
<!-- SECTION:DESCRIPTION:END -->
