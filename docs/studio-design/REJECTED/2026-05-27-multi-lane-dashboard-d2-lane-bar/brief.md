---
proposal: Multi-lane editorial dashboard — Direction 2 "Lane Bar"
status: REJECTED
date: 2026-05-27
feature: docs/1.0/001-IN-PROGRESS/graphical-entries/
visual: ../../../../mockups/2026-05-27-multi-lane-dashboard/direction-2-lane-bar.html
---

# Multi-lane editorial dashboard — Direction 2 "Lane Bar"

## What

Top-of-page horizontal **lane bar** acting as both selector + summary: each lane is a tab-like pill carrying glyph + name + counts; clicking a pill switches the main column to render that single lane's pipeline in full kanban detail. Filtering = which pill is active. The main column shows exactly one lane at a time; multi-lane work happens by tabbing across the bar.

## Why rejected

D2 was **single-lane-at-a-time** by construction, which contradicts the feature's central design question — *"how does the operator see and act on multi-lane work simultaneously."* The PRD (and Phase 5 workplan) calls for a surface where multiple lanes are in view at once, with filtering as a refinement layer over a fundamentally multi-lane visualization. A tab-bar collapses the "multi-lane" half of the problem into a navigation question, which is the wrong primitive: navigation is between surfaces, not between members of a single surface's content set.

The operator picked D3 (Press Bay) on 2026-05-27 because D3 keeps every focused lane on-screen at once. D2's tab-bar approach is what the project's `DESIGN-STANDARDS.md § Studio navigation model` calls out as a retired pattern — *"no top-level tab bars; star nav with Desk as hub."* Adding a per-page tab-bar for lane switching is a slightly more local instance of the same anti-pattern. The audit log's 2026-05-12 cross-bar rejections (`docs/studio-design/REJECTED/2026-05-12-cross-bar-2-v3-collapsed-picker/`, `cross-bar-2-v6-strikethrough-and-sheet/`) all rejected destination-picker UIs in favor of in-page IA — D2 inherits the same failure mode at a smaller scope.

D2's other implicit weaknesses:

- **No persistent multi-lane filter state.** Picking lane A then lane B means the operator's only memory of "I was looking at both" is the tab-history. D3's focus-chip strip remembers a set of focused lanes; D2 remembers exactly one.
- **The lane bar itself is wasted vertical chrome.** It sits between the masthead and the lane body, takes ~56-72px depending on density, and only one of its cells is "live" at any moment. The other cells are nav targets — a high real-estate cost for a low-information role.
- **Tab interaction is not a natural fit for the operator's primary task** (compare draft progress across lanes). It optimizes for "open one lane and read deeply" — but the operator already has the entry-review surface for deep reading. The dashboard's job is the cross-lane view, which D2 disables.

## When

Drafted 2026-05-27 as one of three directions presented to the operator alongside D1 and D3. The operator picked D3 the same day. This entry captures the rejection so a future session cannot re-propose lane-as-tab-bar as a fresh idea — and to anchor the rejection in the existing precedent that the studio doesn't use top-level (or near-top-level) tab bars for primary navigation.

## Feature reference

`docs/1.0/001-IN-PROGRESS/graphical-entries/`

## Visual

[`mockups/2026-05-27-multi-lane-dashboard/direction-2-lane-bar.html`](../../../../mockups/2026-05-27-multi-lane-dashboard/direction-2-lane-bar.html) — single source of truth, never copied into this directory (per `.claude/rules/design-standards.md`).
