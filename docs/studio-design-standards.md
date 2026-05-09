---
title: Deskwork Studio Design Standards
status: load-bearing
last-updated: 2026-05-09
---

# Deskwork Studio Design Standards

This document is the canonical record of design decisions for `@deskwork/studio` — the editorial calendar / review web surface served from `packages/studio` and consumed via the `deskwork-studio` plugin.

It exists because design decisions kept being relitigated. **If a global design choice is documented here, it is settled. Don't re-propose it. Don't show it as an option in mockups. Update this document if a settled choice is to be revisited; don't drift away from it silently.**

## Process

- **Before any UI design or implementation work** on the studio: read this document.
- **When a design decision has global impact** (changes the vocabulary, alters how a class of element looks/behaves, applies across multiple pages, or differs between desktop and mobile): update this document **in the same commit** as the implementation change. The update is part of the work, not a follow-up.
- The standards document is referenced from the **`session-start` skill** so every session loads it.
- The **`studio-design-standards` rule** in `.claude/rules/` enforces it.

If a design decision feels like it might have global impact and you're unsure: it does. Document it.

## Vocabulary (shared across desktop and mobile)

The press-check vocabulary, established by the v0.17 + v0.18 mobile review-surface and editor rebuilds:

### Color tokens

| Token | Hex | Use |
|---|---|---|
| `--er-paper` | `#F5F1E8` | Page background |
| `--er-paper-2` | `#ECE6D4` | Slightly darker paper layer (filter strip, panel-2 backgrounds) |
| `--er-paper-3` | `#DFD7BF` | Hairlines, dashed dividers, paper-cut elements |
| `--er-ink` | `#1A1614` | Primary text |
| `--er-faded` | `#8A7F70` | Secondary text, muted labels |
| `--er-red-pencil` | `#B8362A` | Primary accent — section heads, masthead rule, FAB fill, in-review state internally |
| `--er-proof-blue` | `#2A4B7C` | Secondary accent — links, source/preview toggles, iterating state internally |
| `--er-stamp-green` | `#2E5D45` | Tertiary accent — approve / save success / approved state internally |
| `--er-kraft` | `#8A7250` | Quaternary accent — scrapbook / folio surfaces, kraft paper warmth |

### Typography

- **Display (titles, italic ornament)**: Newsreader, italic, optical-size aware. Used for masthead title, section names, slug entries' titles, sheet kickers, stamps (where used — see desktop-only below).
- **Mono (kickers, labels, meta)**: JetBrains Mono. Used for masthead kicker, section-state stat strips, slug strings, mono caps with letter-spacing for tracked engraved-print feel.
- **No** Inter, Roboto, Arial, system-default sans-serif as primary type. Mono falls back to `ui-monospace` only.

### Texture

- Paper-noise SVG turbulence filter at low opacity behind the `--er-paper` body and on raised surfaces (sheets, FAB, tabbar). Subtle but always present.

### Hierarchy and accent map

| Stage / state | Accent |
|---|---|
| Pipeline stage names (Drafting, Final, etc.) | `--er-red-pencil` (italic display ornament glyphs) |
| Press-check masthead rule | `--er-red-pencil` |
| In-review (internal data) | `--er-red-pencil` (where surfaced) |
| Iterating (internal data) | `--er-proof-blue` (where surfaced) |
| Approved / save-success | `--er-stamp-green` (where surfaced) |
| Scrapbook / folio | `--er-kraft` |

## Surfaces

The studio has 7 web surfaces. v0.17 + v0.18 brought mobile-first treatment to entry-review (longform + shortform + edit + scrapbook). v0.19 brings it to dashboard. Subsequent phases will cover shortform-desk, content-tree, scrapbook-viewer, manual, studio-index. This document grows as each surface lands.

## Mobile vs desktop deltas

Default rule: any standard documented here is shared between desktop and mobile UNLESS the section explicitly says otherwise.

### Rubber-stamp conceit — desktop YES, mobile NO

**This is the most-relitigated rule. Read it carefully and never re-propose alternatives.**

A *rubber-stamp* is any rectangular chrome element labeling a state — `IN REVIEW`, `ITERATING`, `APPROVED`, `IN DRAFTING`, etc. — using a bordered or filled box with state-colored text.

#### Desktop (>600px viewport)

Rubber-stamps **may** appear inline in dashboard rows, in entry-review hero strips, etc. The rotated rubber-stamp idiom (slight `transform: rotate(-1.2deg)` on per-row stamps; `-1.5deg` on hero stamps) is the desktop press-check signature. It reads as "hand-pressed editor's mark on a proof."

Specific desktop stamp classes:
- `.er-stamp` (small rotated stamp; per-row variant in editorial-review.css)
- `.er-stamp-big` (larger stamp on the entry-review hero strip)

These **stay on desktop**. Don't remove them without an explicit decision logged here.

#### Mobile (≤600px viewport)

**No rubber-stamp conceit on mobile. Period.** This includes:

- Rotated rubber-stamps (`transform: rotate(...)`)
- Flat letterpress tags (doubled border, ink-bleed text-shadow)
- Filing-tab silhouettes (clip-path notched corner + paper-3 fill + stage-color edge bar)
- Rule-bracketed marks (top + bottom 1px stage-color rules)
- Embossed seals (inset shadow, no border)
- ANY OTHER label-on-a-rectangle pattern that says "this entry is in state X"

**The reason: state surfacing on mobile rows produces visual noise that compounds vertically.** The original rotated-stamp metaphor was beautiful at desktop scale where stamps spread horizontally — on mobile they cluster, fight the row's natural composition, and (more fundamentally) surface internal-only data the operator doesn't act on at row-level.

**What replaces the rubber-stamp on mobile**: nothing visible at row-level. State, where it matters, is communicated through **stage hierarchy** (the stage tile / section head a row lives under) or through **action affordances** (a contextual primary verb if we add one back). State labels themselves do not appear inline on rows.

**This applies to mockups too.** Don't draft mobile mockups with state-stamp rectangles "for visualization" — the rectangle is what's retired, not just specific stamp shapes. If a mockup needs to communicate "this row needs your attention," do it through:
- Position in the list (pull-to-top ordering by activity)
- Action affordance (a primary verb like `approve →`)
- Subtle row treatment (a colored left rail, not a label)
- Nothing — let the absence-of-state mean the operator drills into the row to learn more

### Review state — internal-only, not user-facing

The fields `entry.reviewState` (in-review / iterating / approved) and the per-stage iteration counter are **internal data structures**. They are slated for backend removal. Do not surface them on user-facing surfaces:

- **No** "IN REVIEW" / "ITERATING" / "APPROVED" labels anywhere on mobile
- **No** "X in review" / "X approved" stats in mobile masthead
- **No** sub-counts like "5 · 3 in review" on stage tiles
- **No** review-state-driven sidebars (the mobile press queue is hidden; desktop press queue is removed)

User-facing pipeline shape comes from **stages**, which IS user-facing data:

- Pipeline stages (Ideas / Planned / Outlining / Drafting / Final / Published / Blocked / Cancelled) — **always** user-facing
- Stage glyphs (◇ § ⊹ ✎ ※ ✓ ⊘ ✗) — **always** user-facing
- Per-stage entry counts — **always** user-facing
- Distribution as a visual sibling of stages (not technically a stage; renders as one for pipeline-shape uniformity) — see Distribution below

### Filter chips — removed entirely

The filter chip strip (`<div class="er-chips">` with one chip per stage) is **removed from the dashboard**. The operator never used it. It added chrome noise and competed with the filter input for the same horizontal real estate.

What remains:
- A search input (`<input data-filter-input>`) for slug/title text-filtering
- Stage navigation lives in the stage-tile stack on mobile (collapsible) and the existing section heads on desktop

If filter chips return, document the rationale here first.

### Compose chip — mobile-only floating affordance

The dashboard's creation entry-point is a **floating Compose chip** at bottom-right (`16px` from viewport edges, above any tabbar that may be present).

- Visual: flat red-pencil pill — `--er-red-pencil` background, `--er-paper` text, 1px border, 2px corner radius, light inset highlight + warm-red drop shadow.
- **Not** a Material round FAB with elevation shadow. The round shape and Material shadow break the press-check vocabulary. The pill is consistent with other press-check chrome (rectangles, hairlines, paper-flat).
- Content: `+` glyph (mono 600 weight) + label `Compose` (mono caps 0.18em tracking).
- Tap → opens a slide-up sheet listing creation verbs (`/deskwork:add`, `/deskwork:ingest`, `/deskwork:shortform-start`). Each verb is clipboard-copy per THESIS Consequence 2.

Hidden on desktop (`display: none` at `min-width: 601px`). Desktop creation lives in the existing Ideas-section intake form.

### Collapsible stage tiles — mobile-only navigation

Each stage section on mobile is wrapped in a `.er-stage-block` containing:
1. A `.er-stage-tile` button (the mobile collapsible head)
2. The existing `<section class="er-section">` (collapsed-by-default)

Behavior:
- All 8 pipeline stages + Distribution render as 36–44px tiles in a stack at the top of the body.
- Each tile shows: stage glyph + name + total entry count + chevron.
- Empty stages render the same tile with `is-empty` styling and `disabled` so the operator sees pipeline shape but cannot drill in.
- Tap a tile → that stage's rows expand inline. Tap another → that one expands and the previous collapses (single-expand).
- On desktop, tiles are `display: none` and section heads render as before.

### Distribution — renders as a stage tile on mobile

Distribution is **not technically a pipeline stage** (no entries flow through it; it's a placeholder for shortform DistributionRecords until that integration lands). On mobile, however, it renders as a stage tile alongside the rest so the pipeline-shape scan stays uniform. The tile is `is-empty` + `disabled` until DistributionRecords ship.

On desktop, the Distribution section keeps its current `<section>` + heading + placeholder text.

### Press queue — removed

The desktop right-rail press queue (`<aside class="er-press-queue">`) is removed entirely. It surfaced review-state-derived "needs your eyes" entries; review state is being retired so the queue has nothing to show. Do not re-add without a non-review-state purpose documented here.

### Mobile chrome budget

- Hero strip (masthead): 56px
- Filter strip: 40px
- Total chrome above body: 96px
- No bottom tab bar on dashboard (parked design question — see decisions below)
- Floating Compose chip overlays content at bottom-right (~52px tall)

## Open / parked design questions

Decisions still under debate, recorded here so they don't get re-litigated as fresh:

- **Bottom tabbar (Pipeline / Press / Folio)**: Mockup 1c included it. Implementation parked because (a) "Press" tab is review-state-driven (now retired), (b) "Folio" was the soft spot in the original narrative, (c) tile stack covers per-stage navigation. **Status: parked. Don't re-propose Pipeline/Press/Folio without resolving what each tab WOULD mean post-review-state.**
- **Per-row affordance shape**: dashboard rows currently render an action chip cluster (open / approve / cancel / scrapbook) that wraps on mobile. Three directions explored (overflow menu / contextual primary / swipe gestures). Mockups in `plugins/deskwork-studio/public/mockups/dashboard-row-{1,2,3}-*.html`. **Status: pending operator pick. Mockups must be cleaned of rubber-stamp visualizations before pick (in flight).**

## Change log

Append a one-line entry to this section every time the document is updated.

- 2026-05-09 — Initial draft. Captured all design decisions made during the v0.19 dashboard rebuild session: rubber-stamp retired on mobile (filing-tab is also a rubber-stamp); review-state internal-only; filter chips removed; Compose FAB shape; collapsible stage tiles; Distribution-as-tile; press queue removed; chrome budget.
