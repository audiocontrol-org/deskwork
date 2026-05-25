---
slug: graphical-entries
targetVersion: "1.0"
date: 2026-05-25
---

# Workplan: Graphical Entries

**Goal:** Generalize deskwork's pipeline model to support per-project lanes bound to pipeline templates, add cross-lane groups, and add first-class graphical entries (`html-mockup` / `single-file-html` / `image`) with a chrome-free review surface — preserving the canonical pipeline shape across all templates and migrating existing projects with zero data loss.

> The workplan elaborates the PRD's Implementation Phases (§ `prd.md` lines 343–360) into tasks with acceptance criteria. Phase 4 is partially elaborated here because it carries scoped-in tooling fixes (#247, #300); the other phases land their task breakdowns when the operator-driven workplan elaboration step runs.

## Phase 1: Prior-art research + build-vs-reuse decision

**Deliverable:** Decision document at `docs/studio-design/ACCEPTED/<date>-graphical-review-prior-art/brief.md` recording the chosen stack (annotation data model, image annotation UI, HTML annotation UI, threading, screenshot capture, screenshot markup) with rationale + dependency footprint + adopter-facing impact. **No production implementation in this phase.**

Tasks: TBD — elaborate from PRD § Prior art and § Tasks/Phase 1.

## Phase 2: Pipeline template loader + preset defaults + override resolver

**Deliverable:** JSON load + schema validation; five preset templates ship at `packages/core/src/pipelines/{editorial,visual,feature-doc,qa-plan,blog-post}.json`; override resolver picks per-project overrides under `<projectRoot>/.deskwork/pipelines/`. Unit tests.

Tasks: TBD — elaborate from PRD § Pipeline templates.

## Phase 3: Lane data model + config loader + entry schema delta

**Deliverable:** `.deskwork/lanes/<id>.json` schema + loader; entry sidecar gains `lane` + `artifactKind`; doctor migration creates `default` lane and back-fills entries on first run. Unit tests.

Tasks: TBD — elaborate from PRD § Lanes and § Migration.

## Phase 4: Verb refactor + stage-list reads through lane's template + tooling fixes

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

## Phase 5: Studio render — per-lane tabs + template stage columns + combined overview + lane-visibility panel + multi-lane composed views

**Deliverable:** Markdown-only studio render that's lane-aware. Tab strip + Combined overview + lane visibility panel + multi-lane composed views. Integration test against multi-lane fixture.

Tasks: TBD — elaborate from PRD § Studio rendering.

## Phase 6: Lane + pipeline CRUD skills + studio management surfaces

**Deliverable:** `/deskwork:lane` and `/deskwork:pipeline` skill families; studio lane-management + pipeline-editor pages; doctor rules for orphan pipeline references.

Tasks: TBD — elaborate from PRD § CRUD support and § Skill changes.

## Phase 7: Groups — members field + CRUD + review surface + multi-lane composition

**Deliverable:** `/deskwork:group` skill family; group review surface with member panel (multi-lane composition); doctor rules for recursion + dangling members.

Tasks: TBD — elaborate from PRD § Groups.

## Phase 8: Annotation model extension — threads + screenshot attachments + spatial anchors + disposition-trace affordance

**Deliverable:** Threaded replies (`replyTo`), screenshot attachments (`attachments[]`), spatial anchors (`spatialAnchor`), and per-comment disposition-trace affordance (inline diff expansion on "addressed" badge + required free-text disposition reason at iterate time). Cross-cutting; markdown review benefits too. Sidecar storage at `<entryDir>/scrapbook/screenshots/`. Closes #299.

Tasks: TBD — elaborate from PRD § Annotation model extensions.

## Phase 9: `/frontend-design` pass for the graphical review surface + screenshot markup co-design

**Deliverable:** 2–3 operator-pickable mockup directions covering chrome-free render area, pin placement, thread expansion, screenshot capture affordance, screenshot attachment workflow, **and screenshot markup UI** (arrow / box / freehand / text-label / blur tools). Operator picks; gates Phase 10–12. **No implementation in this phase.**

Tasks: TBD — elaborate from PRD § Graphical review surface and § Tasks/Phase 9.

## Phase 10: Graphical entries — HTML review surface

**Deliverable:** Iframe-based chrome-free rendering for `html-mockup` + `single-file-html`; DOM-anchored + coordinate-pinned spatial comments; thread expansion; screenshot attachment workflow; iterate against HTML mockups.

Tasks: TBD — elaborate from PRD § Tasks/Phase 10.

## Phase 11: Graphical entries — image review surface + iteration paths

**Deliverable:** Chrome-free image review surface; region-anchored marginalia (raster) + element-anchored marginalia (SVG); iterate skill prose enumerates the four image-iteration paths.

Tasks: TBD — elaborate from PRD § Tasks/Phase 11.

## Phase 12: Screenshot markup / drawing UI

**Deliverable:** Operator-side annotation of captured screenshots before attaching: arrow, box, freehand, text-label, blur-region tools. Markup persists as `<comment-id>-<timestamp>-marked.png` alongside the raw capture; comment annotation's `attachments[]` references the marked file with `originalAttachment` linking back to the raw.

Tasks: TBD — elaborate from PRD § Tasks/Phase 12.

## Closing milestone: scope-discovery v1 dogfood TF summary + audit handoff

**Deliverable:** Final TF entry in `tooling-feedback.md` summarizing the dogfood result (what worked / what didn't / what needs follow-up); closing comment on the feature PR linking the log; handoff to the scope-discovery team to import as `AUDIT-<date>-<NN>` entries in their audit log. Per PRD § Secondary deliverable.

Tasks: TBD — elaborate at feature-ship time.
