---
proposal: Row affordance — overflow menu + swipe drawer hybrid, with full stage-aware verb vocabulary (iterate, block, induct, plus the existing approve / cancel / scrapbook)
status: ACCEPTED
date: 2026-05-11
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ../../../../plugins/deskwork-studio/public/mockups/dashboard-row-4-overflow-plus-swipe.html
---

# Row affordance — overflow + swipe hybrid

## What

Per-row chrome for the dashboard's entry rows. Combines two previously-mocked directions plus expanded verb vocabulary:

- **Mobile** — the row at-rest is clean (slug + title + date + a low-contrast trailing `⋮`). Tap the row body → opens the entry-review surface. **Swipe-left** on the row → action drawer slides in with up to 4 stage-aware verb chips (the high-frequency ones). **Tap the `⋮`** → vertical popover with the full stage-aware verb set including secondary verbs (block, induct…).
- **Desktop** — high-frequency verbs (iterate, approve) stay inline as outlined chips. Secondary verbs (block, induct…, cancel, scrapbook) live in a `⋮`-triggered popover. Same vocabulary as mobile, different chrome.
- **Stage-aware vocabulary** drives both drawer (mobile) and menu (mobile + desktop):

| Stage | Swipe drawer (top-N) | Menu (full) |
|---|---|---|
| Ideas / Planned / Outlining / Drafting | iterate · approve · cancel · `SCRPBK` | iterate · approve · **block** · **induct…** · cancel · open scrapbook |
| Final | approve→publish · cancel · `SCRPBK` | approve · **block** · **induct…** · cancel · open scrapbook |
| Blocked / Cancelled | induct… · `SCRPBK` | induct… (pick stage) · open scrapbook |
| Published | view · `SCRPBK` | view · open scrapbook |

Verbs route through clipboard-copy of the corresponding `/deskwork:<verb> <slug>` slash command (THESIS Consequence 2 — studio routes commands, skills do the work).

## Why accepted

Three reasons combined:

1. **The v0.19 dashboard shipped with desktop-style outlined buttons stacked vertically on mobile rows.** Visible in the operator's 2026-05-11 phone screenshot: each row carries `[open →] [approve →] [cancel ⊘] [scrapbook ↗]` as four outlined rectangles. This is exactly the *"badly repurposed desktop buttons"* failure mode that the workplan's row-affordance design pass (`dashboard-row-1-overflow.html`, `dashboard-row-2-contextual-primary.html`, `dashboard-row-3-swipe.html`) was meant to address — but the operator-pick gate for those mockups never closed during Phase 1, and Task 1.2 shipped with the legacy chrome unchanged. This entry closes that gate.

2. **Overflow (Direction 1) + swipe (Direction 3) is the iOS Mail / Material Design pattern.** Discoverable for new operators (the `⋮` is visible chrome), fast for power users (swipe is one gesture). The original mockup banners framed these as opposing directions with a discoverability-vs-restraint tradeoff; the hybrid resolves the tradeoff cleanly. *(Direction 2 — contextual primary — was retired: its central premise depended on reviewState being user-facing data; reviewState is RETIRED per DESKWORK-STATE-MACHINE.md Commandment III.)*

3. **Adds block and induct… as first-class verbs.** Neither was present in the prior three direction mockups; both are required by the state machine (block per `/deskwork:block`, induct as a universal stage-teleport verb per Commandment II). Without UI affordances, the operator can only invoke them via direct CLI calls, which breaks the dashboard's role as the routing surface for verbs. Block goes in the menu (kraft glyph — paused, distinct from the red-pencil cancel). Induct… uses an ellipsis to indicate a sub-prompt for the target stage; it's available on every linear-pipeline stage in either direction (skip forward or retreat backward), not just Blocked/Cancelled rows.

The `SCRPBK` abbreviation in the swipe drawer (vs. `Open scrapbook` in the menu) is a deliberate tightening — at 64px chip width, "Scrapbook" cramped against neighboring chips and "Scrap" alone read as a destructive verb next to "Cancel". `SCRPBK` is the press-check vocabulary's standard mono-uppercase tracked treatment, with the menu's full label preserved where horizontal space allows.

## When

Approved 2026-05-11 by the operator after the v0.19 release walk surfaced the row-affordance gap. Mockup iterated three times against operator feedback (initial 1+3 hybrid → added iterate + block + induct → tightened swipe drawer label → fixed menu popover clipping). Implementation will land as Phase 1.8 of the studio-mobile-first feature (see `workplan.md`); target release is v0.20.0.

This entry supersedes the prior three row-direction mockups in `plugins/deskwork-studio/public/mockups/dashboard-row-{1,2,3}-*.html`. Those will be retired into REJECTED archive entries once this implementation lands, mirroring the dashboard-1/2/3 retirement after Compact-1 + Dashboard-1c chrome was picked. The "Direction 2 — contextual primary" mockup is already implicitly retired because its review-state premise is gone; the new hybrid uses stage-graduation-based logic instead.

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/) — Task 1.8 (implementation), Phase 1.1.6 (the original pick-gate that was never closed).
