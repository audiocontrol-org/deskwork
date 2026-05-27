---
title: Graphical Review — Prior-Art Candidate Matrix
date: 2026-05-25
slug: graphical-review-prior-art-candidates
---

## What this is

deskwork's review surface is generalizing from longform markdown to three new artifact kinds — `html-mockup` (directory with `index.html` + assets), `single-file-html`, and `image` (PNG / JPG / SVG). For each, operators need to (1) pin spatial comments to regions (DOM-selector + offset for HTML; pixel coordinates for raster; element-selector for SVG), (2) reply in threads, (3) capture screenshots of the rendered artifact, and (4) mark up captured screenshots with arrow / box / freehand / text / blur tools before attaching. The annotation schema is being aligned with the [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) where it makes sense. Operator preference: reinvent as little as possible, but adopter dependencies must be open-source — closed-source SaaS appears inform-only for UX patterns. This matrix is the input to Phase 1's adoption-spike tasks (1.2 image annotation, 1.3 HTML annotation, 1.4 screenshot capture + markup).

## Matrix

Sorted alphabetically within each concern. "Adoptable" means "can be a runtime dependency of deskwork the open-source plugin without licence friction or unacceptable footprint." Cells marked "unknown" mean the public surface didn't expose the fact and a deeper spike would be needed.

### Image annotation (spatial pins on raster + SVG)

| Project | License | Last commit (year-month) | Bundle / dep weight | W3C Web Annotation alignment | Browser APIs used | Self-hosting cost | Adoptable y/n | Notes |
|---|---|---|---|---|---|---|---|---|
| [Annotorious](https://annotorious.dev/) ([repo](https://github.com/annotorious/annotorious)) | BSD-3-Clause | 2026-05 (v3.4.0, 2026-05-27 release) | TypeScript+Svelte; not stated; works as ES module | Partial — explicit `W3CImageAdapter` utility for crosswalk; internal model uses direct coordinates for perf, not full W3C selectors ([data-model docs](https://new.annotorious.com/guides/data-model/)) | DOM, SVG, Pointer Events (touch supported per project home) | Pure client-side library; no server required | **Yes** | Image-only (rectangle / polygon / freehand). Touch + OpenSeadragon + IIIF supported. Threading NOT built in — host app supplies comment UI on top of the annotation body. ~841 GitHub stars. The mature pick for image pins. |
| [Recogito Studio](https://recogitostudio.org/) | Open-source (specific licence unstated on project home — Docker-deployed; underlying [text-annotator](https://github.com/recogito/text-annotator) is BSD-3-Clause) | 2026-04 (text-annotator v3.4.0) | Heavy — full Docker-deployed platform, not embeddable library | Yes — W3C Web Annotations are the on-the-wire format | Browser + server (Postgres, etc.) | High — full self-hosted multi-user platform | **No** (as full platform). The underlying `text-annotator` is adoptable as a library — see HTML annotation row. | Successor to legacy `recogito-js` (archived 2023). Studio is a workbench app, not an SDK; useful as UX inspiration. |

### HTML / single-file-HTML / DOM annotation

| Project | License | Last commit (year-month) | Bundle / dep weight | W3C Web Annotation alignment | Browser APIs used | Self-hosting cost | Adoptable y/n | Notes |
|---|---|---|---|---|---|---|---|---|
| [Hypothes.is client](https://github.com/hypothesis/client) | 2-Clause BSD | actively maintained (15k+ commits; tip unstated on overview page) | Heavy — full sidebar app (annotation list, search, auth UI) injected into host page; designed to run as a SPA next to content | Yes — Hypothes.is is co-author of the W3C model; uses Web Annotation selectors (TextQuoteSelector, RangeSelector, etc.) | DOM, Selection API, IFRAME injection (sidebar runs in shadow / iframe) | API server required ([h](https://github.com/hypothesis/h) or via [Via proxy](https://github.com/hypothesis/via)) — non-trivial to embed without their backend or a replacement implementing the same REST contract | **Partial** — adoptable as an HTML-annotation reference architecture; embedding it whole drags in the Hypothes.is service surface. The data-model is the deeper win than the runtime. | Threading is supported via reply annotations (motivation: `replying`). Mobile is functional; gesture support adequate. Strong fit for HTML annotation IF deskwork is willing to either self-host `h` or write a minimal API adapter for deskwork's filesystem-native storage. |
| [recogito-js](https://github.com/annotorious/recogito-js) | BSD-3-Clause | **Archived 2023-12** (v1.8.4) | Light client lib | Yes (Web Annotation–shaped) | DOM, Selection API | Library only | **No** — repo deprecated; superseded by `@recogito/text-annotator` | Historical reference only. |
| [@recogito/text-annotator](https://github.com/recogito/text-annotator) | BSD-3-Clause | 2026-04 (v3.4.0) | TS library; bundle size unstated | "Aligns closely with W3C Web Annotation Data Model" with same perf-optimization deltas as Annotorious | DOM, Selection API | Library only — host supplies storage | **Yes** | Operates on a host-supplied DOM container (`createTextAnnotator(node)`), not the whole page. Threading NOT built in (host supplies). ~79 stars — small community but actively developed by the same team as Annotorious. The likely pick for HTML / single-file-HTML annotation if Hypothes.is is too heavy. |

### Annotation data model

| Project | License | Last commit (year-month) | Bundle / dep weight | W3C Web Annotation alignment | Browser APIs used | Self-hosting cost | Adoptable y/n | Notes |
|---|---|---|---|---|---|---|---|---|
| [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) | W3C Recommendation (not software) | Published 2017-02-23 (Recommendation) | n/a (spec) | Definitional | JSON-LD serialization | n/a | **Yes — adopt as schema contract** | Defines body / target / selectors (Fragment, CSS, XPath, TextQuote, SVG, DataPosition, Range) and `motivation` vocabulary including `replying` (covers threading). Mature, stable since 2017, baked into Annotorious / Hypothes.is / Recogito. Adopt the conceptual model + JSON shape; don't import a library. |

### Screenshot capture (DOM → image)

| Project | License | Last commit (year-month) | Bundle / dep weight | W3C Web Annotation alignment | Browser APIs used | Self-hosting cost | Adoptable y/n | Notes |
|---|---|---|---|---|---|---|---|---|
| [dom-to-image-more](https://github.com/1904labs/dom-to-image-more) | MIT | 2025-10 (v3.7.2) | ~673 stars; bundle unstated | n/a | DOM cloning, SVG `<foreignObject>`, canvas | None (client-side) | **Yes** | Fork of `dom-to-image` with iframe + cross-origin improvements. SVG-based render path closer to actual rendering than `html2canvas`. Smaller community than html-to-image. |
| [getDisplayMedia (Screen Capture API)](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia) | n/a (browser API) | n/a | n/a | n/a | MediaDevices, MediaStream; HTTPS + transient user activation required | None | **Yes for full-frame**; **no for region** | Captures screen / window / tab. **Permission prompt every time** — cannot persist. Cannot capture a specific element directly. Use the [Element Capture API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API/Element_Region_Capture) for element-level capture (browser support narrower). Useful fallback for cases the DOM-rendering libraries miss (e.g. WebGL contexts), but UX friction (per-capture prompt) makes it second-choice for the primary capture path. |
| [html-to-image](https://github.com/bubkoo/html-to-image) | MIT | 2025-02 (v1.11.13) | 7.1k stars; bundle unstated | n/a | DOM cloning, SVG `<foreignObject>`, canvas | None (client-side) | **Yes** | Most actively maintained of the DOM-cloning family. Better TypeScript story than `html2canvas`. Configurable shadow-DOM handling. The current default pick of the 2025 alternatives roundup ([portalZINE comparison](https://portalzine.de/best-html-to-canvas-solutions-in-2025/)). |
| [html2canvas](https://html2canvas.hertzen.com/) ([repo](https://github.com/niklasvh/html2canvas)) | MIT | last release 2022-01 (v1.4.1) | ~45 KB gzipped; 31.9k stars | n/a | Canvas 2D, DOM walking | None (client-side) | **Yes, but minimally-maintained** | 975+ open issues, no release since Jan 2022. README still labels it "experimental." Known to misrender modern CSS (flex / grid / shadow DOM). Probably wrong default for 2026 work; preferred for compatibility with legacy projects only. |

### Screenshot markup / drawing

| Project | License | Last commit (year-month) | Bundle / dep weight | W3C Web Annotation alignment | Browser APIs used | Self-hosting cost | Adoptable y/n | Notes |
|---|---|---|---|---|---|---|---|---|
| [Excalidraw](https://github.com/excalidraw/excalidraw) (`@excalidraw/excalidraw`) | **MIT** | 2026-04 (v0.18.1) | npm package; 124k stars; bundle large (full whiteboard incl. fonts shipped) | n/a (drawing schema is Excalidraw-native; can export PNG/SVG bitmap for attachment) | DOM, Canvas/SVG, Pointer Events | None (client-side React component) | **Yes** | Hand-drawn aesthetic; React component (`<Excalidraw />`). Exports PNG / SVG / `.excalidraw` JSON. Touch + mobile supported. Stylistically distinctive — may or may not fit deskwork's industrial aesthetic. **The principal open-source alternative to tldraw post-licensing change.** |
| [Konva.js](https://konvajs.org/) ([repo](https://github.com/konvajs/konva)) | MIT | 2026-04 (v10.3.0) | 14.5k stars; bundle size unstated | n/a (it's a canvas primitive lib, not annotation) | Canvas 2D, Pointer Events; React / Vue / Svelte / Angular adapters | None (client-side) | **Yes** (as primitive — build markup tools on top) | Generic 2D-canvas object model: shapes, transforms, drag-handles, hit-testing. Not a markup tool out of the box — would underpin a custom one. Cost = building arrow / box / blur / text-label tooling on top. Use only if Excalidraw doesn't fit and we genuinely want a bespoke aesthetic. |
| [tldraw](https://github.com/tldraw/tldraw) | **Source-available, NOT open-source** ([tldraw license](https://tldraw.dev/community/license)) — production use requires a license key; commercial license is paid (community reports ≈$6,000/year); hobby license is free but requires a "made with tldraw" watermark on the canvas | 2026-05 (v5.0.2) | 47.4k stars; React SDK; bundle large | n/a | DOM, Canvas, Pointer Events | None (client-side React component) | **No, given adopter-dependencies-must-be-open-source constraint** | Technically excellent. Licence is the disqualifier: deskwork can't take a runtime dep that requires every adopter to either pay $6k/yr or render a tldraw watermark in a review surface. Inform-only on UX patterns. |

### Design + collaboration platforms (likely too heavy — informational)

| Project | License | Last commit (year-month) | Bundle / dep weight | W3C Web Annotation alignment | Browser APIs used | Self-hosting cost | Adoptable y/n | Notes |
|---|---|---|---|---|---|---|---|---|
| [Penpot](https://github.com/penpot/penpot) | MPL-2.0 | 2026-05 (v2.15.3) | Clojure/ClojureScript backend + frontend; ~48k stars; entire self-hosted design platform | None | DOM, Canvas, websocket collaboration | High — Docker / Kubernetes deployment, Postgres + Redis + auth | **No** — not an embeddable component | A full Figma-class app, not a library. Useful as inspiration for collaborative-cursor / threaded-comment UX but not a runtime dependency. |
| [Storybook addon-designs](https://github.com/storybookjs/addon-designs) | MIT | 2025-12 (v11.1.1) | Storybook addon | None | iframe embeds | None | **No for our use-case** | Embeds Figma / image / URL previews in Storybook's addon panel. Does NOT add annotation / commenting. Wrong tool for the concern. |
| Storybook "addon-discuss" / addon-comments / community addons | Mixed (per-fork) | Mostly stale or experimental; `storybook-feedback` is explicitly "very early in development" ([listings](https://storybook.js.org/addons/tag/comments)) | Storybook addon footprint | None | iframe-embedded | Backends vary — Supabase / Firebase / Storybook server | **No** | None are mature; all assume a Storybook host. Wrong shape — deskwork doesn't render artifacts inside Storybook. |

### Closed-source SaaS (inform-only — UX patterns)

| Project | License | Last commit (year-month) | Bundle / dep weight | W3C Web Annotation alignment | Browser APIs used | Self-hosting cost | Adoptable y/n | Notes |
|---|---|---|---|---|---|---|---|---|
| [BugHerd](https://bugherd.com/) | Proprietary SaaS | n/a | Hosted SaaS + browser-extension widget | Unknown | DOM + element-pinning; auto-screenshot | $42/mo+ | **No — inform-only** | Best-in-class "point, click, comment-on-element" UX for the HTML annotation concern. Threading, screenshots, technical metadata (browser / viewport) all auto-attached. Look here for affordance patterns when designing the HTML-pin gesture. |
| [Marker.io](https://marker.io/) | Proprietary SaaS | n/a | Hosted SaaS + widget | Unknown | DOM + screenshot capture; session replay | $39/mo+ | **No — inform-only** | Strong screenshot-markup palette (arrow / box / blur / text). Session-replay is overkill for deskwork. Annotation toolbar UX is the take-away. |
| [Pastel](https://usepastel.com/) | Proprietary SaaS | n/a | Hosted SaaS | Unknown | DOM, image, PDF | Paid tiers | **No — inform-only** | Multi-artifact (website + image + PDF) feedback with comment threads, tags, resolved-state. Closest SaaS analog to what deskwork is building. Look here for the "graduated comment lifecycle" UX. |

## Discovered candidates

Adding two not in the brief that surfaced as clearly better than equivalent listed options:

| Project | Why added |
|---|---|
| [@recogito/text-annotator](https://github.com/recogito/text-annotator) | Successor to the archived `recogito-js`. Same team as Annotorious; same data-model philosophy. Replaces the deprecated entry in the brief. |
| [html-to-image](https://github.com/bubkoo/html-to-image) | The 2025/2026 consensus alternative to `html2canvas` ([portalZINE](https://portalzine.de/best-html-to-canvas-solutions-in-2025/), [npm-compare](https://npm-compare.com/dom-to-image-more,html-to-image,html2canvas)). Active releases, better TS story, configurable shadow-DOM. Worth comparing against `dom-to-image-more` in the 1.4 spike. |

## Per-concern shortlists (input to Phase 1 spikes)

### Image annotation (Task 1.2)
1. **Annotorious** — mature, BSD-3, touch + IIIF supported, explicit W3C-crosswalk utility. Image-only is the right shape for the `image` artifact kind. Library-only, no service to host.
2. **@recogito/text-annotator** — same team / philosophy, but text-only — only shortlist for image if Annotorious surprises us in the spike.

### HTML / single-file-HTML annotation (Task 1.3)
1. **@recogito/text-annotator** — library-only, BSD-3, takes a host-supplied DOM container, W3C-aligned data model. Lightest-weight path to "pin a comment to a text range or DOM region inside a rendered HTML mockup."
2. **Hypothes.is client** — heaviest option BUT the canonical W3C-aligned implementation, with built-in `replying`-motivation threading and a multi-year track record on production-grade sites. Shortlist as the deep-end reference; only adopt the runtime if we want its sidebar UX.

### Threading (Task 1.3 / cross-cutting)
1. **W3C Web Annotation Data Model `motivation: replying`** — the standard already specs threaded replies as annotations whose `target` is the parent annotation. Adopt as schema; don't import a library for the threading concern alone.
2. **Hypothes.is client** — only candidate with threading built into the runtime UI. Shortlist as the implementation reference.

### Screenshot capture (Task 1.4)
1. **html-to-image** — actively maintained 2025-02 release, SVG-`foreignObject` render path, modern TS story, configurable shadow-DOM. Default candidate.
2. **dom-to-image-more** — fresh release 2025-10, MIT, iframe + cross-origin improvements; secondary candidate to validate against html-to-image in the spike.
- **Note:** `getDisplayMedia` is a fallback (per-capture permission prompt is a UX cost), and `html2canvas` is effectively unmaintained.

### Screenshot markup (Task 1.4)
1. **Excalidraw** — MIT, embeddable React component, PNG / SVG export, mobile / touch supported. Stylistic fit to deskwork's industrial aesthetic is the open question — handle in the spike with two mockups.
2. **Konva.js** — only if Excalidraw is stylistically wrong AND we accept the cost of building arrow / box / blur tooling from primitives. Fall-back not first-pick.
- **Disqualified: tldraw.** Source-available, not open-source; production use requires either a $6k/yr commercial license or a "made with tldraw" watermark in a review surface. Incompatible with deskwork's open-source dependency stance.

### Data model (cross-cutting)
1. **W3C Web Annotation Data Model** — adopt the conceptual model (`body` / `target` / `selector` / `motivation`) and JSON-LD shape; this is what Annotorious, Recogito, and Hypothes.is all crosswalk against. Library-free decision.
2. (No second option — the spec is the contract.)
