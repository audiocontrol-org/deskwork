---
id: TASK-52
title: shortform-row ⋮ on Desk needs v0.20-style popover (deferred from Step 2.2.9)
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-263
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

Step 2.2.9 of the studio-mobile-first feature shipped the v7 Desk
architecture's Shortform-by-platform section (commit `ffd8b53`).
The shortform-row's trailing `⋮` affordance currently renders as a
plain navigation anchor that links to the entry-review surface:

```html
<a class="er-row-shell-link" href="/dev/editorial-review/<workflow.id>"
   aria-label="Open shortform review for <slug>">⋮</a>
```

The v0.20 dashboard-row idiom is a `⋮` BUTTON that opens a popover
of stage-aware verbs (iterate / approve / cancel / induct / scrapbook
link). Shortform rows on the Desk do NOT yet have that popover.

## Why deferred

The popover wire-up needs the Step 2.2.10 work to land first:

- **G.1**: drop the legacy `er-stamp` chrome from the shortform-review
  client (which renders the `data-state` stamp the Commandment III
  retirement obsoletes).
- **G.2**: stage-gate the verbs (not state-gate). The current
  shortform-review controller branches on `reviewState`, which is
  retired; needs to switch to `currentStage` keying.
- **G.3**: drop the THESIS Cons. 2 violation in
  `editorial-review-client.ts:1619-1764` (the `postDecision()` POST
  chain on row-action clicks). Once that's gone, the row popover's
  verb clicks can copy `/deskwork:<verb> <slug-or-workflow-id>` to
  clipboard, mirroring the longform pattern.
- **G.4**: replace `data-action="reject"` with
  `data-action="cancel"` (#260).
- **G.5**: add `--platform` and `--channel` flags to the iterate skill
  invocation when the workflow is shortform.

Wiring the popover BEFORE these land would either (a) ship a popover
with the same `reject`/state-gating bugs as the legacy controller, or
(b) duplicate the verb-gating logic out of band. Step 2.2.10 retires
those bugs and lands the popover in one coherent commit.

## Acceptance criteria

When Step 2.2.10 completes:

- Each shortform row's `⋮` is a `<button>` that opens a
  v0.20-style popover (matching `dashboard-row-affordances.css`
  `.er-row-menu` pattern).
- Popover contains stage-aware verbs per `affordances.ts`-style
  routing, scoped to the workflow's `currentStage`.
- Verb clicks copy `/deskwork:<verb> <workflow-id>` to clipboard
  (THESIS Consequence 2 — no POST mutation).
- No `er-stamp` chrome anywhere on the Desk or shortform-review
  surfaces.
- Existing tests in `dashboard-shortform-section.test.ts` updated to
  assert popover presence + stage-gating + clipboard-copy behavior.

## Related

- Step 2.2.9 commit: `ffd8b53` (the placeholder anchor)
- Step 2.2.10 workplan brief:
  `docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/workplan.md`
  Step 2.2.10 (G.1–G.5 list)
- v0.20 row affordance design:
  `docs/studio-design/ACCEPTED/2026-05-11-row-affordance-overflow-plus-swipe/`
- THESIS Consequence 2 (server routes commands; clipboard-copy
  is the verb pattern)
<!-- SECTION:DESCRIPTION:END -->
