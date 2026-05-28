---
title: Deskwork Studio Design Standards
status: load-bearing
last-updated: 2026-05-09
deskwork:
  id: 0e8e8d37-9242-42f1-9c8c-cf70330e899f
---

# Deskwork Studio Design Standards

This document is the canonical record of design decisions for `@deskwork/studio` — the editorial calendar / review web surface served from `packages/studio` and consumed via the `deskwork-studio` plugin.

It exists because design decisions kept being relitigated. **If a global design choice is documented here, it is settled. Don't re-propose it. Don't show it as an option in mockups. Update this document if a settled choice is to be revisited; don't drift away from it silently.**

## Process

- **Before any UI design or implementation work** on the studio: read this document.
- **When a design decision has global impact** (changes the vocabulary, alters how a class of element looks/behaves, applies across multiple pages, or differs between desktop and mobile): update this document **in the same commit** as the implementation change. The update is part of the work, not a follow-up.
- **File a proposal-archive entry** under `docs/studio-design/ACCEPTED/<date>-<slug>/` (or `REJECTED/<date>-<slug>/`) whenever a design direction is picked OR rejected. The archive is the durable record of *what was considered* alongside this document's record of *what was settled*. See `docs/studio-design/README.md` for the contract.
- The standards document is referenced from the **`session-start` skill** so every session loads it.
- The **`design-standards` rule** in `.claude/rules/` enforces both the standards-doc updates AND the proposal-archive entries.

If a design decision feels like it might have global impact and you're unsure: it does. Document it.

## Proposal archive

Durable history of design decisions lives at **`docs/studio-design/`**:

- **`ACCEPTED/<YYYY-MM-DD>-<slug>/`** — design decisions that landed
- **`REJECTED/<YYYY-MM-DD>-<slug>/`** — design directions explored and declined

Each entry contains a `brief.md` (what / why / when / feature reference) and either a self-contained visual file or a relative-path reference to the canonical mockup elsewhere in the tree (never a copy). Read `docs/studio-design/README.md` for the contract.

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

## Principles

These are higher-order guides for design decisions. When the deltas section below doesn't speak directly to a question, fall back here.

### Favor structure over scrolling

A structured view with well-considered options for revealing more information on demand is preferable to an unstructured long scroll that hides the implicit structure of a thing.

**What this means in practice:**

- If a list has natural hierarchy (stages, sections, categories), surface that hierarchy at the top of the view as a compact summary the operator can scan at-a-glance. Let them drill into a specific node to see the rows underneath. **Don't** flatten the hierarchy into a long row stack and ask the operator to scroll to find the structure they already know exists.
- Empty hierarchy nodes still have a place in the structured view. Showing "Ideas: 0" is a structural signal — the absence of items is information about the pipeline shape. Don't hide empty nodes just to shorten the page; they communicate "this stage exists, nothing here right now."
- When the structure-summary view costs more chrome (a row of tiles, a stage stack) than just rendering everything, that chrome is paying for navigation. The operator's scroll cost drops in exchange.
- "Reveal more on demand" patterns: collapse-by-default sections, tap-to-expand tiles, sheet-based detail views, sticky structure-strip + scrollable detail. All preferable to always-visible rows.
- "Scrolling is sometimes necessary" — yes. After the operator drills into a node, the rows under it can scroll. Within a single section the row stack is fine. The principle is about the FIRST view: it should communicate structure, not pile rows.

**Canonical example: the dashboard's collapsible stage tiles (v0.19).** Eight stage tiles in a ~360px stack at the top of the body. Whole pipeline shape visible at-a-glance. Tap one → that stage's rows expand inline; others stay collapsed and reachable above and below. Compare the pre-v0.19 dashboard: 746px scroll to reach the first row WITH activity, all four empty stages eating chrome equally, no way to jump straight to the stage you wanted.

**Failure pattern: the "card stream" alternative considered for the dashboard.** A single long-scrolling stream of every entry across every stage, ordered by attention. Discarded specifically because it abandoned the pipeline-shape signal — the operator could no longer SEE that there were four empty stages, that Drafting had 5 entries with 3 needing review, etc. Without structure, the page just got longer.

**How to apply:**

- Before drafting a new mobile surface, ask: *what's the implicit structure of this thing?* (stages, sections, time-buckets, levels of detail, etc.)
- Surface that structure compactly at the top.
- Make detail-on-demand — tap, swipe, expand — the path to rows.
- If the surface genuinely has no structure (a single homogeneous list with no useful hierarchy), then a scrolling list is fine. Be honest about which case you're in. "I couldn't think of a structure" usually means there IS one and the design didn't find it yet.
- Scroll cost is a measurable thing. Cite it (in pixels, or "rows visible at-rest") when comparing direction options.

## Surfaces

The studio has 7 web surfaces. v0.17 + v0.18 brought mobile-first treatment to entry-review (longform + shortform + edit + scrapbook). v0.19 brings it to dashboard. Subsequent phases will cover shortform-desk, content-tree, scrapbook-viewer, manual, studio-index. This document grows as each surface lands.

## Studio navigation model

The studio uses a **star navigation** model. The **Desk** (`/dev/editorial-studio`) is the hub. Every other surface (entry-review, shortform review, scrapbook viewer, content tree, manual, future surfaces) is a leaf reached *by navigating from the Desk*. **There is no bar nav region; there is no destination picker; there is no top-level tab bar.**

This section was settled through seven mockup refinements (cross-bar 2 v1→v7) plus a dedicated desk-states elaboration, all archived under `docs/studio-design/`. Reconsidering would relitigate decisions the operator has already approved.

### The two universal masthead affordances

Every studio surface MUST carry these two affordances at the breakpoints they're shipped to (mobile per the v0.21 implementation; desktop refinement deferred to a separate feature branch):

- **`←` back-link** — leftmost masthead position. Italic-display `←` (U+2190 LEFTWARDS ARROW) at ~1.25rem in `--er-proof-blue` (8.13:1 vs paper). No label, no underline, no border. Touch target ≥44×44px via padding+margin. Tap navigates to `/dev/editorial-studio`. **Absent only on the Desk itself** (you're already home).
- **`⋮` menu glyph** — rightmost masthead position. Monospace `⋮` (U+22EE VERTICAL ELLIPSIS) at ~1.2rem in `--er-ink-soft` (8.92:1 vs paper). No border, no background. Touch target ≥44×44px via padding+margin. Active state (popover open): glyph color shifts to `--er-red-pencil`. **Present on every surface including the Desk.**

The masthead grid: `24px (back) | 1fr (center stack: kicker + slug-or-title) | 24px (menu)`. On the Desk, the back column collapses (no back-link) — grid becomes `1fr | 24px`. Vertical alignment is `center` on all cells; any border-bottom rule has explicit clearance below all content (no element overlaps any rule).

### Menu reveal pattern · popover, not slide-up sheet

The masthead's `⋮` opens a **dropdown popover anchored under the glyph**, with an up-pointing arrow registered to the glyph's x-position. The popover is dismissed by scrim tap, `⋮` tap-again, or Escape. **The masthead menu does NOT use Phase 2.1's `createSlideUpSheet`** — that primitive is reserved for *bottom-anchored* affordances (bar-triggered sheets, the Compose chip).

Top-anchored affordances reveal popovers anchored under the trigger; bottom-anchored affordances reveal slide-up sheets. This matches Apple HIG and Material Design conventions. Violating the spatial model — top-anchored trigger that reveals from the bottom — creates a "I tapped here, why is the menu over there?" failure that v6 surfaced and v7 corrected.

### The `⋮` vocabulary scope convention

`⋮` is the studio's universal **overflow affordance**. It appears in two scopes, parsed by location:

- **Row-level** (inside a dashboard row) — opens row-level options popover (shipped in v0.20: stage-aware verbs like iterate / approve / cancel / scrapbook / induct / block).
- **Masthead-level** (rightmost masthead glyph) — opens studio-level menu popover (v7: cross-cutting options like Manual / Keyboard shortcuts / Configure / File an issue / About).

Both use the same glyph AND the same reveal pattern. Operators parse the scope by location. The pattern is *"tap ⋮ for more options at this level."* No conflation risk — the chrome regions are spatially distinct.

### The Desk's hub role

The Desk is the entry-point to every reachable destination. Its information architecture grows to absorb destinations that would otherwise be top-level navigation entries. See § Desk information architecture below.

### Implications for desktop (separate feature branch)

The desktop refinement (future work, not in scope for this feature branch) inherits this model. The `←` back-link and `⋮` menu glyph appear in equivalent desktop chrome (likely the editorial-folio header rather than the mobile masthead). The Desk's section-stack pattern becomes a multi-column or wide-grid layout where the IA can spread. **The cross-cutting principle — Desk is hub, every leaf carries back + menu — holds at every breakpoint.**

### Why this is settled

Seven mockup passes reached this point:

- **v1** — three nav tabs (Desk · Short · Manual). Scrapbook compressed.
- **v2** — Manual demoted to masthead `?`. Bar has 2 nav cells. Scrapbook stays.
- **v3** — Nav collapsed to single picker cell + slide-up destination sheet. Contextual region 1-5.
- **v4** — Picker removed entirely. *Desk becomes the hub*; every leaf carries `← Desk` in masthead.
- **v5** — Masthead chrome refined: `← Desk` leftmost; expandable menu rightmost (room for cross-cutting actions beyond just help).
- **v6** — Menu glyph reuses `⋮` (matches v0.20 row vocabulary); back-link compressed to single `←` glyph; meta inline in kicker.
- **v7** — Glyph alignment + border clearance fixed; menu reveal pattern corrected from slide-up sheet to dropdown popover.

Each pass added simplification without losing capability. The architecture is at the asymptote — there's nothing left to remove from the bar's nav region (it's gone entirely) and the masthead's two glyphs are the minimum affordance set.

## Universal bar contract

The mobile contextual bar is **universal** — every non-Desk mobile surface consumes the same primitive: `renderMobileBar({ contextual: readonly Cell[] })`. Surface-bespoke bar idioms are **retired**.

This section settles a class of design question that kept resurfacing during v0.21 implementation: *"what idiom should this surface's bottom bar use — sticky decision bar / floating action sheet / bottom tab bar / something else?"* The answer is that the question has the wrong shape. The chrome is fixed by v7; the per-surface design variable is **which cells** the bar carries, not **what shape** the bar takes.

### The contract

1. **One primitive, one shape.** Every non-Desk mobile surface uses `renderMobileBar` (`packages/studio/src/pages/mobile-bar.ts`). No bespoke bar component, no surface-specific tab strip, no inline sticky chrome that duplicates the bar's job. If a surface needs different chrome, the answer is to change the cells passed to `renderMobileBar`, not to draft a new chrome shape.

2. **Zero nav region.** The bar carries zero navigation cells. Per the v7 settlement, navigation lives in the masthead (`←` returns to the Desk; `⋮` opens the cross-cutting menu). A bar cell that triggers navigation to another destination is a violation. (Cells that open per-surface auxiliary surfaces — a TOC sheet, a versions sheet, a row-overflow popover — are not navigation; they're contextual actions on the current surface.)

3. **1–6 contextual cells.** The bar holds between one and six cells. Surfaces with fewer than one cell don't render a bar at all (the Desk is the canonical zero-bar surface). Surfaces with more than six need their cells consolidated — likely by collapsing several into a sheet behind a single cell — not by widening the bar.

4. **Cell API is the per-surface design variable.** The `Cell` discriminated-action union (`{kind:'sheet',name}` or `{kind:'direct',action}`) is the entire interface. Each cell is either *"open this slide-up sheet"* or *"perform this action immediately"*. Cells with sheet-opening semantics use the Phase 2.1 `sheet-controller` primitive. Cells with direct-action semantics dispatch the action inline (typically clipboard-copy of a slash command per THESIS Consequence 2). The API has been deliberately kept small; expanding it ahead of need is a code smell.

5. **No state-derived cell shape.** Cells are gated by stage per `DESKWORK-STATE-MACHINE.md` Commandment II — never by review state, iteration count, or any other retired axis. Cells that render conditionally because of "what the operator just did" (the agent is iterating, the workflow is awaiting apply, etc.) are surfacing review state and are violations of Commandment III. Per-surface "pending pill" affordances of that shape are retired alongside the rubber-stamp conceit.

6. **Bar-bottom-anchored ⇒ slide-up sheets.** Sheets opened from bar cells reveal upward (the Phase 2.1 primitive). Top-anchored affordances (the masthead `⋮`) reveal popovers downward per § Studio navigation model. This spatial rule is non-negotiable; mixing reveal directions is the v6→v7 failure mode.

### What this rules out

- A *"sticky decision bar"* that renders verb chips inline at the bottom outside of `renderMobileBar`. (If the surface needs verbs in the bar, they're cells; they're not a separate sticky strip.)
- A *"floating action sheet"* with bespoke FAB-shaped trigger chrome. (The Desk's Compose chip is a documented exception with its own § entry; new surfaces don't get bespoke FABs.)
- A *"bottom tab bar"* named as such — the word *"tab bar"* is exactly what v4→v7 retired at the architectural level. The bar's cells may resemble tabs visually, but the contract is "1-6 contextual cells consuming the universal primitive," not "tabs choosing among destinations or modes."
- Per-surface visual variants of the bar (different height, different cell-cap, different reveal direction).

### What this rules in

- Per-surface variation in **which cells** the bar carries (e.g., entry-review's 6 cells vs. shortform-review's 3–4 cells vs. dashboard's 0 cells).
- Per-surface variation in **what each cell opens** (a TOC sheet on surfaces with headings; a row-popover sheet on surfaces with row drawers; a versions sheet on surfaces with version history; etc.).
- Per-surface variation in **cell labels and glyphs**, within the press-check vocabulary.

### When a surface seems to need a new bar shape

It doesn't. The thing that varies is the cell list. If the apparent design problem is *"shortform needs three tabs"*, the actual design problem is *"shortform's `Cell[]` is [TOC, Actions, Versions]"* and the implementation is `renderMobileBar({ contextual: [tocCell, actionsCell, versionsCell] })`. The chrome that renders those three cells is the same chrome that renders every other surface's cells.

If a genuine new affordance shape is needed — a search pill that's not sheet-and-not-direct, an inline scrubber, anything that doesn't fit the two-arm `Cell` API — the response is to amend this section (proposing a third Cell arm with operator agreement) **before** drafting markup. Expanding the `Cell` API drift-and-retroactively is the same convention-canon failure mode this section is named to prevent.

### Why this is settled

The same v1→v7 cross-bar arc that settled the masthead's chrome also settled the bar's contract. By v7, the bar's job is exactly "do work on this surface" — a contract that admits exactly the two-arm Cell API and admits no per-surface bespoke variation in chrome shape. Surface-bespoke bar idioms drafted before v7 landed (sticky-decision-bar, floating-action-sheet, bottom-tabbar variants) are archived under `docs/studio-design/REJECTED/2026-05-12-shortform-{1,2,3}-*` with briefs noting their supersession.

## Desk information architecture

The Desk's body is organized into stacked **sections**, each with its own header. Sections are append-only — new destinations slot in as additional sections, not as new top-level navigation entries. The current three sections, top-to-bottom:

### § Longform pipeline · 8 stage tiles

Eight stage tiles in flow order per `DESKWORK-STATE-MACHINE.md`:

| Glyph | Stage | Use |
|---|---|---|
| `◇` | Ideas | Captured pitch |
| `§` | Planned | Committed to publish |
| `⊹` | Outlining | Outline drafted |
| `✎` | Drafting | Body being written |
| `※` | Final | Content locked; ready to publish |
| `✓` | Published | Terminal; publicly committed |
| `⊘` | Blocked | Paused; resumable |
| `✗` | Cancelled | Abandoned; resumable |

Single-expand **within the section**. Tapping a second tile closes the previously-open one. Expanded tile gets `--er-paper-2` background + red-pencil top inset rule + chevron rotated 90°. Rows render inline below the tile in a row-group container. Each row's trailing `⋮` opens the v0.20 row-level overflow popover.

### § Shortform · by platform · 4 platform tiles

Four platform tiles, color-coded badges (badge replaces glyph slot):

| Badge | Color | Platform |
|---|---|---|
| `in` | `--er-red-pencil` | LinkedIn |
| `r/` | `--er-proof-blue` | Reddit |
| `@` | `--er-kraft` | YouTube |
| `IG` | `--er-kraft` | Instagram |

Single-expand within section. Expanded tile shows workflow rows with slug + title + channel + version/age + trailing `⋮`.

### § Adjacent tools · placeholder (Phase 3+)

Two dimmed tiles reserved for future surfaces:

- **Folio** (standalone scrapbook viewer entry-point)
- **Files** (content tree entry-point)

Non-expandable; tagged `(phase 3)` until those surfaces ship.

### Cross-section behavior

The longform pipeline and shortform sections operate **independent single-expand state**. Operators may have one longform stage AND one shortform platform expanded at the same time — useful when cross-referencing pipeline state with social distribution shape.

### Empty-state rendering

Per § Principles ("Favor structure over scrolling"): empty hierarchy nodes still have a place in the structured view. Showing "Ideas: 0" or "Instagram: 0" is a structural signal — the absence of items is information about the pipeline shape.

**Empty tiles MUST render via explicit muted palette, NOT via `opacity` reduction.** Opacity blends with the background and tanks inherited text contrast (e.g., `--er-ink` at 15.77:1 dropped to ~2:1 at `opacity: 0.55`). Explicit muted palette:

- Tile background: `--er-paper` (same as active tiles)
- Glyph: `--er-faded` (3.48:1 — ornamental floor)
- Name: `--er-ink-soft` (8.92:1 — body text)
- Count "0": `--er-ink-soft` (8.92:1 — body text)
- Chevron: hidden via `visibility: hidden`
- Tap target: disabled (cursor default)

This preserves WCAG 2.1 AA contrast on every informational label while still demoting the tile's visual weight.

### Compose

`Compose` stays as the Dashboard's floating chip (v0.19 shipped) — bottom-right of the Desk surface only. Not in masthead chrome. Per v4 default; operator may revisit if they want compose-anywhere via the masthead menu.

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

### Review state — RETIRED

The pre-redesign concept of "review state" (`in-review` / `iterating` / `approved`) is **retired** per `DESKWORK-STATE-MACHINE.md` (the project's canonical state-machine spec). It was the parallel state machine the 2026-04-30 pipeline redesign collapsed into stage. The schema's vestigial `ReviewState` type exists only as a back-compat artifact for reading legacy sidecars; new code does not write it and no UI surface renders it.

Do not surface review state anywhere on any studio surface (desktop or mobile):

- **No** "IN REVIEW" / "ITERATING" / "APPROVED" labels
- **No** "X in review" / "X approved" stats in any masthead
- **No** sub-counts like "5 · 3 in review" on stage tiles
- **No** review-state-driven sidebars (the press queue was removed end-to-end)
- **No** verbs gated on review state — verbs are stage-gated only (per `DESKWORK-STATE-MACHINE.md` Commandment II)

User-facing pipeline shape comes from **stages**, which IS user-facing data:

- Pipeline stages (Ideas / Planned / Outlining / Drafting / Final / Published / Blocked / Cancelled) — **always** user-facing
- Stage glyphs (◇ § ⊹ ✎ ※ ✓ ⊘ ✗) — **always** user-facing
- Per-stage entry counts — **always** user-facing
- Distribution as a visual sibling of stages (not technically a stage; renders as one for pipeline-shape uniformity) — see Distribution below

The state machine spec is upstream of these standards. When in conflict, `DESKWORK-STATE-MACHINE.md` wins.

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

## Accessibility — Contrast

The press-check aesthetic is restrained, but restraint is not invisibility. Every affordance must meet WCAG 2.1 AA contrast minimums against its adjacent background. *"Subdued"* and *"invisible"* are not the same word.

### Minimums

| Element | Minimum contrast | WCAG criterion |
|---|---|---|
| **Body text** (paragraphs, list items, table cells, captions) | ≥4.5:1 | 2.1 SC 1.4.3 (AA — normal text) |
| **Large text** (≥18px / 1.125rem, or ≥14px / 0.875rem bold) | ≥3:1 | 2.1 SC 1.4.3 (AA — large text) |
| **Interactive UI components** (buttons, icons, controls, focus indicators, drawer chips, menu items, FABs, stage-tile chevrons — anything the operator can tap) | ≥3:1 against the adjacent background | 2.1 SC 1.4.11 (Non-Text Contrast) |
| **Ornamental press-check chrome** (decorative glyphs, kicker dividers, rule lines, stage ornaments — anything that contributes to the surface reading as press-check) | ≥3:1 | (project standard — decorative ≠ invisible) |

### How to apply

- Before shipping a CSS color pair (foreground on background) for any of the elements above, run a contrast check. Document the ratio in a CSS comment when it's a deliberate near-minimum choice (e.g. *"3.53:1 — bare WCAG 1.4.11 floor against `--er-paper`"*).
- The token palette in `editorial-review.css` is the canonical color source. When picking a foreground for any affordance, check the resulting ratio against the likely backgrounds (`--er-paper`, `--er-paper-2`, `--er-paper-3`, `--er-ink`). If the chosen token fails, pick a different token — don't ship a near-invisible affordance.
- For active / hover / focus states, the **resting** state is what governs compliance. A button that meets 3:1 only on hover doesn't pass — the operator has to find it first.
- The spec-compliance probe (`scripts/probe-spec-compliance.mjs`) checks contrast for every affordance the brief promises. Adding a new affordance? Add its contrast assertion.

### Why this section exists

This section was added after the 2026-05-11 v0.20 row-affordance walk surfaced that the row's ⋮ overflow button shipped at `color: var(--er-paper-3)` on `var(--er-paper)` — a 1.21:1 contrast ratio. Operator on phone: *"the three dots affordance that opens the per-item menu is so low contrast, I can barely see it."* The token used was the same value as the row's dashed border rule, and no probe assertion existed to catch the gap. Codifying the minimums (with WCAG criterion citations) keeps the press-check restraint *and* keeps every affordance reachable.

## Open / parked design questions

Decisions still under debate, recorded here so they don't get re-litigated as fresh:

- **Bottom tabbar (Pipeline / Press / Folio)** — **RESOLVED 2026-05-12.** Superseded by the v7 star-nav model documented in `§ Studio navigation model`. The studio has no top-level tab bar at all; navigation between destinations happens via the Desk as hub.
- **Per-row affordance shape** — **RESOLVED.** Shipped in v0.20 as the overflow + swipe hybrid (mockup `dashboard-row-4-overflow-plus-swipe.html`). The row `⋮` opens a popover with stage-aware verbs; swipe-left reveals the same verbs as a row drawer.

## Change log

Append a one-line entry to this section every time the document is updated.

- 2026-05-09 — Initial draft. Captured all design decisions made during the v0.19 dashboard rebuild session: rubber-stamp retired on mobile (filing-tab is also a rubber-stamp); review-state internal-only; filter chips removed; Compose FAB shape; collapsible stage tiles; Distribution-as-tile; press queue removed; chrome budget.
- 2026-05-09 — Added Principles section with "Favor structure over scrolling" as the first principle. Cites the dashboard's collapsible stage tiles as the canonical application; cites the discarded card-stream as the failure pattern.
- 2026-05-11 — Added Accessibility / Contrast section codifying WCAG 2.1 AA minimums (4.5:1 body, 3:1 large, 3:1 non-text UI, 3:1 ornamental chrome). Triggered by the v0.20 dashboard ⋮ shipping at 1.21:1; companion ⋮ Direction B (ink-soft glyph, 11.06:1) lands the row-affordance fix.
- 2026-05-12 — Added `§ Studio navigation model` (the v7 star-nav architecture: Desk-as-hub, universal `← / ⋮` masthead affordances, `⋮` popover-not-sheet reveal pattern, `⋮` vocabulary scope convention). Added `§ Desk information architecture` (three sections: longform pipeline + shortform-by-platform + adjacent-tools placeholders; single-expand within section, independent across; explicit muted-palette empty-state rendering). Marked two parked decisions RESOLVED: Pipeline/Press/Folio tabbar superseded by star nav; per-row affordance shipped in v0.20.
- 2026-05-13 — Added `§ Universal bar contract` codifying the v7 settlement explicitly: `renderMobileBar` is the universal contextual chrome on every non-Desk mobile surface; per-surface bespoke bar idioms are retired; the per-surface design variable is which `Cell[]` to pass, not what shape the bar takes. Added because the workplan's stale "Pick Shortform-1/2/3 idiom" sub-step trapped the next implement-skill invocation into relitigating a settled cross-cutting decision. The three shortform-bespoke idioms (sticky-decision-bar, floating-action-sheet, bottom-tab-bar) are filed in `docs/studio-design/REJECTED/2026-05-12-shortform-{1,2,3}-*` with briefs noting their supersession.
- 2026-05-26 — Graphical-entries Phase 1 prior-art decisions accepted. The chrome-free graphical review surface adopts: W3C Web Annotation Data Model (extended with `deskwork:` namespace) as the annotation schema; **Annotorious v3** + `W3CImageFormat` for image annotation; **`@recogito/text-annotator`** v4 + a hand-rolled DOM-selector layer for HTML/DOM annotation; deskwork-supplied threading via W3C `motivation: replying`; **`html-to-image`** as the primary screenshot-capture path (with `getDisplayMedia` as opt-in secondary); **Excalidraw** v0.18.x via an isolated React sub-bundle for screenshot markup (blur deferred to a custom element type in Phase 12). Architecture A confirmed: no cloud services, no databases — every adopted library is OSS, library-only, filesystem-native. Five runnable spike directories live at `spikes/graphical-review/{annotorious-image,text-annotator-html,capture-getdisplaymedia,capture-dom-to-canvas,markup-tools}/`. Decision brief at `docs/studio-design/ACCEPTED/2026-05-26-graphical-review-prior-art/brief.md`; rejected alternatives (Hypothes.is, tldraw, html2canvas, marker.js2, BugHerd / Marker.io / Pastel, etc.) at `docs/studio-design/REJECTED/2026-05-26-graphical-review-alternatives/brief.md`.
- 2026-05-27 — Graphical-entries Phase 5 multi-lane dashboard design accepted. Direction 3 "Press Bay" (v11) is the picked direction over D1 "Lane Stack" and D2 "Lane Bar". The multi-lane dashboard renders as horizontal **swimlanes** on desktop and a vertical **lane-stack** on mobile. Each lane is independently visible/focused (left rail + focus-chip strip — two views of split state), independently expanded/collapsed at the lane level AND the per-stage level, independently switchable between **kanban** and **list** views (viewport-aware defaults: desktop kanban, mobile list — list preserves linear stage sequence on narrow viewports), and independently compose-enabled via a per-lane **`+ new`** chip in the swim-head / lane-head. The chip clipboard-copies `/deskwork:add <SLUG> --lane <id> --stage <first>` so the operator pastes in chat and fills the slug — no form, no popover, no bottom sheet (THESIS Consequence 2 honored). This pivots away from the PRD's original "per-lane tab strip" framing (D2-shaped) toward swimlanes that keep every focused lane on-screen at once. Decision brief at `docs/studio-design/ACCEPTED/2026-05-27-multi-lane-dashboard-d3-press-bay/brief.md`; rejected alternatives at `docs/studio-design/REJECTED/2026-05-27-multi-lane-dashboard-d{1,2}-*/brief.md`. Implementation translates the picked mockup into production studio markup + CSS + minimal client TS via Phase 5 Tasks 5.1+.
