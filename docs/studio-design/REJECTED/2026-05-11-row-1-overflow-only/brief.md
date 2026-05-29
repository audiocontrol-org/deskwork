---
proposal: Per-row affordance — overflow menu only (Direction 1)
status: REJECTED
date: 2026-05-11
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ./mockup.html
---

# Row affordance — overflow only

## What

Direction 1 of the per-row affordance design pass. Each row's at-rest composition is clean — the row body shows slug + title + date with a single small `⋮` button at the trailing edge. All secondary verbs (open, approve, cancel, scrapbook) live in a contextual menu the operator surfaces by tapping the `⋮`.

The pitch: every action is exactly two taps (open menu → pick verb), and the at-rest row carries zero verb-specific chrome. Maximally discoverable — no hidden gestures.

## Why rejected

Superseded by the Row 4 hybrid (`ACCEPTED/2026-05-11-row-affordance-overflow-plus-swipe/`), which keeps the same clean at-rest composition AND the same discoverable `⋮` menu, but adds a swipe-left gesture for power users who want one-tap access to the most-frequent verbs.

The pure-overflow direction's main tradeoff was speed: every secondary action requires two taps regardless of frequency. For verbs the operator runs many times per day (iterate, approve), that adds up. The hybrid resolves the tradeoff without losing the discoverability — discoverers find the `⋮`, power users learn the swipe.

Also: this mockup pre-dated the operator's call-out that the existing three direction mockups (1 / 2 / 3) were missing the `iterate` verb from their action sets. Row 4 fixed that gap as part of the hybrid redesign.

## When

Originally drafted as part of Task 1.1.3's design pass (early 2026-05). Retired 2026-05-11 when Row 4 was approved. The mockup file itself moves into this archive entry under the same name (`mockup.html`); the ACCEPTED Row 4 entry references its own mockup at `plugins/deskwork-studio/public/mockups/dashboard-row-4-overflow-plus-swipe.html`.

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/) — Task 1.1.6 (operator-pick gate, originally skipped; revisited in 2026-05-11 row-affordance pass leading to Row 4 approval).
