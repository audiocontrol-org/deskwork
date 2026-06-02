# DOM-to-canvas capture spike (html-to-image)

Phase 1 Task 1.4.2 (workplan: `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md`).
Wires `html-to-image`'s `toPng()` against a fidelity-stress fixture that
deliberately exercises features known to challenge DOM-to-canvas
rasterizers: web fonts, flex / grid, pseudo-elements (`::before` /
`::after`), box-shadow, border-radius, inline SVG, multi-line text.
Research-only — not part of any workspace, not shipped to adopters.

## How to run

```
npm install
npm run dev
```

Vite prints a local URL (default `http://localhost:5173`). Open it in a
browser. Click **Capture rendered fixture** to render the fixture
section to a PNG via `html-to-image`. The preview pane shows what the
rasterizer produced; the **Download PNG** button saves it to disk.

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

- the UI elements exist in the documented shape;
- a programmatic capture produces a PNG-shaped data URL;
- the PNG's natural dimensions match the live fixture's rendered
  dimensions;
- the per-feature CSS fidelity claims from the findings doc hold
  pixel-by-pixel — the ribbon stripe colors (each card's `::before`
  pseudo-element) sample as the expected accent on the captured PNG;
  the divider's `::after` diamond glyph is rasterized at the center;
  the inline SVG icon's polygon fill is present in the captured PNG;
- the clear lifecycle correctly resets state.

Why pixel sampling: the findings doc claims (a) pseudo-element
backgrounds and content survive the capture, (b) inline SVG rasterizes
correctly. Both claims are operator-perceivable; the probe samples the
PNG at the expected coordinates and asserts the rendered color matches
the CSS-declared color within a tolerance (color distance < 40-50).
Without the pixel test, the assertions would only measure that the
capture didn't throw — which is the "spec compliance via wrong
assertions" failure mode named in `.claude/rules/ui-verification.md`.

## Fixture

`index.html`'s `<section class="fixture-pane">` contains the
fidelity-stress fixture (`#capture-target`). Self-contained CSS in
`src/styles.css` declares each of the tricky features. The fixture is
fixed-width (640px) so probe dimensions are stable across runs.

## Why html-to-image, not html2canvas

Per the candidates matrix (`docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/candidates.md`),
`html2canvas` is effectively unmaintained (last release 2022-01,
975+ open issues, known to misrender modern CSS). `html-to-image`
(v1.11.13, last release 2025-02, 7.1k stars, MIT, zero runtime
dependencies) is the 2025/2026 consensus successor. The matrix
recommendation is "adopt html-to-image"; this spike validates it
empirically.

## Implementation choice — vanilla JS, no TypeScript

Pure JS keeps the spike's surface narrow. The production integration in
`packages/studio/` (Phase 12 — screenshot markup) will be TS.

## Findings doc

The per-feature fidelity results live in:
`docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md`
(section: **Screenshot capture + markup spike — Sub-spike 2**).
