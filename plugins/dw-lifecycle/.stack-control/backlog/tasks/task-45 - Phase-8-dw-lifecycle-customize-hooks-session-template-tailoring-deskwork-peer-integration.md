---
id: TASK-45
title: >-
  Phase 8: dw-lifecycle customize-hooks (session/template tailoring + deskwork
  peer integration)
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-136
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of #134 (dw-lifecycle Phase 7 + 8 umbrella).

> **Scope updated 2026-04-30** following design.md v2 review (workflow `applied`). The originally-scoped "Phase 8b — deskwork peer-plugin integration" has been **deferred**. See the "Out of scope (deferred)" section below.

## Phase 8 — customize-hooks: journal-entry template override

dw-lifecycle ships *deskwork's* opinions as *dw-lifecycle's* defaults, most visibly in the `session-start` and `session-end` skills, which hardcode the deskwork journal-entry shape (#122). Adopters whose journal conventions differ have no override path. Phase 8 introduces a markdown-template override mechanism and exercises it on the journal-entry case as the smallest valuable slice that proves the override seam.

**Scope:** Markdown-only resolver, single-category (`templates`), single-template (`journal-entry`). Establishes the resolver-in-core + bin-command-as-consumer + customize-skill seam. Bundled `journal-entry.md` ships as the minimal generic skeleton; deskwork's existing journal flavor moves into this project's `.dw-lifecycle/templates/journal-entry.md`. Closes #122.

## Out of scope (deferred)

- **deskwork peer-plugin integration** (originally scoped here as "Phase 8b"). Deferred per operator review on 2026-04-30: deskwork plugins are in massive flux; integrating dw-lifecycle with them would be counterproductive until they stabilize. **#123 stays open as backlog**; revisit when the deskwork surface settles. Workplan tasks 61–66 are kept verbatim in a "Deferred" section so the work resumes cleanly.
- Feature-doc B2 manifest (`config.feature.docs.files: [...]` + open-set per-name templates) — the bigger #123 scope.
- TS-module overrides (deskwork's existing customize pattern). Markdown-only stays the v1 shape.
- Bootstrap-routine step manifest (config-level step ordering for session-start).
- Multiple override categories beyond `templates`.

## Workplan

`docs/1.0/001-IN-PROGRESS/dw-lifecycle/workplan.md` Tasks 54–60 (in scope). Tasks 61–66 are in the "Deferred" section.

## Acceptance criteria

- [ ] #122 closed (journal-entry override path verified by one real session-end producing a deskwork-shaped journal entry through the override)
- [ ] One adopter-shaped invocation against a fresh project produces the bundled generic skeleton (proves the resolver's fallback path)

## Design (PRD)

`docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md` Section 10 (v2, approved 2026-04-30 in deskwork workflow `a02a6b98-15e5-4cd2-b758-a2d348cf66bb`).
<!-- SECTION:DESCRIPTION:END -->
