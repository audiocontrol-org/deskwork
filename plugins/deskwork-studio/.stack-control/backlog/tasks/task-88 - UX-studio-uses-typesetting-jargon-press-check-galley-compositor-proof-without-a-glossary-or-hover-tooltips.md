---
id: TASK-88
title: >-
  UX: studio uses typesetting jargon (press-check, galley, compositor, proof)
  without a glossary or hover tooltips
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-114
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Symptom

The studio's surface copy is styled around a 19th-century print magazine: typesetting jargon, page-of-record framing. Examples:

- Dashboard header: `Vol. 01 · № 04 · Press-check`
- Review surface header: `Galley № 1`
- Index page: `Index of the Press` / "Pressed in the deskwork studio."
- Shortform desk title: "The compositor's desk"
- Help page title: "The Compositor's Manual"
- Dashboard section: "Recent proofs"
- Empty-state symbol: `※` (reference mark from typesetting)

This is a deliberate aesthetic and the typography reinforces it well. But terms like *press-check*, *galley*, *compositor*, *proof*, *№* don't carry meaning for adopters who haven't worked in print. They're decoded one of two ways: the operator either accepts they don't understand the chrome and ignores it (loss of voice integrity) or feels the surface is talking down to them (loss of trust).

## Why this matters

The studio asks the operator to use it confidently — clicking destructive buttons (`Approve`, `Iterate`), navigating between surfaces, trusting timestamps. Decorative copy that doesn't tell the operator anything actionable adds cognitive cost without paying it back.

## Suggested fix

Two complementary moves:

1. **Add a glossary** to the Manual: one paragraph mapping each term to its functional meaning. *"Press-check: today's view of the calendar. Galley: a single document under review. Compositor: the operator (you). Proof: a review workflow that has reached a terminal state."* One-time cost, ongoing benefit.

2. **Tooltip-on-hover** for the magazine terms in nav/header chrome. `<span title="Today's calendar view">Press-check</span>`. Two lines of HTML per term.

Neither move replaces the magazine voice; both let it stand without leaving operators to decode it.

## Severity

Low. Aesthetic, deliberate, reasonable people will disagree on whether to dial it back. Filing as a bookmark for the inevitable "what does X mean" question rather than as a bug.
<!-- SECTION:DESCRIPTION:END -->
