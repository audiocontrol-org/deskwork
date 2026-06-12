---
id: TASK-47
title: 'dw-lifecycle: Phase 7 + 8 follow-up (post-v0.1.0)'
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-134
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Umbrella issue for dw-lifecycle Phase 7 + 8 (post-v0.10.0 follow-up)

> **Scope updated 2026-04-30** following design.md v2 review (workflow `applied`). Phase 8's "deskwork peer-plugin integration" sub-scope has been **deferred** — see #136 for details.

The dw-lifecycle code shipped on `main` at v0.9.6 (2026-04-29) and now rides the unified deskwork version line per the Phase-26 npm-publish architecture; current marketplace is v0.10.x. The first dogfood arc against this project (2026-04-29 + 2026-04-30) surfaced two clusters of follow-up work that this issue tracks.

## Constituent issues

**Phase 7 (bugs):** #135 tracks the phase; constituent issues:
- #125 — adopter cache-vs-PATH ergonomics (root cause is Claude Code; dw-lifecycle adds README pointer to #131's auto-repair hook)
- #126 — setup SKILL prose contradicts helper behavior (using-git-worktrees + writing-plans not actually integrated)
- #127 — define SKILL prescribes bare `/tmp/<predictable-name>` path
- #128 — setup worktree path uses current-worktree name as `<repo>` token
- #129 — setup `--definition` puts content in workplan.md, leaves PRD bare
- #130 — setup doesn't write `deskwork.id` UUID to PRD frontmatter

**Phase 8 (design):** #136 tracks the phase. Scope updated:
- #122 — session skills tailoring (in scope; the smallest-slice journal-entry override closes this)
- #123 — feature-doc templates tailoring + deskwork peer-plugin integration (**deferred** per operator review on 2026-04-30: deskwork plugins are in flux; integration would be counterproductive until they stabilize)

## PRD / workplan

- Design (PRD): `docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md` — Section 10 covers the post-v0.10.0 scope. Approved 2026-04-30 (deskwork workflow `a02a6b98-15e5-4cd2-b758-a2d348cf66bb`, applied at v2).
- Workplan: `docs/1.0/001-IN-PROGRESS/dw-lifecycle/workplan.md` — Tasks 47–60 in scope; Tasks 61–66 in "Deferred" section.
- README: `docs/1.0/001-IN-PROGRESS/dw-lifecycle/README.md` — phase status table updated; Phase 8 row reframed; deferred row added.

## Acceptance criteria

- [ ] All six Phase 7 issues closed (#125–#130)
- [ ] #122 closed (Phase 8 — journal-entry override verified end-to-end)
- [ ] #123 stays open as backlog, picked up when deskwork stabilizes
- [ ] Phase 7 verified via fresh `/dw-lifecycle:define` → `/dw-lifecycle:setup` dogfood with no manual fix-up

## Lifecycle note

The PRD for this umbrella **was** routed through deskwork's review pipeline on 2026-04-30 (workflow `a02a6b98-15e5-4cd2-b758-a2d348cf66bb`, approved at v2). The bootstrap path used: `/deskwork:ingest` (no manual UUID required) → `/deskwork:review-start` → operator iteration in studio → `/deskwork:iterate` → `/deskwork:approve`. Ingest auto-wrote the `deskwork.id` UUID into design.md frontmatter — no manual frontmatter edit needed.
<!-- SECTION:DESCRIPTION:END -->
