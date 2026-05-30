---
title: Group review surface — design pass for Phase 7 Tasks 7.3 + 7.4
status: accepted
date: 2026-05-29
feature: graphical-entries
phase: 7
tasks: [7.3, 7.4]
picks:
  group-review-surface: Direction B — Composed multi-lane default with list toggle
  member-of-badge: Direction 1 — Pull-tab on row edge
---

# Group review surface — design pass

## Picks (2026-05-29)

- **Group review surface: Direction B** — composed multi-lane default with section-head toggle to flat list. Reuses the Phase 5 swimlane primitive scoped to the group's member set. Empty-members fallback degrades to the group's `artifactPath` content (or centered empty-state CTA when there's nothing to render).
- **"Member of:" badge on lane dashboard rows: Direction 1** — vertical kraft-color pull-tab on the row's left edge with a member-count badge; tap expands inline below the row with the parent group(s) as clipboard-copy back-links. Mirrors the `.er-marginalia-tab` / `.er-outline-tab` precedent (component-attached affordance per `.claude/rules/affordance-placement.md`).

## Open question deferred: group-vs-member-stage divergence

The operator may at some point want the surface to flag divergence between the group's `currentStage` and member stages (e.g., group at `Final` but members still `Drafting`; all members `Cancelled` but group still `Drafting`). Per the captured spec and the agent-discipline rule's "operator owns scope decisions": the v1 implementation does NOT add a divergence indicator on the surface. Divergence surfacing remains a doctor concern (Task 7.5.3 `group-all-members-cancelled` rule is already on the workplan; other divergence signals can be added as informational doctor rules when an operator-driven need surfaces).

If divergence becomes a real problem in operator practice, file an issue then — do NOT add a code comment IOU per `.claude/rules/agent-discipline.md` § "Just for now is bullshit".

## Why these picks

**Direction B** honors `DESIGN-STANDARDS.md` § Principles ("Favor structure over scrolling") by making the composed view the default rendering — the pipeline shape of the group's members is visible at-rest without the operator having to scroll past a flat list to construct the mental model themselves. The toggle is a concession for operators who occasionally want the linear scan; the default is the structural signal.

**Direction 1** honors `.claude/rules/affordance-placement.md` — the badge IS on the component it affects (the row), not in a toolbar; it mirrors the existing `.er-marginalia-tab` / `.er-outline-tab` "pull-tab on the edge it vanished into" pattern. The kraft color marks it as a "belonging-to" affordance distinct from stage (red-pencil) or action (proof-blue). Non-member rows show no tab — chrome doesn't pay for what doesn't apply.



## What's being designed

Phase 7's groups primitive is shipped at the schema + CLI layer (Tasks 7.1 + 7.2). The remaining studio-facing work splits into two tightly-coupled tasks:

- **Task 7.3** — when a group entry's `members[]` is non-empty, the group's **review surface** renders a "Members" section. Each member row shows: slug, title, lane (badge), current stage, clipboard-copy link to the member's own review surface. Members also need a **"Member of: `<group-slug>`" badge** on their own row in the lane dashboard, with back-link. Multi-parent members show all parents.
- **Task 7.4** — a group's review surface renders members in a **coordinated multi-lane composition** — one column per lane the group spans, members positioned in their lane's stage column, with the group's own stage above. Reuses Phase 5's swimlane primitive scoped to the group's member set. Empty `members[]` falls back to a single-column rendering of the group's content body (or empty-state if no `artifactPath`).

These two tasks address the SAME surface (the group review page) at two different layout axes (flat list vs. multi-column composition) plus one adjacent surface (the member row's "Member of:" affordance on the lane dashboard). Folded into one design pass per `.claude/rules/agent-discipline.md` § "Use /frontend-design for all design tasks" + the prior session's recommendation.

## Why the two layouts are alternatives, not additives

Tasks 7.3 and 7.4 propose the same information at different layout axes:

- **Task 7.3 flat list:** linear scroll, dense, easy to scan one member at a time. Loses the "where in the pipeline does each member live" structural signal at a glance.
- **Task 7.4 multi-lane composed view:** rebuilds the Phase 5 swimlane primitive in miniature, scoped to the group's member set. Surfaces the pipeline shape (which lane / which stage each member is in) at a glance. Costs more chrome and scrolls horizontally on narrow viewports.

Per `DESIGN-STANDARDS.md` § Principles ("Favor structure over scrolling"): the composed view IS the structural signal. The list is the row-detail. The design question for the operator is whether to:

- Pick one default (with or without a toggle to the other), OR
- Show both, stacked.

This design pass produces three candidate group-review-surface directions covering that space, plus three candidate "Member of:" affordance directions for the lane dashboard.

## Constraints (must obey)

From `DESIGN-STANDARDS.md` and `.claude/rules/`:

- **Press-check vocabulary.** Paper tones (`--er-paper`, `--er-paper-2`, `--er-paper-3`), `--er-ink` / `--er-faded`, accent tokens (`--er-red-pencil`, `--er-proof-blue`, `--er-stamp-green`, `--er-kraft`). Newsreader for display; JetBrains Mono for kickers, labels, meta. Paper-noise SVG turbulence at low opacity behind raised surfaces. No Inter / Roboto / Arial as primary type.
- **No rubber-stamp conceit on mobile.** No rotated stamps, no letterpress tags, no filing-tab silhouettes, no rule-bracketed marks, no embossed seals. NO label-on-a-rectangle pattern that says "this entry is in state X." This applies in mockups too — the rectangle is what's retired, not just specific stamp shapes.
- **No review-state surfacing.** No "IN REVIEW" / "ITERATING" / "APPROVED" labels. Stage-only.
- **Stage glyphs always user-facing.** ◇ § ⊹ ✎ ※ ✓ ⊘ ✗ — use them.
- **Phase 5 swimlane primitive available.** Task 7.4's composed view reuses the existing multi-lane swimlane chrome scoped to the group's member set; we don't invent a parallel composition primitive.
- **Affordance placement.** Per `.claude/rules/affordance-placement.md`: component-attached over toolbar-attached; symmetric reveal/hide pattern (chevron in chrome ↔ pull-tab on edge); identical position across modes.
- **Universal masthead chrome.** Every studio surface (including the group review surface) carries `←` back-link (left) and `⋮` menu glyph (right) per the star nav model. The group review surface is reached from the Desk via the lane dashboard.

## Open design questions this pass resolves

1. **Default layout for the group review surface** — flat list vs. composed multi-lane vs. both stacked.
2. **Toggle affordance** (if direction admits a toggle) — chevron in section head, pill in masthead, or no toggle.
3. **Empty-members fallback** — single-column content rendering, empty-state CTA, or both depending on `artifactPath`.
4. **Member-of badge placement** on member entry rows in the lane dashboard — pull-tab on edge, kicker line above slug, or trailing inline chip.
5. **Multi-parent handling** — full list of parent slugs, first-N-plus-overflow chip, or single primary parent + "+N more" indicator.

## Directions

### Group review surface (three directions)

| ID | Name | Default render | Toggle | Trade-off |
|---|---|---|---|---|
| A | Members-as-list with sticky lane-stage summary strip | Flat list of member rows | None — composed view is a 1-line sticky summary strip above the list | Most operator-readable on narrow viewports; least faithful to the Phase 5 composed-view shape; cheapest implementation |
| B | Composed multi-lane default with list toggle | Phase-5-swimlane multi-lane composition scoped to members | Section-head chevron toggles to flat list | Surfaces structure at-rest; honors "structure over scrolling"; requires per-group view-mode state (sticky or transient?) |
| C | Stacked composed-then-list (no toggle) | Compact composed strip on top, flat list below — both always visible | None | No mode state for operator to track; double chrome cost; risk of redundant scroll real estate |

### Member-of badge (three directions)

| ID | Name | Placement | Trade-off |
|---|---|---|---|
| 1 | Pull-tab on row edge | Vertical tab on the row's left edge (mirrors `.er-marginalia-tab` pattern) | Most discoverable structurally; new affordance pattern on dashboard rows |
| 2 | Kicker line above slug | Mono caps line `MEMBER OF cascade-rebuild ↪` above the slug | Cheap; doesn't add a new chrome class; multi-parent shows as `+N`; risk of crowding existing rows |
| 3 | Trailing inline chip near `⋮` | Compact chip immediately left of the row's overflow `⋮` | Co-located with other row affordances; risk of clustering with the v0.20 overflow vocabulary |

## How to evaluate

Open each mockup in a browser at the iPhone-13 viewport (390×844) — the studio's mobile-first home base — then at a desktop viewport (≥1280px) to verify the composed-view direction holds at scale. For each direction, ask:

1. **Does the operator see the pipeline shape of the group's members in one glance?** (Structure over scrolling.)
2. **Does the rendering respect the retired patterns?** (No rubber-stamp, no review state surfacing, no bottom tab bar.)
3. **Does the empty-state degrade gracefully?** A group with `members: []` and no `artifactPath` should still render coherently.
4. **For the badge direction:** does it survive the row's existing affordance density (overflow `⋮`, swipe drawer)? Does the multi-parent case look reasonable at 1, 2, 3, 5 parents?

## How to pick

The operator opens the index page (`mockups/index.html`), reviews each direction, picks one group-review-surface direction (A / B / C) and one badge direction (1 / 2 / 3). The picks are recorded by:

- Moving this proposal from `PROPOSED/` to `ACCEPTED/2026-05-29-group-review-surface/` with the picked directions noted in the `brief.md`.
- Filing `REJECTED/2026-05-29-group-review-surface-alternatives/brief.md` referencing the un-picked directions.
- Updating `DESIGN-STANDARDS.md`'s change log with the decision.

Implementation of the picked direction lands as Phase 7 Tasks 7.3 + 7.4 commits.

## Related design history

- **2026-05-27 multi-lane dashboard (D3 "Press Bay")** — Phase 5's swimlane primitive picked over D1 "Lane Stack" and D2 "Lane Bar". Direction B above reuses this primitive scoped to a single group's members.
- **2026-05-09 collapsible stage tiles** — the dashboard's mobile structure-summary pattern. Direction A's sticky summary strip borrows the at-a-glance shape.
- **2026-05-11 row affordance (overflow + swipe)** — the row chrome the "Member of:" badge has to coexist with. Directions 2 and 3 both interact with this; Direction 1 sidesteps by living on the row's edge.

## Out of scope

- The internal annotation surface for graphical entries (Phase 8 territory).
- Group lifecycle controls (create / archive / cancel) on the review surface — those are CLI-driven per Phase 7's CRUD shape; surfacing them is Task 7.6.
- Studio group-management page at `/dev/groups/` — Task 7.6's territory.
- Iterate semantics on groups — Task 7.7's territory.
