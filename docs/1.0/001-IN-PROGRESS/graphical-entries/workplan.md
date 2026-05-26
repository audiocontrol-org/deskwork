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

- [ ] Step 1.1.1: Author a candidate matrix at `docs/studio-design/PROPOSED/<date>-graphical-review-prior-art/candidates.md` with one row per project (Annotorious, Recogito, Hypothes.is client SDK, W3C Web Annotation Data Model, Penpot embeddable, Storybook addon-design-assets / addon-discuss, html2canvas, dom-to-image-more, MediaDevices.getDisplayMedia, Marker.io / Pastel / BugHerd as inform-only).
- [ ] Step 1.1.2: For each: license, last-commit date, dependency footprint (size of bundle if adopted), self-hosting cost (where applicable), W3C Web Annotation Data Model alignment, browser-API surface used.
- [ ] Step 1.1.3: Drop the matrix into the decision-doc draft as the "Survey" section.

### Task 1.2: Spike — image annotation library integration

- [ ] Step 1.2.1: Pick the top-2 image-annotation candidates from Task 1.1 (typically Annotorious + Recogito).
- [ ] Step 1.2.2: Build a minimal spike at `spikes/graphical-review/<library>-image/` that loads a fixture image, lets the operator pin a region, persists the annotation as a W3C Web Annotation JSON-LD payload.
- [ ] Step 1.2.3: Measure integration cost: lines of glue code, dependency-tree weight, theming overrides required, mobile support, accessibility (keyboard navigation, screen-reader labels).
- [ ] Step 1.2.4: Record findings in the decision-doc draft as the "Image annotation spike" section.

### Task 1.3: Spike — HTML mockup annotation library integration

- [ ] Step 1.3.1: Pick the top-2 HTML-annotation candidates (Hypothes.is client + Annotorious-extended-for-HTML; or build a thin DOM-selector-based annotator if both spike poorly).
- [ ] Step 1.3.2: Build a minimal spike at `spikes/graphical-review/<library>-html/` that loads a fixture HTML mockup in an iframe, lets the operator pin a comment to a DOM selector (with text-snippet + pixel-offset fallback), persists the annotation.
- [ ] Step 1.3.3: Test anchor resilience: hand-edit the mockup's HTML (rename a class, add a sibling, reorder); confirm the resolver still finds the original target via fallback paths.
- [ ] Step 1.3.4: Record findings in the decision-doc draft as the "HTML annotation spike" section.

### Task 1.4: Spike — screenshot capture + markup mechanisms

- [ ] Step 1.4.1: Build a `getDisplayMedia()` capture spike at `spikes/graphical-review/capture-getdisplaymedia/`; measure browser support, prompt-permission UX cost.
- [ ] Step 1.4.2: Build a DOM-to-canvas capture spike using `html2canvas` (or `dom-to-image-more`) at `spikes/graphical-review/capture-dom-to-canvas/`; measure rendering fidelity vs the live surface, font + CSS edge cases.
- [ ] Step 1.4.3: Build a markup-tools spike (canvas-overlay editor with arrow / box / freehand / text-label / blur tools); decide whether to adopt an existing library (e.g. tldraw, excalidraw-react) or build minimal in-house.
- [ ] Step 1.4.4: Record findings in the decision-doc draft as the "Screenshot capture + markup spike" section.

### Task 1.5: Threading + W3C alignment decision

- [ ] Step 1.5.1: Document whether each picked library has native threading (`replyTo` / reply-chain) or whether we extend our own per the schema in PRD § Annotation model extensions.
- [ ] Step 1.5.2: Decide whether the project's `CommentAnnotation` shape adopts W3C Web Annotation Data Model directly, extends it, or stays a project-internal schema (with W3C alignment as future-interop guarantee).
- [ ] Step 1.5.3: Record decision in the doc with migration sketch from current `comment` annotation type.

### Task 1.6: Write decision document

- [ ] Step 1.6.1: Move the draft to `docs/studio-design/ACCEPTED/<date>-graphical-review-prior-art/brief.md` per the project's design-archive contract.
- [ ] Step 1.6.2: For each concern (annotation data model / image annotation UI / HTML annotation UI / threading / screenshot capture / screenshot markup), record: chosen approach, rationale, dependency footprint, adopter-facing impact (new peer dep, bundle size delta), v1 scope vs deferred.
- [ ] Step 1.6.3: Add a "Reject log" section listing every candidate considered + the specific reason rejected (per the design-archive convention's REJECTED tracking).
- [ ] Step 1.6.4: Append a one-line entry to `DESIGN-STANDARDS.md`'s change log per the project rule (design decisions with global impact land in the standards doc + an archive entry).

**Acceptance Criteria:**

- [ ] Decision document exists at `docs/studio-design/ACCEPTED/<date>-graphical-review-prior-art/brief.md`.
- [ ] Each of the 6 concerns has a chosen approach + rationale.
- [ ] Spike repos exist at `spikes/graphical-review/<library>-*` for at least image + HTML + capture; each runs `npm install && npm start` (or equivalent) to demonstrate the spike.
- [ ] DESIGN-STANDARDS.md change log has an entry for this decision; the archive directory has both ACCEPTED and REJECTED entries.
- [ ] No production code in `packages/` or `plugins/` modified — research-only phase.

## Phase 2: Pipeline template loader + preset defaults + override resolver  ·  [#303](https://github.com/audiocontrol-org/deskwork/issues/303)

**Deliverable:** JSON load + schema validation; five preset templates ship at `packages/core/src/pipelines/{editorial,visual,feature-doc,qa-plan,blog-post}.json`; override resolver picks per-project overrides under `<projectRoot>/.deskwork/pipelines/`. Unit tests.

### Task 2.1: PipelineTemplate type + JSON schema

- [ ] Step 2.1.1: Author the `PipelineTemplate` type at `packages/core/src/pipelines/types.ts` matching the PRD's interface (id, name, description, linearStages, lockedStages?, offPipelineStages).
- [ ] Step 2.1.2: Author a Zod schema for `PipelineTemplate` at the same location; export schema + inferred type.
- [ ] Step 2.1.3: Invariant tests: linearStages must be non-empty; lockedStages must be a subset of linearStages; `Cancelled` is reserved if present in offPipelineStages.

### Task 2.2: Override resolver extension

- [ ] Step 2.2.1: Locate the existing override-resolver infrastructure at `packages/core/src/overrides.ts` (THESIS Consequence 3 machinery).
- [ ] Step 2.2.2: Add a `loadPipelineTemplate(id: string, projectRoot: string)` function that checks `<projectRoot>/.deskwork/pipelines/<id>.json` first, falls back to `packages/core/src/pipelines/<id>.json`.
- [ ] Step 2.2.3: Add a `listAvailablePipelineTemplates(projectRoot: string)` function that returns every template found in project overrides + plugin defaults, de-duplicated by id.
- [ ] Step 2.2.4: Unit tests covering override-takes-precedence + plugin-default-fallback + listing-deduplication.

### Task 2.3: Ship five preset templates

- [ ] Step 2.3.1: Author `packages/core/src/pipelines/editorial.json` matching the legacy single-pipeline stage names exactly: linearStages `["Ideas","Planned","Outlining","Drafting","Final","Published"]`, lockedStages `["Final"]`, offPipelineStages `["Blocked","Cancelled"]`. Include a header comment block documenting the lifecycle rationale.
- [ ] Step 2.3.2: Author `packages/core/src/pipelines/visual.json` (Sketched / Iterating / Approved / Shipped; locked: Approved; off: Blocked / Cancelled / Archived) with rationale.
- [ ] Step 2.3.3: Author `packages/core/src/pipelines/feature-doc.json` (Defined / Drafting / Approved / Implemented / Complete; locked: Approved / Implemented; off: Blocked / Cancelled) with rationale.
- [ ] Step 2.3.4: Author `packages/core/src/pipelines/qa-plan.json` (Drafted / Reviewed / Tested / Approved; locked: Reviewed; off: Blocked / Cancelled / Archived) with rationale.
- [ ] Step 2.3.5: Author `packages/core/src/pipelines/blog-post.json` (Idea / Drafting / Edited / Published; locked: Edited; off: Blocked / Cancelled) with rationale.
- [ ] Step 2.3.6: Validate each preset against the Zod schema in a unit test; assert all five load cleanly via the resolver.

**Acceptance Criteria:**

- [ ] Each preset is loadable via `loadPipelineTemplate(id, anyProjectRoot)` and passes schema validation.
- [ ] Project overrides at `<root>/.deskwork/pipelines/<id>.json` take precedence over the plugin default.
- [ ] `listAvailablePipelineTemplates` returns the union of plugin defaults + project overrides with no duplicates.
- [ ] All five preset JSON files carry header comments documenting their lifecycle rationale (operator-authored custom pipelines have a working exemplar to copy from).

## Phase 3: Lane data model + config loader + entry schema delta  ·  [#304](https://github.com/audiocontrol-org/deskwork/issues/304)

**Deliverable:** `.deskwork/lanes/<id>.json` schema + loader; entry sidecar gains `lane` + `artifactKind`; doctor migration creates `default` lane and back-fills entries on first run. Unit tests.

### Task 3.1: LaneConfig type + JSON schema + loader

- [ ] Step 3.1.1: Author `LaneConfig` type at `packages/core/src/lanes/types.ts` per the PRD's interface (id, name, pipelineTemplate, contentDir).
- [ ] Step 3.1.2: Zod schema for `LaneConfig`; export schema + inferred type.
- [ ] Step 3.1.3: `loadLaneConfig(id: string, projectRoot: string)` function reading `<projectRoot>/.deskwork/lanes/<id>.json`; refuses missing files with a clear error (no fallback per the project's no-fallback rule).
- [ ] Step 3.1.4: `listLaneConfigs(projectRoot: string)` returns every `*.json` under `.deskwork/lanes/`.
- [ ] Step 3.1.5: Cross-validation: lane's `pipelineTemplate` must resolve via the Phase 2 template loader.

### Task 3.2: Entry sidecar schema delta — lane + artifactKind

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

- [ ] Step 4.1.1: Identify every hardcoded stage list across the CLI (`approve`, `iterate`, `cancel`, `induct`, doctor rules) — produce a grep manifest.
- [ ] Step 4.1.2: Plumb the entry's lane → template through each verb's stage-gate logic; replace hardcoded lists with template reads.
- [ ] Step 4.1.3: Unit tests covering each verb against both the `editorial` preset (legacy default) and a non-editorial preset (`visual`) — confirm stage advancement, locked-stage refusal, cul-de-sac transitions.

**Acceptance Criteria:**

- [ ] All four verbs consult the entry's lane template; no hardcoded stage list remains in verb logic.
- [ ] Existing single-lane projects (legacy `editorial` semantics) continue to work unchanged.

### Task 4.2: Calendar regen — fix #247 (writer-side)

- [ ] Step 4.2.1: Trace the calendar-regen module's current stage-iteration list; confirm it still emits pre-redesign stage names (`Review` / `Paused`).
- [ ] Step 4.2.2: Refactor calendar regen to iterate the lane's template stages (linearStages ∪ offPipelineStages); for multi-lane projects, emit a per-lane section with the lane's template stage list.
- [ ] Step 4.2.3: Regression test: regen against a fixture project with entries in `Final` and `Cancelled` — confirm every entry persists in the rendered calendar; no `Review` / `Paused` ghost sections.
- [ ] Step 4.2.4: Smoke test against the current deskwork repo's actual `.deskwork/calendar.md` — confirm the 12 currently-orphaned entries (PRDs + design docs in Final/Cancelled) all render correctly post-regen.

**Acceptance Criteria:**

- [ ] `deskwork ingest --apply` and `deskwork approve` no longer drop Final / Cancelled entries from the calendar.
- [ ] Calendar sections match the canonical eight stages (or the lane's template stages in multi-lane projects); no `Review` / `Paused` legacy sections.
- [ ] Issue #247 closes via the smoke-test evidence comment.

### Task 4.3: Doctor parser — fix #300 (reader-side counterpart)

- [ ] Step 4.3.1: Locate the `orphan-frontmatter-id` rule's calendar-parsing logic.
- [ ] Step 4.3.2: Replace section-based parsing with a UUID-set-based lookup (per #300's recommended fix B): scan every row across every table in the calendar; collect UUIDs into a flat set; check frontmatter IDs against the set.
- [ ] Step 4.3.3: Regression test: assemble a fixture calendar with entries in `Ideas`, `Drafting`, `Final`, `Cancelled` sections; assert zero false-positive orphan flags.
- [ ] Step 4.3.4: Smoke test against current deskwork repo state — confirm the 12 currently-false-positive entries no longer surface as orphans.

**Acceptance Criteria:**

- [ ] `deskwork doctor` reports zero false positives for entries in `Final` and `Cancelled` sections.
- [ ] Issue #300 closes via the smoke-test evidence comment.

### Task 4.4: Doctor migration scaffolding

- [ ] Step 4.4.1: Implement the `default` lane auto-creation on first invocation under the new model (per PRD § Migration step 1).
- [ ] Step 4.4.2: Back-fill `lane: "default"` and derived `artifactKind` on every existing sidecar.
- [ ] Step 4.4.3: Emit `migration` journal events for each change.
- [ ] Step 4.4.4: Integration test: pre-feature single-pipeline project → run doctor → confirm `default` lane created, every entry has `lane: default` + correct `artifactKind`.

**Acceptance Criteria:**

- [ ] Migration runs in `--dry-run` first; atomic sidecar writes (tmp + rename) per existing ingest pattern.
- [ ] Every legacy entry post-migration has `lane: "default"` and a correct `artifactKind`.
- [ ] No data loss — all existing frontmatter, scrapbook content, marginalia, journal events preserved.

## Phase 5: Studio render — per-lane tabs + template stage columns + combined overview + lane-visibility panel + multi-lane composed views  ·  [#306](https://github.com/audiocontrol-org/deskwork/issues/306)

**Deliverable:** Markdown-only studio render that's lane-aware. Tab strip + Combined overview + lane visibility panel + multi-lane composed views. Integration test against multi-lane fixture.

### Task 5.1: Per-lane dashboard tab strip + Combined overview

- [ ] Step 5.1.1: Refactor the studio's dashboard server-render to read `listLaneConfigs(projectRoot)` and emit one tab per lane plus a "Combined" tab.
- [ ] Step 5.1.2: Each tab's body renders the lane's dashboard: columns drawn from the lane's template `linearStages` (in order) + an "Off-pipeline" section listing entries in `offPipelineStages`.
- [ ] Step 5.1.3: Combined tab aggregates rows from all lanes with a lane-badge per row indicating membership.
- [ ] Step 5.1.4: Default tab on first load = Combined; remembers last-active tab per-operator via localStorage.

### Task 5.2: Template-aware stage columns (no hardcoded stages in render)

- [ ] Step 5.2.1: Grep the studio's render code for hardcoded stage names (`Drafting`, `Final`, `Published`, etc.); refactor every site to read from the lane's template instead.
- [ ] Step 5.2.2: Empty-lane state: shows the lane's pipeline shape as empty stage columns + a "Create your first entry" CTA that clipboard-copies `/deskwork:add --lane <id>`.
- [ ] Step 5.2.3: Per Commandment III, no surface renders "review state" labels — only stage labels appear.

### Task 5.3: Many-lane overflow + dropdown

- [ ] Step 5.3.1: When N lanes > viewport-fitting threshold, the tab strip overflows into a horizontally-scrollable strip.
- [ ] Step 5.3.2: A "lanes ▾" dropdown lets the operator jump directly to any lane (including hidden lanes); selecting from the dropdown also makes the lane visible if hidden.
- [ ] Step 5.3.3: Mobile / phone: tab strip becomes a swipeable carousel; stage columns collapse to a vertical accordion per the existing mobile-first work.

### Task 5.4: Lane-visibility panel + drag-to-reorder

- [ ] Step 5.4.1: Studio surface (gear menu or sidebar) listing every lane with: visible toggle, drag handle for reorder.
- [ ] Step 5.4.2: Hidden lanes don't render tabs but their entries still exist and count in dashboard stats.
- [ ] Step 5.4.3: Order stored at `.deskwork/lane-order.json` (project-wide) or per-operator via localStorage per PRD § Implied scope captured.

### Task 5.5: Multi-lane composed views (saveable + reopenable)

- [ ] Step 5.5.1: Operator can pick a subset of lanes (e.g. `mockups` + `feature-doc`) and pin a multi-lane view that tiles their dashboards horizontally with shared scroll for stage rows.
- [ ] Step 5.5.2: Saved views stored at `.deskwork/personal/<operator-id>.json` (per-operator) or `.deskwork/views/<view-id>.json` (project-wide).
- [ ] Step 5.5.3: Deep-link URL pattern: `/dev/view/<view-id>` opens the saved composition.

### Task 5.6: Integration test against multi-lane fixture

- [ ] Step 5.6.1: Build a tmp-fixture project with 3 lanes (`default` editorial / `mockups` visual / `qa` qa-plan); add 2 entries per lane in different stages.
- [ ] Step 5.6.2: Boot the studio against the fixture; assert: tab strip has 4 tabs (3 lanes + Combined); each lane tab's columns match its template; Combined shows all 6 entries with lane badges; hidden-lane test (toggle one off, confirm tab disappears but entry still counts in stats).
- [ ] Step 5.6.3: Phone-viewport regression: re-run the existing `scripts/smoke-er-viewport-regressions.mjs` against the multi-lane fixture; assert no overflow / no hidden-affordance / no fixed-position offenders per the project's UI verification protocol.

**Acceptance Criteria:**

- [ ] Studio dashboard renders one tab per lane + Combined; columns are template-driven (no hardcoded stage names in render code).
- [ ] Lane visibility + reorder works; ordering persists.
- [ ] Multi-lane composed views are saveable and reopenable via deep link.
- [ ] Phone + desktop viewports both render correctly (dual-viewport verification protocol passes for all changed surfaces).

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
