---
id: TASK-53
title: >-
  UX: /dw-lifecycle:help Step 3 'list dw-lifecycle-related issues' has
  unspecified search predicate
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-116
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`/dw-lifecycle:help` Step 3 reads:

> List open dw-lifecycle-related GitHub issues across the repo.

The "dw-lifecycle-related" predicate is not defined. Different invocations will produce different lists depending on which interpretation the model picks.

## The ambiguity

Reasonable interpretations include:

1. Issues with a `dw-lifecycle` label (label search).
2. Issues whose title contains `dw-lifecycle` (title-only substring match).
3. Issues whose title or body contains `dw-lifecycle` (full-text search — what I used: `gh issue list --search "dw-lifecycle in:title,body"`).
4. Issues filed by the dw-lifecycle skills (would require a tracking convention).
5. Issues in some specific milestone or project board.

Each predicate yields a different set. Running the skill twice with different interpretations gives different results — operator can't tell whether the list is exhaustive, narrow, or wrong.

## Reproduction

Pick any host repo with mixed-topic issues. Invoke `/dw-lifecycle:help`. Observe Step 3 output. Re-run with a different model session — the predicate may change. In this session I used full-text title+body search and got a single false positive (issue #94, which is about deskwork's Phase 26 npm-publish work, not the dw-lifecycle plugin).

## Suggested fix

Pin the predicate in the SKILL.md. Concrete options:

- **Label-based** — agree on a `dw-lifecycle` label; document it in the skill (`gh issue list --label dw-lifecycle --state open`). Cleanest but requires operator discipline to label issues.
- **Title-prefix-based** — issues filed by `/dw-lifecycle:*` skills could prefix titles with `[dw-lifecycle]`; query is `gh issue list --search "[dw-lifecycle] in:title" --state open`. Self-organizing but ugly.
- **Repo-scoped + literal** — explicitly document that Step 3 searches title+body for the literal string `dw-lifecycle` and accepts false positives; operator filters mentally. Most honest about what's actually feasible without a labeling convention.

Whichever one is chosen, the skill should hardcode the exact `gh` invocation in Step 3 so two runs of the same skill produce the same list.

## Environment

- dw-lifecycle plugin v0.9.7
- Surfaced while dogfooding `/dw-lifecycle:help` against the deskwork repo itself.

## Related

Sibling friction filed alongside: `/dw-lifecycle:help` does not surface missing-config state (separate issue).
<!-- SECTION:DESCRIPTION:END -->
