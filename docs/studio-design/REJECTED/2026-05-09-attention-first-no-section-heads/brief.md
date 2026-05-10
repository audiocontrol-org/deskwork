---
proposal: Attention-first dashboard with no per-stage section heads
status: REJECTED
date: 2026-05-09
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ./mockup.html
---

# Attention-first (no section heads)

## What

A compactness variant that dropped the per-stage section heads entirely on the mobile dashboard. Entries from all stages mixed into a single list, ordered by an "attention score" (combining recency + state-machine-priority + outstanding-marginalia signals). The intent was to surface the entries the operator was most likely to want to act on next, regardless of stage.

## Why rejected

Same root cause as [the card-stream direction](../2026-05-09-card-stream-no-tabs/): demoting stage from primary to inferred-from-priority erases the dashboard's pipeline-shape view. The operator's mobile-dashboard task isn't "what should I work on next" (that's a different surface — the entry-review hero strip); it's "what shape is the press in." The attention-first ordering optimized for the wrong question.

Additionally, "attention score" was not a defined concept in the project's data model — it would have required adding a new derived field with its own definition + tests, all to address a question the dashboard wasn't actually being asked.

## When

Rejected 2026-05-09 during the compactness-exploration design pass. Mockup was originally drafted as `dashboard-compact-3-attention-first.html`; moved into this archive entry as the canonical visual.

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/)
