---
id: TASK-70
title: 'UX: index vs dashboard content-container width mismatch'
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-177
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Child of #158 (Phase 34d split).

## Trigger

Operator-noted in #158: "The index page has a relatively narrow content container. The dashboard uses a relatively wider content container."

## Surfaces

- `/dev/` (index — narrower)
- `/dev/editorial-studio` (dashboard — wider)

## Candidate fix

Pick one max-width token (likely already in `editorial-review.css`) and apply to both. Either widen the index to match dashboard, or narrow dashboard to match index, or introduce a single shared `--er-page-content-max` variable both consume.

## Out of scope

Other surface widths (content view, compositor's desk, etc.) — covered by sibling child issues.

## Filed under

Phase 34d's #158 split. Operator-driven design pass.
<!-- SECTION:DESCRIPTION:END -->
