---
proposal: Graphical review surface — library choices for v1
status: ACCEPTED
date: 2026-05-26
feature: docs/1.0/001-IN-PROGRESS/graphical-entries/
evidence: ./evidence.md
survey: ./candidates.md
---

# Graphical review surface — library choices for v1

## What

Phase 1 of the graphical-entries feature is a prior-art survey + spike-validation pass on the libraries deskwork's chrome-free graphical review surface will depend on. This brief is the canonical decision record for six concerns: annotation data model, image annotation, HTML / DOM annotation, threading, screenshot capture, and screenshot markup. Each concern names the picked approach, the rationale, the dependency footprint, the adopter-facing impact, and what's in v1 scope vs. deferred.

Architecture A applies throughout: **no cloud services, no databases** (operator-confirmed 2026-05-26). Every adopted library is OSS, library-only, filesystem-native — annotations persist as W3C Web Annotation JSON-LD in deskwork's existing sidecar pattern.

## Decisions — by concern

### Annotation data model

**Pick: W3C Web Annotation Data Model (Recommendation 2017-02-23) as the structural base, extended with the `deskwork:` namespace for project-specific fields.**

Rationale. Every adopted library already emits W3C-canonical `@context` + `type: "Annotation"` + `target.selector` JSON-LD via its adapter (`W3CImageFormat`, `W3CTextFormat`) or via deskwork's hand-rolled DOM-selector layer. Phase 8's planned fields fit the JSON-LD extension pattern: `replyTo` is W3C-native via `motivation: replying`, `attachments[]` extends `body[]`, `spatialAnchor` extends `target.selector`, and the required `reason` on disposition annotations becomes `deskwork:reason`. Cross-system migration becomes plausible later (e.g. an export-to-Hypothes.is path) without a full data migration.

Dependency footprint. None — the data model is a spec, not a library.

Adopter impact. Adopters' on-disk annotations carry the canonical W3C `@context` URI. Tools that read W3C Web Annotations work without modification; tools that don't will simply ignore the `deskwork:` namespace per JSON-LD's open-vocabulary rules.

v1 scope. Adopt W3C as the structural base. Phase 8 ships the migration tooling from the legacy `comment` annotation shape (per the migration sketch in [`evidence.md`](./evidence.md) § "Migration sketch from the current `comment` annotation shape").

Deferred. Hosting deskwork's `deskwork:` JSON-LD context URI under a stable domain (Phase 8 decision); a future export-to-Hypothes.is adapter (Architecture B; not selected for v1).

### Image annotation

**Pick: Annotorious v3 (BSD-3-Clause) via `createImageAnnotator` + `W3CImageFormat` adapter.**

Rationale. After a widened survey beyond the original "embeddable OSS library" framing — including marker.js2 (Linkware-licensed badge), react-image-annotate (stale since 2021), `@recogito/annotorious-openseadragon` (IIIF-only scope), LabelStudio frontend (server-required), and the Konva.js / Fabric.js compositional path — Annotorious remains the lone production-mature, library-only, image-only image-annotation library. The spike confirmed: 158 LOC of glue code, 11 production packages totaling ~2.6 MB unpacked, zero theming overrides required, touch code path verified at iPhone-13 viewport, W3C JSON-LD payload emitted correctly with `FragmentSelector` carrying `xywh=pixel:` per W3C media-frags spec.

Dependency footprint. Annotorious v3.8.2 + 10 transitive deps = 11 production packages, ~2.6 MB unpacked.

Adopter impact. New peer dep. Annotorious ships CSS that the studio imports as-is (zero overrides); runtime theming via `setTheme('light' | 'dark' | 'auto')` and `setStyle(...)`.

v1 scope. Adopt as-is with `W3CImageFormat` adapter so lifecycle events deliver W3C-shaped annotations directly. Do NOT fork.

Deferred. IIIF / zoomable image support via `@recogito/annotorious-openseadragon` (Phase 11 extension if the `image` artifact kind grows to include zoomable images); a Konva-based compositional path as the v2 escape hatch if Annotorious's plugin API proves insufficient for SVG element-selector anchors.

### HTML / single-file-HTML / DOM annotation

**Pick: `@recogito/text-annotator` v4 (BSD-3-Clause) for text-range pins, plus a hand-rolled DOM-selector layer for non-text DOM regions.**

Rationale. `@recogito/text-annotator` is a text-range annotator from the Annotorious team — host-supplied DOM container, W3C-aligned data model, library-only with no backend required. The spike confirmed it covers text-range pins natively via the `W3CTextFormat` adapter (`TextQuoteSelector` + `TextPositionSelector`). **However**, the library is text-range-only — it has no concept of pinning to a non-text DOM element (icon button, `<img>`, decorative `<div>`). The spike therefore added a 215-LOC hand-rolled `src/dom-anchor.js` layer that emits a W3C-compatible target with three selectors: `CssSelector` (primary), `TextQuoteSelector` (fallback 1), `FragmentSelector` pixel-offset (fallback 2). Anchor-resilience tested across rename / sibling-insertion / class-rename / pure-reorder / total-teardown mutations; the resolver chain works as documented, with one finding the spike surfaced: nth-of-type CssSelectors silently mis-target after pure-reorder (the resolver does not cross-check CSS match against TextQuote — Phase 10 must add the verification step).

Hypothes.is is the canonical W3C reference implementation but is out for v1 under Architecture A — every embedding path (hosted cloud, self-host the `h` stack, or a fake-`h` API adapter) violates the no-cloud / no-DB constraint.

Dependency footprint. `@recogito/text-annotator` v4.1.1 + 13 transitive deps = 14 production packages, ~6.4 MB unpacked. The hand-rolled DOM-selector layer adds no deps.

Adopter impact. New peer dep. The text-annotator instance runs inside the iframe's JS realm (cross-iframe document-realm gotcha — the library's selection listeners bind to `document` of its own realm); Phase 10 must spec the production-grade iframe-injection mechanism (build-time inline, stable studio-served URL, blob URL, or `postMessage` with a host-side fallback).

v1 scope. Adopt `@recogito/text-annotator` + `W3CTextFormat` for text-range pins; ship the DOM-selector layer (Phase 10 production code) for non-text DOM regions.

Deferred. Hypothes.is integration in any form (architecture-A incompatible); the CSS-resolver cross-check against TextQuote (Phase 10 must-fix from the anchor-resilience finding); iframe-reload annotation re-application (Phase 10 acceptance criterion).

### Threading

**Pick: deskwork-supplied at the marginalia layer, using W3C `motivation: replying` with `target` pointing at the parent annotation's `id`.**

Rationale. None of the picked libraries ship native threading — all defer to the host. This matches the W3C Web Annotation Data Model's documented pattern: replies are themselves annotations whose `target` is the parent annotation's URI. No library import needed for threading; deskwork's marginalia layer owns the reply UI and persists reply annotations alongside the originals.

Dependency footprint. None.

Adopter impact. Adopters see threaded replies in the marginalia sidebar; the on-disk JSON carries the `motivation: replying` + `target: <parent-id>` shape — standard W3C, no deskwork-specific encoding.

v1 scope. Phase 8 ships the marginalia threading UI. The data shape is W3C-canonical from day one.

Deferred. None.

### Screenshot capture

**Pick: `html-to-image` v1.x (MIT) as the primary capture path; `getDisplayMedia()` as an opt-in secondary path for cases the DOM-to-canvas path can't render.**

Rationale. The candidates matrix flagged `html2canvas` as effectively unmaintained (last release 2022-01, 975+ open issues). The spike measured `html-to-image` against a fidelity-stress fixture (`@font-face`, CSS grid, flex, `::before` / `::after`, box-shadow, border-radius, inline SVG, multi-line text wrapping) and confirmed every feature rendered faithfully at RGB-distance 0 in pixel-sampled probe assertions. Capture-via-`getDisplayMedia` is a separate mechanism — it requires user activation + a per-capture OS permission prompt (no "remember this site" affordance) and is unsupported on mobile browsers. It's the right tool for things the DOM-rendering path can't capture (WebGL contexts, video frames, OS-level chrome), not the primary path.

Dependency footprint. `html-to-image` adds 2 packages, ~500 KB unpacked. `getDisplayMedia` is a browser API, zero deps.

Adopter impact. New peer dep for `html-to-image`. `getDisplayMedia` requires HTTPS + transient user activation — no adopter-side configuration needed beyond serving over HTTPS in production.

v1 scope. Adopt `html-to-image` as the primary path. Add `getDisplayMedia` as an opt-in toggle ("Capture screen with system dialog") on the markup surface for the edge cases above.

Deferred. Cross-origin asset handling in mockups (`html-to-image` may silently omit external images / fonts; the studio needs an operator-visible warning surface — Phase 12 concern). Real-device mobile capture validation (Phase 12 acceptance criterion). `getDisplayMedia` on iOS Safari / Android Chrome — not supported by the platform; mark as unsupported in the UI.

### Screenshot markup

**Pick: Excalidraw v0.18.x (MIT) via a self-contained React 18 sub-bundle on the markup surface.**

Rationale. tldraw is licence-disqualified (source-available; requires either a paid commercial licence or a "made with tldraw" watermark on the canvas — incompatible with deskwork's OSS-dependency stance). Konva.js is the credible compositional alternative (MIT, ~55 KB gzipped) but would require ~1,000-1,200 LOC of glue for arrow / box / freehand / text / blur tooling that Excalidraw provides out of the box. The spike validated Excalidraw via `<Excalidraw />` + `exportToBlob` + `convertToExcalidrawElements`: 4 of the 5 spec'd tools (arrow, box, freehand, text-label) map to native Excalidraw primitives; the box-stroke pixel-sample probe confirmed the markup layer composes into the exported PNG. The fifth tool, **blur**, is the real gap — Excalidraw does not ship a built-in blur effect; Phase 12 will extend Excalidraw with a custom element type via its plugin API (estimate: 200-400 LOC) to fill the gap.

Dependency footprint. `@excalidraw/excalidraw` v0.18.1 + React 18 + react-dom + transitive = ~360 packages, ~95 MB unpacked in `node_modules/` (the spike's measured footprint). The shipped bundle is much smaller — Excalidraw + React + react-dom production builds total ~3-5 MB minified (un-gzipped); Phase 12 will measure the gzip + adopter-impact numbers explicitly.

Adopter impact. New peer dep tree. The studio's existing surface uses Hono + an esbuild client pass (no React); Phase 12 ships Excalidraw as an **isolated React sub-bundle** mounted only on the markup surface so adopters who never open markup don't pay the React weight.

v1 scope. Adopt Excalidraw as-is via `createRoot` + isolated sub-bundle. Use `convertToExcalidrawElements()` (not hand-rolled element shapes) so the library owns its version-stable internal invariants.

Deferred. Custom blur element type for Excalidraw (Phase 12 extension). Konva.js compositional path as the v2 escape hatch if Excalidraw's stylistic fit or React dependency proves wrong for deskwork's industrial aesthetic.

## Why accepted

This is research-phase work; "acceptance" means the operator confirmed Architecture A's constraints, the spike measurements grounded the library picks against concrete evidence (not vibes), and the per-concern decisions chain together into a coherent v1 stack: every library is OSS, library-only, filesystem-native, W3C-aligned, and the rejected alternatives (hosted SaaS, source-available libraries, unmaintained tooling) are documented in the companion [REJECTED entry](../../REJECTED/2026-05-26-graphical-review-alternatives/) so future contributors don't re-litigate the same decisions.

## When

Phase 1 ran 2026-05-25 → 2026-05-26 across five tasks (1.1 candidate matrix; 1.2 image spike + post-review fixes; 1.3 HTML spike + post-review fixes; 1.4 capture + markup spikes + post-review fixes; 1.5 threading + W3C alignment synthesis). Each task landed with spike-side probe assertions passing (40+ assertions for Task 1.2, 44 for Task 1.3, ~90 for Task 1.4). Operator pushback on 2026-05-26 widened the survey scope to include hosted SaaS — Hypothes.is was the lone conditional candidate and was excluded under Architecture A.

## Feature reference

[`docs/1.0/001-IN-PROGRESS/graphical-entries/`](../../../1.0/001-IN-PROGRESS/graphical-entries/)

## Evidence

[`evidence.md`](./evidence.md) carries the verbose backing: per-spike integration-cost measurements (LOC, dep weight, unpacked size, theming-override count), the actual emitted W3C JSON-LD payloads, anchor-resilience test results, rendering-fidelity findings, and per-concern open questions. The candidates matrix lives at [`candidates.md`](./candidates.md).

## Spike directories — runnable

Each spike runs via `npm install && npm run dev` from its directory; `npm run verify` re-runs the spec-derived Playwright assertions (first time: `npx playwright install chromium`).

- [`spikes/graphical-review/annotorious-image/`](../../../../spikes/graphical-review/annotorious-image/)
- [`spikes/graphical-review/text-annotator-html/`](../../../../spikes/graphical-review/text-annotator-html/)
- [`spikes/graphical-review/capture-getdisplaymedia/`](../../../../spikes/graphical-review/capture-getdisplaymedia/)
- [`spikes/graphical-review/capture-dom-to-canvas/`](../../../../spikes/graphical-review/capture-dom-to-canvas/)
- [`spikes/graphical-review/markup-tools/`](../../../../spikes/graphical-review/markup-tools/)
