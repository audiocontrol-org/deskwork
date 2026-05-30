---
title: Group review surface alternatives — rejected directions
status: rejected
date: 2026-05-29
feature: graphical-entries
phase: 7
tasks: [7.3, 7.4]
companion: ../../ACCEPTED/2026-05-29-group-review-surface/
---

# Group review surface — rejected directions (2026-05-29)

Four directions were explored alongside the picks (Direction B + Direction 1 in `ACCEPTED/2026-05-29-group-review-surface/`). This brief is the durable record so they don't get re-proposed in future passes.

## Group review surface — rejected

### Direction A — Members-as-list with sticky lane-stage summary strip

**Visual:** [`../../ACCEPTED/2026-05-29-group-review-surface/mockups/direction-A-members-list.html`](../../ACCEPTED/2026-05-29-group-review-surface/mockups/direction-A-members-list.html)

Flat list of member rows is the default; Task 7.4's multi-lane composition is reframed as a 1-line sticky summary strip at the top.

**Why rejected:**

- The summary strip carries the pipeline-shape signal compactly, but loses the "members live in stage columns" visual model that Phase 5's accepted swimlane primitive (`2026-05-27-multi-lane-dashboard-d3-press-bay`) established. Reusing the swimlane primitive on the group review surface is the architectural-symmetry play; abandoning it here for a one-line summary creates a second pipeline-shape vocabulary on the same surface family.
- The flat list reads well at narrow viewports but doesn't scale visually past ~10 members — once the list goes long, the sticky strip's at-a-glance summary becomes the only structural signal and the list itself just scrolls. Direction B's composed view keeps the structural signal in every visible row.
- Cheaper implementation than Direction B but the cost saving is one-time; the operator's repeated-use cost of "scan list to construct mental model of stage shape" pays in every session.

### Direction C — Stacked composed-then-list (no toggle)

**Visual:** [`../../ACCEPTED/2026-05-29-group-review-surface/mockups/direction-C-stacked.html`](../../ACCEPTED/2026-05-29-group-review-surface/mockups/direction-C-stacked.html)

Compact composed strip on top, flat member list below — both always visible, no toggle.

**Why rejected:**

- Double chrome cost: ~120px of composed strip before the list starts, on a surface that may have only 3–4 members.
- The composed strip scrolls off-screen as the list grows, undermining the "structure stays in view" promise. Direction B keeps the composed view as the actual default rendering.
- The "no toggle" appeal is real (fewer states to track) but Direction B's section-head toggle is a small concession for operators who occasionally prefer linear scan; the picked direction's default IS the structural view, so the toggle is rarely needed in practice.

## "Member of:" badge — rejected

### Direction 2 — Kicker line above slug

**Visual:** [`../../ACCEPTED/2026-05-29-group-review-surface/mockups/member-badge-2-kicker.html`](../../ACCEPTED/2026-05-29-group-review-surface/mockups/member-badge-2-kicker.html)

`MEMBER OF v0.18-row-rebuild ↪` line above the row's title in mono caps + kraft color. Multi-parent uses `+N` overflow.

**Why rejected:**

- Adds one extra chrome line per member row (~16px). On a lane with many member entries this compounds vertically — the same compounding-vertical-noise failure mode that retired the rubber-stamp conceit on mobile (`DESIGN-STANDARDS.md` § "Rubber-stamp conceit — desktop YES, mobile NO").
- Per-row text labels for relationship state edge close to the retired pattern. While "Member of X" is relationship (not state), it's a label-on-a-rectangle-shaped chrome strip, which the retired-pattern policy was named to prevent.
- Direction 1's pull-tab keeps the relationship affordance OFF the row's content area entirely; the chrome cost is the edge tab, not row vertical real estate.

### Direction 3 — Trailing inline chip near ⋮

**Visual:** [`../../ACCEPTED/2026-05-29-group-review-surface/mockups/member-badge-3-trailing-chip.html`](../../ACCEPTED/2026-05-29-group-review-surface/mockups/member-badge-3-trailing-chip.html)

Compact chip immediately left of the row's overflow `⋮` — single glyph + parent count.

**Why rejected:**

- Co-locates with the v0.20 row-affordance overflow `⋮`, risking the "⋮ vocabulary scope convention" confusion (`DESIGN-STANDARDS.md` § "The ⋮ vocabulary scope convention" was specifically codified to keep `⋮` interpretable as "more options at THIS level"). Adding a sibling affordance immediately adjacent dilutes the convention.
- The `⊠` glyph isn't pre-loaded operator vocabulary; the chip needs label discovery via tap. Compare Direction 1's vertical pull-tab whose "Member" mono caps label IS the affordance label.
- Reduces the row's tap-target real estate by ~50px on the right edge; on dense lanes the existing overflow `⋮` is already at the edge-comfort floor.

## Process

These rejections trace to `.claude/rules/design-standards.md` § "When the operator approves a design decision: ... file an `ACCEPTED/<date>-<slug>/brief.md` entry. ... When the operator rejects a design direction (or it gets retired during exploration): file a `REJECTED/<date>-<slug>/brief.md` entry."

Future design passes that re-propose any of these four directions for the group review surface or member-of badge should reference this brief explicitly. If a future operator-driven need surfaces (e.g., performance constraints on the Phase 5 swimlane primitive that make Direction B unfeasible), revisit with new rationale.
