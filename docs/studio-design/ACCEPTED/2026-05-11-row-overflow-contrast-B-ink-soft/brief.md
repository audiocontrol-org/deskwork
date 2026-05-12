---
proposal: Row ⋮ overflow button — Direction B (ink-soft glyph, 11.06:1)
status: ACCEPTED
date: 2026-05-11
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ../../../../plugins/deskwork-studio/public/mockups/row-overflow-contrast.html
---

# Row ⋮ overflow contrast — Direction B (ink-soft glyph)

## What

The dashboard row's ⋮ overflow trigger ships at `color: var(--er-ink-soft)` (#3A332E) against `var(--er-paper)` (#F5F1E8) — a **contrast ratio of 11.06:1**, comfortably above WCAG 2.1 AAA for every text and non-text criterion.

This supersedes the shipped v0.20.0 value of `color: var(--er-paper-3)` (#DFD7BF), which was 1.21:1 — failing every WCAG criterion and operator-confirmed unusable on phone.

Direction B is applied on **both mobile and desktop** for consistent affordance treatment. The desktop variant previously sat at `var(--er-faded)` (3.53:1, bare 1.4.11 floor); ink-soft brings desktop up to the same AAA level with headroom.

## Why accepted

1. **Operator picked B explicitly** after reviewing three directions in the `row-overflow-contrast.html` mockup. Trade-off acknowledged: B makes the ⋮ a visually present control rather than ornamental chrome. That trade-off is the right one for an affordance the operator literally couldn't see.

2. **Comfortable headroom.** Direction A (faded glyph, 3.53:1) met the bare WCAG 2.1 SC 1.4.11 floor but had no margin — any future palette tweak to `--er-paper` or `--er-faded` could drop below the threshold. Ink-soft at 11.06:1 absorbs palette drift without re-litigating contrast.

3. **Visual consistency with section heads and dashboard kickers** — those already use ink-soft as their text color. The ⋮ now reads as part of the same chrome system rather than a separate "subdued" treatment.

4. **Direction C (press-mark ring)** added a clear button boundary via a 1px faded ring, which would have reinforced the press-check vocabulary. The operator picked B over C because the simpler treatment is closer to the row chrome's existing minimalism — no extra geometric primitive needed when a single color change solves the contrast.

5. **Companion standard:** the pick was paired with adding an Accessibility / Contrast section to `DESIGN-STANDARDS.md` codifying WCAG 2.1 AA as the floor (4.5:1 body, 3:1 large, 3:1 non-text UI, 3:1 ornamental chrome). The standard is what makes future regressions catchable; this pick is the application of it.

## When

Approved 2026-05-11 by the operator after walking the v0.20.0 dashboard on phone surfaced the unreadable ⋮ and asking: *"Don't we have accessibility standards in the design standards?"* — which prompted both the standards proposal and the directional pick.

Implementation landed in the same session: CSS change to `dashboard-row-affordances.css` (mobile) + `editorial-studio.css` (desktop); empty-stage-tile chevron fixed at the same time (was using the same broken `--er-paper-3` foreground pattern). Spec-compliance probe extended with WCAG contrast assertions per affordance — passing 139/139 across the four stages we have data for.

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/) — Task 1.8 (the v0.20 row-affordance redesign that surfaced this gap).
