---
id: TASK-56
title: >-
  BUG: review surface horizontally scrolls on phone — wide markdown tables +
  fenced code blocks overflow viewport
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-240
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

On phone (390×844) the entry-review surface scrolls horizontally — `documentElement.scrollWidth` is 520px when the viewport is 390px. The operator hits a viewport-wide horizontal scroll on every entry that contains a markdown table or a fenced code block, which makes the surface very hard to read because two-axis scrolling fights one-finger thumb scrolling.

## Reproduction

1. Open `/dev/editorial-review/entry/<uuid>` on phone (390×844). Use any entry whose body contains a fenced code block (most PRDs in this repo qualify).
2. Observed: page scrolls horizontally. Pinch-zoom looks correct, but try to read by scrolling vertically — the page drifts sideways.
3. Expected: content fills the viewport, no horizontal page scroll. Wide tables / code blocks scroll INSIDE their own block container, not the whole page.

Playwright measurement (read mode, 390 viewport):
- `documentElement.scrollWidth = 520`
- Offenders found by walking every `<*>` and reporting children wider than viewport:
  - `<table>` content at 493px (markdown table)
  - `<code class="language-markdown">` at 1351px and 2184px (fenced code blocks with long lines)
  - inline `<code>` at 438px / 482px (long URLs / file paths)

## Root cause

- Fenced code blocks (`<pre><code>`) default to `white-space: pre`, which preserves long lines verbatim and lets them overflow horizontally.
- Markdown tables render as raw `<table>`, which sizes to its widest content. With more columns than fit, the table extends past the viewport and so does the page.
- Inline `<code>` and long URLs break at no character, so a long unbreakable token pushes the line wider than the viewport.

The CSS layer has historical scroll-shadow code that was removed for tables (per a comment in editorial-review.css) without replacing it with a real overflow-containment strategy. Code blocks were never constrained for mobile.

## Proposed fix

`@media (max-width: 600px)` block in editorial-review.css scoping to the article body and edit preview:

- `pre, pre code`: `white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere` — long lines wrap. Reader-friendly, no per-block horizontal scroll.
- `table`: `display: block; max-width: 100%; overflow-x: auto` — wide tables scroll horizontally within their own container, page does not.
- `p, li, code` (inline): `overflow-wrap: anywhere` — long URLs / paths break at any character.
- `.er-page`, `.er-edit-preview`: `min-width: 0` so flex/grid children don't claim intrinsic content width.
- `body`: `overflow-x: hidden` (defense in depth) — containment of last resort if any new offender slips in.

Desktop layout untouched — every change is gated behind the media query.

## Verification

- Playwright at 390×844 in read mode on this same entry: assert `documentElement.scrollWidth <= viewport.width + 1`.
- Playwright at 1280×900: assert tables and pre blocks render unchanged from current behavior (display: table, white-space: pre).

## Out of scope

- Native mobile-friendly table component (column hiding / pinning). The `display: block; overflow-x: auto` shape is the standard mobile fallback; nicer mobile-table UX is a separate larger feature.
- CodeMirror-internal scroll behavior in edit mode (CodeMirror handles its own viewport).
<!-- SECTION:DESCRIPTION:END -->
