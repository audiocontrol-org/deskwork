# getDisplayMedia screen-capture spike

Phase 1 Task 1.4.1 (workplan: `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md`).
Wires `navigator.mediaDevices.getDisplayMedia({ video: true })` against
a one-shot frame-grab flow: capture one frame, render to preview,
download as PNG. Research-only — not part of any workspace, not
shipped to adopters.

## How to run

```
npm install
npm run dev
```

Vite prints a local URL (default `http://localhost:5173`). Open it in a
desktop browser. Clicking **Capture screen** triggers the OS-level
permission prompt — pick a tab, window, or screen. The browser captures
one frame, freezes the stream, renders it to the preview canvas. Click
**Download PNG** to save the captured frame to disk.

## How to verify

The spike ships one Playwright probe at `scripts/verify.mjs`. First-time
setup: `npx playwright install chromium` downloads the headless-shell
binary the probe drives.

Start the dev server in one terminal (`npm run dev`); from another
terminal in this directory:

```
npm run verify
```

The probe asserts what CAN be verified automatically:

- the UI elements documented in the findings doc exist with the right
  initial state (capture button enabled; download/clear disabled);
- a programmatic click on **Capture screen** in headless Chromium ends
  in the documented failure path (either `lastPath === 'unsupported'`
  because Chromium's default headless build lacks `getDisplayMedia`, or
  `lastPath === 'rejected'` because headless cannot satisfy the
  user-activation precondition);
- the post-capture wiring (download/clear enable, preview canvas
  resizes, meta line reports dimensions) is exercised via a synthetic
  successful-capture path so a regression in the lifecycle wiring fails
  the probe;
- the clear lifecycle correctly resets state.

What CANNOT be tested via Playwright:

- the actual OS-level permission prompt (Playwright cannot click OS
  chrome; even `--use-fake-ui-for-media-stream` does not cover
  `getDisplayMedia` reliably across browser versions);
- the visual fidelity of the captured frame against the original screen
  (no ground-truth to compare against in a headless environment);
- the browser's "is being shared" indicator clearing after `track.stop()`
  (an OS-chrome signal Playwright cannot observe).

Per `.claude/rules/ui-verification.md`, these gaps are documented honestly
rather than papered over.

## Manual testing checklist

Run these by hand against the dev server in a real browser to validate
what the automated probe cannot:

- [ ] **Chromium desktop**: capture a tab, capture a window, capture the
  whole screen. For each, verify the preview renders at the source
  dimensions and the download produces a valid PNG.
- [ ] **Firefox desktop**: same three cases.
- [ ] **Safari desktop**: same three cases (Safari supports
  `getDisplayMedia` since Safari 13).
- [ ] **Permission-prompt UX cost**: confirm that EACH capture surfaces a
  fresh OS-level prompt — there is no "remember this choice for this
  site" affordance. (This is the central UX cost called out in the
  findings doc.)
- [ ] **Cross-browser stop-track behaviour**: after capture, the
  browser's "is being shared" badge clears within a second or two.
- [ ] **Permission denial**: deny the prompt; confirm the spike reports
  `Capture failed: NotAllowedError` in the status line without crashing.
- [ ] **Mobile**: most mobile browsers DO NOT implement `getDisplayMedia`
  (caniuse: Mobile Safari and Chrome Android lack support as of 2026).
  Open the spike on a phone; expect `apiAvailable === false` and the
  "not available" status line.

The findings doc summarises the manual results.

## Implementation choice — vanilla JS, no TypeScript

Pure JS keeps the spike's surface narrow. The production integration in
`packages/studio/` will be TS when it lands (Phase 12).

## Findings doc

The browser-support summary + UX-cost narrative + manual-test results
live in:
`docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md`
(section: **Screenshot capture + markup spike — Sub-spike 1**).
