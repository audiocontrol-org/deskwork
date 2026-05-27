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
| Screenshot capture + markup spike | DONE — see below | 1.4 |
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
| **Mobile / touch support** | **verified hands-on** at iPhone 13 viewport via Playwright (`scripts/verify.mjs`) | DOM-region pins (the spike's own click handler) work identically on touch and pointer contexts. Text-range pins via the library's event-driven path also work under Playwright's synthetic-event emulation — the probe's `pinTextRangeInIframe` helper synthesizes pointerdown / selectstart / selectionchange / pointerup sequence inside the iframe document; `addAnnotation` fires from the library's own listener. (Earlier drafts of this finding claimed the imperative-API fallback was load-bearing; the I-5 assertion landed in the Task 1.3 review revision falsified that claim by asserting `usedFallback === false`. The imperative-API fallback is retained as a guardrail in case a future Playwright or library change breaks the synthetic-event path.) Real-device touch validation of text-range selection is still a follow-on — Playwright's emulation is not a substitute for a real touchscreen. |
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

The `anchor-resilience.mjs` probe pins four regions (three id-anchored
plus one nth-of-type-anchored — a `<p>` inside the drafting lane), then
mutates the iframe DOM and verifies the resolver chain. Results:

| Mutation | Annotation | Resolver outcome | Note |
|---|---|---|---|
| (baseline, no mutation) | `#page-title` | resolves via `css` | All four CssSelectors hit. |
| (baseline) | `#thumb-hero` | resolves via `css` | |
| (baseline) | `#decorative-rule` | resolves via `css` | |
| (baseline) | drafting-lane `<p>` (nth-of-type selector) | resolves via `css` | Path-based selector resolves correctly when sibling order is unchanged. |
| Rename `#page-title` → `#page-title-renamed` | `#page-title` | **falls back to `quote`** | CssSelector broken; TextQuote lands on the deepest matching element (the renamed `<h1>`), not on `<body>` or `<main>` even though their `textContent` also starts with the quoted text. The resolver's deepest-match preference is what makes this finding hold. |
| Insert sibling `<h2>` before published-lane heading | `#thumb-hero` | resolves via `css` | id-based CssSelectors survive sibling shifts. |
| Rename `#decorative-rule`'s class | `#decorative-rule` | resolves via `css` | id-based CssSelectors survive class renames. |
| **Pure-reorder of same-tag siblings** (swap drafting & published sections) | drafting `<p>` (nth-of-type) | **silently mis-targets via `css`** | nth-of-type CSS selector remains a *valid* query — it just resolves to a different element (the new first section's `<p>`, which is now the published lane). The resolver does NOT cross-check the resolved element against the TextQuoteSelector, so the mis-target is silent: `resolvedVia === 'css'` (not `quote`) and the wrong element is returned. **This is a real failure mode the spike surfaces.** Phase 10's production resolver MUST add a verification step: after CSS resolves, check `element.textContent.trim().slice(0, 80)` against the TextQuoteSelector's `exact` value; if mismatch, fall through to TextQuote search. |
| Total teardown: rename id + change text content | `#page-title` (already renamed) | **falls back to `fragment`** | Both CSS and TextQuote broken; FragmentSelector pixel-offset returns the topmost element at the original coordinates AND the recorded bbox center remains within the iframe viewport (spatial marker is meaningful). Resolution is "graceful" — it finds *some* element (may not be the original target if layout reflowed). |

**11 spec-derived runtime assertions, all pass.** The probe verifies that
each layer is exercised when the layer above breaks. The third-layer
FragmentSelector fallback returns "some element at the original
coordinates" — useful as a "stale anchor" warning surface for the
operator, NOT a reliable re-anchor. Phase 10's HTML review surface
will need a UI affordance for "this anchor is stale, please re-pin."

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

- **Iframe-annotator injection mechanism.** The spike's iframe HTML loads
  `/src/iframe-annotator.js` via an absolute path that only resolves
  because Vite serves the project root. Production code in
  `packages/studio/` will NOT have Vite at runtime. Phase 10 needs to
  spec the injection mechanism — build-time inline of the iframe
  annotator into the iframe HTML; serve the annotator from a stable
  studio-served URL; blob-URL injection by the host; or `postMessage`
  with a host-side fallback. The spike does NOT solve this; it surfaces
  the constraint.
- **CSS-resolver cross-check against TextQuote.** The spike's resolver
  accepts whatever `doc.querySelector(cssSelector)` returns without
  verifying that the resolved element's textContent matches the
  TextQuoteSelector. The anchor-resilience probe's pure-reorder case
  surfaces this: nth-of-type selectors silently mis-target after sibling
  reorder. Phase 10's resolver must add a verification step (compare
  `element.textContent.trim().slice(0, 80)` against the TextQuote
  `exact` value; on mismatch, fall through to TextQuote search). Without
  it, "the operator's pin landed on the wrong element after a mockup
  edit" is a UX bug the spike has already named.
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

## Screenshot capture + markup spike (Task 1.4)

Three sub-spikes, each focused on one mechanism. All three are
library-only / filesystem-native per Architecture A — captures stay
in-memory, exports are PNG data URLs downloaded via Blob URL, no uploads
to any external service.

### Sub-spike 1: `getDisplayMedia()` capture

Spike location: [`spikes/graphical-review/capture-getdisplaymedia/`](../../../../spikes/graphical-review/capture-getdisplaymedia/).

The browser's Screen Capture API. Operator clicks "Capture screen" → OS
chooser opens → operator picks tab / window / screen → spike grabs one
frame from the resulting MediaStream into a `<canvas>`, immediately
stops the stream's tracks (clears the browser's "is being shared"
indicator), renders the frame, offers PNG download.

**Browser support (per caniuse + the spike's runtime probe):**

| Browser | Desktop support | Mobile support | Notes |
|---|---|---|---|
| Chromium / Chrome | Yes (since 72) | No (Android Chrome lacks `getDisplayMedia`) | Native dialog selects tab / window / screen. The spike's headless probe sees `apiAvailable === true` but the call rejects with `NotSupportedError` because headless cannot satisfy user-activation. |
| Firefox | Yes (since 66) | No | Same dialog UX. |
| Safari | Yes (since 13) | No (iOS Safari does not implement the API) | Safari's chooser is OS-level. Permission scope is per-tab. |
| Headless Chromium (Playwright default) | Reports API available; rejects with `NotSupportedError: Not supported` at call time | n/a | Documented honestly; the spike's verify probe asserts the rejection path. |

**Permission-prompt UX cost:** every capture surfaces a fresh OS-level
permission prompt — there is no "remember this choice for this site"
affordance equivalent to camera / microphone permissions. Each capture
re-prompts. This is the central UX cost: a review workflow that captures
N regions of a mockup costs N prompts. For an operator marking up a
single full-window screenshot the cost is one prompt; for repeated
captures the friction compounds.

**Resolution / fidelity:** the captured frame is at the source's native
resolution (e.g. retina displays capture at devicePixelRatio-adjusted
resolution). The spike captures `video.videoWidth × video.videoHeight`
without scaling; the result is a faithful pixel-for-pixel render of the
source area.

**What you can capture:** the operator chooses at prompt time — entire
screen (multi-monitor: one screen at a time), a window (any visible
top-level window — including non-browser windows), or a tab (rendered
content of any open browser tab). The choice is exposed at the OS-prompt
level; the spike cannot pre-select.

**Integration cost:**

| Dimension | Measurement | Notes |
|---|---|---|
| Glue-code LOC | **219 lines** | `src/spike.js` — element wiring + capture flow + state machine + error handling. |
| Spike total LOC | 761 lines | Adds 120 CSS + 53 HTML + 270 probe + 99 README. |
| Production deps | **0** | Pure browser API. No npm package needed. |
| Production deps disk size | **0** | The spike's `node_modules/` (35 MB / 34 packages) is entirely devDependencies (Vite + Playwright). |

**Probe assertion summary (all PASS):**

```
=== summary ===
All assertions passed.   (28 assertions across initial DOM,
                          API-availability, headless capture rejection,
                          post-capture wiring, clear lifecycle)
```

**v1 recommendation:** keep `getDisplayMedia` as a **secondary** capture
path, NOT the primary. Use it specifically for cases the DOM-to-canvas
path can't render (WebGL contexts, video frames, OS-level chrome the
mockup includes, anything outside the studio's DOM tree). The
per-capture permission prompt is a real friction surface that
disqualifies it as the default; the DOM-to-canvas path (Sub-spike 2)
runs with zero prompts.

The spike's automated probe cannot simulate the OS permission prompt;
manual cross-browser validation is documented in the README. The
findings here trust caniuse + MDN for the cross-browser claims and the
spike's runtime measurements for the headless / programmatic behaviour.

### Sub-spike 2: DOM-to-canvas (`html-to-image`)

Spike location: [`spikes/graphical-review/capture-dom-to-canvas/`](../../../../spikes/graphical-review/capture-dom-to-canvas/).

`html-to-image` v1.11.13 — MIT, zero runtime dependencies, last release
2025-02. The matrix flagged this as the 2025/2026 consensus successor
to `html2canvas` (which is effectively unmaintained — no release since
2022-01, 975+ open issues). This spike validates the matrix claim.

**Why `html-to-image` over `html2canvas`** (per the candidates matrix
§ "Screenshot capture (DOM → image)"): `html2canvas` has not shipped a
release since January 2022, carries ~975 open issues, and the README
still labels it "experimental." `html-to-image` is the active
2025/2026 consensus pick — better TypeScript story, configurable
shadow-DOM, modern SVG `foreignObject` render path. Crucially,
`html-to-image` has **zero runtime dependencies** (verified by
`npm ls --all --omit=dev` in the spike: 2 packages total — html-to-image
itself + its single transitive descendant).

**Integration cost:**

| Dimension | Measurement | Notes |
|---|---|---|
| Glue-code LOC | **247 lines** | `src/spike.js` — render + state machine + error handling + fidelity recording. |
| Spike total LOC | 1,177 lines | Adds 333 CSS + 113 HTML + 401 probe + 83 README. The probe is the largest file because pixel-fidelity testing requires real PNG decoding (pngjs) and per-feature assertions. |
| Production deps | **2 packages** | html-to-image (500 KB unpacked) + 1 transitive. |
| Production disk size | **~500 KB** | The library itself. The spike's `node_modules/` (36 MB / 41 packages) is dominated by Vite + Playwright + pngjs (devDependencies). |

**Rendering-fidelity findings** — the fidelity-stress fixture
deliberately exercises features known to challenge DOM-to-canvas
rasterizers. Each row is a CSS feature; each verdict is from the
probe's pixel-sampling assertions (operator-perceivable: probe samples
the captured PNG at known coordinates and verifies the rendered color
matches the CSS-declared color within tolerance).

| Feature | Verdict | Evidence |
|---|---|---|
| **`@font-face` web font with broken `url(...)` (404)** | **Renders via CSS fallback chain.** The fixture declares `font-family: 'LoraTest', Georgia, serif` where `LoraTest`'s woff2 URL deliberately 404s. Capture does NOT throw; the captured PNG renders the title using the fallback (`Georgia, serif`). | computed-style first-in-stack is still `'LoraTest, Georgia, serif'` (CSS-cascade-level claim); the rasterized output uses the fallback font since the web font is unavailable. |
| **CSS `grid`** | **Faithful.** Three lane cards in a 3-column grid render at the documented pixel offsets (`publishedCard.x = 26`, `draftingCard.x = 226`, `ideasCard.x = 426` per the probe's layout snapshot). | Probe's layout snapshot matches expected grid spacing. |
| **CSS `flex`** | **Faithful.** The aside + svg-icon flex pair renders with the documented sub-pixel positioning. | Multi-line aside paragraph reports `heightPx = 65` (~5 lines at the fixture width). |
| **`::before` pseudo-element backgrounds** | **Faithful.** Each card's left-edge ribbon stripe (`::before` with `background: var(--c-published)`) is captured at the expected color: published #2f5d3a, drafting #b07a1a, ideas #4a4a8a. | Probe samples pixel at `(card.x + 2, card.y + h/2)` for each card; color distance < 40 in all three cases (probe output: green ribbon dist=0, ochre ribbon dist=0, purple ribbon dist=0). |
| **`::after` pseudo-element content** | **Faithful.** The divider's `::after { content: '◆'; color: #6d3a1f }` glyph rasterizes at the divider center; the LANE label glyph (`::after { content: 'LANE'; }` on each card) renders correctly. | Probe scans a ±12px window around the divider center; finds a pixel matching #6d3a1f with `dist = 0`. |
| **`box-shadow`** | **Faithful.** The fixture's outer `box-shadow: 0 4px 16px rgba(0,0,0,0.18)` rasterizes; cards' inner `box-shadow: 0 2px 4px rgba(0,0,0,0.08)` also visible in the export. | Visible in downloaded PNG; not pixel-sampled (shadow is anti-aliased gradient, hard to assert precisely). |
| **`border-radius`** | **Faithful.** Card corners and the fixture's outer 12px radius render correctly. | Visible in downloaded PNG. |
| **Inline `<svg>`** | **Faithful.** The decorative diamond icon's `<polygon fill="#6d3a1f">` rasterizes at the fixture-relative coordinates `(554, 190)` with the expected fill color. | Probe samples a pixel at `(svgIcon.x + svgIcon.w*0.3, svgIcon.y + svgIcon.h/2)`; color distance from #6d3a1f = 0. |
| **Multi-line text wrapping** | **Faithful.** The aside paragraph wraps at the same column width as the live DOM (verified by `heightPx` being identical between live and captured). | Probe records rendered height = 65px; the captured PNG inherits this. |
| **CSS `var(...)` custom properties** | **Faithful.** All `--c-published`, `--c-drafting`, `--c-ideas`, `--accent` references resolve correctly in the captured PNG. | All pixel-sample assertions on these colors pass. |
| **System-font fallback paragraph (`font-family: -apple-system, ...`)** | **Faithful** (qualitative — not pixel-sampled because font rendering across systems varies). | Visible in downloaded PNG. |

**Probe assertion summary (all PASS):**

```
=== summary ===
All assertions passed.   (~30 assertions across initial state, capture
                          run, fidelity snapshot, pixel-fidelity sampling
                          of three ribbon colors + divider glyph + SVG
                          polygon, clear lifecycle)
```

**Captured PNG dimensions vs. live DOM:** the probe verifies
`capturedNaturalWidth === capturedRenderedWidth === 640` and
`capturedNaturalHeight === capturedRenderedHeight === 394`. The capture
is 1:1 with the live rendered fixture at `pixelRatio: 1`.

**Known gaps (not blocking adoption, but should be tracked for Phase
12):**

1. **Cross-origin assets.** The spike's fixture is fully same-origin
   (SVG, fonts, no external assets). Adopters who include cross-origin
   `<img>` or external font URLs will hit `html-to-image`'s CORS
   handling — the library serializes external assets to data URLs at
   capture time, requiring CORS-permissive responses. Adopter-facing:
   if a mockup includes a remote image without `Access-Control-Allow-Origin`,
   the capture either fails or omits the image (depending on the asset
   type). Not exercised by this spike; Phase 12 to budget for the
   adopter-facing CORS error UX.
2. **CSS `transform` + `clip-path`.** Not exercised by the fixture.
   Anecdotal reports in the html-to-image issue tracker suggest these
   can produce slight mis-renders; Phase 12 to add fidelity tests if
   the studio's review surface uses them.
3. **Shadow DOM.** `html-to-image` has a `shadowRootClone` option;
   the spike does not exercise it. If Phase 10's HTML-mockup iframe
   ever uses shadow roots, an additional fidelity probe is needed.

**v1 recommendation:** **adopt `html-to-image` as the primary capture
path.** Zero runtime deps, faithful CSS rendering against the
fidelity-stress fixture, no permission prompts, deterministic capture
size. The known gaps (cross-origin assets, transform / clip-path,
shadow DOM) are Phase 12 budget concerns, not blockers.

### Sub-spike 3: Markup tools (Excalidraw)

Spike location: [`spikes/graphical-review/markup-tools/`](../../../../spikes/graphical-review/markup-tools/).

**Build-vs-adopt decision: ADOPT Excalidraw.**

Per the candidates matrix § "Screenshot markup / drawing": Excalidraw
is MIT-licensed, ships PNG/SVG export, supports touch and mobile,
124k+ GitHub stars. tldraw is **disqualified** — source-available
licence requires either a $6k/yr commercial licence or a "made with
tldraw" watermark on the canvas; incompatible with deskwork's
OSS-dependency stance. Konva.js is a credible compositional
alternative — see "considered but not spiked" below.

**Integration cost:**

| Dimension | Measurement | Notes |
|---|---|---|
| Glue-code LOC | **345 lines** | `src/main.jsx` — React mount + Excalidraw API wiring + fixture loader + box-annotation builder + export flow + state machine. |
| Spike total LOC | 1,034 lines | Adds 132 CSS + 54 HTML + 13 vite.config + 319 probe + 124 README + 47 SVG fixture. |
| Production deps | **259 packages** | `@excalidraw/excalidraw` + React + react-dom + their full transitive trees. Verified via `npm ls --all --omit=dev --parseable \| wc -l`. |
| Per-library unpacked sizes | `@excalidraw/excalidraw` **48 MB**, `react` 368 KB, `react-dom` 4.4 MB | Excalidraw ships its full whiteboard (icons, fonts, themes); the shipped bundle is tree-shakeable but the dev-install is heavy. |
| Spike `node_modules/` total | **312 MB / 539 directories** | Vite + Playwright + pngjs add to the above; this is the entire dev install size. |

**Tool palette exposed by Excalidraw out of the box** (queried via
`data-testid="toolbar-*"` against the rendered DOM in the probe):

| Tool | Excalidraw testid | aria-label | Maps to spec's required tools |
|---|---|---|---|
| Selection | `toolbar-selection` | "Selection" | (transport) |
| Rectangle | `toolbar-rectangle` | "Rectangle" | **box** |
| Arrow | `toolbar-arrow` | "Arrow" | **arrow** |
| Line | `toolbar-line` | "Line" | (no spec equivalent; complementary) |
| Freedraw | `toolbar-freedraw` | "Draw" | **freehand** |
| Text | `toolbar-text` | "Text" | **text-label** |
| Image | `toolbar-image` | "Insert image" | (transport — used by the spike to embed the fixture) |
| Eraser | `toolbar-eraser` | "Eraser" | (housekeeping) |

**The workplan's "arrow / box / freehand / text-label / blur" tool list
maps 4-of-5 cleanly to Excalidraw's native primitives.** The fifth —
**blur** — is NOT a built-in Excalidraw tool. See § "Blur limitation"
below.

**Touch / mobile story:** Excalidraw is actively touch-first. The
library's input handling uses Pointer Events (`pointerdown`/`pointermove`)
with multi-touch support for pan/zoom; documented mobile support in
upstream issues + release notes. Not exercised by this spike's
automated probe (Playwright's mouse-event emulation is sufficient for
desktop assertions but doesn't validate real touch gestures); manual
mobile validation is a Phase 12 follow-on.

**Export quality:** the probe exports the composed scene (fixture image
+ programmatic box annotation) via `exportToBlob({ mimeType: 'image/png',
appState: { exportBackground: true, viewBackgroundColor: '#ffffff' } })`.
The exported PNG is 620×420px (Excalidraw frames the export to the
scene bounds + padding), 44–46 KB, contains the box-stroke color
(#e03131) at 139 sampled pixel positions (proves the markup layer
composes into the export, not just into the live editor).

**Probe assertion summary (all PASS):**

```
=== summary ===
All assertions passed.   (32 assertions across mount + tool-palette
                          enumeration, fixture-image add, box-annotation
                          add, scene export with pixel-color sampling of
                          the box stroke, reset lifecycle)
```

**Blur limitation:** Excalidraw does not ship a native "blur this
region" primitive. The workplan calls for blur as one of five markup
tools. Three v1.x paths to close the gap:

1. **Two-pass workflow.** Operator captures the region to blur via
   `html-to-image` on a CSS-blurred clone, then re-inserts the blurred
   image as an Excalidraw image element on top of the original. Works
   today; ugly UX (operator runs the blur outside Excalidraw's toolbar).
2. **Custom Excalidraw element type.** Excalidraw supports user-extended
   element types via its plugin API. Phase 12 to scope adding a `blur`
   element that renders as a CSS-blur overlay in the editor + as a
   pre-rendered blurred image on export. Estimated cost: ~200-400 LOC
   of TypeScript + the Excalidraw-element-API documentation work.
3. **Reconsider Konva.js.** Konva ships `Konva.Filters.Blur` as a
   one-line filter. If blur is load-bearing for v1 and option (2)
   surfaces unforeseen integration cost, Konva becomes the credible
   path — but at the cost of ~1,000-1,200 LOC of arrow/box/text/freehand
   tooling we'd be building from scratch.

The recommendation is option (2) — extend Excalidraw — because the
v1 markup surface is small and Excalidraw's adopter ergonomics
(stamps, hand-drawn aesthetic, mobile-first input) are worth the
custom-element work.

**Considered but not spiked: Konva.js compositional alternative.**

Per the Task 1.2 broader survey's "compositional path" analysis (also
recorded in `decision-draft.md` § "Image annotation spike" survey
section): Konva.js is the credible alternative if Excalidraw proves
stylistically wrong or its React dependency proves architecturally
incompatible with `packages/studio/`. Konva is MIT, ~55 KB gzipped,
canvas-primitive-only (no built-in markup tools). Building a markup
editor on Konva would be ~1,000-1,200 LOC of arrow/box/freehand/text/
blur tooling — a meaningful investment relative to the 345-LOC
Excalidraw integration this spike measured. **NOT spiked because the
matrix's recommendation (Excalidraw) holds against this spike's
findings**; Konva remains documented as the v2 escape hatch if
Excalidraw goes dormant or its stylistic direction diverges from
deskwork's needs.

**The React dependency cost.** `packages/studio/` does NOT currently
depend on React (it's a Hono server with a vanilla-TS client bundle
built via esbuild). Adopting Excalidraw forces React into the studio's
runtime. Two integration shapes for Phase 12 to evaluate:

1. **Isolated React sub-bundle.** Excalidraw mounts into a single
   container; the rest of the studio remains vanilla TS. React is
   loaded only on the screenshot-markup surface. Bundle weight is
   gated by route — operators who never open the markup tool never
   pay the cost.
2. **Whole-studio React migration.** Out of scope for v1; would be a
   substantially larger feature than the screenshot-markup work
   itself.

The recommendation is option (1) — isolate React to the markup
surface. The spike's `main.jsx` already demonstrates the shape
(createRoot mount into a single DOM node; rest of the page is
vanilla DOM).

**v1 recommendation:** **adopt Excalidraw, isolated React sub-bundle,
defer blur primitive to a v1.x custom-element extension.** Excalidraw
delivers 4-of-5 spec'd markup tools natively, has mature touch / mobile
support, ships PNG export that composes cleanly with the fixture
image, and the licence is unambiguous MIT.

### Architectural fit with Architecture A

All three sub-spikes are **library-only / filesystem-native** — captures
and exports stay in-memory as PNG data URLs / Blobs; downloads happen
through in-process Blob URLs the operator saves to disk; no upload to
any external service. The findings hold under Architecture A's no-cloud
/ no-DB constraint.

### Open questions for Phase 12 (screenshot markup) implementation

- **Capture-path routing.** The studio surface should default to
  `html-to-image` (no prompt, faithful CSS) and offer `getDisplayMedia`
  only when the operator explicitly opts in (toggle: "Capture screen
  with system dialog" — for WebGL / video / OS-chrome cases). Phase 12
  UX decision.
- **Cross-origin assets in mockups.** Adopters who include remote
  images / fonts in their HTML mockups will hit `html-to-image`'s CORS
  handling. The studio needs an operator-visible warning surface when
  a capture omits an external asset (rather than silently rendering a
  broken-image placeholder in the captured PNG).
- **Custom blur element for Excalidraw.** Estimate the cost of
  extending Excalidraw with a `blur` element type before committing
  to the path. The custom-element API is documented but
  feature-incomplete in older Excalidraw versions; Phase 12 to verify
  against v0.18.x at implementation time.
- **React-isolation architecture.** How the studio builds + loads the
  markup React sub-bundle. esbuild can produce the bundle; the host
  page mounts it via dynamic import only on the markup surface.
  Bundle-weight target: Excalidraw + React + react-dom production
  builds total ~3-5 MB minified (un-gzipped, including Excalidraw's
  shipped fonts). Phase 12 to measure the gzip + adopter-impact
  numbers.
- **Mobile validation.** Both `html-to-image` and Excalidraw claim
  mobile support; neither was validated against a real touchscreen in
  this task. Phase 12 acceptance criterion: real-device mobile capture +
  markup smoke test on iOS Safari and Android Chrome.
- **Annotation persistence.** Excalidraw exports `.excalidraw` JSON
  alongside PNG; deskwork's filesystem-native model can persist both
  (the JSON for "re-editable markup" reopening, the PNG for the
  rendered review-surface attachment). Phase 12 to spec the storage
  shape — likely an annotation's `body[]` carries both the rendered
  PNG (as a `TextualBody` with `format: 'image/png'`) and the
  re-editable Excalidraw JSON (as a separate body part).
