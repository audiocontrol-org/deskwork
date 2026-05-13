---
proposal: Shortform 2 — Floating action sheet (surface-bespoke FAB trigger)
status: REJECTED
date: 2026-05-12
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ./mockup.html
---

# Shortform 2 — Floating action sheet (surface-bespoke FAB trigger)

## What

At rest, only a small *"Actions →"* pill at bottom-right of the shortform review surface — a FAB-style trigger. Tap → slide-up sheet covering ~45% of the screen, with platform/channel confirmed in the sheet header and Iterate / Approve / Cancel buttons stacked large. Sheet dismisses via scrim, drag-down (80px threshold), Escape, or close button. The pill is bespoke shortform chrome (a second FAB alongside the Desk's Compose chip).

## Why rejected

Superseded by the v7 settlement that the contextual bar is **universal** — every non-Desk mobile surface consumes `renderMobileBar` with a 1–6 cell `Cell[]`. The proposal's *"only a FAB at rest"* shape is a bespoke per-surface chrome variant that v7 retired.

The proposal's strengths (maximum article real estate at rest; clean reuse of Phase 2.1 `sheet-controller`) translate forward differently than they did in the original proposal: the universal bar's `{kind:'sheet'}` cell already consumes `sheet-controller`; no FAB trigger is needed because the bar IS the trigger. *"Article real estate at rest"* is preserved at a smaller scale (the universal bar is thinner than a 52px sticky bar would be) without introducing a bespoke FAB.

The proposal's weakness (extra tap: FAB → action) compounds in the universal-bar context: where the universal bar already requires one tap to open a sheet, adding a FAB layer above it adds another. The universal bar is already the architecturally cleanest reuse of Phase 2.1.

The Desk's Compose chip is a documented exception that earns its FAB shape (it's bottom-anchored on the hub surface where the bar isn't present); new surface-bespoke FABs don't get that exception.

## When

Drafted 2026-05-12 in Step 2.2.2 of `studio-mobile-first`; superseded the same week by the v1→v7 cross-bar arc settling on a universal bar contract; explicitly archived 2026-05-13 alongside the `§ Universal bar contract` section in `DESIGN-STANDARDS.md` after the workplan's stale "Pick Shortform-1/2/3 idiom" sub-step relitigated the decision during a `/dw-lifecycle:implement` invocation.

## Feature reference

`docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/` — Phase 2 Task 2.2; the v7 ACCEPTED entry that superseded this proposal is `docs/studio-design/ACCEPTED/2026-05-12-cross-bar-2-star-nav-desk-as-hub/`.
