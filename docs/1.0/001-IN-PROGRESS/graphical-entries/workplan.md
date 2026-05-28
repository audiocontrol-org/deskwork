---
slug: graphical-entries
targetVersion: "1.0"
date: 2026-05-25
---

# Workplan: Graphical Entries

**Goal:** Generalize deskwork's pipeline model to support per-project lanes bound to pipeline templates, add cross-lane groups, and add first-class graphical entries (`html-mockup` / `single-file-html` / `image`) with a chrome-free review surface — preserving the canonical pipeline shape across all templates and migrating existing projects with zero data loss.

> The workplan elaborates the PRD's Implementation Phases into tasks with acceptance criteria. Phase 4 carries scoped-in tooling fixes (#247, #300). Phase 1 is research-only (no production implementation). Phase 9 is design-only (no production implementation). All other phases ship code + tests; integration tests live in `packages/<workspace>/test/` and run locally per the project's "no test infrastructure in CI" rule.

## Phase 1: Prior-art research + build-vs-reuse decision  ·  [#302](https://github.com/audiocontrol-org/deskwork/issues/302)

**Deliverable:** Decision document at `docs/studio-design/ACCEPTED/<date>-graphical-review-prior-art/brief.md` recording the chosen stack (annotation data model, image annotation UI, HTML annotation UI, threading, screenshot capture, screenshot markup) with rationale + dependency footprint + adopter-facing impact. **No production implementation in this phase.**

### Task 1.1: OSS candidate survey

- [x] Step 1.1.1: Author a candidate matrix at `docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/candidates.md` — 17 candidates evaluated across 6 concerns (image annotation, HTML annotation, data model, screenshot capture, screenshot markup, closed-source inform-only).
- [x] Step 1.1.2: License / last-commit / bundle weight / W3C alignment / browser-API surface / self-hosting cost / adoptable y/n captured per row; sources cited inline.
- [ ] Step 1.1.3: Drop the matrix into the decision-doc draft as the "Survey" section. (Deferred to Task 1.6.)

**Surprises surfaced that change the spike picks:**
- **tldraw disqualified** — source-available licence, requires paid commercial use or "made with tldraw" watermark; incompatible with deskwork's OSS-dependency constraint. Excalidraw is the clean MIT alternative.
- **html2canvas effectively unmaintained** (no release since 2022-01; 975+ open issues). **html-to-image** is the 2025/2026 consensus successor.
- **recogito-js archived 2023-12.** Use **@recogito/text-annotator** from the same team.
- **Hypothes.is client = library + service.** Embedding it drags in the API server surface. Adopt the data model + UX patterns; consider the runtime only if willing to self-host `h` or build an adapter.

### Task 1.2: Spike — image annotation library integration

- [x] Step 1.2.1: Pick the top-2 image-annotation candidates from Task 1.1. **Library-of-one finding:** Annotorious is the lone viable embeddable image-annotation library (Recogito Studio is a Docker-deployed platform; `recogito-js` is archived 2023-12; `@recogito/text-annotator` is text-only). Spike narrowed to Annotorious; rationale recorded in `decision-draft.md`.
- [x] Step 1.2.2: Built spike at [`spikes/graphical-review/annotorious-image/`](../../../../spikes/graphical-review/annotorious-image/) — vanilla JS + Vite dev server, self-contained SVG fixture, `W3CImageFormat` adapter wired so lifecycle events deliver W3C JSON-LD directly, payload mirrored to the page and downloadable as `annotations.json`. Verified at desktop (1280×800) and iPhone-13 viewport via `scripts/verify.mjs`.
- [x] Step 1.2.3: Integration cost measured: 158 lines glue code in `src/spike.js` (403 LOC across all spike sources); Annotorious v3.8.2 + 10 transitive deps = 11 production packages / ~2.6 MB unpacked; zero theming overrides required (Annotorious default CSS imported as-is); touch code path verified at iPhone-13 viewport (renders `.a9s-touch-handle` + `.a9s-touch-halo`); keyboard/SR accessibility partial — host must add `tabindex`/`aria-label` for annotation traversal.
- [x] Step 1.2.4: Findings recorded in [`docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md`](../../../studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md) as the **Image annotation spike (Task 1.2)** section, with the actual emitted W3C JSON-LD payload pasted inline. v1 recommendation: adopt Annotorious + `W3CImageFormat` adapter as-is; do not fork.

### Task 1.3: Spike — HTML mockup annotation library integration

- [x] Step 1.3.1: Candidates narrowed under operator-confirmed Architecture A (no cloud, no DB). **Library-of-one finding:** `@recogito/text-annotator` is the lone viable embeddable HTML-annotation library (Hypothes.is client is out under the no-cloud/no-DB constraint — hosted leaks data, self-host needs Postgres+Elasticsearch+Docker, fake-adapter still assumes a service contract; `recogito-js` is archived 2023-12). Spike narrowed to `@recogito/text-annotator`; rationale recorded in `decision-draft.md`.
- [x] Step 1.3.2: Built spike at [`spikes/graphical-review/text-annotator-html/`](../../../../spikes/graphical-review/text-annotator-html/) — vanilla JS + Vite dev server, self-contained HTML mockup fixture loaded in an iframe, `W3CTextFormat` adapter wired so text-range pin lifecycle events deliver W3C JSON-LD directly, hand-rolled 215-LOC `dom-anchor.js` layer for non-text DOM regions (icon buttons, images, decorative divs) emitting CssSelector + TextQuote + FragmentSelector pixel-offset chain, payload mirrored to the page and downloadable as `annotations.json`. Verified at desktop (1280×800) and iPhone-13 viewport via `scripts/verify.mjs`.
- [x] Step 1.3.3: Anchor resilience verified via `scripts/anchor-resilience.mjs`: pins four regions (three id-anchored + one nth-of-type-anchored), then programmatically mutates the iframe DOM (id rename, sibling insertion before, class rename, **pure-reorder of same-tag siblings** to break nth-of-type, total teardown of id+text). Resolver chain works as documented — id rename triggers TextQuote fallback landing on the deepest matching element (not a containing ancestor); sibling/class shifts leave id-based CssSelectors intact; pure-reorder breaks nth-of-type CSS and falls through to TextQuote which still finds the original `<p>`; total teardown triggers FragmentSelector pixel-offset graceful degradation whose recorded bbox center remains inside the iframe viewport. All 11 anchor-resilience assertions pass.
- [x] Step 1.3.4: Findings recorded in [`docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md`](../../../studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md) as the **HTML annotation spike (Task 1.3)** section. Includes actual emitted W3C JSON-LD payloads inline (text-range + DOM-region samples), library cross-iframe document-realm gotcha + workaround, anchor-resilience results table, and v1 recommendation: **adopt `@recogito/text-annotator` + `W3CTextFormat` for text-range pins, AND ship a thin DOM-selector layer (Phase 10 scope) for non-text DOM regions**.

### Task 1.4: Spike — screenshot capture + markup mechanisms

- [x] Step 1.4.1: Built [`spikes/graphical-review/capture-getdisplaymedia/`](../../../../spikes/graphical-review/capture-getdisplaymedia/) — vanilla JS + Vite, `navigator.mediaDevices.getDisplayMedia({ video: true })` one-shot frame capture, PNG download via Blob URL. Browser-support summary, permission-prompt UX cost (per-capture OS prompt, no "remember this site" affordance), what's capturable (tab / window / screen, native resolution) recorded in `decision-draft.md`. Playwright probe at `scripts/verify.mjs` asserts UI wiring + path-taken state machine (idle / unsupported / rejected / captured); 28 assertions PASS. OS-prompt cannot be simulated headlessly — manual cross-browser checklist documented in the spike README per `.claude/rules/ui-verification.md`'s explicit-coverage-vs-gap framing.
- [x] Step 1.4.2: Built [`spikes/graphical-review/capture-dom-to-canvas/`](../../../../spikes/graphical-review/capture-dom-to-canvas/) — vanilla JS + Vite, `html-to-image` v1.11.13 (NOT html2canvas — matrix flagged it as effectively unmaintained), fidelity-stress fixture exercising `@font-face` web font (deliberately 404'd to test fallback), CSS grid + flex, `::before` / `::after` pseudo-elements (ribbon stripes + LANE label + diamond glyph), box-shadow, border-radius, inline SVG, multi-line text wrapping, system-font stack. Playwright probe decodes the captured PNG and samples pixels at known coordinates — 30+ spec-derived assertions PASS, including pixel-color matches for three ribbon stripes (#2f5d3a green, #b07a1a ochre, #4a4a8a purple at color distance 0), divider `::after` glyph rasterization (#6d3a1f at color distance 0), inline SVG polygon fill (#6d3a1f at color distance 0). Captured PNG is 1:1 with live DOM dimensions (640×394px). Production-dep footprint: 2 packages, ~500 KB unpacked.
- [x] Step 1.4.3: Built [`spikes/graphical-review/markup-tools/`](../../../../spikes/graphical-review/markup-tools/) — vanilla JSX + Vite + React 18, `@excalidraw/excalidraw` v0.18.1 mounted onto a fixture editorial dashboard SVG, programmatic API exposed via `window.__spike` for probe-driven scene manipulation, `exportToBlob` composes fixture + markup into a single PNG. Playwright probe asserts mount (Excalidraw renders `<canvas>` in the container), tool palette enumeration (rectangle / arrow / line / freedraw / text / image / eraser / selection — 4-of-5 spec'd tools map natively, blur is the gap), scene-element accounting (fixture-image add advances count by 1; box-annotation add advances by 1), export PNG dimensions / byte length / pixel-color sampling (139 sampled pixels match the box stroke color #e03131 in the exported PNG). 32 assertions PASS. **Build-vs-adopt decision: ADOPT Excalidraw** — MIT, mature, touch-first, PNG/SVG export, 4-of-5 spec tools native; blur deferred to a v1.x custom-element extension via Excalidraw's plugin API. **Konva.js documented as "considered but not spiked"** — the v2 escape hatch if Excalidraw's React dep or stylistic direction proves wrong; building markup tooling from Konva primitives is the ~1,000-1,200 LOC alternative. **tldraw remains disqualified** (source-available, not OSS). React dependency cost (259 production packages, ~50 MB unpacked; isolated React sub-bundle is the recommended Phase 12 integration shape).
- [x] Step 1.4.4: Findings recorded in [`docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md`](../../../studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md) as the **Screenshot capture + markup spike (Task 1.4)** section, with three sub-spikes documented end-to-end: browser-support tables, permission-prompt UX cost narrative, integration-cost numbers per sub-spike, per-CSS-feature rendering-fidelity table for `html-to-image`, tool-palette table + blur-limitation analysis + 3 v1.x mitigation paths for Excalidraw, build-vs-adopt decision with Konva-as-considered documented, architectural-fit-with-Architecture-A confirmation, and 6 open questions for Phase 12 implementation.

### Task 1.5: Threading + W3C alignment decision

- [x] Step 1.5.1: Documented per-library threading capability in `decision-draft.md` § "Threading + W3C alignment decision (Task 1.5)" → "Threading capability — by picked library." Finding: **none** of the picked libraries (Annotorious / `@recogito/text-annotator` / Excalidraw / `html-to-image`) ship native threading. All defer to host-supplied comment UI per the W3C Web Annotation Data Model pattern.
- [x] Step 1.5.2: Decision: **adopt W3C as the structural base; extend with the `deskwork:` namespace for project-specific fields** (Option B). Rationale recorded in `decision-draft.md` § "W3C Web Annotation Data Model adoption — three options considered" — the picked libraries already emit W3C-shaped JSON, Phase 8's planned fields fit the JSON-LD extension pattern, threaded replies land natively via `motivation: replying`.
- [x] Step 1.5.3: Migration sketch landed in `decision-draft.md` § "Migration sketch from the current `comment` annotation shape" — per-field mapping (`range` → `[TextPositionSelector, TextQuoteSelector]`, `comment` → `[TextualBody]`, `iteration` → `deskwork:revisionId`, parent-comment-id → reply annotation's `target` with `motivation: replying`), doctor-managed migration with audit-preserving cutover window.

### Task 1.6: Write decision document

- [x] Step 1.6.1: Decision brief landed at [`docs/studio-design/ACCEPTED/2026-05-26-graphical-review-prior-art/brief.md`](../../../studio-design/ACCEPTED/2026-05-26-graphical-review-prior-art/brief.md) per the project's design-archive contract. The prior `PROPOSED/2026-05-25-graphical-review-prior-art/` directory is retired — `candidates.md` (Task 1.1 matrix) moved into the ACCEPTED entry alongside `evidence.md` (the verbose backing, formerly `decision-draft.md`) and the new `brief.md` (focused summary per the design-standards convention).
- [x] Step 1.6.2: Each of the six concerns (annotation data model / image annotation UI / HTML annotation UI / threading / screenshot capture / screenshot markup) records chosen approach + rationale + dependency footprint + adopter-facing impact + v1 scope vs. deferred in `brief.md` § "Decisions — by concern."
- [x] Step 1.6.3: Reject log lives as a companion entry at [`docs/studio-design/REJECTED/2026-05-26-graphical-review-alternatives/brief.md`](../../../studio-design/REJECTED/2026-05-26-graphical-review-alternatives/brief.md) — consolidates 25+ rejected candidates across the six concerns (Hypothes.is excluded under Architecture A; tldraw licence-disqualified; html2canvas unmaintained; marker.js2 Linkware; react-image-annotate stale; LabelStudio server-required; BugHerd/Marker.io/Pastel/Frame.io/Loom/Penpot Cloud closed appliances; SVG.js / Pixi.js / Paper.js wrong-shape primitives; etc.) with specific reasons for each.
- [x] Step 1.6.4: `DESIGN-STANDARDS.md` change log appended with a 2026-05-26 entry naming the picked libraries, the Architecture A confirmation, the five spike directories, and links to the ACCEPTED + REJECTED briefs.

**Acceptance Criteria:**

- [ ] Decision document exists at `docs/studio-design/ACCEPTED/<date>-graphical-review-prior-art/brief.md`.
- [ ] Each of the 6 concerns has a chosen approach + rationale.
- [ ] Spike repos exist at `spikes/graphical-review/<library>-*` for at least image + HTML + capture; each runs `npm install && npm start` (or equivalent) to demonstrate the spike.
- [ ] DESIGN-STANDARDS.md change log has an entry for this decision; the archive directory has both ACCEPTED and REJECTED entries.
- [ ] No production code in `packages/` or `plugins/` modified — research-only phase.

## Phase 2: Pipeline template loader + preset defaults + override resolver  ·  [#303](https://github.com/audiocontrol-org/deskwork/issues/303)

**Deliverable:** JSON load + schema validation; five preset templates ship at `packages/core/src/pipelines/{editorial,visual,feature-doc,qa-plan,blog-post}.json`; override resolver picks per-project overrides under `<projectRoot>/.deskwork/pipelines/`. Unit tests.

### Task 2.1: PipelineTemplate type + JSON schema

- [x] Step 2.1.1: Author the `PipelineTemplate` type at `packages/core/src/pipelines/types.ts` matching the PRD's interface (id, name, description, linearStages, lockedStages?, offPipelineStages).
- [x] Step 2.1.2: Author a Zod schema for `PipelineTemplate` at the same location; export schema + inferred type.
- [x] Step 2.1.3: Invariant tests: linearStages must be non-empty; lockedStages must be a subset of linearStages; `Cancelled` is reserved if present in offPipelineStages.

### Task 2.2: Override resolver extension

- [x] Step 2.2.1: Locate the existing override-resolver infrastructure at `packages/core/src/overrides.ts` (THESIS Consequence 3 machinery).
- [x] Step 2.2.2: Add a `loadPipelineTemplate(id: string, projectRoot: string)` function that checks `<projectRoot>/.deskwork/pipelines/<id>.json` first, falls back to `packages/core/src/pipelines/<id>.json`.
- [x] Step 2.2.3: Add a `listAvailablePipelineTemplates(projectRoot: string)` function that returns every template found in project overrides + plugin defaults, de-duplicated by id.
- [x] Step 2.2.4: Unit tests covering override-takes-precedence + plugin-default-fallback + listing-deduplication.

### Task 2.3: Ship five preset templates

- [x] Step 2.3.1: Author `packages/core/src/pipelines/editorial.json` matching the legacy single-pipeline stage names exactly: linearStages `["Ideas","Planned","Outlining","Drafting","Final","Published"]`, lockedStages `["Final"]`, offPipelineStages `["Blocked","Cancelled"]`. Include a header comment block documenting the lifecycle rationale.
- [x] Step 2.3.2: Author `packages/core/src/pipelines/visual.json` (Sketched / Iterating / Approved / Shipped; locked: Approved; off: Blocked / Cancelled / Archived) with rationale.
- [x] Step 2.3.3: Author `packages/core/src/pipelines/feature-doc.json` (Defined / Drafting / Approved / Implemented / Complete; locked: Approved / Implemented; off: Blocked / Cancelled) with rationale.
- [x] Step 2.3.4: Author `packages/core/src/pipelines/qa-plan.json` (Drafted / Reviewed / Tested / Approved; locked: Reviewed; off: Blocked / Cancelled / Archived) with rationale.
- [x] Step 2.3.5: Author `packages/core/src/pipelines/blog-post.json` (Idea / Drafting / Edited / Published; locked: Edited; off: Blocked / Cancelled) with rationale.
- [x] Step 2.3.6: Validate each preset against the Zod schema in a unit test; assert all five load cleanly via the resolver.

**Acceptance Criteria:**

- [x] Each preset is loadable via `loadPipelineTemplate(id, anyProjectRoot)` and passes schema validation.
- [x] Project overrides at `<root>/.deskwork/pipelines/<id>.json` take precedence over the plugin default.
- [x] `listAvailablePipelineTemplates` returns the union of plugin defaults + project overrides with no duplicates.
- [x] All five preset JSON files carry header comments documenting their lifecycle rationale (operator-authored custom pipelines have a working exemplar to copy from). [Note: JSON lacks `//` comments; rationale is carried as a top-level `"$rationale"` string field, ignored by the Zod schema via `.passthrough()` and documented in `loader.ts` JSDoc.]

## Phase 3: Lane data model + config loader + entry schema delta  ·  [#304](https://github.com/audiocontrol-org/deskwork/issues/304)

**Deliverable:** `.deskwork/lanes/<id>.json` schema + loader; entry sidecar gains `lane` + `artifactKind`; doctor migration creates `default` lane and back-fills entries on first run. Unit tests.

### Task 3.1: LaneConfig type + JSON schema + loader

- [ ] Step 3.1.1: Author `LaneConfig` type at `packages/core/src/lanes/types.ts` per the PRD's interface (id, name, pipelineTemplate, contentDir).
- [ ] Step 3.1.2: Zod schema for `LaneConfig`; export schema + inferred type.
- [ ] Step 3.1.3: `loadLaneConfig(id: string, projectRoot: string)` function reading `<projectRoot>/.deskwork/lanes/<id>.json`; refuses missing files with a clear error (no fallback per the project's no-fallback rule).
- [ ] Step 3.1.4: `listLaneConfigs(projectRoot: string)` returns every `*.json` under `.deskwork/lanes/`.
- [ ] Step 3.1.5: Cross-validation: lane's `pipelineTemplate` must resolve via the Phase 2 template loader.

### Task 3.2: Entry sidecar schema delta — lane + artifactKind

> **Phase 2 follow-up (from code-quality review 2026-05-27, I-3):** `PipelineTemplateSchema` uses `.passthrough()` to admit the `$rationale` field; this widens the inferred `PipelineTemplate` type to admit arbitrary string-keyed fields. Phase 3 consumers (`LaneConfig`, sidecar readers) should `import { PipelineTemplate } from '@deskwork/core/pipelines'` AND consider exporting a narrower `StrictPipelineTemplate = Pick<PipelineTemplate, 'id' | 'name' | 'description' | 'linearStages' | 'lockedStages' | 'offPipelineStages'>` at the consumption boundary so typos like `template.lockedSatges` don't compile cleanly. Decision: Phase 3 introduces the narrow type when the first consumer lands; until then, the runtime contract holds via Zod validation.

- [ ] Step 3.2.1: Extend `EntrySidecar` Zod schema at `packages/core/src/entries/schema.ts` (or wherever the schema lives) with `lane: string` (required after migration) and `artifactKind: 'markdown' | 'html-mockup' | 'single-file-html' | 'image'` (required after migration).
- [ ] Step 3.2.2: Make `currentStage` accept any string drawn from the lane's template (linearStages ∪ offPipelineStages); the runtime validates against the resolved template, not a global enum.
- [ ] Step 3.2.3: Make both new fields optional in the schema during the migration window; doctor enforces them after migration runs.
- [ ] Step 3.2.4: Update every read path of `currentStage` to consult the entry's lane template (note: Phase 4 handles the verb read paths; this task handles the schema + non-verb readers).

### Task 3.3: artifactKind detection

- [ ] Step 3.3.1: Author `detectArtifactKind(artifactPath: string)` that returns the kind per file extension: `.md` → `markdown`; `<dir>/index.html` or single `.html` → `html-mockup` (directory case) or `single-file-html` (loose file case); `.png` / `.jpg` / `.jpeg` / `.gif` / `.webp` / `.svg` → `image`. Refuses unrecognized extensions with a clear error listing supported types.
- [ ] Step 3.3.2: Unit tests covering every supported case + the refusal path.

### Task 3.4: Default lane bootstrap on install

- [ ] Step 3.4.1: When `loadLaneConfig('default', projectRoot)` fails AND the project has a legacy `sites.<defaultSite>.contentDir`, the loader (or `deskwork install` flow, depending on where this slots) auto-creates `.deskwork/lanes/default.json` bound to `editorial` with `contentDir` from the legacy `sites` block. Emits a `migration` journal event.
- [ ] Step 3.4.2: Integration test: pre-feature project with `sites.<id>.contentDir` → first invocation under the new model → confirm `.deskwork/lanes/default.json` exists with the right contents + a migration journal entry.

### Task 3.5: Unit + integration tests

- [ ] Step 3.5.1: Unit tests for `loadLaneConfig`, `listLaneConfigs`, the Zod schemas, `detectArtifactKind`.
- [ ] Step 3.5.2: Integration test against a tmp-fixture project: install → load default lane → confirm everything wires correctly.

**Acceptance Criteria:**

- [ ] `LaneConfig` schema + loader are functional; lane configs at `.deskwork/lanes/<id>.json` load cleanly; bad configs fail with actionable errors.
- [ ] `EntrySidecar` schema supports `lane` + `artifactKind` (optional during migration; doctor enforces after).
- [ ] `detectArtifactKind` covers all four supported kinds plus the rejection path.
- [ ] Auto-bootstrap of `default` lane happens transparently on first invocation under the new model for any pre-feature project.

## Phase 4: Verb refactor + stage-list reads through lane's template + tooling fixes  ·  [#305](https://github.com/audiocontrol-org/deskwork/issues/305)

**Deliverable:** `approve`, `iterate`, `cancel`, `induct` consult the entry's lane template. Existing behavior preserved when lane = `default`. Calendar regen + doctor parser stop hardcoding stage lists; #247 and #300 close as side effects.

### Task 4.1: Refactor verb stage-list reads to template-driven

> **Phase 3 follow-ups (from code-quality review 2026-05-27):**
>
> - **I-2** — `packages/core/src/entry/induct.ts:18` `targetStage: Stage` is still editorial-narrow. Widen to `string` and gate the runtime check on the resolved lane template (`linearStages` membership). Removes the type-cast surface area that would otherwise infect Phase-4 callers.
> - **I-3** — `StrictPipelineTemplate` (declared in `packages/core/src/pipelines/types.ts:158`) and `StrictLaneConfig` (`packages/core/src/lanes/types.ts:68`) are exported but currently have zero consumers. Verb refactor MUST consume these narrow types at the bound-template / bound-lane input boundary so typos like `template.lockedSatges` fail at compile time.
> - **M-8** — `packages/core/src/entry/snapshot.ts:115` blindly lowercases the stage name for the snapshot filename. Editorial stages (`Drafting` → `drafting.md`) work; a custom-template stage like `"My Stage"` would produce `my stage.md` (filesystem-fragile). Add a stage-name → filesystem-safe-token mapping (kebab-case + non-ASCII transliteration or rejection) as part of the verb refactor.

- [x] Step 4.1.1: Grep manifest produced in commit `844447c`'s body — every hardcoded stage literal across `packages/core/src/{entry,iterate,calendar,doctor,schema,pipelines}/` enumerated with file:line + replacement disposition. Verb-side literals all replaced via template-aware helpers; intentional editorial-narrow exceptions (legacy migration parser, editorial-default doctor switch cases, `'Published'` gate on `entry/create.ts` deferred to Phase 6 CRUD) documented in code with phase-pointer JSDoc.
- [x] Step 4.1.2: All six verbs (`approve`, `iterate`, `cancel`, `block`, `induct`, `publish`) now route through `resolveEntryStrictTemplate(sidecar, projectRoot)` and consume `pipelines/helpers.ts` (`isLinearPipelineStageInTemplate`, `nextStageInTemplate`, `terminalLinearStage`, `preTerminalLinearStage`, etc.) instead of hardcoded stage literals.
- [x] Step 4.1.3: `test/entry/verbs-visual.test.ts` exercises every verb against the loaded `visual` preset (Sketched → Iterating → Approved → Shipped; locked-stage refusal on Approved; off-pipeline cul-de-sacs Blocked/Cancelled/Archived); the existing editorial coverage in `test/entry/{approve,induct,...}.test.ts` is preserved.
- [x] Step 4.1.4: `inductEntry`'s `targetStage` widened to `string` at both `packages/core/src/entry/induct.ts:23` and `packages/cli/src/commands/induct.ts:96`; runtime `linearStages.includes` check throws with the bound template's allowed stage list.
- [x] Step 4.1.5: `StrictPipelineTemplate` + `StrictLaneConfig` consumed at every verb input boundary via `resolveEntryStrictTemplate`. The Phase 2/3 "declared-but-unused" state is closed.
- [x] Step 4.1.6: `stageNameToFilesystemToken` lives at `packages/core/src/pipelines/stage-token.ts` (relocated from `lanes/` in the Phase 4 review fix to avoid an import cycle; lanes/ re-exports for back-compat). Snapshot.ts uses it. Plus a Zod-schema refinement catches stage-name collisions at template-load time (Phase 4 review I-3) — two stages whose tokenized forms collide are rejected with a descriptive error.

**Acceptance Criteria:**

- [x] All six verbs (approve / iterate / cancel / block / induct / publish) consult the entry's lane template; no hardcoded stage list remains in verb logic.
- [x] Existing single-lane projects (legacy `editorial` semantics) continue to work unchanged — verified via the editorial coverage in `test/entry/*.test.ts` + smoke run against this repo's actual sidecars.
- [x] `StrictPipelineTemplate` + `StrictLaneConfig` are consumed at every verb input boundary; the declared-but-unused state from Phase 3 is closed.
- [x] Snapshot filenames + any other filesystem-path-from-stage-name producers use the `stageNameToFilesystemToken` helper.

### Task 4.2: Calendar regen — fix #247 (writer-side)

- [x] Step 4.2.1: Pre-redesign `STAGE_ORDER` constant in `calendar/render.ts` traced and removed; the only remaining literal `linearStages` array is the `EDITORIAL_FALLBACK` constant used when no project root is supplied (test fixtures), with a JSDoc note pointing at Phase 8's enforcement step that lets the fallback be deleted.
- [x] Step 4.2.2: `calendar/render.ts:154` now accepts `projectRoot?: string` and iterates `templateStageOrder(template) = [...linearStages, ...offPipelineStages]` per lane. Multi-lane projects emit `# Lane: <name>` sections; single-lane projects keep the legacy shape unchanged.
- [x] Step 4.2.3: `test/calendar/regenerate-multilane.test.ts` covers a fixture project with entries across `Final` and `Cancelled` — no `Review` / `Paused` ghost sections; every entry renders.
- [x] Step 4.2.4: Smoke run `node scripts/smoke-phase4-issues.mjs` against this repo's `.deskwork/calendar.md` — `PASS: all 22 sidecars present in regenerated calendar` (every Final/Cancelled entry persists).

**Acceptance Criteria:**

- [x] `deskwork ingest --apply` and `deskwork approve` no longer drop Final / Cancelled entries from the calendar (verified via smoke + the regression test).
- [x] Calendar sections match the canonical eight stages (or the lane's template stages in multi-lane projects); no `Review` / `Paused` legacy sections.
- [x] Issue #247 closes via the smoke-test evidence (auto-close via commit body `closes #247`).

### Task 4.3: Doctor parser — fix #300 (reader-side counterpart)

- [x] Step 4.3.1: Located at `packages/core/src/doctor/rules/orphan-frontmatter-id.ts`. Section-based parser depended on stage-header recognition (the bug #300 names).
- [x] Step 4.3.2: New `UUID_IN_ROW_RE` regex scans every table row in `<calendar>.md` regardless of section heading; `readCalendarUuidSet` collects UUIDs into a flat set; the audit checks every frontmatter `deskwork.id` against the union of (parsed-entries-set ∪ regex-derived-set) so the over-counting is biased toward false negatives.
- [x] Step 4.3.3: `test/doctor/orphan-frontmatter-id.test.ts` carries fixture coverage of entries in `Ideas`, `Drafting`, `Final`, `Cancelled`, plus a custom-lane section — zero false-positive orphan flags.
- [x] Step 4.3.4: Smoke `node scripts/smoke-phase4-issues.mjs` against this repo — only 2 legitimate orphans remain (markdown files whose UUIDs genuinely don't appear in any calendar row); the false-positives on Final/Cancelled the bug named are gone.

**Acceptance Criteria:**

- [x] `deskwork doctor` reports zero false positives for entries in `Final` and `Cancelled` sections.
- [x] Issue #300 closes via the smoke-test evidence (auto-close via commit body `closes #300`).

### Task 4.4: Doctor migration scaffolding

- [x] Step 4.4.1: `migrateLaneMembership` (in `packages/core/src/doctor/lane-migration.ts`) calls `bootstrapDefaultLaneIfMissing` (Phase 3 helper) as its first step. Auto-creation is gated on the legacy `sites.<defaultSite>.contentDir` being present in the config; pre-feature projects bootstrap cleanly.
- [x] Step 4.4.2: Back-fill walks every sidecar; sets `lane: "default"` where absent; derives `artifactKind` from `artifactPath` via `deriveArtifactKindFromPath` (extension-based — `.md` → `markdown`, etc.).
- [x] Step 4.4.3: Each back-fill emits a `lane-migration` journal event (`migration: 'backfill-lane-and-artifact-kind'`, details listing the entry uuid + which fields were added). Phase 4 review I-2 reversed the order so sidecar writes happen FIRST, then the journal event lands as a post-condition record (matching `bootstrapDefaultLaneIfMissing`'s convention).
- [x] Step 4.4.4: `test/doctor/lane-migration.test.ts` carries the integration test — pre-feature project → run migration → confirm default lane created, every entry has `lane: default` + correct `artifactKind`. Smoke `node scripts/smoke-phase4-migration.mjs` verified against this repo: 22 examined / 22 lane back-fills / 22 artifactKind back-fills / second run idempotent.

**Acceptance Criteria:**

- [x] Migration runs in `--dry-run` first; atomic sidecar writes via the existing `writeSidecar` helper (tmp + rename).
- [x] Every legacy entry post-migration has `lane: "default"` and a correct `artifactKind`.
- [x] No data loss — all existing frontmatter, scrapbook content, marginalia, journal events preserved (the migration only ADDS fields; never deletes existing ones).

## Phase 5: Studio render — multi-lane swimlane dashboard + template stage columns + per-lane collapse + kanban↔list toggle + per-lane compose  ·  [#306](https://github.com/audiocontrol-org/deskwork/issues/306)

**Deliverable:** Markdown-only studio render that's lane-aware. Multi-lane swimlane dashboard (D3 Press Bay v11) + per-stage and per-lane collapse + per-lane kanban↔list toggle + per-lane compose chip + focus-chip + lane-visibility rail. Integration test against multi-lane fixture.

### Phase 5 · Design pick (accepted)

Direction 3 "Press Bay" (v11) is the accepted design as of 2026-05-27. Decision brief: [`docs/studio-design/ACCEPTED/2026-05-27-multi-lane-dashboard-d3-press-bay/brief.md`](../../../studio-design/ACCEPTED/2026-05-27-multi-lane-dashboard-d3-press-bay/brief.md). Canonical mockup: [`mockups/2026-05-27-multi-lane-dashboard/direction-3-press-bay.html`](../../../../mockups/2026-05-27-multi-lane-dashboard/direction-3-press-bay.html) (committed at SHA `2102f4e`). Rejected alternatives: [`D1 Lane Stack`](../../../studio-design/REJECTED/2026-05-27-multi-lane-dashboard-d1-lane-stack/brief.md), [`D2 Lane Bar`](../../../studio-design/REJECTED/2026-05-27-multi-lane-dashboard-d2-lane-bar/brief.md).

The picked design **pivots away from the PRD's original "per-lane tab strip" framing** (which corresponds to D2 Lane Bar — now REJECTED) toward stacked horizontal swimlanes on desktop + a vertical lane-stack on mobile. The PRD body in `prd.md` still describes the tab-strip approach; that wording is to be iterated through `/deskwork:iterate` so the PRD reflects the picked design. Implementation continues against the swimlane spec captured in the brief + mockup, not against the stale PRD prose.

### Task 5.1: Multi-lane swimlane dashboard + focus-chip strip + lane-visibility rail

- [ ] Step 5.1.1: Refactor the studio's dashboard server-render to read `listLaneConfigs(projectRoot)` and emit one **swimlane** (`<article class="swim ...">`) per visible-and-focused lane, in operator-configured order.
- [ ] Step 5.1.2: Each swimlane's body renders the lane's dashboard: columns drawn from the lane's template `linearStages` (in order) + an "Off-pipeline" section listing entries in `offPipelineStages`. No tab navigation; every focused lane is on-screen at once.
- [ ] Step 5.1.3: **Focus-chip strip** (transient filter) emits one chip per visibility-on lane plus an "All" chip; clicking a chip toggles whether that lane is rendered in the current view. State stored per-operator (localStorage); URL-deep-linkable via `?focus=<csv>`.
- [ ] Step 5.1.4: **Lane-visibility rail** (left rail on desktop, sheet on mobile) lists every lane with an eye-toggle (`●` visible / `○` persistently hidden) + drag handle. Visibility-off lanes don't appear in the focus-chip strip at all.
- [ ] Step 5.1.5: Filtered-out lane stubs: when a lane is visibility-on but focus-off, render a compact **swim-stub** button between the focused swimlanes so the operator can see what's hidden by the current focus filter; clicking the stub re-adds the lane to focus.

### Task 5.1A: Per-lane collapse — lane-level + per-stage

- [ ] Step 5.1A.1: Lane-level collapse: chevron in each `swim-head` / `lane-head` toggles between expanded (full pipeline body) and collapsed (swim-head + compact per-stage count strip). State stored per-lane-per-operator.
- [ ] Step 5.1A.2: Per-stage collapse: chevron in each `stage-head` (kanban) / `lb-group-head` (list) toggles one stage's content within an expanded lane. In kanban, collapsed columns shrink to a ~42px vertical strip with the stage name rotated 90°; remaining columns redistribute via flex. State stored per-lane-per-stage-per-operator.
- [ ] Step 5.1A.3: Universal chevron convention: `▾` glyph, rotates 90° clockwise to indicate collapsed, click anywhere on the head (or chevron) to toggle, focus-visible ring, ≥24×24 hit target per WCAG 2.2 SC 2.5.8 AA.

### Task 5.1B: Per-lane kanban ↔ list view toggle

- [ ] Step 5.1B.1: Segmented `▦ Kanban` / `≡ List` toggle in each swim-head / lane-head flips the body between the two views. Both views show the same entries — only spatial arrangement differs.
- [ ] Step 5.1B.2: Viewport-aware defaults: desktop kanban, mobile list. Operator's per-lane choice persists once set (per-operator localStorage).
- [ ] Step 5.1B.3: When a lane is lane-level-collapsed, the toggle greys out (collapse precedence — there's no body to render either view of).
- [ ] Step 5.1B.4: Mobile kanban tile view is the **v0.19 single-column collapsible-stage-tile pattern** (per `DESIGN-STANDARDS.md § Collapsible stage tiles`), NOT a 2-column wrap (which would obscure the linear stage sequence). List view stage groups carry the same stage-name + count + tag pattern as the kanban stage-grid heads; rows are dense (title + version-pill + state + ⋮ overflow).

### Task 5.1C: Per-lane Compose chip (`+ new`)

- [ ] Step 5.1C.1: Each swim-head / lane-head carries a `.swim-compose` chip rendering `+ new` on desktop, icon-only `+` on mobile (aria-label carries the full action). Min hit target: 26px desktop / 30×30 mobile, ≥24×24 per WCAG 2.2 SC 2.5.8 AA.
- [ ] Step 5.1C.2: Click handler clipboard-copies the partial slash-command: `/deskwork:add <SLUG> --lane <lane-id> --stage <first-linear-stage>`. The placeholder text `<SLUG>` is LITERAL — the operator replaces it in the chat editor after pasting.
- [ ] Step 5.1C.3: Post-click state: chip flashes green with `✓ Copied — paste in chat` for ~2s, then reverts to default. Implementation may use `.copied` class + `setTimeout`; no form fields, no popover, no bottom sheet.
- [ ] Step 5.1C.4: Per THESIS Consequence 2, the studio does not mutate sidecar state from the click — the chip only copies; the operator's pasted slash-command IS the action.

### Task 5.2: Template-aware stage columns (no hardcoded stages in render)

- [ ] Step 5.2.1: Grep the studio's render code for hardcoded stage names (`Drafting`, `Final`, `Published`, etc.); refactor every site to read from the lane's template instead.
- [ ] Step 5.2.2: Empty-lane state: shows the lane's pipeline shape as empty stage columns + a "Create your first entry" CTA that clipboard-copies `/deskwork:add --lane <id>`.
- [ ] Step 5.2.3: Per Commandment III, no surface renders "review state" labels — only stage labels appear.

### Task 5.3: Many-lane overflow — horizontal scroll of focus-chip strip + visibility-rail jump

- [ ] Step 5.3.1: When N visibility-on lanes exceeds the viewport-fitting threshold, the focus-chip strip overflows into a horizontally-scrollable row (per the D3 mockup's mobile focus-strip behavior).
- [ ] Step 5.3.2: The lane-visibility rail acts as the master list of every lane (including persistently-hidden ones); clicking a hidden lane in the rail flips its visibility on AND adds it to focus. No separate "lanes ▾" dropdown is needed — the rail already serves that role.
- [ ] Step 5.3.3: Mobile / phone: focus-chip strip becomes a horizontally-scrollable row inside the masthead; lane-visibility rail becomes a slide-up sheet triggered by the masthead's "Lanes ▾" button.

### Task 5.4: Lane-visibility panel + drag-to-reorder

- [ ] Step 5.4.1: Studio surface (gear menu or sidebar) listing every lane with: visible toggle, drag handle for reorder.
- [ ] Step 5.4.2: Hidden lanes don't render tabs but their entries still exist and count in dashboard stats.
- [ ] Step 5.4.3: Order stored at `.deskwork/lane-order.json` (project-wide) or per-operator via localStorage per PRD § Implied scope captured.

### Task 5.5: Saveable focus presets + deep-link URL pattern

- [ ] Step 5.5.1: The dashboard's base view is already multi-lane (D3 Press Bay) — every focused lane renders simultaneously. The "composed view" concept becomes a **saved focus preset**: a named subset of `{ visible-lanes, focused-lanes, per-lane-view-mode, per-lane-collapse-state }` that the operator can re-open later.
- [ ] Step 5.5.2: Saved presets stored at `.deskwork/personal/<operator-id>/focus-presets.json` (per-operator) or `.deskwork/focus-presets/<preset-id>.json` (project-wide).
- [ ] Step 5.5.3: Deep-link URL pattern: `/dev/editorial-studio?preset=<preset-id>` opens the saved preset. The lane-visibility rail surfaces "Save current as preset…" and "Load preset…" affordances.

### Task 5.6: Integration test against multi-lane fixture

- [ ] Step 5.6.1: Build a tmp-fixture project with 3 lanes (`default` editorial / `mockups` visual / `qa` qa-plan); add 2 entries per lane in different stages.
- [ ] Step 5.6.2: Boot the studio against the fixture; assert: three swimlanes render in the bay shell (one per focused lane); each swimlane's stage columns match its template; focus-chip strip shows 3 chips + "All"; lane-visibility rail lists all 3 lanes with eye-toggles; hidden-lane test (toggle one off, confirm its chip disappears AND no swimlane renders, but the entry still counts in dashboard stats).
- [ ] Step 5.6.3: Per-lane collapse test: toggle lane-level collapse → swim-head + count strip only; toggle per-stage collapse → narrow vertical strip with rotated name + redistributed remaining columns.
- [ ] Step 5.6.4: Per-lane view-toggle test: flip one lane to list view → vertical stage groups with row entries; flip another to kanban → columnar stages with cards. Both modes show the same entries.
- [ ] Step 5.6.5: Compose-chip test: click `+ new` on a lane → clipboard contains `/deskwork:add <SLUG> --lane <id> --stage <first-linear-stage>`; chip flashes green with `✓ Copied — paste in chat` for ~2s, then reverts.
- [ ] Step 5.6.6: Phone-viewport regression: re-run the existing `scripts/smoke-er-viewport-regressions.mjs` against the multi-lane fixture; assert no overflow / no hidden-affordance / no fixed-position offenders per the project's UI verification protocol. Verify the chip layout doesn't overflow the lane-head row on phone viewports.

**Acceptance Criteria:**

- [ ] Studio dashboard renders one swimlane per focused lane; columns are template-driven (no hardcoded stage names in render code).
- [ ] Lane visibility + focus + reorder all work; visibility persists project-wide-or-per-operator; focus + view-mode + collapse persist per-operator.
- [ ] Per-lane collapse (lane + per-stage) and kanban↔list toggle work with universal chevron convention and viewport-aware defaults.
- [ ] Per-lane `+ new` Compose chip clipboard-copies the partial `/deskwork:add` command with lane + initial stage pre-filled; no form, no popover, no bottom sheet.
- [ ] Saveable focus presets work; deep-link URL pattern opens saved preset.
- [ ] Phone + desktop viewports both render correctly (dual-viewport verification protocol passes for all changed surfaces).
- [ ] WCAG 2.2 SC 2.5.8 AA: every interactive affordance has a ≥24×24 hit target; WCAG 2.1 SC 2.4.7 AA: every interactive affordance has a visible focus ring; WCAG 2.1 SC 1.4.11 AA: contrast ratios verified for chevrons, chips, and stub-text.

## Phase 6: Lane + pipeline CRUD skills + studio management surfaces  ·  [#307](https://github.com/audiocontrol-org/deskwork/issues/307)

**Deliverable:** `/deskwork:lane` and `/deskwork:pipeline` skill families; studio lane-management + pipeline-editor pages; doctor rules for orphan pipeline references.

### Task 6.1: `/deskwork:lane` skill family

- [ ] Step 6.1.1: Author SKILL.md at `plugins/deskwork/skills/lane/SKILL.md` documenting subcommands: `list`, `show <id>`, `create <id> --template <preset-or-custom> --content-dir <path>`, `update <id> [--template <id>] [--name <label>] [--content-dir <path>]`, `archive <id>`, `restore <id>`, `purge <id>` (gated; refused if any entries exist), `move <slug> --to <lane-id>` (cross-lane entry move with stage remap prompt).
- [ ] Step 6.1.2: CLI implementation at `packages/cli/src/commands/lane.ts` covering each subcommand; reads / writes `.deskwork/lanes/<id>.json` via Phase 3's loader.
- [ ] Step 6.1.3: Stage remap on cross-lane move: prompt operator for target stage; default to target lane's first linearStage; preserve `iterationByStage` counters per PRD's open-question default.
- [ ] Step 6.1.4: Content-tree relocation on lane move: move the artifact file (and scrapbook) to the new lane's `contentDir`.
- [ ] Step 6.1.5: Unit tests covering each subcommand against a tmp-fixture.

### Task 6.2: `/deskwork:pipeline` skill family

- [ ] Step 6.2.1: Author SKILL.md at `plugins/deskwork/skills/pipeline/SKILL.md` documenting subcommands: `list`, `show <id>`, `create <id> --shape <linear-stages-spec>` (from-scratch authoring), `update <id> --add-stage <name> [--position N]` / `--rename-stage <from> <to>` / `--remove-stage <name>` / `--set-locked <stages>` / `--set-off-pipeline <stages>`, `delete <id>` (refused if any lane references it; force with `--reassign-lanes-to <other-id>`).
- [ ] Step 6.2.2: CLI implementation at `packages/cli/src/commands/pipeline.ts`.
- [ ] Step 6.2.3: Update / delete operations honor the existing `/deskwork:customize pipeline <preset-id>` start-from-preset path (the customize skill becomes a convenience wrapper around `pipeline create`).
- [ ] Step 6.2.4: Stage rename migration: when an operator renames a stage in a template, doctor surfaces affected entries with a remediation (manual induct, automatic rename via `doctor --apply`, etc.); a `pipeline-renames.json` migration file may live alongside the template per PRD § Pipeline template lifecycle.
- [ ] Step 6.2.5: Unit tests.

### Task 6.3: Studio lane-management page

- [ ] Step 6.3.1: Server-render page at `/dev/lanes/` listing every lane with create / archive / restore buttons; each row shows lane ID, name, bound template, content-dir, entry count, visibility toggle, reorder handle.
- [ ] Step 6.3.2: "New lane" form: prompts for id, name, template (dropdown of available templates from `listAvailablePipelineTemplates`), contentDir.
- [ ] Step 6.3.3: Edit form: same fields, editable; clipboard-copies the equivalent `/deskwork:lane update` invocation per THESIS Consequence 2.
- [ ] Step 6.3.4: Archive / restore actions: clipboard-copy `/deskwork:lane archive <id>` or `/deskwork:lane restore <id>` — studio never mutates sidecar state.

### Task 6.4: Studio pipeline-editor page

> **Phase 2 follow-up (from code-quality review 2026-05-27, I-1):** `listAvailablePipelineTemplates` returns id strings without pre-validating each template. The picker UI in this task surfaces ids that may fail to load when selected (e.g. an operator-authored `.deskwork/pipelines/<id>.json` with malformed JSON). Add an acceptance criterion that selection-time load errors surface as an inline error message naming the offending file path + the specific failure (parse / Zod / id-mismatch). Do NOT silently filter the picker; the operator should see "this id exists but won't load — fix it" rather than "this id is missing." See `packages/core/src/pipelines/loader.ts` for the thrown error shapes the UI should render.

- [ ] Step 6.4.1: Server-render page at `/dev/pipelines/` listing every template with view / edit / create / delete buttons.
- [ ] Step 6.4.2: Pipeline-editor form: visualize linearStages as a horizontal flow with `lockedStages` and `offPipelineStages` distinguished by chrome; operator can add / rename / remove / reorder stages.
- [ ] Step 6.4.3: Each save action clipboard-copies the equivalent `/deskwork:pipeline` invocation.
- [ ] Step 6.4.4: Delete refused when any lane references the template; surfaces the dependent lanes.

### Task 6.5: Doctor rule: orphan-pipeline-reference

- [ ] Step 6.5.1: Add `lane-config-missing-template` doctor rule per PRD § Doctor rules: when a lane config references a `pipelineTemplate` id that doesn't resolve, surface error with the lane file path.
- [ ] Step 6.5.2: Repair flow: operator picks a valid template, or removes the lane.
- [ ] Step 6.5.3: Unit test against a fixture with a dangling pipeline reference.

### Task 6.6: Integration test

- [ ] Step 6.6.1: Tmp-fixture project; create a custom pipeline (`custom-blog` with stages "Idea → Drafting → Reviewed → Live"); create a lane bound to it; add 2 entries; archive the lane; restore; verify entries persist + state intact.

**Acceptance Criteria:**

- [ ] Lane + pipeline CRUD CLI + studio surfaces work end-to-end.
- [ ] Soft-archive is the default; hard delete refused when references exist.
- [ ] Doctor surfaces orphan pipeline references with actionable repair.
- [ ] Studio writes nothing to sidecar state — every action clipboard-copies the equivalent CLI invocation per THESIS Consequence 2.

## Phase 7: Groups — members field + CRUD + review surface + multi-lane composition  ·  [#308](https://github.com/audiocontrol-org/deskwork/issues/308)

**Deliverable:** `/deskwork:group` skill family; group review surface with member panel (multi-lane composition); doctor rules for recursion + dangling members.

### Task 7.1: Schema delta — members[] on entry

- [ ] Step 7.1.1: Extend `EntrySidecar` schema with `members?: string[]` (array of member entry UUIDs).
- [ ] Step 7.1.2: Entries with non-empty `members[]` are groups; otherwise they're regular entries. No separate "group" entity — same schema, same code paths, plus the `members` field.
- [ ] Step 7.1.3: Optional `artifactPath` on group entries: when set, the group has a content body (e.g. `manifesto.md`); when absent, the group is metadata-only.

### Task 7.2: `/deskwork:group` skill family

- [ ] Step 7.2.1: Author SKILL.md at `plugins/deskwork/skills/group/SKILL.md` covering: `list`, `show <slug>`, `create <slug> --lane <lane-id> [--artifact-path <path>]`, `update <slug> [--title <text>]`, `add-member <group-slug> <member-slug>`, `remove-member <group-slug> <member-slug>`, `archive <slug>`. Cancel uses the universal `/deskwork:cancel`.
- [ ] Step 7.2.2: CLI implementation at `packages/cli/src/commands/group.ts`.
- [ ] Step 7.2.3: Member ordering: members are an ordered array; `add-member` appends by default; `--at <index>` inserts; studio drag-to-reorder updates the array.
- [ ] Step 7.2.4: Multi-group membership supported: an entry can be a member of multiple groups simultaneously.
- [ ] Step 7.2.5: Cross-lane membership: members may span lanes; no lane-binding constraint on `add-member`.
- [ ] Step 7.2.6: Cancel propagation: cancelling a group does NOT propagate to members by default (universal-verb rule); `--cascade` is supported opt-in per PRD § Group lifecycle edge cases.

### Task 7.3: Group review surface — Members section

- [ ] Step 7.3.1: When the entry's `members[]` is non-empty, the review surface renders an additional "Members" section.
- [ ] Step 7.3.2: Each member row shows: slug, title, lane (badge), current stage, clipboard-copy link to the member's review surface.
- [ ] Step 7.3.3: Member entries' own rows on the lane dashboard show a "Member of: <group slug>" badge with back-link.
- [ ] Step 7.3.4: When an entry is a member of multiple groups, the badge shows all parents.

### Task 7.4: Group multi-lane review composition

- [ ] Step 7.4.1: A group's review surface renders members in a coordinated multi-lane composition — one column per lane the group spans, members positioned in their lane's stage column, with the group's own stage above.
- [ ] Step 7.4.2: Reuse Phase 5's multi-lane composed-view machinery; scope it to one group's member set.
- [ ] Step 7.4.3: Empty `members[]` falls back to a single-column rendering of the group's own content body (or empty-state if no `artifactPath`).

### Task 7.5: Doctor rules — recursion + dangling members

- [ ] Step 7.5.1: `group-recursive` rule: a group has a member whose `members` array is non-empty → refuse (recursive groups out of scope per v1). Repair: prompts to flatten or unbind.
- [ ] Step 7.5.2: `group-member-missing` rule: a member UUID doesn't resolve. Repair: prompts to remove the dangling reference.
- [ ] Step 7.5.3: `group-all-members-cancelled` informational rule: every member is in `Cancelled`; surface for operator review (cancel the group, remove cancelled members, or leave as-is).
- [ ] Step 7.5.4: Doctor builds a UUID → lane index once per run for efficient member-lookup-across-lanes per PRD § Risks mitigation.

### Task 7.6: Studio group-management page

- [ ] Step 7.6.1: Server-render page at `/dev/groups/` listing every group with member count + lane badges.
- [ ] Step 7.6.2: Per-group surface: members editor with drag-to-reorder, add / remove member buttons (clipboard-copy `/deskwork:group add-member` / `remove-member`).
- [ ] Step 7.6.3: Lifecycle controls: archive / cancel actions clipboard-copy the relevant verb.

### Task 7.7: Iterate semantics on groups

- [ ] Step 7.7.1: Group with `artifactPath`: iterate addresses comments on that file (same as any entry).
- [ ] Step 7.7.2: Group without `artifactPath`: iterate refuses with "group has no editable artifact — iterate operates on the content body when present; otherwise this group is metadata-only."
- [ ] Step 7.7.3: Update `/deskwork:iterate` skill prose to enumerate the group case.

### Task 7.8: Integration tests

- [ ] Step 7.8.1: Tmp-fixture: create a group spanning 2 lanes (`mockups` + `feature-doc`); add 2 members from each lane; advance group through its own stages independently of members; verify members can be in different stages from group.
- [ ] Step 7.8.2: Approve on group does not propagate; cancel with `--cascade` does propagate; recursive-group attempt refused by doctor.

**Acceptance Criteria:**

- [ ] Groups have full lifecycle: create / add-member / remove-member / archive / cancel; cross-lane membership works.
- [ ] Group approve doesn't propagate to members by default; `--cascade` opt-in works.
- [ ] Recursive groups refused via `group-recursive` doctor rule; dangling members surfaced via `group-member-missing`.
- [ ] Group review surface renders multi-lane member composition; member entries show "Member of:" badges.

## Phase 8: Annotation model extension — threads + screenshot attachments + spatial anchors + disposition-trace affordance  ·  [#309](https://github.com/audiocontrol-org/deskwork/issues/309)

**Deliverable:** Threaded replies (`replyTo`), screenshot attachments (`attachments[]`), spatial anchors (`spatialAnchor`), and per-comment disposition-trace affordance (inline diff expansion on "addressed" badge + required free-text disposition reason at iterate time). Cross-cutting; markdown review benefits too. Sidecar storage at `<entryDir>/scrapbook/screenshots/`. Closes #299.

### Task 8.0: Enforce `lane` presence at the doctor layer (Phase 4 follow-up)

> **Phase 4 follow-up (from code-quality review 2026-05-27, M-5):** `packages/core/src/lanes/resolve.ts:60-64` carries a migration-window default that resolves `entry.lane === undefined` to the editorial template. Once doctor's `lane-migration` step (Phase 4 Task 4.4) has run across the canary repos (this project + audiocontrol + writingcontrol) AND reports zero un-migrated entries, the resolver should tighten to throw on missing-lane. `packages/core/src/calendar/render.ts:130-141` similarly carries an `EDITORIAL_FALLBACK` constant that becomes unreachable once doctor enforces lane presence; remove it in the same change.

- [ ] Step 8.0.1: Add a doctor rule `entry-lane-missing` that surfaces every sidecar without a `lane` field as a finding. Repair flow: run `migrateLaneMembership` to back-fill `default`, OR have the operator explicitly assign a lane via `/deskwork:lane move <slug> --to <lane-id>` once Phase 6's lane CRUD ships.
- [ ] Step 8.0.2: Once the canary projects report zero `entry-lane-missing` findings, tighten `resolveEntryTemplate` in `packages/core/src/lanes/resolve.ts:60-64` to throw on missing-lane. Delete the `EDITORIAL_FALLBACK` constant in `packages/core/src/calendar/render.ts` and pipe the renderer through `loadPipelineTemplate` always.
- [ ] Step 8.0.3: Update the `@deprecated` tags in `packages/core/src/schema/entry.ts` to remove the "kept for back-compat" caveat; the legacy editorial helpers can be deleted in a future cleanup once their last callers (legacy calendar migration parser) are themselves removed.

### Task 8.1: Annotation schema extension

- [ ] Step 8.1.1: Extend `CommentAnnotation` (`packages/core/src/annotations/types.ts` or equivalent) with: `replyTo?: string` (root comment id for reply comments); `attachments?: string[]` (relative paths under `<entryDir>/scrapbook/screenshots/`); `spatialAnchor?: { kind: 'pixel' | 'dom-selector' | 'svg-element'; selector?: string; x?: number; y?: number }`.
- [ ] Step 8.1.2: Extend the disposition annotation type with a **required** `reason: string` field (per PRD acceptance criterion: "required free-text disposition reason captured at iterate time").
- [ ] Step 8.1.3: Adopt or align with W3C Web Annotation Data Model per Phase 1's decision; if adopting, the migration sketch from current `comment` is documented in the Phase 1 doc + applied here.
- [ ] Step 8.1.4: Schema validation: existing single-comment annotations (no new fields) keep working unchanged — additive schema delta.

### Task 8.2: Threaded replies rendering

- [ ] Step 8.2.1: Studio's marginalia sidebar renders threads expandable; collapsed thread shows root comment + reply count badge.
- [ ] Step 8.2.2: Per Phase 9's design pick, threads are either inline-on-pin or sidebar-grouped (operator picks the direction in Phase 9; this task translates).
- [ ] Step 8.2.3: Comment-thread permalinks per PRD § Implied scope captured: `/dev/editorial-review/entry/<uuid>#comment/<comment-id>` scrolls to the thread.

### Task 8.3: Screenshot capture mechanism

- [ ] Step 8.3.1: Per Phase 1's decision, implement screenshot capture (native `getDisplayMedia()` / DOM-to-canvas / adopted-library built-in). Land the capture invocation in the studio's review surface.
- [ ] Step 8.3.2: Selection-rectangle UI for region capture; full-frame capture is the alternative path.
- [ ] Step 8.3.3: Captured bytes saved to `<entryDir>/scrapbook/screenshots/<comment-id>-<timestamp>.png` (entry-anchored) OR `<projectRoot>/.deskwork/screenshots-orphan/<timestamp>-<hash>.png` (capture-then-attach flow).

### Task 8.4: Screenshot attachment workflow

- [ ] Step 8.4.1: After capture, operator can attach the screenshot to an existing comment (sets `attachments[]` on the comment) or create a new comment with the screenshot pre-attached.
- [ ] Step 8.4.2: Cross-entry attachment: operator attaches screenshot from entry A to a comment on entry B; the screenshot lives in entry B's scrapbook with a `sourceEntry` field on the attachment metadata.
- [ ] Step 8.4.3: External-image attachment: operator pastes from clipboard or drag-drops any image file from filesystem onto a comment.

### Task 8.5: Iterate skill — required disposition reason

- [ ] Step 8.5.1: Update `/deskwork:iterate` skill prose (`plugins/deskwork/skills/iterate/SKILL.md`) to require a free-text `reason` for every `addressed` disposition. The dispositions file format becomes: `{ "<commentId>": { "disposition": "addressed", "reason": "addressed by adding § X at line N" } }`.
- [ ] Step 8.5.2: The `deskwork iterate` CLI refuses dispositions files missing the `reason` field for `addressed` entries (clear error with example).
- [ ] Step 8.5.3: Existing `addressed` dispositions in the journal without `reason` (legacy) render with "no reason recorded" in the studio — backward compatible read; only new writes are gated.

### Task 8.6: Per-comment inline diff expansion ("addressed" badge → diff)

- [ ] Step 8.6.1: Studio: clicking a comment's "addressed" badge expands inline to show two things — the disposition's `reason` text AND the slice of the prior-vs-new-revision diff that intersects the comment's anchor region.
- [ ] Step 8.6.2: Diff-slicing logic: compute the diff between revision N-1 and revision N (server-side, via diff library); for each comment with `disposition: addressed` on revision N, intersect the diff hunks with the comment's `range` (markdown) or `spatialAnchor` region (graphical) and return that subset.
- [ ] Step 8.6.3: Render the slice as a side-by-side mini-diff inside the expanded comment, with the disposition reason as a header line.
- [ ] Step 8.6.4: When the diff slice is empty (the comment was on a region that didn't change in the new revision), surface "addressed without local diff — see the disposition reason" so the operator knows to read the reason text.

### Task 8.7: Cross-cutting markdown review benefit

- [ ] Step 8.7.1: Verify the existing markdown review surface picks up threads + attachments + inline diff expansion for free (the schema change is additive; the render layer reads the same data).
- [ ] Step 8.7.2: Smoke test: leave a threaded comment + screenshot attachment on an existing markdown entry; confirm the existing review surface renders both correctly.

### Task 8.8: Tests

- [ ] Step 8.8.1: Unit tests for schema validation, diff-slicing logic, screenshot path resolution, dispositions reason-required gate.
- [ ] Step 8.8.2: Integration test against a markdown entry + a (placeholder) graphical entry: thread, attach screenshot, iterate, verify diff expansion works.

**Acceptance Criteria:**

- [ ] Annotation schema supports `replyTo`, `attachments`, `spatialAnchor`, and required-`reason` disposition fields; additive change preserves existing single-comment annotations.
- [ ] Threads render expandable in the marginalia sidebar with reply-count badges.
- [ ] Screenshots can be captured, attached to comments / replies, and persist at the documented sidecar path.
- [ ] Per-comment "addressed" badge expands inline to show the disposition reason + the diff slice intersecting the comment's anchor.
- [ ] Markdown review benefits from threads + attachments + inline diff for free (no additional render-layer work).
- [ ] Issue #299 closes.

## Phase 9: `/frontend-design` pass for the graphical review surface + screenshot markup co-design  ·  [#310](https://github.com/audiocontrol-org/deskwork/issues/310)

**Deliverable:** 2–3 operator-pickable mockup directions covering chrome-free render area, pin placement, thread expansion, screenshot capture affordance, screenshot attachment workflow, **and screenshot markup UI** (arrow / box / freehand / text-label / blur tools). Operator picks; gates Phase 10–12. **No implementation in this phase.**

### Task 9.1: Invoke `/frontend-design` for the chrome-free render area

- [ ] Step 9.1.1: Run `/frontend-design` (the `frontend-design:frontend-design` skill) with the design brief: chrome-free render area for HTML mockup (iframe) and image (`<img>`); collapsible verb bar; comment-thread sidebar that can collapse to a peek-line; full-bleed scale.
- [ ] Step 9.1.2: Honor `DESIGN-STANDARDS.md` § Rubber-stamp / mobile-row conventions per the project rule.
- [ ] Step 9.1.3: Honor the `affordance-placement.md` rule: per-component affordances (stow controls on the component, pull-tab on the edge it vanished into) — not toolbar-attached.

### Task 9.2: Pin placement + thread expansion direction

- [ ] Step 9.2.1: Mockup 2-3 directions for pin placement (where on the artifact the pin marker sits relative to the anchor region; how active vs inactive pins differ visually).
- [ ] Step 9.2.2: Mockup 2-3 directions for thread expansion: inline-on-pin (clicking a pin pops the thread next to the pin) vs sidebar-grouped (all threads listed in the sidebar; pin click highlights + scrolls sidebar) vs hybrid.
- [ ] Step 9.2.3: Mockup thread navigation when many threads exist (jump-to-next-unaddressed, filter by category, etc.).

### Task 9.3: Screenshot capture + attachment affordance

- [ ] Step 9.3.1: Mockup the capture entry-point: where the "capture screenshot" button lives (toolbar / per-comment / per-thread); region-select vs full-frame toggle.
- [ ] Step 9.3.2: Mockup the attachment workflow: capture → attach to existing comment (which comment is highlighted) vs capture → create new comment (which prompts for anchor).
- [ ] Step 9.3.3: Mockup the attachment surface on the comment itself: thumbnail strip below the comment text, click to expand full-size, marked vs original toggle.

### Task 9.4: Screenshot markup UI co-design

- [ ] Step 9.4.1: Mockup the markup editor: canvas-overlay invoked from the capture flow; tool palette (arrow / box / freehand / text-label / blur-region); undo / redo; save / cancel.
- [ ] Step 9.4.2: Tool affordance placement per the project's `affordance-placement.md` rule — on the editor surface, not in a global toolbar.
- [ ] Step 9.4.3: Mobile / touch consideration: markup tools work on touch screens (no hover-only interactions).

### Task 9.5: Disposition-trace affordance (per Phase 8) — visual design

- [ ] Step 9.5.1: Mockup the "addressed" badge → inline diff expansion (how the diff renders next to the comment; how the disposition `reason` is surfaced; how an empty-diff-slice case looks).
- [ ] Step 9.5.2: Mockup the badge → diff transition (animation, micro-interaction) so the operator's mental model of "click badge, see what changed" is reinforced.

### Task 9.6: Operator picks direction

- [ ] Step 9.6.1: Mockups land in `mockups/<date>-graphical-review/` (typically HTML/CSS standalone files); update `mockups/index.html` with a card per direction.
- [ ] Step 9.6.2: Operator reviews + picks; the pick + rationale lands at `docs/studio-design/ACCEPTED/<date>-graphical-review-design/brief.md` per the design-archive contract.
- [ ] Step 9.6.3: Rejected directions land at `docs/studio-design/REJECTED/<date>-graphical-review-<variant>/brief.md` with rationale per the design-archive contract; single-pass rejections still get an entry.
- [ ] Step 9.6.4: Update `DESIGN-STANDARDS.md` change log.

**Acceptance Criteria:**

- [ ] At least 2 mockup directions exist as self-contained HTML+CSS files in `mockups/<date>-graphical-review/`.
- [ ] Operator-picked direction is recorded in `docs/studio-design/ACCEPTED/<date>-graphical-review-design/brief.md`.
- [ ] Rejected directions have corresponding `REJECTED/` entries with rationale.
- [ ] No production code in `packages/` or `plugins/` modified — design-only phase.
- [ ] Phase 10 and Phase 11 implementation can translate the picked mockup directly (no further design ambiguity).

## Phase 10: Graphical entries — HTML review surface  ·  [#311](https://github.com/audiocontrol-org/deskwork/issues/311)

**Deliverable:** Iframe-based chrome-free rendering for `html-mockup` + `single-file-html`; DOM-anchored + coordinate-pinned spatial comments; thread expansion; screenshot attachment workflow; iterate against HTML mockups.

### Task 10.1: Chrome-free iframe rendering

- [ ] Step 10.1.1: Studio review-surface routing: when `artifactKind in ['html-mockup', 'single-file-html']`, render the artifact in an iframe instead of the markdown editor.
- [ ] Step 10.1.2: Iframe loads `index.html` directly (for `html-mockup` directory case) or the loose `<slug>.html` (for `single-file-html` case) with no wrapper styling — the mockup's own CSS governs the rendered surface entirely.
- [ ] Step 10.1.3: Asset routing: sibling `*.css`, `*.js`, `*.png`, etc. under the mockup's directory are served via the studio's existing asset path (or a new graphical-asset path if needed); broken-image / 404 cases surface inline.
- [ ] Step 10.1.4: Verb bar (Iterate / Approve / Cancel) + comment-thread sidebar dock to the edges via the picked-mockup overlay design.

### Task 10.2: DOM-anchored spatial comments

- [ ] Step 10.2.1: Per Phase 1's library decision, integrate the chosen DOM-annotation library against the iframe; communicate marginalia events from inside the iframe to the parent studio surface.
- [ ] Step 10.2.2: Comment anchor records: DOM selector (CSS path), pixel offset (x/y within the element), text-snippet fallback (the visible text near the pin, for resolver recovery).
- [ ] Step 10.2.3: Resolver: try selector first; if missing or text mismatch, try text-snippet match; if still missing, fall back to pixel coordinates with a "stale anchor" warning surfaced inline.
- [ ] Step 10.2.4: Operator can click anywhere on the iframe surface to drop a new pin; the resolver captures all three anchor components.

### Task 10.3: Thread expansion (per Phase 9 mockup pick)

- [ ] Step 10.3.1: Wire the picked thread-expansion direction (inline-on-pin / sidebar-grouped / hybrid) from Phase 9 into the live surface.
- [ ] Step 10.3.2: Thread navigation: jump-to-next-unaddressed; filter by category; permalink scroll per PRD § Implied scope.

### Task 10.4: Screenshot attachment workflow

- [ ] Step 10.4.1: Wire Phase 8's screenshot capture against the iframe (capture renders the iframe's contents, not the studio chrome).
- [ ] Step 10.4.2: Capture flow per Phase 9 mockup: region-select (selection rectangle drawn on the iframe overlay) or full-frame.
- [ ] Step 10.4.3: Attach captured screenshot to a comment / reply per Phase 8's workflow.

### Task 10.5: Iterate against HTML mockups

- [ ] Step 10.5.1: Update `/deskwork:iterate` skill prose to enumerate the HTML-mockup case: agent reads each marginalia anchor (selector + offset + text-snippet + comment text + thread context), resolves against live DOM, identifies the most plausible element, edits HTML / CSS / JS to address the comment.
- [ ] Step 10.5.2: For sibling asset edits (replacing a `*.png`, modifying a `*.css`), the agent operates on the file via Edit / Write tools — same operator-recognizable shape as markdown iterate.
- [ ] Step 10.5.3: Disposition recording follows Phase 8's required-`reason` rule; the diff-slice expansion on "addressed" badge shows the HTML / CSS diff intersecting the comment's selector region.

### Task 10.6: Marginalia anchor resilience

- [ ] Step 10.6.1: Doctor rule: scan an entry's annotations; resolve each anchor against the current artifact; surface unresolved anchors as warnings (per PRD § Risks mitigation).
- [ ] Step 10.6.2: Studio: stale-anchor pins render with distinct chrome ("⚠ this anchor's selector no longer resolves; falling back to text-snippet").

### Task 10.7: Integration test

- [ ] Step 10.7.1: Build a fixture `html-mockup` entry under a tmp-fixture project with a small HTML / CSS / JS bundle.
- [ ] Step 10.7.2: Studio renders the iframe correctly; operator can pin a comment; iterate addresses it; revision history captures pre/post HTML state; doctor surfaces no unresolved anchors.
- [ ] Step 10.7.3: Stale-anchor regression: hand-edit the mockup to rename a class; assert resolver falls back through selector → text-snippet → pixel coordinates correctly; doctor warns on the unresolved selector.

**Acceptance Criteria:**

- [ ] `html-mockup` and `single-file-html` entries render in a chrome-free iframe; mockup's own CSS governs the surface.
- [ ] Comments anchor to DOM elements with resilient fallback (selector → text-snippet → pixel).
- [ ] Iterate edits HTML/CSS/JS to address marginalia; revision history captures pre/post state.
- [ ] Stale anchors surface inline with distinct chrome + doctor warning.

## Phase 11: Graphical entries — image review surface + iteration paths  ·  [#312](https://github.com/audiocontrol-org/deskwork/issues/312)

**Deliverable:** Chrome-free image review surface; region-anchored marginalia (raster) + element-anchored marginalia (SVG); iterate skill prose enumerates the four image-iteration paths.

### Task 11.1: Chrome-free image rendering

- [ ] Step 11.1.1: Studio review-surface routing: when `artifactKind === 'image'`, render the artifact in an `<img>` wrapper (raster) or inline SVG (vector).
- [ ] Step 11.1.2: Marginalia overlay sits on top of the image; pin click captures coordinates in image-natural-space (not viewport-space) so anchors survive resize.
- [ ] Step 11.1.3: Zoom + pan controls for large images (per the picked Phase 9 mockup direction).

### Task 11.2: Region-anchored marginalia (raster)

- [ ] Step 11.2.1: Per Phase 1's library decision (likely Annotorious-class), wire the chosen image-annotation library into the studio review surface.
- [ ] Step 11.2.2: Anchor records: pixel coordinates (x, y in image-natural-space); optional region (rectangle / polygon / freehand) per the library's capability.
- [ ] Step 11.2.3: Resizing the image in-browser doesn't move pins (anchors stay in image-natural-space).

### Task 11.3: Element-anchored marginalia (SVG)

- [ ] Step 11.3.1: For SVG entries, anchors use element-selector (SVG's element id, class, or generated path); falls back to pixel coordinates if the selector doesn't resolve.
- [ ] Step 11.3.2: Resolver: try selector first; fall back to pixel coordinates with a "stale anchor" warning (same shape as Phase 10's HTML resolver).

### Task 11.4: Iterate skill — four image-iteration paths

- [ ] Step 11.4.1: Update `/deskwork:iterate` skill prose to enumerate the four paths:
  - **Agent-driven regeneration** for generation-pipeline images (Midjourney, Stable Diffusion, DALL·E) — agent reads marginalia, regenerates with updated prompt, replaces file.
  - **Agent-driven programmatic transformation** for crops / annotations / composites — agent runs ImageMagick / sharp / custom script per the comment.
  - **SVG edits** — agent edits SVG source directly via element-selector anchors.
  - **Operator-supplied replacement** — operator drops a new image file at `artifactPath`; iterate appends as the next revision.
- [ ] Step 11.4.2: Skill prose asks the agent to pick the path matching the comments + available tooling; if none apply, report back to operator with comments unaddressed.
- [ ] Step 11.4.3: Revision history captures the prior image bytes in the journal per `DESKWORK-STATE-MACHINE.md` § Versions and revisions; the new file replaces the old at `artifactPath`.

### Task 11.5: Per-project iteration handlers

- [ ] Step 11.5.1: Support `<projectRoot>/.deskwork/iterate-handlers/<artifactKind>.ts` per PRD § Graphical entries.
- [ ] Step 11.5.2: Handler signature: `(marginalia, entryContext) => Promise<{ newContent: Buffer; metadata?: Record<string, unknown> }>`.
- [ ] Step 11.5.3: Discovery uses the same override-resolver pattern as templates and doctor rules (Phase 2's machinery).
- [ ] Step 11.5.4: Iterate skill prose explains when the agent uses the handler vs. its own judgment.

### Task 11.6: Doctor rule — image-locked-stage drift

- [ ] Step 11.6.1: `image-locked-stage` rule: an image entry is in a `lockedStages` stage but has been iterated since reaching it → surface the iterate journal entries for manual review per PRD § Doctor rules.
- [ ] Step 11.6.2: Repair flow: operator reviews the drift and decides (induct backward + re-iterate properly, or fold the drift into the revision history).

### Task 11.7: Manual dogfood

- [ ] Step 11.7.1: Ingest one of the project's existing `docs/studio-design/` mockups as a `visual`-lane entry; iterate it; approve it.
- [ ] Step 11.7.2: Ingest a screenshot (e.g., one from the dogfood TF log); iterate via operator-supplied replacement.
- [ ] Step 11.7.3: Capture a screenshot of a pathological state from one of the spike fixtures; attach to a comment; verify both versions persist.
- [ ] Step 11.7.4: Log any friction surfaces as new TF entries.

### Task 11.8: Integration test

- [ ] Step 11.8.1: Tmp-fixture with one PNG entry + one SVG entry; pin comments on each; iterate via operator-supplied replacement (PNG) and SVG edit (SVG); verify revision history captures prior bytes; doctor surfaces no anchor warnings.

**Acceptance Criteria:**

- [ ] Image entries (PNG / JPG / SVG) render chrome-free with marginalia overlay.
- [ ] Anchors stay correct across resize (raster) and survive element-selector edits with fallback (SVG).
- [ ] Iterate skill enumerates 4 image-iteration paths; agent picks the right one per the comments + tooling.
- [ ] Per-project iteration handlers load via override-resolver.
- [ ] Doctor surfaces image-locked-stage drift.
- [ ] Manual dogfood successfully exercises ingest + iterate + approve on at least one existing `docs/studio-design/` mockup.

## Phase 12: Screenshot markup / drawing UI  ·  [#313](https://github.com/audiocontrol-org/deskwork/issues/313)

**Deliverable:** Operator-side annotation of captured screenshots before attaching: arrow, box, freehand, text-label, blur-region tools. Markup persists as `<comment-id>-<timestamp>-marked.png` alongside the raw capture; comment annotation's `attachments[]` references the marked file with `originalAttachment` linking back to the raw.

### Task 12.1: Canvas-overlay markup editor

- [ ] Step 12.1.1: Implement the markup editor per Phase 9's picked design: HTML5 canvas overlay invoked from the capture flow.
- [ ] Step 12.1.2: Loads the raw captured screenshot as the canvas base layer; markup draws on a second canvas layer.
- [ ] Step 12.1.3: Touch + mouse + stylus input all supported (per Phase 9 mobile-aware requirement).

### Task 12.2: Markup tool palette

- [ ] Step 12.2.1: **Arrow** tool: click-drag to draw an arrow from start to end; configurable head size + color.
- [ ] Step 12.2.2: **Box** tool: click-drag to draw a rectangle; outline or filled with operator-selected opacity.
- [ ] Step 12.2.3: **Freehand** tool: drag to draw a freehand line; smoothing algorithm reduces jitter.
- [ ] Step 12.2.4: **Text-label** tool: click to place text input; operator types label; configurable font size + color.
- [ ] Step 12.2.5: **Blur-region** tool: click-drag rectangle; the region is gaussian-blurred (canvas filter) — for sensitive content.
- [ ] Step 12.2.6: Undo / redo stack covering all tools.

### Task 12.3: Save + persistence

- [ ] Step 12.3.1: "Save markup" exports the composed canvas (base + markup) as PNG to `<entryDir>/scrapbook/screenshots/<comment-id>-<timestamp>-marked.png`.
- [ ] Step 12.3.2: The raw capture stays at `<comment-id>-<timestamp>.png` (untouched).
- [ ] Step 12.3.3: Comment annotation's `attachments[]` array updated to reference the marked file path.
- [ ] Step 12.3.4: Attachment metadata gains `originalAttachment: <raw-file-path>` so the operator can re-mark the raw or compare versions.

### Task 12.4: Studio rendering of marked attachments

- [ ] Step 12.4.1: Comment renders the marked version by default with a small "original" toggle in the chrome.
- [ ] Step 12.4.2: Clicking the marked version opens a full-size lightbox; clicking the toggle in the lightbox swaps to raw.

### Task 12.5: Re-mark workflow

- [ ] Step 12.5.1: Operator can re-mark an existing screenshot: opens the markup editor pre-loaded with the raw + prior markup (loaded as separate layer for further editing).
- [ ] Step 12.5.2: Save creates a new file (e.g. `<comment-id>-<timestamp>-marked-v2.png`); the comment's `attachments[]` updates to the new version; prior versions preserved in the journal.

### Task 12.6: Integration test + mobile verification

- [ ] Step 12.6.1: Tmp-fixture: capture a fixture screenshot; mark with each of the 5 tools; save; verify the marked file persists alongside raw; verify the comment renders both versions.
- [ ] Step 12.6.2: Touch-screen verification: run a Playwright test against an iPhone-class viewport; assert each tool works with touch input (no hover-only interaction).

**Acceptance Criteria:**

- [ ] Markup editor supports all five tools (arrow / box / freehand / text-label / blur-region) + undo / redo.
- [ ] Marked screenshot persists alongside the raw capture; comment annotation references both via `attachments[]` + `originalAttachment`.
- [ ] Re-mark workflow preserves prior markup versions in the journal.
- [ ] Touch-screen markup works without hover-only interactions.

## Closing milestone: scope-discovery v1 dogfood TF summary + audit handoff

**Deliverable:** Final TF entry in `tooling-feedback.md` summarizing the dogfood result (what worked / what didn't / what needs follow-up); closing comment on the feature PR linking the log; handoff to the scope-discovery team to import as `AUDIT-<date>-<NN>` entries in their audit log. Per PRD § Secondary deliverable.

### Task C.1: Aggregate TF entries + identify patterns

- [ ] Step C.1.1: Walk every TF-NNN entry in `tooling-feedback.md`; tabulate by category (A / AM / CL / GATE / DSC / MISC) + severity (high / medium / low).
- [ ] Step C.1.2: Identify recurring patterns — same root cause surfacing in multiple TF entries; promote those to GH issues if not already filed.
- [ ] Step C.1.3: Tabulate dispositions: how many TF entries closed by an in-flight fix during this feature vs how many remain open at feature-close.

### Task C.2: Write final TF summary

- [ ] Step C.2.1: Append the closure entry to `tooling-feedback.md` (next TF-NNN id) with title shape `TF-NNN · MISC · n/a · Dogfood closure summary`.
- [ ] Step C.2.2: Body: what worked (which protocol layers caught friction proactively); what didn't (which surfaces fell through to operator catch); what needs follow-up (recurring patterns justifying a v1.1 audit cycle).
- [ ] Step C.2.3: Include a one-line summary per still-open TF entry naming the gap; list closed TF entries with their closing-commit SHAs.

### Task C.3: Closing comment on the feature PR

- [ ] Step C.3.1: Comment on the graphical-entries PR linking `tooling-feedback.md` + naming the total TF count + how many promoted to GH issues.
- [ ] Step C.3.2: Tag the deskwork team for the audit-log import.

### Task C.4: Audit-log handoff

- [ ] Step C.4.1: The deskwork team imports the closure into `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` as `AUDIT-<date>-<NN>` entries — mirror of how the audiocontrol pilot's TF-001..TF-016 imported into AUDIT-20260525-05..09.
- [ ] Step C.4.2: Each AUDIT entry references its source TF entry + summarizes the friction shape + the suggested fix.
- [ ] Step C.4.3: The aggregated audit-log entries become the v1.1 workplan input for scope-discovery.

**Acceptance Criteria:**

- [ ] `tooling-feedback.md` carries a TF closure summary entry.
- [ ] The feature PR has a closing comment with TF count + promoted-issue count.
- [ ] The scope-discovery team has imported AUDIT entries derived from this feature's TF log.
