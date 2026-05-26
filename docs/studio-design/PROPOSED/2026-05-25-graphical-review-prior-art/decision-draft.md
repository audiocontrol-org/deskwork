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
