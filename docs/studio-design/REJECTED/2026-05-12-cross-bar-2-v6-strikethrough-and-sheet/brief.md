---
proposal: Cross-bar 2 refinement v6 — streamlined masthead with ⋮ menu (alignment bug + slide-up sheet)
status: REJECTED
date: 2026-05-12
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ../../../../plugins/deskwork-studio/public/mockups/cross-bar-2-refined-v6-streamlined-masthead.html
---

# Cross-bar 2 refinement v6 — streamlined masthead (alignment bug + slide-up sheet)

## What

The streamlined masthead chrome that replaced v5's hamburger + word-back with bare paper-flat glyphs. Single italic-display `←` glyph at left (proof-blue, no label, no underline); single mono `⋮` glyph at right (matches v0.20 row overflow vocabulary). Meta data folds inline into the kicker line. The masthead has three visual zones (back glyph · center stack · menu glyph) instead of v5's four. The menu reveal is a slide-up sheet anchored to the bottom of the viewport.

## Why rejected

Two real bugs the operator caught after walking v6 on phone. **First:** the masthead's `align-items: end` + `align-self: end` dropped both side glyphs to the bottom edge of the grid track — the same y-coordinate as the border-bottom rule. The rule passed *through* the glyphs, reading as a strikethrough. **Second:** a top-anchored trigger (`⋮` in the masthead) revealing a bottom-anchored sheet violates the spatial model. Apple HIG / Material Design convention: top-anchored affordances reveal popovers anchored under the trigger; bottom-anchored affordances reveal slide-up sheets. The two patterns are not interchangeable.

v7 corrected both: `align-items: center` + masthead height +20px + bottom padding clearance fixed the strikethrough; the masthead `⋮` opens a dropdown popover anchored under the glyph (matching the v0.20 row `⋮` popover idiom) instead of a slide-up sheet.

## When

Documented 2026-05-12; superseded by v7 (masthead-fixes) the same day.

## Feature reference

`docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/`
