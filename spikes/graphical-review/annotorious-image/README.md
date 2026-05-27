# Annotorious image-annotation spike

Phase 1 Task 1.2 (workplan: `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md`).
Wires Annotorious v3 against a self-contained SVG fixture and emits W3C
Web Annotation Data Model JSON-LD via the bundled `W3CImageFormat`
adapter. Research-only — not part of any workspace, not shipped to
adopters.

## How to run

```
npm install
npm run dev
```

Vite prints a local URL (default `http://localhost:5173`). Open it in a
browser. Vite is in use because Annotorious ships as ESM with
bare-specifier imports (`@annotorious/annotorious`); Vite resolves the
imports for the dev server without a separate build step.

To pin a region: click-and-drag on the fixture. To draw a polygon:
click the **Polygon** toolbar button, then click vertices and press
Enter (handled natively by Annotorious) to close. Press **Escape** to
abort a draw in progress. The right-hand pane mirrors the current set
of annotations as W3C-shaped JSON-LD; the **Download annotations.json**
button persists it to disk.

## How to verify

The spike ships two Playwright probes that produce the evidence cited
in the findings doc. First-time setup: `npx playwright install chromium`
downloads the headless-shell binary the probes drive (skipped if a
matching binary is already cached under `~/Library/Caches/ms-playwright/`).
Start the dev server in one terminal (`npm run dev`); from another
terminal in this directory:

```
npm run verify   # drives the spike at desktop (1280x800) and iPhone 13
                 # viewports; asserts every clause of the findings doc's
                 # § "W3C alignment — actual emitted payload" + the
                 # mobile touch-handle claim.
npm run a11y     # focuses the SVG overlay; asserts the gaps documented
                 # in § "Accessibility — keyboard" (annotation <g>
                 # elements have no tabindex / role / aria-label).
```

Both probes exit non-zero on assertion failure. They log payload +
DOM snapshots before each assertion section so a failure is
diagnosable without re-running.

If Annotorious upgrades and the findings doc's claims no longer hold
(e.g. they add `aria-label` to annotation `<g>` elements), the relevant
probe will fail — re-verify the findings against the new version
before relaxing the assertion.

## What to look at to verify the W3C payload

Each annotation should carry:

- `"@context": "http://www.w3.org/ns/anno.jsonld"`
- `"type": "Annotation"`
- A `target` object with `source` pointing at the fixture's URI
  (`urn:deskwork-spike:fixture.svg`) and a `selector` of type
  `FragmentSelector` (rectangle, via `xywh=pixel:x,y,w,h`) or
  `SvgSelector` (polygon).

The actual emitted payload is captured in the spike findings under
`docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md`.

## Implementation choice — vanilla JS, no TypeScript

Pure JS keeps the spike's surface narrow: one HTML, one CSS, one JS
module, one SVG. Adding TS would mean tsconfig + tsc + types
plumbing that has zero bearing on the integration-cost question
Task 1.2 is here to answer. The production integration will be TS
when it lands in `packages/studio/`.

## Fixture

`fixture.svg` is a hand-authored SVG mimicking a deskwork dashboard
mockup. Bundled with the spike so the demo is offline-self-contained
(no network fetch at runtime). If `fixture.svg` is missing or fails to
load, the spike throws a visible error — there is no silent fallback,
per the project's no-fallback rule.

## Findings doc

The integration-cost numbers and v1 scope recommendation live in:
`docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md`
(section: **Image annotation spike (Task 1.2)**).
