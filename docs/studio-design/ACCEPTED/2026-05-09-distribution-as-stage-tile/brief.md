---
proposal: Distribution rendered as a sibling stage tile on the mobile dashboard
status: ACCEPTED
date: 2026-05-09
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: N/A — surfaces in the live implementation; see packages/studio/src/pages/dashboard/
---

# Distribution rendered as a stage tile

## What

The "Distribution" surface (cross-platform shortform syndication: Reddit, LinkedIn, YouTube, Instagram) is rendered as a peer of the pipeline stages on the mobile dashboard, even though it is not technically a stage in the state machine. It uses the same tile chrome (glyph, name, count, collapsibility) as Ideas / Planned / Outlining / etc.

## Why accepted

The mobile dashboard's job is to surface "what's on the press" at a glance. Distribution work shares the same operator-attention shape as in-pipeline content (it has counts, it has a current state, it has affordances), so rendering it with the same tile chrome maintains pipeline-shape uniformity from the operator's eye. The operator scans a single visual rhythm of tiles without having to context-switch between "stages" and "sidebar widgets."

This is **visual** uniformity, not state-machine uniformity. The tile is treated as a stage on the dashboard surface; the underlying entry/workflow records continue to distinguish distribution from pipeline stages. The decision is scoped to dashboard rendering — not a claim that distribution is a stage in `DESKWORK-STATE-MACHINE.md`.

## When

Picked 2026-05-09. Implementation landed alongside the collapsible-stage-tiles work under Task 1.2.

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/)
