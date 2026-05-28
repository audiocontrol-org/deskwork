---
proposal: Multi-lane editorial dashboard — Direction 1 "Lane Stack"
status: REJECTED
date: 2026-05-27
feature: docs/1.0/001-IN-PROGRESS/graphical-entries/
visual: ../../../../mockups/2026-05-27-multi-lane-dashboard/direction-1-lane-stack.html
---

# Multi-lane editorial dashboard — Direction 1 "Lane Stack"

## What

Vertical stack of per-lane accordion sections in the main column. Each section's head shows the lane glyph + name + entry count + stage-count tag + chevron; expanded body renders the lane's stages as a wrapped tile-row (mobile-style v0.19 collapsible-stage-tile pattern repeated on desktop). The masthead carries lane filtering as a chip strip below it; no left rail (the chip strip carries everything). Compose was a single global FAB anchored bottom-right.

## Why rejected

D1 was the **least information-dense** of the three directions and the **least lane-aware**. On a viewport with three or more lanes expanded, the operator scrolls vertically through repeating tile-rows that don't differentiate lanes spatially — every lane reads as a row of stage tiles, and the only thing keeping them apart is the lane head's typography. The operator picked D3 (Press Bay) on 2026-05-27 without lengthy comparison, and the reason was visible at first read: D3's horizontal swimlanes preserve the "lane = horizontal track" mental model that the project's audit log calls out as the established direction for multi-lane work; D1 collapses each lane into a uniform vertical block that doesn't carry that signal.

D1's other implicit weaknesses, surfaced by comparing against D3 after the operator's pick:

- **No per-lane view-toggle.** The accordion body is always the tile-row stack; switching to a list view would require duplicating the toggle pattern inside every accordion body, which doesn't fit the section-head's slim chrome.
- **No spatial home for per-stage collapse.** The tile-row is already the collapsed view of a stage; there's nowhere natural to put a "collapse one stage further" affordance.
- **Compose was global, not per-lane.** D1 inherited the v9-v10 floating FAB pattern that D3 v11 retired. Even if D1 had been the pick, the v11 chip pattern would have required reintroducing a per-lane affordance, which sits awkwardly in an accordion head whose right edge already carries the chevron.
- **Lane filtering was chip-strip-only.** No persistent visibility model; the chip strip was both the focus-filter AND the visibility surface, which conflates two state axes that D3's left-rail + chip-strip split apart cleanly.

## When

Drafted 2026-05-27 as one of three directions presented to the operator alongside D2 and D3. The operator picked D3 the same day. This entry captures the rejection so a future session cannot re-propose lane-as-accordion-stack as a fresh idea.

## Feature reference

`docs/1.0/001-IN-PROGRESS/graphical-entries/`

## Visual

[`mockups/2026-05-27-multi-lane-dashboard/direction-1-lane-stack.html`](../../../../mockups/2026-05-27-multi-lane-dashboard/direction-1-lane-stack.html) — single source of truth, never copied into this directory (per `.claude/rules/design-standards.md`).
