---
id: TASK-48
title: >-
  Phase 29: post-release customer acceptance playbook (/post-release:walk +
  /post-release:file-issues)
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-133
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Phase 29: post-release customer acceptance playbook

A pair of skills that codify how to evaluate the freshly-installed deskwork marketplace plugin, surface friction, and file issues — using the deskwork pipeline itself as the triage surface.

- `/post-release:walk` — boots the studio against the latest marketplace install, walks surfaces (cursory mode is fast HTTP-only checks; deep mode adds a sandbox CLI drive + Playwright cross-check), produces a structured findings markdown, ingests it into deskwork as a longform document, surfaces a review URL.
- `/post-release:file-issues` — runs after the operator approves the findings doc in the studio. Parses the approved markdown, prompts per finding (`y/N/edit`), files via `gh issue create` with a `post-release` label and a cross-link footer.

### Source-of-truth

Design v2 applied 2026-04-30 via deskwork workflow `970aa75d-f586-47f0-bc89-4481830a7676` (commit `b1f1815`):

- Design: [`docs/1.0/post-release-acceptance-design.md`](https://github.com/audiocontrol-org/deskwork/blob/feature/deskwork-plugin/docs/1.0/post-release-acceptance-design.md)
- Workplan: [Phase 29 in workplan.md](https://github.com/audiocontrol-org/deskwork/blob/feature/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md)
- PRD: [Extension section in prd.md](https://github.com/audiocontrol-org/deskwork/blob/feature/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md)

### Stop-gap framing (binding)

The entire feature — both the new `/post-release:*` skill family AND the existing `/release` skill it integrates with — is stop-gap scaffolding inside the deskwork plugin only because dw-lifecycle has not yet shipped the capability to customize or override lifecycle stages. When dw-lifecycle gains that capability, `/release` and `/post-release:*` migrate into dw-lifecycle's customizable-workflow surface; file paths (skill paths, playbook path, generated findings paths) are explicitly ephemeral.

### Sub-phases

- **A** — Playbook scaffold (`docs/post-release/playbook.md` + TS parser).
- **B** — `/post-release:walk` cursory mode (HTTP-only): auto-discover surfaces, per-surface walk, aggregate findings, generate findings doc, ingest + review-start.
- **C** — Playbook assertions wired into the cursory walk.
- **D** — `/post-release:walk --mode deep`: sandbox + CLI drive + studio cross-check via Playwright.
- **E** — `/post-release:file-issues`: parse approved findings doc, per-finding `gh issue create`.
- **F** — `/release` end-prompt integration (Pause 5 success → invoke walk).
- **G** — Procedural amendment: playbook-update checklist line in `feature-define` / `feature-extend` skills.

### Acceptance

Per the workplan section above, ending with: first canonical run = post-release walk against the v(N+1) shipped after Phase 29 lands. Real findings file as real issues.

### Operator principle driving the work

> "We should have a post-release customer acceptance playbook that we run through — not hard-coded tooling, but a skill (or a composition of skills) that codify how to evaluate the installed plugin to ensure it's sane and file bugs if it's not. This should include playwright inspection of the studio. We should update that playbook as we add/update features."

### Tracking

This is the parent issue for Phase 29. Sub-phase issues filed only if scope warrants — small phases stay as one issue per the project's existing per-phase-one-issue convention (cf. Phase 27 #103–#110). Filed via `/dw-lifecycle:extend` against the active feature `deskwork-plugin`.
<!-- SECTION:DESCRIPTION:END -->
