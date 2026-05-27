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
| HTML annotation spike | pending | 1.3 |
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
