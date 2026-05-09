# Retired dashboard mockups

These nine mockup files were drafted during the v0.19 dashboard rebuild between 2026-05-08 and 2026-05-09. They explored design directions before the **Studio Design Standards** (`docs/studio-design-standards.md`) were written.

**They are now MISLEADING — do not use them as reference.** They encode design patterns that have since been retired:

- All of them surface review state ("In review", "Iterating", "Approved") visibly on rows or in stage tile sub-counts ("5 · 3 in review") or in masthead stats ("2 in review · 1 approved"). Per the standards, **review state is internal-only data** and not surfaced anywhere on user-facing surfaces.
- Most of them use rubber-stamp / filing-tab / letterpress-tag / rule-bracketed-mark variants — the rubber-stamp conceit is **retired on mobile in all forms** per the standards.
- `dashboard-1-press-tabs.html` and its variants propose a Pipeline / Press / Folio bottom tab bar that depends on review-state (the "Press" tab) — parked design question, not currently implemented.

## What is the canonical record of the v0.19 dashboard design?

The **standards document** (`docs/studio-design-standards.md`) and the **live implementation** (`packages/studio/src/pages/dashboard*.ts` + `plugins/deskwork-studio/public/css/dashboard-mobile.css`). When the spec says one thing and these mockups say another, the spec wins.

## Why keep them at all?

Decision archaeology. They represent the design space that was explored, including dead ends. If a future session asks "did we ever consider X?", the answer may be in here. They're not deleted — just retired from active use.

## File index

| File | Direction | Why retired |
|---|---|---|
| `dashboard-1-press-tabs.html` | Original Mockup 1 — bottom tab bar, rotated rubber-stamps | Picked → revised → 1c, then mobile rubber-stamps retired entirely |
| `dashboard-1b-press-tabs-revised.html` | Mockup 1 + flat letterpress-tag stamps + Compose tab | Letterpress-tag is also a rubber-stamp; retired |
| `dashboard-1c-filing-tab-fab.html` | The picked design — filing-tab stamps + floating Compose chip | Filing-tab is also a rubber-stamp; retired post-implementation |
| `dashboard-1d-rule-mark-strip-chip.html` | Rule-bracketed marks + masthead "+ New" chip | Rule-bracketed is also a rubber-stamp; retired |
| `dashboard-2-card-stream.html` | No tabs, magazine-style stream | Surfaces review-state on every card |
| `dashboard-3-folio-dock.html` | Card-stream + 52px asymmetric dock | Same review-state surfacing problem |
| `dashboard-compact-1-collapsible.html` | The picked compactness direction — collapsible stage tiles | Has filing-tab stamps in expanded sections + tile sub-counts surfacing review state |
| `dashboard-compact-2-density-toggle.html` | Hide empty stages + density toggle | Same review-state surfacing problem |
| `dashboard-compact-3-attention-first.html` | Filter chips as nav, attention-ordered rows | Built around review-state-derived ordering |

## Active dashboard mockups

The remaining `dashboard-row-1-overflow.html` / `dashboard-row-2-contextual-primary.html` / `dashboard-row-3-swipe.html` are **active** — awaiting operator pick on the per-row affordance shape. They've been stripped of stamp markup and bear a deprecation banner where their narratives reference review-state-driven contextual logic that needs redrafting on a stage-graduation basis.
