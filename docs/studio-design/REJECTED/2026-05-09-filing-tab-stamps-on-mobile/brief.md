---
proposal: Filing-tab state chrome on mobile dashboard rows
status: REJECTED
date: 2026-05-09
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ./mockup.html
---

# Filing-tab state stamps

## What

The rubber-stamp state chrome from the rotated-stamps direction was reframed as a filing-tab variant: a small horizontal tab anchored to the row's leading edge, rendered as a press-check filing-tab graphic (paper-cut shape, kraft tone). Same labels (IN REVIEW / ITERATING / APPROVED) — but flat, un-rotated, presented as a filing-cabinet metaphor rather than a press-room metaphor.

## Why rejected

Same root cause as [the rotated rubber-stamps](../2026-05-09-rotated-rubber-stamps-on-mobile/): the labels surfaced review state, which is RETIRED per `DESKWORK-STATE-MACHINE.md`. Visually flatter than the rotated stamps, but the filing-tab graphic was still the row's visual primary, and it carried the same retired data.

The operator's framing was direct: *"The filing tabs are good — that's what we decided to use as a replacement for the inkstamp conceit. The problem is that you resurrected the inkstamp conceit, even after we had retired it for mobile. If we have to relitigate basic design decisions, we'll NEVER make any headway."* The retirement was about the *conceit* (state-on-a-rectangle as the row's visual primary), not the *graphic style*. Filing-tabs failed the same test for the same reason.

The rejection of the filing-tab stamps motivated the creation of `DESIGN-STANDARDS.md` (top-level) — to make the retirement of the rubber-stamp conceit on mobile durable instead of relitigated each session.

## Note on the mockup file

This mockup file (`mockup.html`, originally `dashboard-1c-filing-tab-fab.html`) also includes the floating compose-chip FAB, which WAS accepted as a separate decision. See [ACCEPTED/2026-05-09-floating-compose-chip-fab/](../../ACCEPTED/2026-05-09-floating-compose-chip-fab/). One mockup, two decisions: the FAB landed; the filing-tab stamps did not.

## When

Rejected 2026-05-09. Mockup was originally drafted as `dashboard-1c-filing-tab-fab.html`; moved into this archive entry as the canonical visual (and referenced by the ACCEPTED FAB entry by relative path).

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/)
