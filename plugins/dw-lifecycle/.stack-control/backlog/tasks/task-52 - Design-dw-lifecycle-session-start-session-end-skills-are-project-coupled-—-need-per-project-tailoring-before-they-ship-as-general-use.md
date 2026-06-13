---
id: TASK-52
title: >-
  Design: dw-lifecycle session-start / session-end skills are project-coupled —
  need per-project tailoring before they ship as general-use
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-122
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`/dw-lifecycle:session-start` and `/dw-lifecycle:session-end` are not yet ready for adopters. They hardcode the deskwork project's specific journal conventions with no per-project tailoring hook. An adopter dropping dw-lifecycle into a different project would inherit deskwork's journal shape verbatim — which probably doesn't match their actual workflow.

## Specifics — what's project-coupled

Inspecting the published v0.9.8 versions of the two skills:

**`/dw-lifecycle:session-start`** assumes:

- A journal file named `DEVELOPMENT-NOTES.md` (configurable in `.dw-lifecycle/config.json` — OK, this part isn't coupled).
- A specific entry structure: a top-level `## YYYY-MM-DD: <title>` heading, sub-headings for `### Feature`, `### Worktree`, then a body with sections labeled `**Goal:**`, `**Accomplished:**`, `**Didn't Work:**`, `**Course Corrections:**`, `**Quantitative:**`, `**Insights:**`. None of this is configurable.
- A `**Course Corrections:**` taxonomy of `[PROCESS]`, `[UX]`, `[COMPLEXITY]`, `[FABRICATION]`, `[DOCUMENTATION]` tags — pulled directly from `.claude/rules/session-analytics.md` in the deskwork repo. Hardcoded into the skill body's prompt for what to populate.
- A `**Quantitative:**` block with specific metrics (Messages, Commits, Corrections, Files changed) — same source, hardcoded.

**`/dw-lifecycle:session-end`** mirrors all of the above for write-side, plus assumes the operator wants to commit doc updates with a particular commit-message shape.

## Why this matters

The dw-lifecycle plugin's value proposition is *"project lifecycle orchestration"* — define → setup → issues → implement → review → ship → complete. Different projects keep journals in different shapes:

- Some use `CHANGELOG.md` instead of `DEVELOPMENT-NOTES.md`.
- Some don't journal at all.
- Some have radically different correction taxonomies (e.g., a research lab might tag entries with `[METHODS]`, `[FINDINGS]`, `[REPRO]`).
- Some want session entries in a different file altogether (per-feature journals, per-week journals).
- Some want different metrics (LOC changed, tests added, perf benchmarks).

If the session-* skills assume deskwork's exact shape, adopters either (a) silently end up with deskwork-shaped journals that don't match their workflow, (b) ignore the skills entirely, or (c) fork the plugin — none of which are good outcomes.

## Suggested fix

Apply the same override-hook pattern deskwork uses for `templates/` and `doctor/` rules — `/deskwork:customize <category> <name>` copies a default into `.deskwork/<category>/<name>.ts` so adopters can edit it; the plugin loads the override automatically.

Concrete shape for dw-lifecycle:

1. Move the body of `/dw-lifecycle:session-start` and `/dw-lifecycle:session-end` into template files under `plugins/dw-lifecycle/templates/skills/`:
   - `templates/skills/session-start.md`
   - `templates/skills/session-end.md`

2. Add an override resolver (mirror of deskwork's pattern): the skill body says *"read the journal-template at `<projectRoot>/.dw-lifecycle/templates/skills/session-start.md` if present, fall back to the in-package default."*

3. Add a `dw-lifecycle customize <category> <name>` subcommand that copies a default into `.dw-lifecycle/templates/<category>/<name>.md`. Adopters edit; plugin loads override.

4. The published default in dw-lifecycle's package SHOULD NOT be deskwork-coupled. Probably a generic skeleton like:

   ```markdown
   ## YYYY-MM-DD: <title>

   **Goal:**
   <what we set out to do>

   **Accomplished:**
   <what was done>

   <Add or remove sections to match your project's journaling style.
   Customize via /dw-lifecycle:customize templates session-end.>
   ```

   The deskwork-specific shape (Course Corrections taxonomy, Quantitative block) becomes a customization of the generic default in this project's `.dw-lifecycle/templates/`, not the dw-lifecycle plugin's default.

## Alternative: pull session-* out until tailoring lands

If the customize-hook design needs more bake time, an interim option: drop `/dw-lifecycle:session-start` and `/dw-lifecycle:session-end` from the plugin entirely. Adopters who want the deskwork shape can copy `.claude/skills/session-{start,end}/` from this repo into their project. That avoids the false-promise of *"dw-lifecycle has session journaling built in"* while we work on the override mechanism.

Trade-off: removing-and-readding skills is a churn signal to adopters. Keeping them with a *"⚠ project-coupled, customize before use"* note in the SKILL.md description might be the lower-disruption path.

## Surfaced by

Dogfood arc on this project (deskwork). After `/dw-lifecycle:complete dw-lifecycle` succeeded, I proposed `/dw-lifecycle:session-end` as the natural next step. Operator pushed back: *"I don't think session-end belongs in dw-lifecycle yet. It needs to be tailorable per project and it isn't yet."* That's the correction this issue captures.

## Related

- The same coupling exists in `/dw-lifecycle:session-start` — same fix shape.
- Adjacent design hook: deskwork's `customize` pattern at `plugins/deskwork/` for `templates/` and `doctor/` overrides — the prior art to mirror.
<!-- SECTION:DESCRIPTION:END -->
