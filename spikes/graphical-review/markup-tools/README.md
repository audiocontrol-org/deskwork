# Markup-tools spike (Excalidraw)

Phase 1 Task 1.4.3 (workplan: `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md`).
Mounts Excalidraw via React onto a fixture editorial dashboard SVG image,
exposes arrow / box / freehand / text / image / eraser tools through
Excalidraw's native palette, exports the composed scene (fixture + markup)
as a PNG. Research-only — not part of any workspace, not shipped to
adopters.

## How to run

```
npm install
npm run dev
```

Vite prints a local URL (default `http://localhost:5173`). Open it in a
browser. Excalidraw mounts; click **Add fixture image** to load the
fixture SVG into the scene. Then draw on top of it using Excalidraw's
native toolbar (arrow / rectangle / freehand / text / image / eraser).

Click **Save markup (PNG)** to export the composed scene (fixture +
markup) as a PNG; the preview pane below shows the result. Click
**Reset scene** to clear everything and start over.

## How to verify

The spike ships one Playwright probe at `scripts/verify.mjs`. First-time
setup: `npx playwright install chromium` downloads the headless-shell
binary the probe drives.

Start the dev server in one terminal (`npm run dev`); from another
terminal in this directory:

```
npm run verify
```

The probe asserts:

- Excalidraw mounts inside `#markup-mount` and renders at least one
  `<canvas>` element;
- the tool palette (queried via `data-testid="toolbar-*"`) exposes the
  documented primitives — rectangle, arrow, line, freedraw, text,
  image, eraser, selection;
- a programmatic fixture-image add via the spike's `__spike.addFixtureImage()`
  helper produces an `image`-type element on the scene;
- a programmatic box annotation via `__spike.addBoxAnnotation()`
  produces a `rectangle`-type element with the documented stroke color
  (`#e03131`) at the documented dimensions;
- exporting the scene via `__spike.exportScene()` produces a PNG-shaped
  data URL with non-zero dimensions and byte length;
- the exported PNG contains the box-stroke color at >20 sampled pixel
  positions (proves the markup layer composes into the export);
- the reset lifecycle returns the spike state to `mounted` with zero
  scene elements.

## Build-vs-adopt — decision

**Adopt Excalidraw.** Per the candidates matrix (`docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/candidates.md`),
Excalidraw is MIT-licensed, actively maintained, ships PNG/SVG export,
supports touch and mobile, has 124k+ GitHub stars. It is the primary
candidate; tldraw is disqualified (source-available, requires either
a paid commercial licence or a "made with tldraw" watermark — both
incompatible with deskwork's OSS-dependency stance).

**Konva.js** is the credible alternative for a hand-rolled markup
editor (`~55 KB gzipped`, MIT, primitive-only — would require ~1,000-
1,200 LOC of glue for arrow/box/freehand/text/blur tooling per the
Task 1.2 broader survey). NOT spiked in this task — see the findings
doc's "considered but not spiked" section for the rationale. Konva is
the v2 escape hatch if Excalidraw's stylistic fit or React dependency
proves wrong for deskwork's industrial aesthetic.

The cost of adopting Excalidraw is the React dependency. React is not
currently in `packages/studio/` (which uses Hono + an esbuild client
pass). Phase 12 (screenshot markup) will need to scope the React
introduction — likely as a self-contained sub-bundle Excalidraw mounts
into via createRoot, isolated from the rest of the studio surface.
Estimate: the React + react-dom + @excalidraw/excalidraw transitive
weight on this spike is ~360 packages and ~95 MB unpacked in
`node_modules/`. The shipped bundle weight is much smaller (Excalidraw's
dist is heavy but tree-shakeable for the few APIs used: `Excalidraw`,
`exportToBlob`).

## Blur tool — limitation noted

Excalidraw does NOT ship a built-in "blur" effect for markup. The spec
in `.claude/rules/agent-discipline.md` calls for arrow / box / freehand /
text-label / **blur**. Excalidraw's `image` element can be used as a
backing layer for an externally-blurred region (the operator captures a
sub-region, blurs it via a separate pipeline, then re-inserts as an
image element), but that's a workflow not a primitive. If first-class
"redact this region" is load-bearing for v1, Phase 12 will need to
either (a) extend Excalidraw with a custom element type (the library
supports custom elements via its plugin API), (b) compose Excalidraw
with a separate blur-overlay layer, or (c) reconsider Konva (where the
blur primitive is a one-line `Konva.Filters.Blur` filter on a shape).

This limitation is documented in the findings doc; it does not change
the v1 recommendation (Excalidraw is still the right adopt — the blur
primitive is a focused workflow that can land as a v1.x extension).

## Why React-based vs. plain DOM

Excalidraw is published as a React component; the package's `exports`
manifest gates against `react` as a peer dep. There is no documented
plain-DOM mount path. Bringing in React for this single component is
the cost of adoption.

## Implementation choice — vanilla JSX, no TypeScript

The spike uses JSX without TypeScript to keep the surface narrow. The
production integration in `packages/studio/` will be TS when Phase 12
lands.

## Findings doc

The integration-cost numbers, tool palette table, blur-limitation
narrative, and v1 scope recommendation live in:
`docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md`
(section: **Screenshot capture + markup spike — Sub-spike 3**).
