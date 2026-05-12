---
proposal: Row ⋮ overflow button — Direction A (faded glyph, 3.53:1)
status: REJECTED
date: 2026-05-11
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ../../../../plugins/deskwork-studio/public/mockups/row-overflow-contrast.html
---

# Row ⋮ overflow contrast — Direction A (faded glyph)

## What

Proposed: `.er-row-overflow { color: var(--er-faded); }` — #8A7F70 on #F5F1E8 paper = **3.53:1**. Bare-minimum compliance with WCAG 2.1 SC 1.4.11 (Non-Text Contrast, 3:1 floor for interactive UI components).

The visual intent was to preserve the press-check aesthetic's "subdued chrome, primary content" hierarchy — keeping the ⋮ visually low-emphasis while still meeting the minimum standard.

## Why rejected

The operator picked Direction B (ink-soft, 11.06:1) over A primarily because **A has no headroom**. The 3.53:1 ratio sits 0.53 above the WCAG floor — any future palette tweak to `--er-paper` (lightening), `--er-faded` (warming), or display calibration drift could drop the ratio below 3:1 and re-introduce the same regression.

Secondary considerations:
- The operator's framing on the v0.20.0 phone walk was *"I can **barely** see it"* even before the rule existed — a 3.53:1 ratio would still feel marginal in glare and on older displays, even though it technically passes.
- "Bare minimum compliance" is the wrong target when a 10×-better ratio (ink-soft, 11.06:1) is available from the same press-check token palette without inventing a new color.

## When

Rejected 2026-05-11 in the same review pass that accepted Direction B. The Direction A treatment is captured here so future sessions don't re-propose it as a fresh "subdued + accessible" option without confronting the headroom argument.

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/)
