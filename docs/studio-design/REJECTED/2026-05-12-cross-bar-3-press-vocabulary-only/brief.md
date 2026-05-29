---
proposal: Cross-bar 3 — No cross-cutting bar; press-check vocabulary is the consistency
status: REJECTED
date: 2026-05-12
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ../../../../plugins/deskwork-studio/public/mockups/cross-bar-3-press-vocabulary-only.html
---

# Cross-bar 3 — No cross-cutting bar; press-check vocabulary is the consistency

## What

The null hypothesis. Each studio surface keeps the affordance idiom shaped to its job — dashboard ships v0.19's floating Compose chip + collapsible stage tiles; entry-review longform ships v0.18's 4-tab mobile-bar; shortform picks one of the three Shortform mockup idioms; scrapbook viewer and manual design when their phases land. The cross-cutting consistency lives in the press-check vocabulary (paper colors, paper-noise, Newsreader italic + JetBrains Mono kickers, kraft/blue/red/green accent map, folio masthead pattern) — NOT in any chrome shape.

## Why rejected

The proposal's argument was reasonable: *"a uniform bar is a category error; surfaces have genuinely different needs and forcing them into one shape compromises every one."* But the operator's framing surfaced the failure mode this direction tolerated: navigation across surfaces. Without a permanent global affordance, operators travel via the folio masthead's back-link only — one extra tap per surface switch, and no signal of WHICH surfaces are available. For a small set of surfaces (today's 7) this is tolerable; the architecture has no graceful answer for the growing set.

The v4 star-nav model gives the same "press-check vocabulary IS the consistency" benefit (the press-check tokens still carry the cross-surface unity) *plus* adds a universal back affordance that scales as destinations are added. Cross-bar 3's null hypothesis didn't survive the v4 reframing.

## When

Documented 2026-05-12 alongside the v7 ACCEPTED entry; superseded by the v4 Desk-as-hub direction.

## Feature reference

`docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/`
