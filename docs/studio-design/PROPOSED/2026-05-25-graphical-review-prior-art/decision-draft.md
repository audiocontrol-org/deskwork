---
title: Graphical Review — Decision Draft (Phase 1)
date: 2026-05-25
slug: graphical-review-prior-art-decision-draft
---

## What this is

Decision draft (Phase 1) for the graphical-entries feature's prior-art
research. Captures the per-concern picks (annotation data model, image
annotation UI, HTML annotation UI, threading, screenshot capture,
screenshot markup) as they are spike-validated across Phase 1 tasks
1.2 through 1.5. Survey input is the candidate matrix at
[`candidates.md`](./candidates.md) (17 candidates / 6 concerns,
authored in Task 1.1).

Sections fill in as the spikes land. **This is a draft; the finalized
document moves to `docs/studio-design/ACCEPTED/<date>-graphical-review-prior-art/brief.md`
in Task 1.6.**

| Concern | Status | Task |
|---|---|---|
| Image annotation spike | DONE — see below | 1.2 |
| HTML annotation spike | DONE — see below | 1.3 |
| Screenshot capture + markup spike | pending | 1.4 |
| Threading + W3C alignment | pending | 1.5 |

## Image annotation spike (Task 1.2)

### Candidates considered + why narrowed to one

The candidates matrix lists four projects under "Image annotation."
Spike narrowed to **one viable embeddable library**:

| Candidate | Disposition | Reason |
|---|---|---|
| **Annotorious** ([repo](https://github.com/annotorious/annotorious), v3.8.2 at install time) | **Spiked** | BSD-3, actively maintained, image-only embeddable library, ships `W3CImageFormat` adapter for W3C Web Annotation Data Model crosswalk. Only candidate that fits the "drop into the studio as a runtime dependency" shape. |
| Recogito Studio | Out — wrong shape | Docker-deployed multi-user platform, not an embeddable library (per candidates.md row 2). Useful as UX inspiration only. |
| `recogito-js` | Out — archived | Repo deprecated 2023-12 (per candidates.md row 4). Superseded by `@recogito/text-annotator`. |
| `@recogito/text-annotator` | Out — wrong artifact | Text-only annotation surface. Cannot pin rectangles or polygons on raster images. Spiked separately for HTML in Task 1.3. |

This is a **library-of-one** finding. The matrix's per-concern shortlist
(matrix § "Image annotation (Task 1.2)") proposed Annotorious as
primary and `@recogito/text-annotator` as fallback, but
`@recogito/text-annotator` doesn't annotate images, so there is no
second candidate to spike. The shortlist's framing of "only shortlist
for image if Annotorious surprises us in the spike" was the right
hedge — Annotorious did not surprise us in the spike.

The decision-doc that lands in Task 1.6 must explicitly call out
"library-of-one for image annotation" as a risk surface: a future
maintainership change at Annotorious has no in-kind embeddable
alternative; the fallback for image annotation is "build the SVG
overlay ourselves on a canvas primitive like Konva," which is a v2
or later concern.

### Survey widened (operator pushback 2026-05-26)

After the initial spike landed, the operator pushed back: *"do some more
research on the solution space. I feel like there must be more than one
option. Are there any web services we could leverage?"* Three parallel
research agents widened the survey beyond the candidates matrix's
"embeddable OSS library" framing. The library-of-one conclusion holds;
the audit trail below is here so future readers can verify the
conclusion against the wider field rather than re-litigating it.

**Additional OSS libraries surfaced (none competitive with Annotorious):**

| Library | Licence | Last release | Disposition + reason |
|---|---|---|---|
| [marker.js2](https://github.com/ailon/markerjs2) | Linkware (paid OR forced attribution badge) | 2026, active | Out — Linkware embeds a "marker.js" badge unless a paid licence is bought; awkward for OSS adopters of deskwork |
| [react-image-annotate](https://github.com/UniversalDataTool/react-image-annotate) | MIT | Feb 2021 (stale) | Out — last meaningful release 5+ years ago; maintenance risk |
| [react-picture-annotation](https://github.com/Kunduin/react-picture-annotation) | MIT | 2021, stale | Out — abandoned; npm download velocity in decline |
| [@recogito/annotorious-openseadragon](https://www.npmjs.com/package/@recogito/annotorious-openseadragon) | BSD-3 (same team) | 2026-05, active | Out for v1 — narrow scope (IIIF / zoomable images only); same-team plugin and a viable later add-on if the `image` artifact kind extends to zoomable images |
| [LabelStudio frontend](https://github.com/HumanSignal/label-studio-frontend) | Apache-2.0 | active | Out — heavyweight (designed for multi-user ML labeling workflows); assumes a server backend; architectural mismatch with deskwork's client-only studio surface |
| [DICOM viewers](https://www.cornerstonejs.org/) (Cornerstone.js, DWV) | BSD | active | Out — medical-imaging-specific; DICOM codec + measurement tools are overkill for generic PNG/JPG/SVG |
| [Mark.js](https://markjs.io/) | MIT | active | Out — text highlighter only, no spatial image regions |
| [image-map-resizer](https://github.com/davidjbradshaw/image-map-resizer) | MIT | active | Out — too primitive (HTML `<map>` / `<area>` only); no drawing UX, no threading |

**Compositional path (canvas / SVG primitives evaluated as an alternative
to adopting a turnkey annotator):**

| Primitive | Licence | Bundle (gzip) | v1 annotator LOC estimate | Verdict |
|---|---|---|---|---|
| [Konva.js](https://konvajs.org/) | MIT | ~55 KB | ~1,000–1,200 lines of glue | Strongest primitive; touch-optimized; deskwork would own every UX bug forever. Threshold to beat Annotorious: 3+ weeks of focused implementation. |
| [Fabric.js](https://fabricjs.com/) | MIT | ~70–100 KB | ~1,000–1,500 lines | SVG↔canvas native (potential v2 win for SVG mockup annotation); touch needs Hammer.js; heavier |
| [Paper.js](https://github.com/paperjs/paper.js) | MIT | ~50–100 KB | ~1,500–2,000 lines | Vector focus misaligned with pin/region task; thin annotation community |
| [SVG.js](https://github.com/svgdotjs/svg.js) | MIT | 2.64 MB | n/a | Out — bundle size disqualifying |
| [Pixi.js](https://github.com/pixijs/pixijs) | MIT | ~200+ KB | ~1,200–1,600 lines | Out — WebGL is the wrong abstraction; event handling too low-level |

Konva-based composition is the credible escape hatch for v2 IF Annotorious
plugin API proves insufficient for SVG element-selector anchors (Phase 11
concern). For v1, the compositional path is **not** competitive — 0 LOC
adopting Annotorious vs. ~1,000 LOC building on Konva, and the upstream
maintains touch + undo/redo + a11y handles for free.

**Hosted SaaS / web services (the operator's explicit prompt — none
adoptable as v1 runtime, with one conditional exception):**

| Service | API surface | Data residency | W3C aligned? | Disposition |
|---|---|---|---|---|
| [Hypothes.is](https://web.hypothes.is/) | Public REST at `https://hypothes.is/api/` | Their cloud (or self-host `h`: Postgres + Elasticsearch + Docker) | Yes — canonical W3C reference implementation | **Conditional — only SaaS worth serious consideration** as an *optional* sync backend. Filesystem-native sidecars remain primary; an adapter could mirror them to Hypothes.is for adopters opting in. Out for v1 — engineering cost of the adapter is not justified by current scope. |
| [BugHerd](https://bugherd.com/) | Private (task CRUD; no annotation read API) | Their cloud | No | Out — closed appliance; no API to sync annotations into deskwork's filesystem model. Inform-only for UX patterns (element-click-comment gesture). |
| [Marker.io](https://marker.io/) | No public API | Their cloud (AWS Ireland) | No | Out — closed widget; artifact uploaded to their servers. Inform-only for screenshot-markup toolbar UX. |
| [Pastel](https://usepastel.com/) | No public API | Mixed (proxy approach unclear) | No | Out — closed platform; no API. Inform-only for graduated comment lifecycle UX. |
| [Frame.io](https://frame.io/) (Adobe) | Public REST | Their cloud (artifacts uploaded) | No (custom format) | Out — video-primary; no embed widget for local content; vendor lock-in |
| [InVision Freehand](https://www.invisionapp.com/) | — | — | — | **Deprecated January 2025** (acquired by Miro) — not an option |
| [Penpot Cloud](https://penpot.app/) | Public (design-data CRUD) | Their cloud | No | Out — design-object scope (frames / components); not artifact annotation |
| [Loom](https://loom.com/) | — | Their cloud | No | Out — video-centric; static artifact annotation is not the primary use case |
| PageProofer / Userback / GoVisually / ReviewStudio / Markup.io / Atarim | None public | Their cloud | No | All out — same closed-appliance pattern as BugHerd / Marker.io |

### Architectural fork the SaaS survey surfaces

Three v1 architectures are possible. The operator's call (2026-05-26)
selected **Architecture A**.

| Architecture | Storage | Cloud dependency | Engineering cost | Status |
|---|---|---|---|---|
| **A. Filesystem-native** (current design) | Annotorious + local W3C JSON sidecars | None | Owned by deskwork; minimal (Annotorious does the heavy lifting) | **Selected for v1** |
| **B. Optional Hypothes.is sync backend** | Local sidecars (primary) + optional adapter to Hypothes.is REST | Hypothes.is cloud (or self-host the `h` stack) | Adapter layer (~300 LOC + sync semantics) | Out for v1 — revisit if multi-operator real-time review surfaces as a v2 need |
| **C. SaaS-primary** (deskwork as thin UI on a hosted backend) | SaaS-only (BugHerd / Marker.io / Pastel class) | Required | Lower for deskwork, higher for the operator's data residency story | Rejected — breaks the filesystem-native ethos central to deskwork's design |

The operator's preference for "the simplest thing": Architecture A is the
v1 deliverable. Architectures B and C are documented here so a future
operator (or a v2 scoping conversation) can revisit them with the full
context of why v1 didn't go that direction, rather than re-deriving the
trade-offs.

### Integration cost — measured

Spike location: [`spikes/graphical-review/annotorious-image/`](../../../../spikes/graphical-review/annotorious-image/).

| Dimension | Measurement | Notes |
|---|---|---|
| **Glue-code LOC (annotation integration)** | **158 lines** | `src/spike.js` — initializes annotator, wires W3CImageFormat adapter, listens to lifecycle events, renders payload, wires toolbar / download / Escape-cancel. Counts all imports + error handling + browser-console handle. |
| **Glue-code LOC (full spike incl. chrome)** | 403 lines total | Adds 148 lines CSS (none of it Annotorious overrides — see below), 57 lines HTML, 40 lines SVG fixture. |
| **Resolved Annotorious version** | **3.8.2** | `package.json` declares `^3.4.0`; npm resolves to 3.8.2 (released after the candidates-matrix cutoff). |
| **Annotorious + production deps disk size** | **~2.6 MB unpacked** | `node_modules/@annotorious` (2.2 MB) + dequal (48 K) + rbush (60 K) + simplify-js (20 K) + uuid (304 K) + nanoevents / nanoid / nanostores / quickselect (~20 K combined). |
| **Production dependency count** | **11 packages total** | Annotorious + 10 transitive. Verified via `npm ls --all --omit=dev --parseable \| wc -l`. |
| **Dev tooling footprint (Vite, not shipped)** | adds Vite v5.4.21 + transitive | Brings the total `node_modules/` for the spike to 21 MB / 21 packages. Vite is spike-only; production integration in `packages/studio/` uses the studio's existing esbuild pass and would not add Vite. |
| **Theming overrides required** | **0 (zero)** | The spike imports `@annotorious/annotorious/annotorious.css` as-is. The custom CSS in `src/styles.css` styles only the surrounding page chrome (masthead, payload pane, toolbar) — none of it overrides any `.a9s-*` class. Annotorious's defaults are usable out of the box; runtime theming is achievable via `setTheme('light' \| 'dark' \| 'auto')` and `setStyle(...)` for dynamic per-annotation fill/stroke. |
| **Mobile / touch support** | **verified hands-on** at iPhone 13 viewport via Playwright (`scripts/verify.mjs`) | Drawing a rectangle via simulated drag at 390×844 emits the same W3C payload shape as desktop (with fractional pixels — devicePixelRatio normalization). Annotorious renders extra `.a9s-touch-handle` and `.a9s-touch-halo` elements specifically on touch contexts — concrete evidence of a touch-aware code path. Real-device touch validation is a follow-on; Playwright's mouse-event emulation against a phone viewport is a smoke check, not a substitute. |
| **Accessibility — keyboard** | **partial — host must extend** | The SVG annotation layer has `role="application"` and `tabindex="0"` (focusable). The `Escape` keyboard shortcut to cancel an in-progress drawing is documented and works. BUT: individual annotation `<g>` elements have NO `tabindex`, NO `role`, NO `aria-label` — they are not in the tab order. A keyboard user can focus the canvas but cannot Tab between drawn annotations, and there is no out-of-the-box keyboard mechanism to create an annotation (drawing requires pointer events). The host application would need to add: (a) `tabindex` + `role="button"` + `aria-label` to rendered annotation nodes via a custom renderer or DOM post-processing; (b) arrow-key or shortcut handlers for keyboard-only region pinning. |
| **Accessibility — screen reader** | **inadequate out of the box** | Per the DOM snapshot at desktop (27 a9s-nodes) and mobile (32 a9s-nodes), **no** annotation node carries `aria-label` or `aria-describedby`. The annotation body's text would need to be surfaced into an `aria-label` by the host integrator. Annotorious handles (corner, edge, rotation) carry `role="button"` and `tabindex="0"` BUT lack `aria-label` — a screen reader announces "button" with no context. |

Operator-perceivable summary: **out of the box, the spike is mouse-and-touch first; keyboard and screen-reader accessibility require host-side scaffolding.** This is a known shape for canvas-style annotation libraries and matches what Recogito Studio / Hypothes.is also leave to the host. Adopters who need WCAG-AA-grade keyboard-only operation will need to budget the extra work; the v1 deliverable should at minimum surface the annotation list as a parallel ARIA-friendly DOM tree adjacent to the SVG overlay.

### W3C alignment — actual emitted payload

Sample payload from the spike (desktop, rectangle pinned at
xywh=200,150,120,90 against the fixture image):

```json
{
  "id": "b686c23a-1bfa-451c-9a6a-d1f02953c92e",
  "target": {
    "source": "urn:deskwork-spike:fixture.svg",
    "type": "SpecificResource",
    "selector": {
      "type": "FragmentSelector",
      "conformsTo": "http://www.w3.org/TR/media-frags/",
      "value": "xywh=pixel:200,150,120,90"
    }
  },
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "type": "Annotation",
  "body": [],
  "created": "2026-05-26T03:15:12.378Z",
  "creator": {
    "isGuest": true,
    "id": "V0iggItb3qmbszG5rdSW"
  }
}
```

**Conformance to W3C Web Annotation Data Model** (per [the spec](https://www.w3.org/TR/annotation-model/)):

- `@context` is the canonical W3C JSON-LD context. ✓
- `type: "Annotation"` is the canonical root type. ✓
- `target.type: "SpecificResource"` and `target.selector` with
  `FragmentSelector` + `conformsTo: media-frags` + `xywh=pixel:...`
  value is the W3C-spec-canonical way to address a pixel region on a
  raster image. ✓
- `body: []` because the spike pins a region but doesn't bind a
  comment body. The host application supplies the body (text /
  TextualBody / reply-motivation chain). The shape is W3C-compatible
  the moment the host populates it. ✓
- `creator.isGuest: true` is an Annotorious-specific convenience for
  unauthenticated sessions — NOT in the W3C spec, but harmless as an
  unknown property under JSON-LD's open-vocabulary rules. The host can
  strip or remap it on persistence.
- Polygon annotations (verified via the candidate matrix's claim, not
  re-tested in this measurement run — the rectangle path is the
  representative case) emit `SvgSelector` per Annotorious's
  documented behavior; same W3C-canonical shape with the polygon as
  inline SVG.

**Divergences from the W3C spec the matrix flagged** (Annotorious uses
direct coordinates internally for performance, per matrix row 1):
the spike confirms the matrix — Annotorious's internal `ImageAnnotation`
model uses `target.selector.geometry: { x, y, w, h }` (verified by
inspecting `window.__spike.anno.getAnnotations()` without an adapter
during early exploration). The `W3CImageFormat` adapter serializes that
internal form to / from the W3C JSON-LD shape on every lifecycle event
and on `getAnnotations()`. This is the matrix's "explicit
W3C-crosswalk utility" — the spike validates that it works correctly
on both create and read paths.

### v1 scope recommendation

**Adopt Annotorious with the `W3CImageFormat` adapter, as-is.** Reasoning:

1. The adapter delivers W3C-shaped JSON-LD on every lifecycle event
   and on read — the production-side comment-persistence code can
   treat Annotorious as a black-box source of W3C annotations and
   never has to know about the internal `geometry` form.
2. Zero theming overrides were required to get a usable rendering —
   `setTheme(...)` and `setStyle(...)` handle the runtime customization
   path the studio needs for state-coloured pins.
3. The touch code path is real (not a polyfill) — mobile review is
   viable at v1 for image pins.
4. The accessibility gap is a host-app concern, not an Annotorious
   defect — every comparable annotation library leaves keyboard
   navigation to the host. The studio already has the ARIA-aware
   marginalia pattern (per project rules) and can reuse it as the
   parallel-DOM accessibility surface.
5. Library-of-one risk is acceptable for v1 — Annotorious has been
   under continuous maintenance since 2015, BSD-3 licence, and the
   internal model is shallow enough that a fallback path (build atop
   Konva or a hand-rolled SVG overlay) is a clear v2 escape if the
   project goes dormant.

**Do NOT fork.** The `W3CImageFormat` adapter is the integration seam
the project already designed; the studio's per-state colour theming
flows through the documented `setStyle(...)` API; the touch path is
maintained upstream. Forking would inherit maintenance cost without
clear short-term gain.

**Open questions for Task 1.5 (threading) and Task 1.6 (final
decision-doc):**

- Where to bind the comment-body text and the reply chain to the
  W3C `body` array — likely `{ type: 'TextualBody', value: '...',
  purpose: 'commenting' }` for the parent comment and `motivation:
  'replying'` for replies, per W3C § 3.2.7.
- Whether to persist the `creator.isGuest` flag or strip it on
  ingest. Recommended: strip and re-attach the deskwork
  user/identity at persist time, so the on-disk payload is
  schema-clean.
- Accessibility scaffolding pattern: a parallel ARIA-friendly DOM
  surface adjacent to the SVG overlay, mirroring each annotation as
  a focusable element with `aria-label` populated from the body.
  Track as a v1 acceptance criterion in Phase 6+ (review surface).

## HTML annotation spike (Task 1.3)

### Candidates considered + why narrowed to one

The candidates matrix lists four projects under "HTML / single-file-HTML
/ DOM annotation," plus the data-model row. After operator-confirmed
Architecture A (filesystem-native, no cloud, no DB) extends to the HTML
concern, only one OSS library is viable.

| Candidate | Disposition | Reason |
|---|---|---|
| **`@recogito/text-annotator`** ([repo](https://github.com/recogito/text-annotator), v4.1.1 at install time) | **Spiked** | BSD-3, library-only, takes a host-supplied DOM container, W3C-aligned data model, same team as Annotorious. Only candidate that fits the "drop into the studio as a runtime dependency" shape AND satisfies Architecture A's no-cloud / no-DB constraint. |
| Hypothes.is client | **Out — operator constraint 2026-05-26** | Three sub-options were all rejected: (a) hosted — data leaves disk (cloud); (b) self-host the `h` stack — Postgres + Elasticsearch + Docker (DB); (c) build a fake-`h` API adapter — the client still assumes a service contract (architectural mismatch). Absent the constraint, Hypothes.is would have been the canonical W3C reference implementation choice; with the constraint it is structurally incompatible. Documented for posterity in the audit trail. |
| `recogito-js` | **Out — archived** | Repo deprecated 2023-12 (per candidates.md row 4). Superseded by `@recogito/text-annotator`. |
| W3C Web Annotation Data Model | n/a (spec) | The spec is the data-model contract Task 1.5 picks up. Confirmed compatible with the spike's emitted payload — see § "W3C alignment" below. |

This is a **library-of-one** finding for HTML annotation. Same shape as
the image-annotation library-of-one finding for Task 1.2: a future
maintainership change at `@recogito/text-annotator` has no in-kind
embeddable alternative; the fallback path is "build the DOM-selector
layer ourselves entirely" (the spike already builds part of this layer
— see § "Anchor model" below). This is a known v2 risk surface; for v1
the library is a credible adoption.

### Survey widened (operator-confirmed Architecture A applies to HTML)

The Task 1.2 survey-widening exercise (operator pushback 2026-05-26 →
three parallel research agents) enumerated additional OSS libraries
and the hosted-SaaS landscape. The same conclusions apply transitively
to HTML annotation:

- **Hand-rolled DOM-selector annotator** is the credible v2 escape
  hatch IF `@recogito/text-annotator` proves insufficient. The spike
  already implements the DOM-selector layer as a 215-LOC module
  (`src/dom-anchor.js`) — Phase 10's HTML review surface can lift this
  layer directly or extend it.
- **Konva-as-primitive** (Task 1.2 widening) is NOT useful for HTML
  annotation. HTML pinning is selector-based, not coordinate-based;
  Konva's canvas hit-testing is the wrong abstraction. Disposition
  documented here so future readers don't re-evaluate.
- **Hosted SaaS** (BugHerd / Marker.io / Pastel / etc.) — all rejected
  under Architecture A, same as the image-annotation rejection. Inform-
  only on UX patterns.

### Architectural fork confirmed

Architecture A (filesystem-native, no cloud) applies to HTML annotation
the same as to image annotation. Architectures B (Hypothes.is sync) and
C (SaaS-primary) are documented in the image section above; both
remain rejected for v1.

### Integration cost — measured

Spike location: [`spikes/graphical-review/text-annotator-html/`](../../../../spikes/graphical-review/text-annotator-html/).

| Dimension | Measurement | Notes |
|---|---|---|
| **Glue-code LOC (annotation integration)** | **484 lines** | `src/spike.js` (226) + `src/iframe-annotator.js` (43) + `src/dom-anchor.js` (215). The dom-anchor module is the hand-rolled DOM-selector layer the library doesn't ship — see § "Anchor model" for why this exists. |
| **Glue-code LOC (full spike incl. chrome)** | 1,721 lines total | Adds host + fixture CSS (314 lines), host + fixture HTML (162 lines), three probe scripts (761 lines combined). The probes are pure spec-compliance + anchor-resilience verification; they don't ship to production. |
| **Resolved `@recogito/text-annotator` version** | **4.1.1** | `package.json` declares `^4.1.1`; resolves identically. |
| **Production dependency count** | **14 packages total** | `@recogito/text-annotator` + 13 transitive (`@annotorious/core`, `colord`, `debounce`, `dequal`, `hotkeys-js`, `nanoevents`, `nanoid`, `nanostores`, `poll`, `quickselect`, `rbush`, `uuid`). Verified via `npm ls --all --omit=dev --parseable \| wc -l`. |
| **Library + production deps disk size** | **~6.4 MB unpacked** | `@recogito/text-annotator` (688K) + `@annotorious/core` (392K) + `hotkeys-js` (**4.4 MB unpacked** — surprising; the library's hotkey handling is a meaningful chunk of the install) + transitive (~900K combined). |
| **Dev tooling footprint (Vite, not shipped)** | adds Vite v5 + transitive | Brings total `node_modules/` for the spike to 42 MB. Vite is spike-only; production integration in `packages/studio/` uses the studio's existing esbuild pass. |
| **Theming overrides required** | **0 (zero)** | The spike imports `@recogito/text-annotator/text-annotator.css` as-is. The custom CSS in `src/styles.css` styles only the surrounding page chrome (masthead, payload pane, toolbar) — none of it overrides any `.r6o-*` class. Library defaults render usable highlights out of the box. |
| **Mobile / touch support** | **verified hands-on** at iPhone 13 viewport via Playwright (`scripts/verify.mjs`) | DOM-region pins (the spike's own click handler) work identically on touch and pointer contexts. Text-range pins require the library's selection-driven path — Playwright's synthetic events did not finalize selections on either viewport, so the probe falls back to the library's imperative `addAnnotation(...)` API for the text-range path. Real-device touch validation of text-range selection is a follow-on; the imperative path is what deskwork's production review surface will likely call anyway (annotations restored from disk go through the same imperative entry point). |
| **Accessibility — keyboard** | **partial — host must extend** | The iframe body carries `class="r6o-annotatable"` + `tabindex="-1"` (container-level mark for keyboard-event capture, NOT per-annotation tab order). Per-annotation overlay spans (`.r6o-annotation`) have NO `tabindex`, NO `role`, NO `aria-label` — keyboard users cannot Tab between annotations. Tab from the iframe body lands on the next interactive content element (e.g. the `<button>` chrome), bypassing all highlights. |
| **Accessibility — screen reader** | **inadequate out of the box** | Per the DOM snapshot, `.r6o-annotation` overlay spans have no `aria-label` / `aria-describedby`. The annotation body text would need to be surfaced into an `aria-label` by the host integrator, or via a parallel ARIA-friendly DOM tree adjacent to the highlights. Same shape as Annotorious's accessibility gap; same host-side scaffolding pattern is the answer. |

Operator-perceivable summary: **library handles text-range pinning with
W3C-canonical output and minimal CSS; non-text DOM regions need a
hand-rolled layer (the spike's `src/dom-anchor.js`); keyboard / SR
accessibility require host-side scaffolding (parity with Annotorious).**

### Library gotcha — cross-iframe document realm

`@recogito/text-annotator` attaches its selection listeners to the JS
realm's `document` (not the container's `ownerDocument`). Running the
library in the HOST page against an iframe's `body` does NOT capture
selections inside the iframe — selection events fire on the iframe
document, but the library listens on the host document. The spike
demonstrates the workaround: load `src/iframe-annotator.js` as a module
inside the iframe document (same-origin via Vite), creating a second
annotator instance in the iframe's own JS realm. Annotations from the
iframe are exposed to the host via direct `window.parent.__spike.*`
assignment.

This is load-bearing for v1 architecture because deskwork's HTML review
surface intends to sandbox the mockup in an iframe. Two options for the
production design:

1. **Inject the library bundle into the iframe at load time.** Same-origin
   iframe with a module-script tag pointing at the library's ESM build.
   The host page communicates with the iframe instance via
   `window.parent` (when same-origin) or `postMessage` (when sandboxed).
2. **Render the mockup inline in the host page** (no iframe) and sacrifice
   sandbox isolation. Simpler integration but breaks the "sandboxed
   user-supplied HTML" goal.

The spike adopts (1) and documents the trade-off here. Phase 10's HTML
review surface implementation will need to decide between (1) — adopt
the iframe-injection pattern — and (2) — accept that user-supplied HTML
runs in the studio's JS realm. (1) is the safer default.

### Anchor model — measured

Critical section. The spike layers **three anchoring selectors** for
non-text DOM regions (matching the workplan's "DOM selector + text-
snippet + pixel-offset fallback" framing):

1. **`CssSelector`** — primary anchor. Prefers `#id`; falls back to a
   path of `tagName + nth-of-type` (class names included up to 2 per
   step). Resolves via `document.querySelector`.
2. **`TextQuoteSelector`** — fallback 1. Skipped when the element has
   no text content (e.g. decorative empty `<div>`). On resolve, the
   resolver walks the document and finds the first element whose
   `textContent.trim()` starts with or equals the quote.
3. **`FragmentSelector`** with `xywh=pixel:x,y,w,h` — fallback 2.
   Last-resort spatial anchor. On resolve, the resolver returns the
   topmost element at the bounding-box centre via `elementFromPoint`.

The resolver applies the same precedence on read. Each fallback that
fires is reported via `resolveDomAnnotation(doc, ann).resolvedVia`
(values: `'css'`, `'quote'`, `'fragment'`, or `null`).

#### `@recogito/text-annotator` covers what?

**Yes — for text-range pins.** Drag-selecting text inside the (iframe-
context) container produces a `TextQuoteSelector + TextPositionSelector`
payload matching the W3C spec verbatim.

**No — for non-text DOM regions.** The library cannot pin to an icon
button with no inner text, an `<img>` element, or an empty decorative
`<div>`. There is no API surface for "pin this Element." This is not a
library defect — it's a text-range annotator's intentional scope. The
gap is real; the spike's hand-rolled DOM-selector layer is what fills it.

#### Anchor-resilience results (Step 1.3.3)

The `anchor-resilience.mjs` probe pins three regions, then mutates the
iframe DOM and verifies the resolver chain. Results:

| Mutation | Annotation | Resolver outcome | Note |
|---|---|---|---|
| (baseline, no mutation) | `#page-title` | resolves via `css` | All three CssSelectors hit. |
| (baseline) | `#thumb-hero` | resolves via `css` | |
| (baseline) | `#decorative-rule` | resolves via `css` | |
| Rename `#page-title` → `#page-title-renamed` | `#page-title` | **falls back to `quote`** | CssSelector broken; TextQuoteSelector finds the renamed element by its unchanged text content. |
| Insert sibling `<h2>` before published-lane heading | `#thumb-hero` | resolves via `css` | id-based CssSelectors survive sibling shifts. |
| Rename `#decorative-rule`'s class | `#decorative-rule` | resolves via `css` | id-based CssSelectors survive class renames. |
| Total teardown: rename id + change text content | `#page-title` (already renamed) | **falls back to `fragment`** | Both CSS and TextQuote broken; FragmentSelector pixel-offset returns the topmost element at the original coordinates. Resolution is "graceful" — it finds *some* element (may not be the original target if layout reflowed). |

**The fallback chain works.** The probe verifies that each layer is
exercised when the layer above breaks. The third-layer FragmentSelector
fallback returns "some element at the original coordinates" — useful as
a "stale anchor" warning surface for the operator, NOT a reliable
re-anchor. Phase 10's HTML review surface will need a UI affordance
for "this anchor is stale, please re-pin."

### W3C alignment — actual emitted payload

#### Text-range pin (library output — `W3CTextFormat` adapter)

```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "id": "8bbcbfb5-d726-44ec-b9e5-46dbe4d59855",
  "type": "Annotation",
  "body": [],
  "creator": {
    "isGuest": true,
    "id": "EwniRYdKWK9foKZLyt4A"
  },
  "created": "2026-05-27T04:42:05.357Z",
  "modified": "2026-05-27T04:42:05.408Z",
  "target": [
    {
      "annotation": "8bbcbfb5-d726-44ec-b9e5-46dbe4d59855",
      "source": "urn:deskwork-spike:fixture-html-mockup",
      "selector": [
        {
          "type": "TextQuoteSelector",
          "exact": "\n          The drafting stage is where the body of the entry",
          "prefix": "g\n        ",
          "suffix": " takes sha"
        },
        {
          "type": "TextPositionSelector",
          "start": 262,
          "end": 322
        }
      ]
    }
  ]
}
```

#### DOM-region pin (spike's hand-rolled layer)

```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "id": "urn:uuid:b76e65c2-9989-4ea2-bce0-5e1cdb91f71e",
  "type": "Annotation",
  "body": [],
  "target": {
    "source": "urn:deskwork-spike:fixture-html-mockup",
    "type": "SpecificResource",
    "selector": [
      { "type": "CssSelector", "value": "#action-help" },
      { "type": "TextQuoteSelector", "exact": "?" },
      {
        "type": "FragmentSelector",
        "conformsTo": "http://www.w3.org/TR/media-frags/",
        "value": "xywh=pixel:151,84,36,36"
      }
    ]
  },
  "created": "2026-05-27T04:42:05.833Z"
}
```

#### Conformance to W3C Web Annotation Data Model

- `@context` is the canonical W3C JSON-LD context. ✓
- `type: "Annotation"` is the canonical root type. ✓
- For text-range pins: `TextQuoteSelector` (exact / prefix / suffix) +
  `TextPositionSelector` (start / end) are the W3C-spec-canonical text
  anchors (§ 4.2.5, § 4.2.6). ✓
- For DOM-region pins: `CssSelector` (§ 4.2.1) + `TextQuoteSelector`
  + `FragmentSelector` with `conformsTo: media-frags` are the
  spec-canonical DOM and pixel-region anchors. ✓
- `body: []` because the spike pins without binding a comment body.
  The host application supplies the body (text / TextualBody /
  reply-motivation chain). The shape is W3C-compatible the moment
  the host populates it. ✓
- **Divergences:** text-range payload's `target` is wrapped in an array
  (`target: [...]`) while DOM-region payload uses `target: {...}`. The
  W3C spec permits both (§ 3.2.1 — target may be a single resource or
  an array). The host's persistence code must accept either shape.
  Also, text-range payload has the library's internal `target.annotation`
  back-pointer field — harmless under JSON-LD's open-vocabulary rules
  but the host can strip it on persist.
- `creator.isGuest: true` is the library's convenience for
  unauthenticated sessions, same as Annotorious's image-annotation
  output. Strip and re-attach at persist time per the Task 1.2 finding.

### v1 scope recommendation

**Adopt `@recogito/text-annotator` with the `W3CTextFormat` adapter for
text-range pins, AND ship a thin DOM-selector layer for non-text
regions.** Reasoning:

1. The library covers text-range pinning with W3C-canonical output
   (TextQuoteSelector + TextPositionSelector). Spec verified in this
   spike's probe assertions.
2. The library cannot pin to non-text DOM regions; this is a real and
   load-bearing gap for deskwork's HTML-mockup review (icon buttons,
   images, decorative regions are all common review targets). The
   spike's `src/dom-anchor.js` demonstrates ~215 LOC fills the gap
   with a W3C-compatible CssSelector + TextQuote fallback +
   FragmentSelector pixel-offset chain.
3. The iframe document-realm gotcha is solvable via in-iframe library
   injection (the spike's pattern). Phase 10 lifts that pattern.
4. Zero theming overrides needed; mobile/touch path works for DOM-region
   pins; text-range mobile selection has the same Playwright-vs-reality
   gap as Task 1.2 — requires real-device validation in Phase 10.
5. Accessibility scaffolding is host-side, same shape as Task 1.2's
   image-annotation a11y story. Reuse the parallel-DOM ARIA pattern.
6. Library-of-one risk is acceptable for v1; if `@recogito/text-annotator`
   goes dormant, lifting the spike's DOM-selector layer fully (i.e.
   building a text-range layer on top of `Range` + `Selection` directly,
   another ~200-400 LOC) is a clear v2 escape.

**The DOM-selector layer is Phase 10 scope, NOT Task 1.3 scope.** Task 1.3's
deliverable is the spike that demonstrates the gap and the shape of the
solution. The production-ready DOM-selector layer (with resolver UX for
stale anchors, the parallel-ARIA surface, persistence semantics, etc.)
lands in Phase 10 — operator confirms at Task 1.6's decision-doc gate.
The spike's 215-LOC module is a credible starting point; the production
module will likely be larger (TypeScript types, error handling for edge
cases the spike doesn't test, the stale-anchor UI affordance).

**Do NOT fork `@recogito/text-annotator`.** The `W3CTextFormat` adapter
delivers the integration seam deskwork needs. The library's API is
stable enough that wrapping is preferable to forking; the DOM-selector
layer is a sibling module, not a fork.

### Open questions

- **Iframe boundary policy.** The spike same-origins host + iframe so
  `window.parent` direct access works. Production may need cross-origin
  isolation for sandbox reasons; the iframe-side annotator pattern
  generalizes via `postMessage`. Decision belongs to Phase 10.
- **Stale-anchor UX.** When the FragmentSelector pixel-offset fallback
  fires, the operator needs a visible "this anchor is stale, last seen
  at coordinates X,Y" affordance. Phase 10 UX concern.
- **Library lifecycle on iframe reload.** When the host re-renders the
  iframe (mockup updated), the iframe-side annotator needs to be
  re-created and existing annotations re-applied. The spike does NOT
  test this lifecycle — Phase 10 acceptance criterion.
- **Custom Highlight API path.** The library may render via the
  browser's CSS Custom Highlight API instead of overlay spans on newer
  browsers (the a11y probe noted `CSS.highlights` is available). Both
  rendering paths share the same W3C output but the DOM inspection
  differs. The probe's a11y assertions handle both paths; production
  code shouldn't depend on overlay-span presence.
