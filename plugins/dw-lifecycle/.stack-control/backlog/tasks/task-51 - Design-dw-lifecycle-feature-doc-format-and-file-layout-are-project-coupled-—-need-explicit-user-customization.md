---
id: TASK-51
title: >-
  Design: dw-lifecycle feature-doc format and file layout are project-coupled —
  need explicit user customization
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-123
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`/dw-lifecycle:setup`, `/dw-lifecycle:complete`, `/dw-lifecycle:extend`, and the supporting templates ship a single opinionated take on what feature documentation looks like — directory shape, file set, frontmatter schema, section structure, status taxonomy. Adopting projects will have their own documentation conventions; dw-lifecycle currently has no override hooks for any of this. That makes the plugin only really fit for projects that happen to share deskwork's specific shape.

This is the documentation-format counterpart to #122 (which covers session-start / session-end skills with the same root cause).

## What's project-coupled today

Inspecting v0.9.8:

### Directory shape

The lifecycle assumes `<docs.root>/<version>/<statusDir>/<slug>/` (or `<docs.root>/<statusDir>/<slug>/` with `byVersion: false`). The version layer is configurable; the `<statusDir>/<slug>/` layer is hardcoded into every transition.

Projects that organize differently — `rfcs/<number>-<title>/`, `adr/<number>-<title>.md` (single file, no subdirectory), `specs/<area>/<feature>.md`, `proposals/<id>/`, etc. — can't use the lifecycle skills as-is.

### Status taxonomy

Three states are baked in at the *lifecycle level*: `inProgress`, `waiting`, `complete`. Their directory names are configurable in `docs.statusDirs` (defaults: `001-IN-PROGRESS`, `002-WAITING`, `003-COMPLETE`), but:

- The set of states is fixed at three.
- The transitions encoded in the skills (`/dw-lifecycle:setup` → in-progress; `/dw-lifecycle:complete` → complete; no `waiting` skill exists yet) hardcode the workflow.
- Projects with different state machines (e.g., `draft` → `in-review` → `accepted` → `superseded`, or `proposed` → `prototyping` → `landed` → `removed`) have no override path.

The numeric prefix sort-order convention (`001-`, `002-`, `003-`) is also opinionated — fine for some teams, jarring for others.

### File set per feature

`/dw-lifecycle:setup` creates a fixed set of files in every feature directory:

- `README.md` — a status table + key-links scaffolding
- `prd.md` — Problem / Scope / Approach / Tasks
- `workplan.md` — Phase + Task tables, checkbox tracking syntax

The feature definition flow also writes:

- `feature-definition.md` — interview output, in `/tmp/`

Some projects only want a single file (a spec, an ADR, an RFC). Some want different files (`design.md`, `RESEARCH.md`, `IMPLEMENTATION.md`). Some want zero docs and only the GitHub-issue trail. There's no override.

### Frontmatter schema

The README and PRD templates assume a specific frontmatter shape:

```yaml
---
slug: <slug>
targetVersion: "1.0"
date: 2026-04-29
branch: feature/<slug>
parentIssue: <issue-number>
---
```

Adopters with their own metadata schemas (RFC numbers, ADR statuses, owner fields, deadline fields) have no way to specify which keys dw-lifecycle should write or read. The `parentIssue` placeholder shows up empty in the README until `/dw-lifecycle:issues` runs — adopters who don't use GitHub-issue tracking get a permanently-empty placeholder.

### Section structure within each file

The published templates hardcode:

- README: `## Status`, `## Key Links`, `## Open follow-ups`
- PRD: `## Problem`, `## Scope`, `## Approach`, `## Tasks`
- Workplan: `## File Structure`, `## Phases`, `## Phase N — <title>`, `### Task N: <title>`

These are deskwork's conventions. Other teams structure docs differently (no PRD-vs-design split, single-section ADRs, narrative spec files, etc.).

## Why this matters for adopters

Every project that's evolved past *"single dev, no process"* has documentation conventions. Forcing dw-lifecycle's exact shape on those projects creates three bad outcomes:

1. **Quiet drift** — adopters use the skills, end up with deskwork-shaped docs that diverge from their existing convention. Now they have two conventions side by side.
2. **Skill rejection** — adopters look at the published `prd.md` template, decide it doesn't match how they work, and stop using the skills. The plugin's value collapses.
3. **Forks** — motivated adopters fork dw-lifecycle to swap templates, then can't take updates without manual merging. Same failure mode as un-overridable doctor rules in the deskwork plugin.

## Suggested fix

Same override-hook pattern as #122 and as deskwork's existing `customize` mechanism. Concrete shape:

### 1. Per-project template overrides

Read templates from `<projectRoot>/.dw-lifecycle/templates/<name>.md` if present, fall back to in-package defaults. Add `dw-lifecycle customize templates <name>` to copy a default into the project for editing.

### 2. Configurable file set

`docs.featureFiles` in `.dw-lifecycle/config.json` declares the file set `/dw-lifecycle:setup` creates per feature:

```json
{
  "docs": {
    "featureFiles": [
      { "name": "README.md", "template": "readme" },
      { "name": "prd.md", "template": "prd" },
      { "name": "workplan.md", "template": "workplan" }
    ]
  }
}
```

Adopters set this list to whatever they want. Default ships with the deskwork shape.

### 3. Configurable status taxonomy

`docs.states` declares the lifecycle's state machine:

```json
{
  "docs": {
    "states": [
      { "key": "inProgress", "dir": "001-IN-PROGRESS" },
      { "key": "waiting",    "dir": "002-WAITING" },
      { "key": "complete",   "dir": "003-COMPLETE" }
    ]
  }
}
```

Skills like `/dw-lifecycle:complete` operate on the configured `complete` state-key, not a hardcoded directory name.

For adopters who want a different state machine (`proposed` → `prototyping` → `landed`), they edit this list. The skill set for the workflow is a separate question (we ship transitions for the default states; custom states need custom skills) — but at minimum the doc-tree side stops fighting them.

### 4. Configurable frontmatter schema

`docs.frontmatter` declares the schema dw-lifecycle reads / writes. Default ships with deskwork's keys; adopters override.

### 5. Generic defaults — the published templates should not be deskwork-coupled

When the customize hooks land, the in-package defaults (the un-overridden templates) should ship as **minimal generic skeletons**, not deskwork's exact shape. Deskwork's specific conventions (Status table phases, Course Corrections taxonomy, etc.) become this project's `.dw-lifecycle/templates/` overrides — not the plugin's published default.

This keeps the plugin honest: the published version of the plugin is a *workflow runner*, not a deskwork-style-doc generator.

## Surfaced by

Same dogfood arc on this project that surfaced #122. Operator directive: *"Every project will likely have their own standards for documentation and we don't want to be opinionated about that. That's something we'll want to make explicitly customizable by the user."*

## Related

- #122 — same root cause for session-start / session-end skills.
- The customize-hook pattern to mirror lives in `plugins/deskwork/` for `templates/` and `doctor/` overrides.
- Whether `/dw-lifecycle:install` should also become customizable (config-shape itself) is a follow-on question — once defaults stop being deskwork-coupled, the install probe might want to detect *which* convention the project uses (RFCs? ADRs? Specs?) and offer the matching template set.
<!-- SECTION:DESCRIPTION:END -->
