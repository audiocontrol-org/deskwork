---
proposal: Shortform 3 — Bottom tab bar (surface-bespoke 3-tab chrome)
status: REJECTED
date: 2026-05-12
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ./mockup.html
---

# Shortform 3 — Bottom tab bar (surface-bespoke 3-tab chrome)

## What

A 48px bottom tab bar on the shortform review surface with up to three tabs — Actions, Versions, TOC. Each tab opens its own slide-up sheet via a separate `sheet-controller` instance. TOC tab is conditional (hides when body has <2 h2/h3/h4 entries); Versions tab is conditional (hides when there's only one version). The proposal explicitly notes that picking this direction "makes Task 2.2.5's `renderMobileBar()` parameterization a concrete two-consumer design rather than speculative."

## Why rejected

This is the subtlest of the three to retire because its content (TOC / Actions / Versions sheets) survives forward into the universal-bar implementation, even though its chrome shape ("bottom tab bar") does not. The chrome distinction matters: v7 settled that the contextual bar is universal — every non-Desk surface consumes `renderMobileBar` with a 1–6 cell `Cell[]`. *"Bottom tab bar"* names a surface-bespoke chrome shape that v7 retired.

The proposal's strengths translate forward fully: the cells become `[{kind:'sheet',name:'toc'}, {kind:'sheet',name:'actions'}, {kind:'sheet',name:'versions'}]`, passed to the universal bar. TOC closure (#244) and the conditional-cell behavior (hide TOC when no headings) are implementation details of *which cells the surface passes*, not of *what shape the chrome takes*.

The reason this specifically deserves a REJECTED archive entry (not silent retirement) is that the visual closely resembles the universal-bar's rendered output. Without an explicit archive entry, a future agent reading the mockup file might conclude *"this is the live target — implement this chrome shape"* and re-introduce the bespoke variant. The architectural difference (universal primitive consuming cells, vs. surface-drafting its own tab bar) doesn't show up in a static mockup; the archive entry is what makes it readable.

Naming matters: *"tab bar"* is exactly the vocabulary v4→v7 retired at the architectural level. The universal bar's cells may resemble tabs visually, but the contract is "1-6 contextual cells consuming the universal primitive," not "tabs choosing among destinations or modes." A surface that draws its own tab bar — even cosmetically identical to the universal-bar output — violates the contract.

## When

Drafted 2026-05-12 in Step 2.2.2 of `studio-mobile-first`; superseded the same week by the v1→v7 cross-bar arc settling on a universal bar contract; explicitly archived 2026-05-13 alongside the `§ Universal bar contract` section in `DESIGN-STANDARDS.md` after the workplan's stale "Pick Shortform-1/2/3 idiom" sub-step relitigated the decision during a `/dw-lifecycle:implement` invocation.

## Feature reference

`docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/` — Phase 2 Task 2.2; the v7 ACCEPTED entry that superseded this proposal is `docs/studio-design/ACCEPTED/2026-05-12-cross-bar-2-star-nav-desk-as-hub/`. The mockup's TOC / Actions / Versions cell composition survives forward as the cells the surface passes to the universal `renderMobileBar`.
