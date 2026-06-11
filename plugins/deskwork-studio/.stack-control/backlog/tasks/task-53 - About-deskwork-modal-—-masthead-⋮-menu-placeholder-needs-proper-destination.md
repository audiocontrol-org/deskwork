---
id: TASK-53
title: About deskwork modal — masthead ⋮ menu placeholder needs proper destination
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-262
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

Step 2.2.7 (commit `7e03d57`) wired the masthead `⋮` menu's "About deskwork" item as an `<a href="/dev/editorial-help">` — the same destination as the "Manual" item. The Phase 2 workplan brief specified an "in-studio modal with version + license + thesis link" instead.

## What was deferred

The brief in `docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/workplan.md` § Task 2.2 → Step 2.2.7 lists for the About item:

> About → opens a small modal (or, simpler for this commit, also goes to /dev/editorial-help#about — read the help page first to see if an about section exists; if not, file a follow-up issue and ship with a placeholder for now — see "About handling" below)

The implementer chose the "placeholder + follow-up issue" path. The help page has no `#about` section today, so the placeholder links to the manual root.

## What the About modal should contain

Per the Step 2.2.7 brief:

- Studio version (read from `@deskwork/studio` package.json)
- License (GPL-3.0)
- Link to THESIS.md (the architectural thesis)
- (Optional) Link to releases page, marketplace listing

## Implementation options

1. **Small in-studio modal** — overlay similar to the existing `renderShortcutsOverlay()` pattern in `packages/studio/src/pages/entry-review/shortcuts.ts`. Self-contained; opens from the popover's About item via a new event (e.g. `studio:show-about`). Estimated effort: ~1-2 hours including tests.

2. **Section on `/dev/editorial-help`** — add an `#about` anchor to the help page. The popover's About item becomes `<a href="/dev/editorial-help#about">`. Lower effort but couples About to the manual surface.

3. **Both** — modal for quick reference; manual section for fuller documentation.

## Where to land

Phase 4 candidate per `DESIGN-STANDARDS.md § Studio navigation model` (which lists the manual + studio menu items but doesn't ship the About surface). Could also land sooner if the modal pattern proves useful for other surfaces.

## Acceptance

- The masthead `⋮` menu's "About deskwork" item links to (or opens) a surface that contains version + license + thesis link.
- The "About" item's destination is distinct from "Manual" (currently both go to `/dev/editorial-help`).
- Test coverage in `packages/studio/test/masthead-popover-smoke.test.ts` updated to assert the About item points at the correct destination/event.

## Related

- Commit `7e03d57` (Step 2.2.7 — masthead popover menu) introduced the placeholder
- Workplan: `docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/workplan.md` § Task 2.2.7
- Phase 4 candidate per `DESIGN-STANDARDS.md § Studio navigation model`
<!-- SECTION:DESCRIPTION:END -->
