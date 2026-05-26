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
browser.

To pin a region: click-and-drag on the fixture. To draw a polygon:
click the **Polygon** toolbar button, then click vertices and press
Enter to close. Press **Escape** to abort a draw in progress. The
right-hand pane mirrors the current set of annotations as W3C-shaped
JSON-LD; the **Download annotations.json** button persists it to disk.

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
