---
id: TASK-55
title: >-
  BUG: mobile scrapbook sheet — cloned items have inert event handlers (lightbox
  + future actions)
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-245
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Symptom

When the operator opens the mobile Scrapbook sheet (review surface, phone widths) and taps a scrapbook item, the rich interactions wired on desktop don't fire:

- Tapping an image: opens the raw file in a new tab (browser default `<a href>` behavior) instead of the lightbox.
- Any future per-item affordances bound at boot (`data-action` buttons, expand-inline-text, etc.) are inert on the cloned items.

## Root cause

`mobile-sheet-bar.ts:refreshScrapbookSlot` clones content from the desktop `.er-scrapbook-drawer-body` via `child.cloneNode(true)`. Per spec, `cloneNode` does **not** copy `addEventListener`-bound handlers. The lightbox controller (`initScrapbookLightbox(document)`, called once at boot in `entry-review-client.ts:252`) walks the original DOM and binds click handlers on the *original* `<a class="scrap__thumb-link">` elements. The clones in the mobile sheet share the markup but not the listeners.

## Why we landed on clone

The Notes slot solves this by *moving* the actual `[data-sidebar-list]` element into the slot at boot — single source of truth, listeners stay attached. We deferred the same approach for scrapbook because:

- The desktop scrapbook drawer is `position: fixed bottom: 0`; its CSS lays out the items in-place inside the drawer chrome.
- Moving the `.er-scrapbook-drawer-body` into a sheet slot would require the desktop drawer to render an empty container at phone widths and re-route the items to the sheet — non-trivial CSS surgery.
- For an MVP that gets the affordance + sheet behavior in front of the operator, clone-and-accept-default-link-behavior was acceptable.

## Options for fixing

1. **Move-not-clone** (matches Notes pattern). Move `.er-scrapbook-drawer-body` into the mobile sheet slot at boot when on phone widths. Desktop drawer becomes the dropzone shell only; items live in whichever container is currently visible. Most consistent with existing patterns; biggest CSS-side reshape.

2. **Rebind handlers post-clone**. After `refreshScrapbookSlot()` runs, re-call `initScrapbookLightbox(slots.scrapbook)` to bind handlers on the cloned items. Smallest change. Lightbox handlers re-bind cleanly. Doesn't cover handlers wired by other modules unless they also accept a root parameter.

3. **Accept native link behavior**. The scrapbook items use `<a href>` for the underlying file; tapping opens the file in a new tab. That's actually a reasonable mobile UX — the lightbox isn't load-bearing on phone where viewport is small anyway. Remove the gap by deciding the mobile sheet should NOT lightbox.

## Recommendation

Option 2 (rebind via `initScrapbookLightbox(slot)`) is the minimum viable fix; it uses the lightbox controller's existing `root` parameter (already exposes a `ParentNode` arg). Estimate: ~3 lines in `refreshScrapbookSlot`. Verify with a targeted assertion in `scripts/probe-mobile-scrapbook.mjs` that tapping a `.scrap__thumb-link` opens the lightbox dialog (or whatever the lightbox renders).

If we later add per-item action buttons (edit metadata, delete, etc.) those handlers would need their own re-binding hooks; at that point Option 1 (move-not-clone) becomes the more durable shape.

## Discovered

Reviewer A finding #4, code review session of `23cb111` (mobile editor + scrapbook implementation), 2026-05-09. Surfaced via in-tree `/dw-lifecycle:review` on commit `74e42eb..23cb111` range. Deferred from that fix-up commit per the agent-discipline scope rule (operator decision needed on the move-vs-clone vs. native-link choice).

## Acceptance

- Tapping a scrapbook image in the mobile sheet behaves consistently with desktop (lightbox, OR documented native-link decision).
- Future per-item affordances bound after the rebuild work on cloned items.
- Probe coverage in `scripts/probe-mobile-scrapbook.mjs` pins the chosen behavior.
<!-- SECTION:DESCRIPTION:END -->
