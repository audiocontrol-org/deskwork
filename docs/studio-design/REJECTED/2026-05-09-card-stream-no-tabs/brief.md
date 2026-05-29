---
proposal: Card-stream dashboard with no stage tabs
status: REJECTED
date: 2026-05-09
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ./mockup.html
---

# Card-stream (no tabs) dashboard

## What

A flat vertical stream of entry cards on the mobile dashboard, with no per-stage tabs or grouping. Entries would be ordered by recency (most-recently-updated first) regardless of stage; stage was demoted to a small chip on each card.

## Why rejected

The card-stream pattern made the *entry* the primary unit and the *stage* a secondary attribute. That inverts what the dashboard is for: the dashboard's primary job is to show *what's on the press* — the pipeline shape, the distribution of entries across stages. A flat recency-sorted stream loses pipeline shape entirely; the operator can't see at a glance how many entries are in Drafting vs Final vs Outlining without scrolling and counting.

The collapsible-stage-tiles pattern (which won) preserves pipeline shape as the primary surface while still letting the operator drill into a specific stage. The card-stream optimized for "find the most recent entry quickly," but the operator's actual mobile-dashboard task is "see what shape the press is in" — a different task with a different surface.

## When

Rejected 2026-05-09. Mockup was originally drafted as `dashboard-2-card-stream.html`; moved into this archive entry as the canonical visual.

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/)
