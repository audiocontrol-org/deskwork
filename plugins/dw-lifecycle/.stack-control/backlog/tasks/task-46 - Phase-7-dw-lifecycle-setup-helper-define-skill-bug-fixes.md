---
id: TASK-46
title: 'Phase 7: dw-lifecycle setup-helper + define-skill bug fixes'
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-135
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of #134 (dw-lifecycle Phase 7 + 8 umbrella).

## Phase 7 — Setup-helper + define-skill bug fixes

Six discrete defects in `dw-lifecycle:setup` and `dw-lifecycle:define` that block adopter-grade end-to-end runs. All surfaced during the customize-hooks dogfood on 2026-04-30 and filed individually:

- #125 — adopter cache-vs-PATH ergonomics
- #126 — setup SKILL prose contradicts helper behavior
- #127 — define SKILL prescribes bare `/tmp/<predictable-name>` path
- #128 — setup worktree path uses current-worktree name as `<repo>` token
- #129 — setup `--definition` puts content in workplan.md, leaves PRD bare
- #130 — setup doesn't write `deskwork.id` UUID to PRD frontmatter

## Workplan

`docs/1.0/001-IN-PROGRESS/dw-lifecycle/workplan.md` Tasks 47–53 (one task per defect, plus a Phase 7 verification task).

## Acceptance criteria

- [ ] All six constituent issues closed
- [ ] Fresh `/dw-lifecycle:define` → `/dw-lifecycle:setup` dogfood produces a structurally correct PRD + workplan + README without manual fix-up
- [ ] No regression in existing tests; new tests added per workplan tasks
<!-- SECTION:DESCRIPTION:END -->
