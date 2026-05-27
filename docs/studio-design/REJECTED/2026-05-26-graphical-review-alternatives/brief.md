---
proposal: Alternative libraries surveyed for the graphical review surface — rejected
status: REJECTED
date: 2026-05-26
feature: docs/1.0/001-IN-PROGRESS/graphical-entries/
companion: ../../ACCEPTED/2026-05-26-graphical-review-prior-art/
---

# Alternative libraries surveyed for the graphical review surface — rejected

## What

Phase 1's prior-art research (Tasks 1.1-1.5) considered 25+ candidate libraries across six concerns. This entry records the rejected alternatives with concrete reasons so future contributors don't re-litigate the same decisions. The accepted picks live in the [companion ACCEPTED entry](../../ACCEPTED/2026-05-26-graphical-review-prior-art/).

The original candidates matrix (Task 1.1) covered the documented "embeddable OSS library" alternatives. Operator pushback on 2026-05-26 widened the survey to include hosted SaaS and drawing-canvas compositional primitives. All of the alternatives below were considered and rejected for the v1 graphical review surface; many remain viable as v2 escape hatches if the v1 picks turn out wrong.

## Why these were rejected (vs. picked)

The v1 architecture is operator-confirmed: **no cloud services, no databases** (Architecture A, 2026-05-26). Every adopter dependency must be OSS, library-only, filesystem-native. Some rejections are direct consequences of that constraint; others are about maintenance health, licensing, scope mismatch, or being measurably less capable than the picked alternative.

## Rejected — by concern

### Image annotation

| Candidate | Reason |
|---|---|
| Recogito Studio | Docker-deployed multi-user platform, not an embeddable library. Useful as UX inspiration only. |
| `recogito-js` | Archived 2023-12 (v1.8.4 was the last release). Superseded by `@recogito/text-annotator`, which is text-only and doesn't annotate images. |
| `@recogito/text-annotator` (for images) | Text-only annotation surface; cannot pin rectangles or polygons on raster images. (Spiked separately for HTML annotation in Task 1.3.) |
| marker.js2 | Linkware licence — embeds a "marker.js" branding badge unless a paid commercial licence is purchased. Awkward for OSS adopters of deskwork. |
| react-image-annotate | MIT-licensed but stale since February 2021 (5+ years without a meaningful release). Maintenance risk. |
| react-picture-annotation | MIT but abandoned. npm download velocity in decline. |
| `@recogito/annotorious-openseadragon` | BSD-3 (same team as Annotorious), actively maintained, but narrow scope — IIIF / zoomable images only. v1 of the `image` artifact kind is generic raster; reconsider if zoomable-image support becomes a requirement. |
| LabelStudio frontend | Apache-2.0 but heavyweight — designed for multi-user ML data-labeling workflows; assumes a server backend. Architectural mismatch with deskwork's client-only studio surface. |
| Mark.js | Text highlighter only, no spatial image regions. Wrong shape. |
| image-map-resizer | Too primitive (HTML `<map>` / `<area>` coordinate scaling only); no drawing UX, no threading. |
| DICOM viewers (Cornerstone.js, DWV) | Medical-imaging-specific. DICOM codec + measurement tools are overkill for generic PNG/JPG/SVG. |

### Compositional primitives (alternative to a turnkey image annotator)

| Candidate | Reason |
|---|---|
| Konva.js | MIT, ~55 KB gzipped, strongest of the canvas primitives. NOT spiked for image annotation in v1 — adopting Annotorious is 0 LOC vs. ~1,000-1,200 LOC of glue on Konva. **Retained as the v2 escape hatch** if Annotorious's plugin API proves insufficient for SVG element-selector anchors (Phase 11 concern). |
| Fabric.js | MIT, ~70-100 KB gzipped. SVG↔canvas native (potential v2 win for SVG mockup annotation) but heavier than Konva and touch requires Hammer.js. Not v1 competitive. |
| Paper.js | MIT, ~50-100 KB gzipped. Vector focus misaligned with the pin/region task; thin annotation community. |
| SVG.js | MIT but 2.64 MB bundle — disqualifying on size. |
| Pixi.js | MIT, ~200+ KB. WebGL is the wrong abstraction; event handling too low-level for annotation UI. |
| D3.js (+ d3-annotation) | Annotation extension exists (Susie Lu's library) but it's designed for chart markup, not image-region painting. Not suitable for pixel-coordinate or SVG-element anchoring. |

### HTML / DOM annotation

| Candidate | Reason |
|---|---|
| Hypothes.is client | Co-author of the W3C Web Annotation spec; canonical reference implementation; native threading via `motivation: replying`. **Excluded under Architecture A**: every embedding path requires either the Hypothes.is hosted cloud (data leaves disk), self-hosting the `h` stack (Postgres + Elasticsearch + Docker), or building a fake-`h` API adapter (the client still assumes a service contract). All three violate the no-cloud / no-DB constraint. UX patterns from Hypothes.is remain valuable as references but the runtime is out. |
| `recogito-js` (text mode) | Archived 2023-12. Superseded by `@recogito/text-annotator`. |

### Threading

| Candidate | Reason |
|---|---|
| Hypothes.is client (for the threading UI alone) | Same exclusion as above. The W3C `motivation: replying` data model is adoptable without adopting the Hypothes.is runtime. |

### Screenshot capture

| Candidate | Reason |
|---|---|
| html2canvas | Effectively unmaintained — last release January 2022, 975+ open issues. The README still labels itself "experimental." Known to misrender modern CSS (flex / grid / shadow DOM). The 2025/2026 consensus successor is `html-to-image`. |
| dom-to-image-more | MIT, fresh release (2025-10). Smaller community than `html-to-image`. Worth comparing in a future fidelity audit but not v1-competitive against `html-to-image`'s maturity. |
| `getDisplayMedia()` (as primary path) | Browser API, zero deps, but per-capture OS permission prompt is a UX cost — no "remember this site" affordance. No mobile support (iOS Safari, Android Chrome lack the API). Retained as a **secondary opt-in path** for cases the DOM-rendering path can't capture (WebGL, video, OS chrome). |

### Screenshot markup

| Candidate | Reason |
|---|---|
| **tldraw** | Source-available, NOT open-source. Production use requires either a paid commercial licence (≈$6,000/year per community reports) or a "made with tldraw" watermark on the canvas (free hobby licence). **Incompatible with deskwork's OSS-dependency stance** — adopters can't be asked to pay $6k/yr or render a tldraw watermark in a review surface. UX patterns are inform-only. |
| Konva.js (for markup, as a bespoke build) | MIT, ~55 KB. Would require building arrow / box / freehand / text / blur tools from primitives (~1,000-1,200 LOC). Not v1-competitive against Excalidraw's out-of-box tool set. **Retained as the v2 escape hatch** if Excalidraw's stylistic fit or React dependency proves wrong. |
| Penpot | MPL-2.0, ~48k stars, full self-hosted design platform — Docker + Postgres + Redis + auth. Not an embeddable component. Useful as inspiration for collaborative-cursor / threaded-comment UX but not a runtime dependency. |
| Storybook addon-designs / addon-comments / community comment addons | Embed Figma / image previews in Storybook's addon panel; do NOT add annotation. Most community comment addons are explicitly "very early in development." Wrong shape — deskwork doesn't render artifacts inside Storybook. |

### Hosted SaaS — all out under Architecture A

The operator's 2026-05-26 prompt explicitly invited consideration of web services. Architecture A rules them all out as v1 runtime dependencies, but several offer valuable UX patterns worth studying:

| Service | API surface | Data residency | W3C aligned? | Reason rejected |
|---|---|---|---|---|
| Hypothes.is | Public REST | Their cloud (or self-host the `h` stack) | Yes — canonical | Architecture A — every embedding path violates no-cloud / no-DB. Conditional candidate if multi-operator real-time review becomes a v2 requirement. |
| BugHerd | Private (task CRUD; no annotation read API) | Their cloud | No | Closed appliance; no API to sync annotations into deskwork's filesystem model. **UX-pattern reference only** (element-click-comment gesture). |
| Marker.io | No public API | Their cloud (AWS Ireland) | No | Closed widget; artifact uploaded to their servers; no API. **UX-pattern reference only** (screenshot-markup toolbar). |
| Pastel | No public API | Mixed (proxy approach unclear) | No | Closed platform; no API. **UX-pattern reference only** (graduated comment lifecycle). |
| Frame.io (Adobe) | Public REST | Their cloud (artifacts uploaded) | No (custom format) | Video-primary; no embed widget for local content; vendor lock-in into Adobe ecosystem. |
| InVision Freehand | — | — | — | **Deprecated January 2025** (Miro acquisition). Not an option. |
| Penpot Cloud | Public (design-data CRUD) | Their cloud | No | Design-object scope (frames / components), not artifact annotation. |
| Loom | — | Their cloud | No | Video-centric. Static-artifact annotation is not the primary use case. |
| PageProofer / Userback / GoVisually / ReviewStudio / Markup.io / Atarim | None public | Their cloud | No | All closed-appliance pattern; no APIs; design-feedback workflows are agency-oriented. |

## Why this entry exists

The design-archive contract (`.claude/rules/design-standards.md`) requires REJECTED entries for "every alternative that the operator declined OR that was retired during exploration." The Phase 1 work surfaced enough alternatives that a single consolidated REJECTED entry (this one) is more navigable than per-library entries. Each row above carries a specific reason traceable to either Architecture A, the candidates matrix (`../../ACCEPTED/2026-05-26-graphical-review-prior-art/candidates.md`), or measured spike outcomes (`../../ACCEPTED/2026-05-26-graphical-review-prior-art/evidence.md`).

If a future contributor proposes one of these libraries for v1 of the graphical review surface, this entry is the answer — *"already considered, here's why it was rejected, here's the v2 condition under which it'd be re-evaluated."*

## When

Survey ran 2026-05-25 → 2026-05-26 during Phase 1 of the graphical-entries feature. Operator pushback on 2026-05-26 widened the survey to include hosted SaaS + drawing-canvas compositional primitives; all of those were rejected too, with reasons recorded here.

## Feature reference

[`docs/1.0/001-IN-PROGRESS/graphical-entries/`](../../../1.0/001-IN-PROGRESS/graphical-entries/)
