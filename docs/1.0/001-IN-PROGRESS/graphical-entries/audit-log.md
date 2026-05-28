# Audit Log: graphical-entries

This audit log is the source of truth for graphical-entries findings.
Findings are actionable work, not bookkeeping. Never delete findings;
update entries in place with explicit status transitions.

Status rules:

- `open` means newly reported and not yet fixed.
- `acknowledged-<ref>` means accepted but deferred to a tracked issue,
  workplan entry, or operator-approved plan.
- `fixed-<sha>` means a fix commit landed but has not yet been
  re-verified.
- `verified-<date>` means the surface was re-exercised after the fix.
- `withdrawn-<date>` or `superseded-by-<finding-id>` replaces deletion.

Canonical queue checks:

```bash
grep -nE "^Status:[[:space:]]+(open|acknowledged|fixed-)" docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
grep -nE "^Status:[[:space:]]+open" docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
grep -nE "^Status:[[:space:]]+fixed-" docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
```

## 2026-05-28 audit: branch default scope

Audit scope: `main...HEAD` from merge-base
`23e0b0edcc831db04d9c0dd50ac7308b2810581a`.

Risk classification: high. The branch touches core schema, lane and
pipeline loaders, verbs, doctor migration, calendar regeneration, and the
Studio dashboard UI.

Track 1 verification:

- `npm --workspace @deskwork/core test` passed: 64 files, 697 tests.
- `npm --workspace @deskwork/studio test` passed: 60 files, 599 tests;
  2 files and 11 tests skipped.
- `npm run build --workspaces --if-present` failed in
  `@deskwork/studio` with TS2345 errors at
  `packages/studio/src/pages/dashboard/affordances.ts:321`,
  `:344`, `:353`, `:354`, and
  `packages/studio/src/pages/dashboard/data.ts:76`.
- `tsx scripts/smoke-phase4-issues.mjs` passed after sandbox escalation
  allowed `tsx` IPC socket creation.
- `tsx scripts/smoke-phase4-migration.mjs` passed after sandbox
  escalation allowed `tsx` IPC socket creation.

Track 2 spec-compliance review: read-only reviewer pass against Phase 5
Task 5.1 and the accepted D3 Press Bay design brief.

Track 3 code-quality review: read-only reviewer pass against production
code changed in `packages/core`, `packages/cli`, `packages/studio`, and
`plugins/deskwork-studio`.

### AUDIT-20260528-01

Finding-ID: AUDIT-20260528-01
Status:     fixed-68e5fbd
Severity:   blocking
Surface:    packages/studio build

**Fix:** commit `68e5fbd fix(graphical-entries): Phase 5 Task 5.1 — audit-log findings AUDIT-01/02/04/05` introduced `packages/studio/src/pages/dashboard/legacy-stage.ts` exporting `isLegacyEditorialStage(s: string): s is Stage` — a proper type-narrowing predicate, not an `as` cast. The five call sites flagged in Evidence now guard on the predicate: the three `renderRowActions` / `renderRowDrawer` / `renderRowMenu` exports return empty `RawHtml` for non-editorial entries (the existing `swimlane-shell.ts:247` dispatch routes them to `renderEntryCard` so they still surface), and `data.ts:bucketize` skips non-editorial entries from the legacy back-compat `byStage` map (their per-lane bucketing in `loadLaneBuckets` is the authoritative routing). Per DESKWORK-STATE-MACHINE.md Commandment II, the editorial verb vocabulary stays editorial-scoped until Phase 5 Task 5.2 lands the template-driven verb resolver. Build now exits 0 (verified post-fix); test count went 606 → 614.

Studio does not build after `Entry.currentStage` was widened from the
legacy eight-stage `Stage` union to an arbitrary non-empty string.
`EntrySchema.currentStage` now parses as `string` in
`packages/core/src/schema/entry.ts:164`, while Studio still sends
`entry.currentStage` into legacy `Stage`-typed code.

Evidence:

- `packages/studio/src/pages/dashboard/affordances.ts:321` passes
  `entry.currentStage` to `verbsForStage`.
- `packages/studio/src/pages/dashboard/affordances.ts:344` passes
  `entry.currentStage` to `verbsForStage`.
- `packages/studio/src/pages/dashboard/affordances.ts:353` passes
  `entry.currentStage` to `verbsForStage`.
- `packages/studio/src/pages/dashboard/affordances.ts:354` passes
  `entry.currentStage` to `renderMenu`.
- `packages/studio/src/pages/dashboard/data.ts:76` uses
  `entry.currentStage` as a `Map<Stage, Entry[]>` key.

Expected: `npm run build --workspaces --if-present` passes.

Actual: `@deskwork/studio` fails with TS2345 at the lines above.

Fix guidance: add an explicit legacy-stage type guard before calling
legacy dashboard affordance and `byStage` code, or widen those legacy
helpers deliberately after removing exhaustive `Stage` assumptions.

### AUDIT-20260528-02

Finding-ID: AUDIT-20260528-02
Status:     fixed-68e5fbd
Severity:   high
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane.ts

**Fix:** commit `68e5fbd` made the server render BOTH `<article class="swim">` AND `<button class="swim-stub">` for every visibility-on lane (`packages/studio/src/pages/dashboard/swimlane-shell.ts`). The server stamps `.is-focus-hidden` on exactly one of the pair based on the initial focus state — the existing client controller at `plugins/deskwork-studio/public/src/dashboard/swimlane.ts:153` already toggles the class on chip clicks, so once both nodes exist in the DOM the toggle is end-to-end. Added the missing `.swim-stub.is-focus-hidden { display: none; }` CSS rule mirroring `.swim.is-focus-hidden`. New acceptance tests in `packages/studio/test/dashboard-swimlane.test.ts` assert both elements render per lane with exactly one carrying `.is-focus-hidden`. New jsdom client test in `packages/studio/test/dashboard-swimlane-client.test.ts` exercises the chip-and-stub toggle end-to-end.

Focus-off swim stubs do not work after client-side focus changes. Phase
5 Task 5.1.5 requires visibility-on but focus-off lanes to render compact
stubs, and clicking a stub should re-add the lane to focus.

Evidence:

- `packages/studio/src/pages/dashboard/swimlane-shell.ts:456` renders
  either a full swimlane or a stub for each lane, not both.
- `plugins/deskwork-studio/public/src/dashboard/swimlane.ts:141`
  toggles classes only on elements already present in the DOM.
- `plugins/deskwork-studio/public/src/dashboard/swimlane.ts:300`
  handles stub clicks by adding the lane back to the focus set.
- `plugins/deskwork-studio/public/css/dashboard-swimlane.css:570`
  hides `.swim.is-focus-hidden`, but has no matching rule for
  `.swim-stub.is-focus-hidden`.

Expected: toggling a focused lane off creates or reveals a stub, and
clicking that stub restores the full lane.

Actual: with the default all-focused server render, no stub exists when
the client hides a lane. With a URL-driven focus-off server render, no
full swimlane exists for the stub to reveal after it is clicked.

Fix guidance: render both the full swimlane and the stub for every
visibility-on lane and let client/CSS show exactly one based on focus
state, or make focus and stub clicks update the URL and reload. Add a
client/browser test covering focus-off and stub-restore.

### AUDIT-20260528-03

Finding-ID: AUDIT-20260528-03
Status:     fixed-e4168ee
Severity:   high
Surface:    dashboard swimlane localStorage state

**Fix:** commit `e4168ee fix(graphical-entries): Phase 5 Task 5.1 — spec-fidelity fixes from spec-review` introduced `packages/studio/src/pages/dashboard/project-key.ts` (SHA-1 / 12-char hex helper), threaded `projectKey` from `renderDashboard` through `renderSwimlanesShell`, and emits `data-project-key="${projectKey}"` on the `<section class="bay-shell">` element (`packages/studio/src/pages/dashboard/swimlane-shell.ts:470`). The audit reviewer ran against the pre-fix state at `b09bfa5`; the spec-compliance reviewer surfaced the same gap independently as Finding 4. Pending re-verification against the auditor's `data-project-key` server/client test recommendation — for now the dashboard-swimlane test asserts the 12-char lowercase-hex shape on the rendered HTML.


Swimlane localStorage state is not project-scoped even though the client
contract says it is. This can leak focus and visibility preferences
between different projects served at the same Studio route.

Evidence:

- `plugins/deskwork-studio/public/src/dashboard/swimlane.ts:27`
  documents state keys as namespaced per project root via a server-rendered
  `data-project-key`.
- `plugins/deskwork-studio/public/src/dashboard/swimlane.ts:125` reads
  `shell.dataset.projectKey`.
- `packages/studio/src/pages/dashboard/swimlane-shell.ts:467` emits
  `data-bay-shell` and `data-focus-url-driven`, but no `data-project-key`.
- `plugins/deskwork-studio/public/src/dashboard/swimlane.ts:128` falls
  back to `window.location.pathname`, so all projects on
  `/dev/editorial-studio` share keys.

Expected: focus and visibility state for separate project roots does not
collide.

Actual: separate projects served on the same origin and path reuse
`deskwork:dashboard:/dev/editorial-studio:*` keys.

Fix guidance: pass a stable project-root-derived key into the server
render and emit `data-project-key`. Add a server/client test proving
different project keys produce separate localStorage keys.

### AUDIT-20260528-04

Finding-ID: AUDIT-20260528-04
Status:     fixed-68e5fbd
Severity:   high
Surface:    dashboard lane visibility UI

**Fix:** commit `68e5fbd` addressed both sub-issues. Sub-A: added `.focus-chip.is-visibility-hidden` to the existing hide rule list in `plugins/deskwork-studio/public/css/dashboard-swimlane.css`. Sub-B: the rail row now server-renders BOTH eye glyphs as siblings inside `.r-eye` — `<span class="r-eye-visible">●</span><span class="r-eye-hidden">○</span>` — and CSS picks which one shows based on the parent `.rail-lane[data-lane-visible]` attribute (the client controller already updates the attribute on visibility toggles at `swimlane.ts:197`). New acceptance tests in `packages/studio/test/dashboard-swimlane.test.ts` assert both glyph spans render per rail row and assert the new CSS rules (`.focus-chip.is-visibility-hidden { display: none }` and the `[data-lane-visible]` glyph swap). The jsdom client test in `dashboard-swimlane-client.test.ts` exercises the eye-glyph click end-to-end — confirming `data-lane-visible` flips between `"true"` and `"false"` and the focus chip picks up `.is-visibility-hidden` so CSS hides it.

Visibility-off lanes still appear in the focus strip and the rail eye
does not change to the hidden state. Phase 5 Task 5.1.4 requires
visibility-off lanes to disappear from the focus-chip strip and the rail
to show `visible` vs `hidden` eye state.

Evidence:

- `plugins/deskwork-studio/public/src/dashboard/swimlane.ts:167` adds
  `.is-visibility-hidden` to focus chips.
- `plugins/deskwork-studio/public/css/dashboard-swimlane.css:561` hides
  `.swim` and `.swim-stub` for that class, but does not hide
  `.focus-chip.is-visibility-hidden`.
- `packages/studio/src/pages/dashboard/swimlane-shell.ts:117`
  hardcodes the rail eye glyph to the visible state.
- `plugins/deskwork-studio/public/src/dashboard/swimlane.ts:191`
  updates `data-lane-visible`, but does not update the visible glyph.

Expected: hiding a lane removes its focus chip and changes the rail eye
state.

Actual: the chip remains visible and the rail eye continues to display
the visible glyph.

Fix guidance: hide `.focus-chip.is-visibility-hidden`, update the rail
eye glyph/text when state changes, and add client-side coverage for the
visibility toggle.

### AUDIT-20260528-05

Finding-ID: AUDIT-20260528-05
Status:     fixed-68e5fbd
Severity:   medium
Surface:    packages/studio/src/pages/dashboard/swimlane-shell.ts

**Fix:** commit `68e5fbd` switched the stage-column DOM ID from `id="stage-<slug>"` to lane-scoped `id="lane-<laneId>-stage-<slug>"` so multi-lane pages can no longer collide on shared stage names (e.g. `Approved`, which appears in both `visual` and `qa-plan` templates). Picked option (a) from the audit's fix guidance — the default editorial lane ALSO emits an empty `<span id="stage-<slug>" aria-hidden="true">` inside the column so the existing deep-link href `/dev/editorial-studio#stage-drafting` (used by `pages/shortform.ts:113` and `pages/index.ts:114`) continues to resolve. Option (a) won over (b) because the legacy deep-link is referenced from two production pages AND pinned by `packages/studio/test/shortform-empty-state.test.ts` assertions on `id="stage-drafting"`, `id="stage-ideas"`, `id="stage-planned"`, `id="stage-published"`. New acceptance tests in `packages/studio/test/dashboard-swimlane.test.ts` assert: (a) each `Approved` column across `mockups` and `qa` lanes carries a unique `id="lane-<laneId>-stage-approved"`; (b) the rendered page has zero duplicate `id="..."` attributes anywhere; (c) the legacy `id="stage-drafting"` etc. anchors persist for the default lane only, and non-default lane-unique stage names (e.g. `Sketched`, `Drafted`, `Tested`) do NOT emit a bare-anchor form.

Multi-lane stage columns can render duplicate DOM IDs when lanes share a
stage name. Phase 5 introduces multiple lanes on the same page, and
template presets share names such as `Approved`.

Evidence:

- `packages/studio/src/pages/dashboard/swimlane-shell.ts:260` derives
  `stageIdSlug` from the stage name only.
- `packages/studio/src/pages/dashboard/swimlane-shell.ts:286` renders
  `id="stage-${stageIdSlug}"`.
- The new dashboard fixture includes `Approved` in both visual and QA
  lanes, so a multi-lane page can render more than one
  `id="stage-approved"`.

Expected: DOM IDs are unique per document so anchors, labels, and future
collapse controls target deterministic elements.

Actual: shared stage names across lanes produce duplicate IDs.

Fix guidance: include the lane id in stage IDs, for example
`lane-${laneId}-stage-${stageSlug}`. If a legacy `#stage-drafting`
anchor must survive, keep it only for the default/editorial lane.

