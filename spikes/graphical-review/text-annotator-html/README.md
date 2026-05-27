# @recogito/text-annotator HTML-annotation spike

Phase 1 Task 1.3 (workplan: `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md`).
Wires `@recogito/text-annotator` v4 inside an iframe-loaded HTML mockup and
emits W3C Web Annotation Data Model JSON-LD via the bundled `W3CTextFormat`
adapter for text-range pins. For non-text DOM regions (icon buttons,
`<img>`, decorative `<div>`s), the spike layers a thin hand-rolled
DOM-selector resolver on top because the library is text-range-only and
cannot natively pin to a non-text element. Research-only — not part of any
workspace, not shipped to adopters.

## How to run

```
npm install
npm run dev
```

Vite prints a local URL (default `http://localhost:5173`). Open it in a
browser. Vite is in use because `@recogito/text-annotator` ships as ESM with
bare-specifier imports (`@recogito/text-annotator`); Vite resolves them
for the dev server without a separate build step.

To pin a text range: drag-select text inside the iframe. To pin a DOM
region: click the **DOM region** toolbar button, then click any element
inside the iframe (text-heavy paragraph, icon button, image, decorative
div). The right-hand pane mirrors the current set of annotations as
W3C-shaped JSON-LD; the **Download annotations.json** button persists
the payload to disk.

## How to verify

The spike ships three Playwright probes that produce the evidence cited
in the findings doc. First-time setup: `npx playwright install chromium`
downloads the headless-shell binary the probes drive (skipped if a
matching binary is already cached under `~/Library/Caches/ms-playwright/`).
Start the dev server in one terminal (`npm run dev`); from another
terminal in this directory:

```
npm run verify             # drives the spike at desktop (1280x800) and
                           # iPhone 13 viewports; asserts every clause
                           # of the findings doc's § "W3C alignment" +
                           # "Anchor model — measured" for text-range
                           # and DOM-region pins.
npm run a11y               # asserts the gaps documented in
                           # § "Accessibility — keyboard" (text-annotator
                           # highlight spans have no tabindex / role /
                           # aria-label; container body carries the
                           # tabindex="-1" mark for keyboard-event capture
                           # only, not per-annotation tab navigation).
npm run anchor-resilience  # exercises Step 1.3.3 — pins three regions,
                           # hand-edits the iframe DOM (id rename, sibling
                           # insertion, class rename, total teardown);
                           # asserts the resolver chain (CSS → TextQuote
                           # → FragmentSelector pixel-offset).
```

All three probes exit non-zero on assertion failure. They log payload +
DOM snapshots before each assertion section so a failure is diagnosable
without re-running.

If `@recogito/text-annotator` upgrades and the findings doc's claims no
longer hold (e.g. they add `aria-label` to `.r6o-annotation` spans), the
relevant probe will fail — re-verify the findings against the new
version before relaxing the assertion.

## What to look at to verify the W3C payload

Each annotation should carry:

- `"@context": "http://www.w3.org/ns/anno.jsonld"`
- `"type": "Annotation"`
- A `target` object with `source` pointing at the fixture's URI
  (`urn:deskwork-spike:fixture-html-mockup`) and a `selector` shaped by
  pin kind:
  - **Text-range pin**: `TextQuoteSelector` (exact / prefix / suffix) +
    `TextPositionSelector` (start / end).
  - **DOM-region pin**: `CssSelector` (primary anchor) + optional
    `TextQuoteSelector` (when the element has text content) +
    `FragmentSelector` with `xywh=pixel:x,y,w,h` (pixel-offset fallback).

The actual emitted payload + integration-cost numbers + anchor-resilience
results are captured in the spike findings under
`docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md`.

## Implementation choices

### Vanilla JS, no TypeScript

Pure JS keeps the spike's surface narrow: one HTML host, one CSS host,
two JS modules (spike + dom-anchor), one iframe-side annotator module,
one fixture HTML + CSS. Adding TS would mean tsconfig + tsc + types
plumbing that has zero bearing on the integration-cost question Task 1.3
is here to answer. The production integration will be TS when it lands
in `packages/studio/`.

### Iframe-side annotator (cross-context library gotcha)

`@recogito/text-annotator` attaches its selection listeners to the JS
realm's `document` (not the container's `ownerDocument`). Running the
library in the HOST page against an iframe's body therefore does NOT
capture selections inside the iframe — selection events fire on the
iframe document, but the library listens on the host document. This
gotcha is load-bearing for v1 architecture because deskwork's HTML
review surface intends to sandbox the mockup in an iframe.

The spike works around this by loading `src/iframe-annotator.js` as a
module inside the iframe document. That script creates a second
`createTextAnnotator(iframeDoc.body)` instance inside the iframe's own
JS realm so the library's `document` reference matches the selection
events. Annotations from the iframe are exposed to the host page via
`window.parent.__spike.onIframeTextAnnotationsChanged(...)`.

Same-origin (Vite serves both host + fixture) so cross-frame access is
allowed; postMessage is unnecessary.

**Spike-specific injection mechanism — Vite-coupled.** The fixture's
`<script type="module" src="/src/iframe-annotator.js">` is an absolute
path that only resolves because Vite serves the project root. Phase 10
will need a different injection mechanism — build-time inline of the
iframe annotator into the iframe HTML, a stable studio-served URL, a
blob URL injected by the host, or postMessage with a host-side
fallback. The spike does NOT solve this; it surfaces the constraint so
the Phase 10 PRD can spec the production-grade injection path.

### Hand-rolled DOM-selector layer for non-text regions

`@recogito/text-annotator` is a text-range annotator. It has no concept
of pinning to a non-text DOM element (icon `<button>`, `<img>`, empty
decorative `<div>`). For those regions, the spike's
`src/dom-anchor.js` emits a W3C-compatible target with three selectors:

1. `CssSelector` — primary anchor. Prefers id; falls back to a path of
   `tagName + nth-of-type` to the document body.
2. `TextQuoteSelector` — fallback. Skipped when the element has no text
   content (e.g. decorative empty `<div>`).
3. `FragmentSelector` with `xywh=pixel:...` — last-resort spatial
   fallback.

The resolver applies the same precedence on read. Each fallback that
fires is reported via `resolveDomAnnotation(doc, ann).resolvedVia`.

The anchor-resilience probe (`scripts/anchor-resilience.mjs`) tests
each fallback path independently by programmatically mutating the
iframe DOM after annotations are placed.

The findings doc names the v1 scope question this surfaces: do we
adopt `@recogito/text-annotator` for text-only pins and ship a thin
DOM-selector layer for non-text pins (the spike's pattern), or do we
build everything bespoke?

## Fixture

`fixture/index.html` is a hand-authored HTML mockup mimicking a
deskwork editorial dashboard. It deliberately mixes:

- text-heavy regions (headings, paragraphs, list items) — for
  `@recogito/text-annotator` to operate on
- a text-light interactive region (`#action-help` is a `<button>`
  whose only inner text is the SVG `<text>` glyph "?")
- an image (`#thumb-hero` is an inline-SVG-as-data-url `<img>`)
- an empty decorative `<div>` (`#decorative-rule` has `aria-hidden=true`
  and no children) — the cleanest case where text-annotator cannot
  reach but a DOM-selector layer can.

Bundled with the spike so the demo is offline-self-contained. If
`fixture/index.html` fails to load, the spike throws a visible error —
there is no silent fallback, per the project's no-fallback rule.

## Findings doc

The integration-cost numbers, anchor-model finding, and v1 scope
recommendation live in:
`docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md`
(section: **HTML annotation spike (Task 1.3)**).
