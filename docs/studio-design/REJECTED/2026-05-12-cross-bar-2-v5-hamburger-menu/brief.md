---
proposal: Cross-bar 2 refinement v5 — hamburger menu glyph + word "Desk" back-link
status: REJECTED
date: 2026-05-12
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ../../../../plugins/deskwork-studio/public/mockups/cross-bar-2-refined-v5-masthead-menu.html
---

# Cross-bar 2 refinement v5 — hamburger menu glyph

## What

The masthead chrome refinement for the v4 Desk-as-hub direction. `← Desk` (mono `←` + italic-display "Desk" + 1px blue underline) at the leftmost masthead position. An expandable menu glyph at the rightmost — three CSS-rendered horizontal rules (14px / 10px / 14px) inside a 30×30 paper-bordered square. Tap opens a slide-up menu sheet.

## Why rejected

Two operator catches. **First:** the three-rule glyph reads as a generic web hamburger, which doesn't fit the press-check design language. The studio's v0.20 row affordance already established `⋮` (vertical ellipsis) as the studio's overflow vocabulary. Reusing `⋮` for the masthead menu (v6 refinement) unifies the vocabulary — *"⋮ at row level = row options; ⋮ at masthead = studio menu"* — same glyph, scoped by location. **Second:** the bordered square + word-back design read as visually noisy ("messy") on mobile. v6 simplified to bare paper-flat glyphs flanking the center stack.

## When

Documented 2026-05-12; superseded by v6 (streamlined masthead with ⋮ glyph) and v7 (alignment + popover fixes).

## Feature reference

`docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/`
