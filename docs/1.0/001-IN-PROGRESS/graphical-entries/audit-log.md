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
Status:     verified-2026-05-28
Severity:   blocking
Surface:    packages/studio build

**Fix:** commit `68e5fbd fix(graphical-entries): Phase 5 Task 5.1 — audit-log findings AUDIT-01/02/04/05` introduced `packages/studio/src/pages/dashboard/legacy-stage.ts` exporting `isLegacyEditorialStage(s: string): s is Stage` — a proper type-narrowing predicate, not an `as` cast. The five call sites flagged in Evidence now guard on the predicate: the three `renderRowActions` / `renderRowDrawer` / `renderRowMenu` exports return empty `RawHtml` for non-editorial entries (the existing `swimlane-shell.ts:247` dispatch routes them to `renderEntryCard` so they still surface), and `data.ts:bucketize` skips non-editorial entries from the legacy back-compat `byStage` map (their per-lane bucketing in `loadLaneBuckets` is the authoritative routing). Per DESKWORK-STATE-MACHINE.md Commandment II, the editorial verb vocabulary stays editorial-scoped until Phase 5 Task 5.2 lands the template-driven verb resolver. Build now exits 0 (verified post-fix); test count went 606 → 614.

**Verification (2026-05-28):** `npm run build --workspaces --if-present` exits 0 for core, CLI, and Studio at HEAD `6aa35b0`.

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
Status:     verified-2026-05-28
Severity:   high
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane.ts

**Fix:** commit `68e5fbd` made the server render BOTH `<article class="swim">` AND `<button class="swim-stub">` for every visibility-on lane (`packages/studio/src/pages/dashboard/swimlane-shell.ts`). The server stamps `.is-focus-hidden` on exactly one of the pair based on the initial focus state — the existing client controller at `plugins/deskwork-studio/public/src/dashboard/swimlane.ts:153` already toggles the class on chip clicks, so once both nodes exist in the DOM the toggle is end-to-end. Added the missing `.swim-stub.is-focus-hidden { display: none; }` CSS rule mirroring `.swim.is-focus-hidden`. New acceptance tests in `packages/studio/test/dashboard-swimlane.test.ts` assert both elements render per lane with exactly one carrying `.is-focus-hidden`. New jsdom client test in `packages/studio/test/dashboard-swimlane-client.test.ts` exercises the chip-and-stub toggle end-to-end.

**Verification (2026-05-28):** `npm --workspace @deskwork/studio test` exits 0 with 63 files passed and 661 tests passed, including the swimlane server/client tests named above.

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
Status:     verified-2026-05-28
Severity:   high
Surface:    dashboard swimlane localStorage state

**Fix:** commit `e4168ee fix(graphical-entries): Phase 5 Task 5.1 — spec-fidelity fixes from spec-review` introduced `packages/studio/src/pages/dashboard/project-key.ts` (SHA-1 / 12-char hex helper), threaded `projectKey` from `renderDashboard` through `renderSwimlanesShell`, and emits `data-project-key="${projectKey}"` on the `<section class="bay-shell">` element (`packages/studio/src/pages/dashboard/swimlane-shell.ts:470`). The audit reviewer ran against the pre-fix state at `b09bfa5`; the spec-compliance reviewer surfaced the same gap independently as Finding 4. Pending re-verification against the auditor's `data-project-key` server/client test recommendation — for now the dashboard-swimlane test asserts the 12-char lowercase-hex shape on the rendered HTML.

**Verification (2026-05-28):** `npm --workspace @deskwork/studio test` exits 0 at HEAD `6aa35b0`; `packages/studio/test/dashboard-swimlane.test.ts` covers the rendered `data-project-key` shape and the current client controllers consume the shared project-key helper.


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
Status:     verified-2026-05-28
Severity:   high
Surface:    dashboard lane visibility UI

**Fix:** commit `68e5fbd` addressed both sub-issues. Sub-A: added `.focus-chip.is-visibility-hidden` to the existing hide rule list in `plugins/deskwork-studio/public/css/dashboard-swimlane.css`. Sub-B: the rail row now server-renders BOTH eye glyphs as siblings inside `.r-eye` — `<span class="r-eye-visible">●</span><span class="r-eye-hidden">○</span>` — and CSS picks which one shows based on the parent `.rail-lane[data-lane-visible]` attribute (the client controller already updates the attribute on visibility toggles at `swimlane.ts:197`). New acceptance tests in `packages/studio/test/dashboard-swimlane.test.ts` assert both glyph spans render per rail row and assert the new CSS rules (`.focus-chip.is-visibility-hidden { display: none }` and the `[data-lane-visible]` glyph swap). The jsdom client test in `dashboard-swimlane-client.test.ts` exercises the eye-glyph click end-to-end — confirming `data-lane-visible` flips between `"true"` and `"false"` and the focus chip picks up `.is-visibility-hidden` so CSS hides it.

**Verification (2026-05-28):** `npm --workspace @deskwork/studio test` exits 0 at HEAD `6aa35b0`; the swimlane server/client tests re-exercise focus-chip hiding and rail visibility glyph state.

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
Status:     superseded-by-AUDIT-20260528-07
Severity:   medium
Surface:    packages/studio/src/pages/dashboard/swimlane-shell.ts

**Fix:** commit `68e5fbd` switched the stage-column DOM ID from `id="stage-<slug>"` to lane-scoped `id="lane-<laneId>-stage-<slug>"` so multi-lane pages can no longer collide on shared stage names (e.g. `Approved`, which appears in both `visual` and `qa-plan` templates). Picked option (a) from the audit's fix guidance — the default editorial lane ALSO emits an empty `<span id="stage-<slug>" aria-hidden="true">` inside the column so the existing deep-link href `/dev/editorial-studio#stage-drafting` (used by `pages/shortform.ts:113` and `pages/index.ts:114`) continues to resolve. Option (a) won over (b) because the legacy deep-link is referenced from two production pages AND pinned by `packages/studio/test/shortform-empty-state.test.ts` assertions on `id="stage-drafting"`, `id="stage-ideas"`, `id="stage-planned"`, `id="stage-published"`. New acceptance tests in `packages/studio/test/dashboard-swimlane.test.ts` assert: (a) each `Approved` column across `mockups` and `qa` lanes carries a unique `id="lane-<laneId>-stage-approved"`; (b) the rendered page has zero duplicate `id="..."` attributes anywhere; (c) the legacy `id="stage-drafting"` etc. anchors persist for the default lane only, and non-default lane-unique stage names (e.g. `Sketched`, `Drafted`, `Tested`) do NOT emit a bare-anchor form.

**Supersession (2026-05-28):** the lane-scoped fix closes cross-lane collisions for identical stage names, but Track 3 found a second collision class inside a single lane when two valid stage names produce the same DOM slug. See `AUDIT-20260528-07`.

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

## 2026-05-28 audit rerun: current Phase 5.1A/5.1B state

Audit scope: `main...HEAD` from merge-base
`23e0b0edcc831db04d9c0dd50ac7308b2810581a`, current HEAD `6aa35b0`.

Risk classification: high. The rerun covers Phase 5.1A per-lane /
per-stage collapse and Phase 5.1B per-lane kanban/list view toggle.

Track 1 verification:

- `npm --workspace @deskwork/core test` passed: 64 files, 697 tests.
- `npm --workspace @deskwork/studio test` passed: 63 files, 661 tests;
  2 files and 11 tests skipped.
- `npm run build --workspaces --if-present` passed for core, CLI, and
  Studio.
- `tsx scripts/smoke-phase4-issues.mjs` passed.
- `tsx scripts/smoke-phase4-migration.mjs` passed.
- Browser / viewport smoke was attempted but not completed: Studio dev
  server initially failed under sandboxing because `tsx` could not open
  its IPC socket; rerunning with escalation reported
  `http://localhost:47326/`, but `curl` and
  `scripts/smoke-er-viewport-regressions.mjs` could not connect from the
  command context. The server processes were stopped.

Track 2 spec-compliance review: read-only reviewer pass against Phase 5
Tasks 5.1, 5.1A, 5.1B, and the accepted D3 Press Bay brief.

Track 3 code-quality review: read-only reviewer pass against current
dashboard client/server code, storage, IDs, accessibility, and tests.

### AUDIT-20260528-06

Finding-ID: AUDIT-20260528-06
Status:     fixed-653bc2b
Severity:   high
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane.ts

Keyboard users cannot reliably toggle lane visibility via the rail eye
button. The eye toggle is a real button, but keyboard activation on that
button bubbles to the parent rail row's `keydown` handler.

Evidence:

- `plugins/deskwork-studio/public/src/dashboard/swimlane.ts:281` stops
  click propagation on `.r-eye-btn`.
- `plugins/deskwork-studio/public/src/dashboard/swimlane.ts:301`
  handles bubbled `keydown` events on the parent row for Enter / Space
  and toggles focus.
- Existing tests cover mouse clicks on `.r-eye-btn` and keyboard
  activation on the row, but not Enter / Space while focus is on
  `.r-eye-btn`.

Expected: Enter or Space on the eye button toggles visibility only.

Actual: the keydown can bubble to the row and toggle focus instead;
Space also calls `preventDefault`, which can suppress native button
activation.

Fix guidance: make the rail-row keydown handler ignore events whose
target is an interactive descendant, or stop `keydown` propagation on
`.r-eye-btn`. Add a jsdom test for Enter and Space on `.r-eye-btn`.

### AUDIT-20260528-07

Finding-ID: AUDIT-20260528-07
Status:     fixed-a281ea7
Severity:   medium
Surface:    packages/studio/src/pages/dashboard/swimlane-card.ts

The stage-ID collision fix is incomplete for valid stage names that
produce the same DOM slug inside one lane.

Evidence:

- `packages/studio/src/pages/dashboard/swimlane-card.ts:127` derives
  `stageIdSlug` via `stage.toLowerCase().replace(/[^a-z0-9-]+/g, '-')`.
- `packages/core/src/pipelines/stage-token.ts:67` preserves underscores
  in filesystem tokens, so valid stages such as `QA Review` and
  `QA_Review` are distinct at template validation time.
- `packages/core/src/pipelines/types.ts:133` checks filesystem-token
  collisions, not dashboard DOM-token collisions.

Expected: every valid pipeline template renders unique stage IDs.

Actual: a single lane with valid stages `QA Review` and `QA_Review`
renders both as `lane-<lane>-stage-qa-review`.

Fix guidance: use the validated `stageNameToFilesystemToken(stage)` for
DOM IDs, or introduce a dedicated DOM-token helper plus collision
validation and tests.

### AUDIT-20260528-08

Finding-ID: AUDIT-20260528-08
Status:     fixed-e309f00
Severity:   medium
Surface:    packages/studio/src/pages/dashboard/swimlane-list-body.ts

The list-view overflow affordance is a focusable inert control inside a
link.

Evidence:

- `packages/studio/src/pages/dashboard/swimlane-list-body.ts:80`
  renders each list row as an `<a>`.
- `packages/studio/src/pages/dashboard/swimlane-list-body.ts:88`
  renders a nested `span` with `role="button"`, `tabindex="0"`, and
  `aria-label="Actions for ..."`.
- The comment above the markup says wiring is deferred.

Expected: focusable controls either perform their advertised action or
are not focusable / interactive yet.

Actual: keyboard users can tab to `Actions for ...`, but the control has
no behavior and is nested inside a navigational anchor.

Fix guidance: render it as non-focusable decorative chrome until wired,
or restructure the row into separate link and real button elements with
click / keyboard handlers and tests.

### AUDIT-20260528-09

Finding-ID: AUDIT-20260528-09
Status:     fixed-9eff7af
Severity:   medium
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane.ts

The `All` focus chip can hide every lane.

Evidence:

- `packages/studio/src/pages/dashboard/swimlane-focus-strip.ts:37`
  renders an explicit `All` chip.
- `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:225`
  defines the focus-chip strip as one chip per visibility-on lane plus
  an `All` chip.
- `plugins/deskwork-studio/public/src/dashboard/swimlane.ts:241`
  documents the `All` chip as focusing every visible lane.
- `plugins/deskwork-studio/public/src/dashboard/swimlane.ts:251`
  clears `state.focused`, and only repopulates it when not already all
  focused.

Expected: clicking `All` restores or keeps every visibility-on lane
focused.

Actual: when every visible lane is already focused, clicking `All`
leaves the focus set empty, so every visible lane becomes focus-off and
only stubs remain.

Fix guidance: make `All` idempotently select all visible lanes, or add a
separate explicit `None` affordance if that state is desired. Add a
client test for clicking `All` from the already-all-focused state.

### AUDIT-20260528-10

Finding-ID: AUDIT-20260528-10
Status:     fixed-e228e26
Severity:   medium
Surface:    mobile dashboard lane stack

The Task 5.1B mobile lane-stack / lane-head variant is not implemented,
or the workplan has over-claimed the mobile scope.

Evidence:

- `docs/studio-design/ACCEPTED/2026-05-27-multi-lane-dashboard-d3-press-bay/brief.md:14`
  requires a vertical lane-stack of accordion sections on mobile.
- `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:231`
  says the `lane-head` mobile lane-stack variant ships with Task 5.1B's
  mobile pass.
- `packages/studio/src/pages/dashboard/swimlane-card.ts:307` always
  emits desktop-shaped `<article class="swim">` with
  `<div class="swim-head">`.
- The mobile CSS adapts desktop swim markup by hiding the rail, wrapping
  `.swim-head`, and stacking `.stage-grid` columns. No production
  `lane-head`, `lane-stack`, or `lane-section` renderer/controller path
  exists.

Expected: mobile renders the accepted lane-stack / lane-head accordion
variant with collapse and view-toggle affordances attached there, or the
workplan explicitly leaves that acceptance criterion for later mobile
work.

Actual: mobile gets desktop swim markup adapted by CSS while the 5.1B
workplan text marks the lane-head mobile variant as shipped.

Fix guidance: implement the mobile lane-stack / lane-head path for
5.1B, or move that acceptance criterion out of checked-off scope and
track it explicitly in later mobile work.

## 2026-05-28 audit: Phase 5 Task 5.1C (per-lane Compose chip)

Audit scope: commit `487e9bb` (+ in-task a11y follow-up below).
Predecessor: `755a50d`. Tests 661 → 672 (+11). Build exit 0.

Two-stage review (spec-compliance + code-quality) routed through the
dw-lifecycle trussing (wrap-prompt → dispatch → validate-return).

- Spec-compliance: SPEC-COMPLIANT. All four steps (5.1C.1–5.1C.4)
  match the workplan + brief; no scope creep, no missing affordance.
  Per-lane `data-first-stage` verified against editorial.json (Ideas),
  visual.json (Sketched), qa-plan.json (Drafted).
- Code-quality: APPROVED WITH FOLLOWUPS. Zero blocking, two
  non-blocking findings (F11 + F15) plus several observations.

### AUDIT-20260528-11

Finding-ID: AUDIT-20260528-11
Status:     fixed-8a2e0a5
Severity:   medium
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts

The chip's `aria-label` did not update during the `.copied` flash. On
phone (`.sc-label { display: none }` per
`plugins/deskwork-studio/public/css/dashboard-swimlane.css:1257`), the
visible label swap was invisible to screen-reader users — `aria-label`
is the only accessible name available on mobile. AT users got zero
feedback that the clipboard copy succeeded.

Resolution: snapshot the render-time `aria-label` at `bindChip` time
(WeakMap); swap to `Copied — paste in chat` on enter; restore on
revert. Added a dedicated mobile-a11y test
(`packages/studio/test/dashboard-swimlane-compose-client.test.ts`
"swaps aria-label to the success message during .copied"); updated the
pre-existing "chip remains a real focusable <button>" test to assert
the mid-flash aria-label rather than the original.

Rejected alternative: `aria-live="polite"` region elsewhere on the
page. Heavier change for an equivalent outcome; the `aria-label` swap
is local to the affordance and keeps the AT contract on the chip
itself. Rejected the static-aria-label option (the existing
`.er-copy-btn` pattern is not analogous — that primitive's accessible
name comes from `textContent`, not from a separate `aria-label`; it
has no aria-label/visible-label split for the icon-only case to land
on).

### AUDIT-20260528-12

Finding-ID: AUDIT-20260528-12
Status:     wontfix-observation (no production polyfill exhibits the shape; revisit only if one surfaces)
Severity:   low
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts

The `typeof navigator.clipboard?.writeText !== 'function'` guard at
`plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts:116`
catches missing / non-function but not a polyfill that exposes
`writeText` as a synchronous `undefined`-returning shim. In that
hypothetical case, the chip would flash `.copied` even though nothing
was copied.

No known production polyfill exhibits that shape (`clipboard-polyfill`
and the Permissions API shim return real Promises). Tracked as an
observation; no fix needed unless a polyfill case surfaces.

### AUDIT-20260528-13

Finding-ID: AUDIT-20260528-13
Status:     wontfix-observation (test infrastructure heuristic; no flake observed in CI; switch to vi.spyOn shape if one surfaces)
Severity:   low
Surface:    packages/studio/test/dashboard-swimlane-compose-client.test.ts

The clipboard-rejection test uses `process.removeAllListeners(
'uncaughtException')` + reinstalls prior listeners in `finally`, and
performs a heuristic microtask flush via a 10-iteration `await
Promise.resolve()` loop.

Two latent fragilities: (1) a parallel-installed listener mid-test
would be wiped without restoration (unlikely under vitest's
serial-tests-within-a-file model); (2) a future Node microtask
scheduler change could break the flush heuristic silently.

No action unless the test flakes in CI. If it does, switch to a
`vi.spyOn(window, 'onerror')` assertion shape.

### AUDIT-20260528-14

Finding-ID: AUDIT-20260528-14
Status:     fixed-3c5228a
Severity:   medium
Surface:    plugins/deskwork-studio/public/css/dashboard-swimlane.css + packages/studio/test/dashboard-swimlane.test.ts

File-size cap trajectory: `dashboard-swimlane.css` is now 1285 lines
and `dashboard-swimlane.test.ts` is 1008 lines. Both pre-existed >500
before Task 5.1C. The 5.1{,A,B,C} sequence has piled additive sections
onto a single file each.

Fix guidance: before Task 5.2 lands, split into per-section files —
e.g. `dashboard-swimlane-chips.css`, `dashboard-swimlane-list.css` (CSS)
and `dashboard-swimlane-{shell,collapse,view-toggle,compose}.test.ts`
(tests). The split keeps each file under the 500-line cap going
forward.

## 2026-05-28 audit: Phase 5 Task 5.2 (template-aware stage rendering + empty-lane CTA)

Audit scope: commits `1d6383a` + in-task followup (this commit).
Predecessor: `877e778`. Tests 672 → 732 (+60). Build exit 0 across core + studio.

Two-stage review (spec-compliance + code-quality) routed through the
dw-lifecycle trussing. Spec ✅ SPEC-COMPLIANT; quality ⚠️ APPROVED WITH
FOLLOWUPS — zero blocking, four non-blocking findings + four observations.
The followups land in this same in-task commit (no deferral).

### AUDIT-20260528-15

Finding-ID: AUDIT-20260528-15
Status:     fixed-followup-commit
Severity:   medium
Surface:    packages/studio/src/pages/dashboard/{swimlane-entry-card.ts, section.ts}

Two orphaned exports surfaced after Task 5.2 lifted the swimlane-card
dispatch to a universal `renderRow`: `renderEntryCard` in
`swimlane-entry-card.ts` (implementer-flagged) AND `renderStageSection`
in `section.ts` (caught by the code-quality reviewer, NOT flagged by
the implementer). The reviewer's note: per `Just for now is bullshit`,
orphaned code is a defer.

Resolution: deleted `swimlane-entry-card.ts` entirely (no live callers);
removed `renderStageSection`, `renderStageTile`, `STAGE_ORNAMENTS`, and
`STAGE_EMPTY_MESSAGES` from `section.ts` (all dead code post-5.2). The
remaining `section.ts` exports are `renderRow` (consumed by
`swimlane-card.ts`) and `renderDistributionPlaceholder` (consumed by
`dashboard.ts`).

Stale doc-comments updated in lockstep: `dashboard.ts:24` (the data flow
no longer mentions `renderStageSection`); `legacy-stage.ts:1-30` (the
"until Task 5.2 lands" framing replaced with "after Task 5.2; the guard
remains for `data.ts:bucketize` only").

### AUDIT-20260528-16

Finding-ID: AUDIT-20260528-16
Status:     fixed-followup-commit
Severity:   medium
Surface:    packages/studio/test/dashboard-affordances-template.test.ts

Commandment III was not test-pinned for the new template-aware row
chrome path. The reviewer's recommendation: add an `er-stamp-*` /
`reviewState` / `IN REVIEW` / `ITERATING` / `in-review` absence
assertion across every template's rendered chrome so a future regression
that re-introduces a review-state badge fails fast.

Resolution: added `describe('Commandment III — no review-state labels
in template-aware row chrome')` to `dashboard-affordances-template.test.ts`.
Three test bodies cover the editorial active-linear + locked + terminal
chrome plus a matrix run across visual + qa-plan + feature-doc +
blog-post (10 stage-template pairs).

### AUDIT-20260528-17

Finding-ID: AUDIT-20260528-17
Status:     fixed-followup-commit
Severity:   low
Surface:    packages/studio/test/dashboard-affordances-template.test.ts

`verbsForStage` activeLinear matrix had small gaps — `feature-doc` and
`blog-post` templates were covered for locked + terminal but not for
their active-linear stages. Drawer-view invariants (the mobile-swipe
top-N set) were not asserted at all.

Resolution: added `feature-doc Drafting` + `blog-post Drafting`
activeLinear cases; added a 4-test `drawer-view invariants` describe
block covering active linear + locked + off-pipeline + terminal drawer
sets.

### AUDIT-20260528-18

Finding-ID: AUDIT-20260528-18
Status:     fixed-followup-commit
Severity:   low
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts

Held-Space auto-repeat on the affordance button would fire N clipboard
writes (each `keydown` repeat re-invokes `activateAffordance`). The
visible state stays stable (`scheduleRevert` resets the timer) but the
no-single-activation contract is violated and the clipboard sees N
identical writes.

Resolution: added `if (ev.repeat) return;` to the Space-key handler.
Click and Enter (native button keyboard contract) are single-activation
already; only Space needed the explicit guard.

### AUDIT-20260528-19

Finding-ID: AUDIT-20260528-19
Status:     closed-as-documented (inline doc-comment at affordances.ts:118-126 IS the disposition; no behavior change)
Severity:   low
Surface:    packages/studio/src/pages/dashboard/affordances.ts

`classifyStage` dispatches a stage that is BOTH terminal (last linear
stage) AND a member of `lockedStages` as `terminal` (view + scrapbook
only) rather than as `locked` (Approve → next). Adopter templates that
want "this is the terminal stage AND it must be approved before
freezing" semantics will silently get the frozen-artifact UX. This is
defensible — there's no `linearIdx + 1` to label "Approve → next" — but
was previously undocumented.

Resolution: added an inline doc-comment at the terminal-first branch
(`affordances.ts:118-126`) naming the precedence rule and pointing
adopters at off-pipeline-stages as the alternative express form.

Tracked as `open` rather than `fixed` because the doc-comment is the
disposition; no behavior change. A schema-level invariant forbidding
terminal-AND-locked stages could be added in a future task (would
require migrating any adopter that relies on the current dispatch) —
worth re-evaluating when a real adopter hits the case.

### AUDIT-20260528-20

Finding-ID: AUDIT-20260528-20
Status:     wontfix-observation (swimlane-card.ts at 494 lines, under 500-line cap; trajectory note revisits if exceeded)
Severity:   informational
Surface:    packages/studio/src/pages/dashboard/swimlane-card.ts

`swimlane-card.ts` post-5.2 is 482 lines — within the 300–500 cap but
near the limit. The file has accumulated four sibling task contracts
(5.1 swim-shell, 5.1A collapse, 5.1B view-toggle, 5.1C compose chip,
5.2 empty-CTA + template-aware dispatch). The next addition (Task 5.6
integration test or a new affordance) will likely push it over.

Fix guidance: if a Task 5.6 / 5.3 addition would push past 500, split
into `swimlane-card-{shell,renderers,empty-cta}.ts` (or similar). Track
alongside AUDIT-20260528-14 (CSS + test file split) as a Phase 5
cleanup task.

## 2026-05-28 audit: Phase 5 Task 5.3 (overflow + mobile sheet + hidden-row activation)

Audit scope: commit `cfe4812` + in-task review followup.
Predecessor: `5bc36c5`. Tests 732 → 751 (+19, including +2 review-
followup regression tests). Build exit 0 across core + studio.

Two-stage review via the dw-lifecycle trussing. Spec ✅ SPEC-COMPLIANT;
quality ⚠️ APPROVED WITH FOLLOWUPS — 1 blocking + 2 non-blocking
findings. All three applied in-thread (no deferral).

### AUDIT-20260528-21

Finding-ID: AUDIT-20260528-21
Status:     fixed-followup-commit
Severity:   high
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane.ts

Keyboard a11y bug: the row's `keydown` listener (lines 343-347 pre-fix)
called `preventDefault()` on every Enter/Space inside the row,
including when the eye-button (`.r-eye-btn`) had focus. The
preventDefault cancelled the native button click synthesis, so the
eye-button's visibility-only contract was silently swallowed — the
row's dual-action (visibility + focus) fired instead.

Consequence: a VISIBLE lane + eye-button focus + Enter = "hide this
lane" gesture flipped focus off without hiding. Mouse path was
correct (eye-click runs stopPropagation); only the keyboard path
was broken.

Resolution: added `if (ev.target instanceof Element && ev.target
.closest('.r-eye-btn') !== null) return;` to the row keydown handler
before the `preventDefault`. Pulled the same predicate the mobile-
sheet's `shouldCloseOnTarget` already uses (DRY across two
controllers).

Regression tests added at `dashboard-swimlane-client.test.ts` for
both Enter and Space gestures on the eye-button; both assert
`defaultPrevented === false` AND that the row's focus state is
unchanged.

### AUDIT-20260528-22

Finding-ID: AUDIT-20260528-22
Status:     fixed-followup-commit
Severity:   medium
Surface:    plugins/deskwork-studio/public/css/dashboard-swimlane.css

The Task 5.3 initial commit added `opacity: 0.6` to
`.rail-lane[data-lane-visible="false"]` (line 1455 of the post-5.3
CSS). Compound effect: the pre-existing rule at line 145 already set
`color: var(--er-faded)`, which renders at ~3.48:1 contrast on
`--er-paper` (below WCAG 2.1 SC 1.4.3 AA's 4.5:1 floor). The opacity
layer reduced effective contrast further.

Resolution: upgraded the pre-existing color from `--er-faded` to
`--er-ink-soft` (~8.92:1 — AAA on paper) and dropped the redundant
opacity wash. The `text-decoration: line-through` on `.r-name` keeps
the visual differentiation; the row is now readable AND
distinguishable.

Test pin: `dashboard-swimlane.test.ts` test renamed and updated to
assert the new `--er-ink-soft` color rule AND verify no
`opacity: 0.6` rule survives on the hidden-row selector.

### AUDIT-20260528-23

Finding-ID: AUDIT-20260528-23
Status:     fixed-followup-commit
Severity:   medium
Surface:    plugins/deskwork-studio/public/css/dashboard-swimlane.css

`.focus-chip` lacked `flex-shrink: 0`. With the Task 5.3.1 overflow-
scroll (`.focus-strip { flex-wrap: nowrap; overflow-x: auto }`),
default flex-shrink-1 chips would compress under pressure (long lane
names, narrow viewport) before the scroll kicked in.

Resolution: added `flex-shrink: 0` to `.focus-chip` and
`white-space: nowrap` to `.fc-label` so chips preserve their natural
width and the strip scrolls instead of crushing the labels.

### AUDIT-20260528-24

Finding-ID: AUDIT-20260528-24
Status:     wontfix-observation (disclosure-widget convention prefers return-to-trigger; defensible default)
Severity:   low
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-mobile-sheet.ts

Focus-return behavior on row-activation close: the row click/keydown
closes the sheet via `onClose` → `trigger.focus()`. The trigger sits
in the bay-head; the operator just activated a row, so focus
yanking is mildly jarring. Disclosure-widget convention prefers
return-to-trigger, so the current behavior is defensible. Surface as
an observation; revisit if operator feedback shows confusion.

### AUDIT-20260528-25

Finding-ID: AUDIT-20260528-25
Status:     fixed-73c8359
Severity:   low
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane.ts

`SwimlaneState` and `RailRowActivation` are `export`-marked but no
other module imports them. Forward-looking public API per the
implementer's note; YAGNI flag per the project's `Just for now is
bullshit` rule. Either drop the `export` modifiers now (one-line
revert) or wait for a concrete consumer.

Observation only; no immediate action.

### AUDIT-20260528-26

Finding-ID: AUDIT-20260528-26
Status:     wontfix-observation (swimlane.ts at 491 lines, under 500-line cap; trajectory note revisits if exceeded)
Severity:   informational
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane.ts

`swimlane.ts` is at 415 lines post-5.3 — within the 500-line cap but
approaching. Phase 5 future tasks (5.4 drag-reorder, 5.5 presets,
5.6 integration test) will likely push it over. The Task 5.3
mobile-sheet split into a sibling controller was the right call;
further splits along the same boundaries (focus-chips, rail-eye,
row-activation) become candidates if the file grows.

Trajectory note alongside AUDIT-14 (CSS) and AUDIT-20
(swimlane-card.ts).

## 2026-05-28 audit: Phase 5 Task 5.4 (drag-to-reorder + lane order persistence)

Audit scope: commit `5c5864a` + in-task review followup.
Predecessor: `a3480c2`. Tests 751 → 771 (+20, including +3 review-
followup regression tests). Build exit 0 across core + studio.

Two-stage review via the dw-lifecycle trussing. Spec ✅ SPEC-COMPLIANT;
quality ⚠️ APPROVED WITH FOLLOWUPS — 0 blocking, 4 actionable non-
blocking findings + a11y observation. The actionables landed in this
in-task followup commit.

### AUDIT-20260528-27

Finding-ID: AUDIT-20260528-27
Status:     fixed-followup-commit
Severity:   low
Surface:    packages/studio/test/dashboard-swimlane-drag-client.test.ts

Test coverage gaps: dragleave-that-exits-rail clearing drop-target
classes; visibility-hidden-lane reorder preserving `is-visibility-
hidden`; dragstart sweep of stale `.is-dragging` (AUDIT-30).

Resolution: 3 new regression tests added.

### AUDIT-20260528-28

Finding-ID: AUDIT-20260528-28
Status:     fixed-followup-commit
Severity:   medium
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-drag.ts

The dragend handler's `querySelector` interpolated `state.draggingId`
into an attribute selector without `CSS.escape`. Lane ids are
operator-authored (`.deskwork/lanes/<id>.json`) and not constrained
to alphanumeric — an id containing `"`, `]`, or `\` would break the
selector. The companion `swimlane.ts:138,141` consistently uses
`CSS.escape` for the same data dictionary; the inconsistency was
the maintainability concern.

Resolution: wrapped `state.draggingId` with `CSS.escape`. Added a
`CSS.escape` shim at the top of the drag-client test (jsdom 29.x
does not ship `CSS.escape` natively) mirroring the existing pattern
in `dashboard-swimlane-client.test.ts:98-107`.

### AUDIT-20260528-29

Finding-ID: AUDIT-20260528-29
Status:     fixed-followup-commit
Severity:   low
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-drag.ts

The `drop` handler called `writeStoredOrder` even when
`computeReorder` short-circuited (same source-target id, or stale
target). The localStorage write was a harmless no-op but violated
the controller's "writes happen on real reorders" contract.

Resolution: added an `orderEquals(prev, next)` helper; the drop
handler guards the DOM-reorder + localStorage write on a real
change. Inline comment cites the invariant that class state
survives `appendChild` moves on a per-id basis, so no
`applyState` reapply is needed post-reorder. Test updated to
assert the no-op drop produces ZERO localStorage entries.

### AUDIT-20260528-30

Finding-ID: AUDIT-20260528-30
Status:     fixed-followup-commit
Severity:   low
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-drag.ts

If a previous `dragend` failed to fire (browser quirks — disconnect,
page navigation, dev-tools cancellation), a stale `.is-dragging`
class would survive on the old row. The next `dragstart` would
stamp the new source without sweeping the stale class.

Resolution: added a one-time stale-class sweep at the top of the
`dragstart` handler. Cheap insurance against a hard-to-reproduce
browser quirk. Regression test added.

### AUDIT-20260528-31

Finding-ID: AUDIT-20260528-31
Status:     fixed-3aeea2e
Severity:   medium
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-drag.ts

HTML5 native DnD has no keyboard equivalent. Keyboard-only operators
cannot reorder lanes. The workplan accepted the native-DnD-only
constraint for Phase 5; this finding tracks the gap for future
disposition.

Options:
1. ARIA grabbed/listbox semantics with custom keyboard handler
   (deprecated grabbed but functional).
2. A separate "move up / move down" affordance on each row reachable
   via keyboard.
3. Replace HTML5 native DnD with a keyboard-sensor-equipped library
   (dnd-kit ships one).

Operator-decision required. No immediate action; tracking for Phase 6
disposition.

### AUDIT-20260528-32

Finding-ID: AUDIT-20260528-32
Status:     addressed-by-3aeea2e (AUDIT-31 split swimlane-drag.ts into swimlane-drag.ts 246 + swimlane-reorder.ts 393; both under cap; trajectory note resolved structurally)
Severity:   informational
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-drag.ts

`swimlane-drag.ts` post-followup is 396 lines (was 365 pre-followup).
Approaching the 500-line cap. The recent additions (orderEquals,
stale-class sweep, CSS.escape, comments) consumed ~30 lines. Future
Phase 5 expansions (e.g., touch-drag via Pointer Events, or
animation polish) would push past the cap.

Trajectory note alongside AUDIT-14 / -20 / -26.

## 2026-05-28 audit: Phase 5 Task 5.5 (saveable focus presets + deep-link URL)

Audit scope: commit `643f2e9` + in-task review followup.
Predecessor: `990d304`. Tests 771 → 781 (with one regression after the
window.prompt removal addressed below); after followup tests stabilize.
Build exit 0 across core + studio.

Combined spec + code-quality review via the dw-lifecycle trussing.
Spec ✅ SPEC-COMPLIANT; quality ⚠️ APPROVED WITH FOLLOWUPS — 0
blocking architecture findings, 3 actionable non-blocking (F1 URL
strip, F3 id collision, F8 whitespace name) + 1 BLOCKING discovered
during in-task verification (window.prompt / window.confirm violate
the project's `no-native-prompts.test.ts` enforcement rule). All
applied inline.

### AUDIT-20260528-33

Finding-ID: AUDIT-20260528-33
Status:     fixed-followup-commit
Severity:   medium
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-presets.ts

Deep-link URL persisted `?preset=<id>` in the URL bar after applying
the preset. Subsequent operator-driven mutations (focus chip clicks,
view-toggle flips) drifted the live state away from what the URL
advertised; the shareable deep-link became a half-truth.

Resolution: added `stripPresetFromUrl()` helper invoked at the end of
`applyDeepLinkPreset`. Uses `history.replaceState` to remove the
`preset` query param while preserving the rest of the URL (other
params, hash). Degrades to no-op when `history.replaceState` is
unavailable.

### AUDIT-20260528-34

Finding-ID: AUDIT-20260528-34
Status:     fixed-followup-commit
Severity:   medium
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts

`p${Date.now().toString(36)}` preset ids collided on same-millisecond
saves, silently overwriting the prior preset with no error.

Resolution: appended a short base-36 random suffix (`-${random5}`) so
two saves in the same millisecond produce distinct ids. Added a
16-attempt collision-guard that throws if the random suffix also
collides (cosmic-ray-rare; the throw surfaces the case loudly per the
no-fallback rule).

### AUDIT-20260528-35

Finding-ID: AUDIT-20260528-35
Status:     fixed-followup-commit
Severity:   low
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-presets.ts

Save handler silently dropped whitespace-only names with no operator
feedback. The flash confirm wouldn't fire, leaving the operator
unsure whether the save took.

Resolution: the new `inlinePrompt` helper (see AUDIT-36) trims and
returns null on whitespace-only input, which the save handler treats
as cancel. The belt-and-braces guard in `handleSaveClick` covers any
custom hook violating the contract.

### AUDIT-20260528-36

Finding-ID: AUDIT-20260528-36
Status:     fixed-followup-commit
Severity:   high
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-presets.ts + plugins/deskwork-studio/public/src/entry-review/inline-prompt.ts

The initial Task 5.5 implementation used `window.prompt` and
`window.confirm` (per the dispatch contract's "use window.prompt for
simplicity"). This violated the project-wide ban enforced by
`packages/studio/test/no-native-prompts.test.ts:78` (per #166 / Phase
34b — full audit). The test failed immediately on the followup-
verification suite run.

Resolution: extended `plugins/deskwork-studio/public/src/entry-review/
inline-prompt.ts` with a new `inlinePrompt(opts)` function for text
input (sibling of the existing `inlineConfirm`). Updated
`PresetControllerHooks` so `promptForName` returns `Promise<string |
null>` and `confirmDelete` returns `Promise<boolean>`; the default
hooks consume the inline helpers. Handlers became async; the bind
wrapper uses `void` to suppress the floating-promise warning. Tests
updated to await the async hook chain via `Promise.resolve` yields.

Dispatch-contract conflict learned: the implementer prompt instructed
`window.prompt` per the workplan literal text, but the project rule
forbids it. The dispatch prompt should have caught this. Adding a
note to the dispatch playbook: pre-check the dispatch's
implementation primitives against the no-native-prompts test.

### AUDIT-20260528-37

Finding-ID: AUDIT-20260528-37
Status:     fixed-3ed2532
Severity:   low
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-presets.ts

Reviewer findings F2 (no copy-deep-link affordance), F4 (`?focus=` vs
`?preset=` interaction docs), F5 (singleton reset for tests), F6
(type narrowing on stage collapse), F7 (window.prompt replacement now
covered by AUDIT-36) — surfaced as observations.

F2 (copy-deep-link affordance): the dispatch prompt called it
"optional but valued." Adding a small `🔗` button next to Delete
clipboard-copies `<origin>/dev/editorial-studio?preset=<id>` and is
a worthwhile Phase 5 polish addition. Not blocking 5.5 close.

F4: the preset apply overrides any concurrent `?focus=` URL param
silently. Worth a doc-comment in `applyDeepLinkPreset` and a test
pinning the precedence.

F5: module-level singleton state means cross-describe-block tests
could see stale state. Currently no such test exists; document the
contract via a code comment at each `activeState` declaration.

F6: `stageCollapseState: Record<string, Record<string, boolean>>`
silently drops `false` flags through the snapshot/apply round-trip.
Type would be cleaner as `Record<string, readonly string[]>`
(collapsed stage names).

Tracked as `open` observations; revisit during Phase 5 polish or
Phase 6 lane CRUD work.

## 2026-05-28 tooling-feedback verification against dw-lifecycle v0.25.0

Operator notification: the upstream dw-lifecycle plugins shipped
v0.25.0 with purported tooling-feedback fixes. Verified by probing
each TF entry against `/Users/orion/.claude/plugins/marketplaces/
deskwork/plugins/dw-lifecycle/bin/dw-lifecycle` (the v0.25.0
binary):

- **TF-008** (Searched-line strictness — "matches" noun required):
  ✅ PROBE PASSES under v0.25.0. The validator now accepts other
  enumeration nouns ("call sites" probed; passes). Update TF-008
  status: `closed-v0.25.0`.
- **TF-009** (forbidden-deferral false-positives on project-vocab
  nouns like "stub" / "placeholder"): ✅ PROBE PASSES under v0.25.0.
  Body text containing "stub" and "placeholder" no longer trips the
  forbidden-phrase check (only Excluded-line reasons are scanned).
  Update TF-009 status: `closed-v0.25.0`.
- **TF-011** (`Excluded: (none ...)` parser rejection): ❌ STILL
  REJECTED under v0.25.0. The parser still requires a `path:LINE`
  shape. Workaround documented in TF-011 remains the operator's
  path. Status: still open.
- **TF-012** (`refactored` word triggers refactor-precondition gate
  on additive-feature responses): ❌ STILL REJECTED under v0.25.0.
  The matcher still fires on bare-word "refactored" in any context.
  Workaround documented in TF-012 remains. Status: still open.

Net: 2 of 4 wrapper-format frictions closed by v0.25.0. TF-008 and
TF-009 to be marked `closed-v0.25.0` in `tooling-feedback.md`.
TF-011 and TF-012 remain open with the v0.25.0 verification noted.

## 2026-05-28 audit rerun: Phase 5.5 end state

Audit scope: `main...HEAD` from merge-base
`23e0b0edcc831db04d9c0dd50ac7308b2810581a`, current HEAD `e792d03`.

Risk classification: high. The rerun covers the accumulated Phase 5.2
through 5.5 dashboard behavior, including saveable presets and the
followup fixes through `e792d03`.

Track 1 verification:

- `npm --workspace @deskwork/core test` passed: 64 files, 697 tests.
- `npm --workspace @deskwork/studio test` passed: 68 files, 781 tests;
  2 files and 11 tests skipped.
- `npm run build --workspaces --if-present` passed for core, CLI, and
  Studio.
- `tsx scripts/smoke-phase4-issues.mjs` passed.
- `tsx scripts/smoke-phase4-migration.mjs` passed.
- Browser / viewport smoke was attempted but not completed: Studio dev
  server with escalation reported `http://localhost:47326/`, but
  `curl` and `scripts/smoke-er-viewport-regressions.mjs` could not
  connect from the command context. The server processes were stopped.

Track 2 spec-compliance review: read-only reviewer pass against Phase 5
Tasks 5.2 through 5.5 and the accepted D3 Press Bay brief.

Track 3 code-quality review: read-only reviewer pass against current
dashboard controllers, presets, storage, accessibility, and command
integration.

### AUDIT-20260528-38

Finding-ID: AUDIT-20260528-38
Status:     fixed-a5ba0b8
Severity:   medium
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts

Saved presets do not capture viewport-derived view mode. Task 5.5.1
defines saved focus presets as including per-lane view mode, but the
snapshot reads only explicit storage overrides, not the effective mode
currently rendered on the page.

Evidence:

- `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:269`
  defines saved presets as including `per-lane-view-mode`.
- `plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle.ts`
  applies the mobile `list` / desktop `kanban` default from
  `matchMedia`, but only writes storage when the operator clicks a
  toggle.
- `plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:189`
  snapshots `viewModePerLane` from the stored override map only.
- `plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:256`
  applies that stored map back as the authoritative view-mode state.

Expected: `Save current as preset` captures the actual current per-lane
view mode, including viewport-derived mobile `list` mode when no
explicit override exists.

Actual: a preset saved from mobile default list view can store `{}` for
`viewModePerLane`; loading it later on desktop resolves back to desktop
default `kanban`, so the reopened preset does not match the saved view.

Fix guidance: snapshot effective view mode from the live
`.swim.view-kanban` / `.swim.view-list` DOM state for every lane, or
expose a view-toggle helper that returns resolved per-lane modes after
viewport defaults and overrides are applied. Add a regression test that
saves under mobile default list mode, applies under desktop, and verifies
the lane remains list.

### AUDIT-20260528-39

Finding-ID: AUDIT-20260528-39
Status:     fixed-a9214b7
Severity:   high
Surface:    dashboard compose chip / deskwork add command integration

Studio copies `/deskwork:add` commands that the current add surface
cannot execute. The per-lane compose chip now generates lane/template
aware commands, but the deskwork add skill, CLI parser, and core create
path are still legacy-editorial only.

Evidence:

- `plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts:97`
  copies `/deskwork:add <SLUG> --lane ${laneId} --stage ${firstStage}`.
- `plugins/deskwork/skills/add/SKILL.md:13` documents only
  `/deskwork:add <slug> "<title>"`; no `--lane`, `--stage`, or
  lane-aware behavior.
- `packages/cli/src/commands/add.ts:22` accepts only `site`, `type`,
  `content-url`, `source`, and `slug`; unknown flags are rejected by
  `parseArgs`.
- `packages/core/src/entry/create.ts:20` still types
  `currentStage` as the legacy `Stage` union while
  `packages/core/src/schema/entry.ts:164` permits arbitrary template
  stage strings.

Expected: clicking `+ new` in a non-editorial lane produces a pasteable
command that creates an entry in that lane's first template stage.

Actual: the copied command is ahead of the command implementation. It
will be rejected or mishandled by the current add path, and non-editorial
stages such as `Sketched` / `Drafted` cannot flow through the typed
creation helper.

Fix guidance: update `/deskwork:add` skill + CLI + core create path
together: accept `--lane`, `--stage`, and `--kind`; validate stage
against the target lane template; widen `CreateEntryParams.currentStage`
to the schema's string contract; write `lane` / `artifactKind`; and add
an integration test from copied compose command to sidecar output. Also
quote or otherwise encode stage values, since valid stage names may
contain spaces.

## 2026-05-28 audit: Phase 5 Task 5.6 (multi-lane integration test)

Audit scope: commit `6ad45d9` + in-task review followup.
Predecessor: `e792d03`. Tests 781 → 801 (+20 integration tests). Build
exit 0 across core + studio. Phase 5 closes with this task.

Combined spec + code-quality review via the dw-lifecycle trussing.
Spec ✅ SPEC-COMPLIANT across all six steps; quality ⚠️ APPROVED WITH
FOLLOWUPS — 0 blocking, 2 info-level findings.

### AUDIT-20260528-38

Finding-ID: AUDIT-20260528-38
Status:     fixed-followup-commit
Severity:   low
Surface:    packages/studio/test/dashboard-swimlane-integration-client.test.ts

The Step 5.6.2 hidden-lane test asserted `.is-visibility-hidden`
on the qa swim + qa chip + `data-lane-visible="false"` on the qa
rail row, but did NOT assert the corresponding state on the qa
**stub** ([data-swim-stub="qa"]). The stub class state is part of
the controller's contract (swimlane.ts:151) and was untested by
this integration suite — a regression that left stubs visible while
hiding the full swim would not have surfaced.

Resolution: added a one-line assertion for the stub's
`.is-visibility-hidden` class. The contract is now end-to-end
covered: swim + stub + chip + rail row all signal hidden state
when localStorage carries the hidden lane.

### AUDIT-20260528-39

Finding-ID: AUDIT-20260528-39
Status:     wontfix-observation (inherited as-cast pattern across 4 test files; not net-new debt; separate project-wide cleanup pass appropriate)
Severity:   informational
Surface:    packages/studio/test/dashboard-swimlane-integration-client.test.ts:83-84 + ~3 other test files

Two `as { CSS?: unknown }` / `as { CSS: CSSShim }` casts to read/install
the `CSS.escape` shim under jsdom. This pattern is carried over verbatim
from the existing precedent in `dashboard-swimlane-client.test.ts:105-106`
and 2-3 other client-test files. The cast pattern violates the project's
"no `as Type` casts" rule literally, but the test file inherits — it is
not net-new debt.

The cleaner shape across all jsdom test files would be a single shared
helper using `Object.defineProperty(globalThis, 'CSS', {...})` paired with
`if ('CSS' in globalThis === false)`. Worth a focused project-wide
cleanup pass; not blocking Phase 5.

## 2026-05-28: Phase 5 — closing summary

All six Phase 5 tasks (5.1 / 5.1A / 5.1B / 5.1C / 5.2 / 5.3 / 5.4 / 5.5 /
5.6) landed cleanly via the dw-lifecycle trussing. Test count grew from
the pre-Phase-5 baseline (586) to 801 (+215) with zero regressions.
Build exits 0 across core + studio. The multi-lane bay-shell ships:

- Swimlane shell with template-driven stage columns per lane.
- Per-lane chrome: collapse (lane + per-stage), kanban ↔ list toggle,
  compose chip, empty-lane CTA.
- Lane-visibility rail with eye-toggle + drag-to-reorder + per-operator
  order persistence (localStorage).
- Focus-chip strip with overflow scroll, hidden-lane rail activation,
  mobile slide-up sheet via bay-head trigger.
- Saveable focus presets capturing the four state axes; deep-link URL
  pattern `?preset=<id>` applies on init AND strips after apply.
- Template-aware verb dispatch via `classifyStage(stage, template)`:
  off-pipeline, terminal, locked (with `Approve → <next>` label), or
  active-linear.
- Commandment III verified end-to-end: no surface renders review-state
  labels; pinned by regression tests across every template's row chrome.

Tooling-feedback during the cycle:
- TF-008 and TF-009 closed in dw-lifecycle v0.25.0.
- TF-010 (scope-widen no-op clustering) tracks upstream #318.
- TF-011 (`Excluded: (none ...)` parser) and TF-012 (refactored-word
  gate) remain open under v0.25.0.

Phase 5 audit log: AUDIT-01 through AUDIT-39, 39 findings total. All
blocking findings closed; non-blocking observations either applied
inline or tracked as `open` with explicit fix guidance.

## Phase 6 Task 6.1 — `/deskwork:lane` skill family — review cycle (2026-05-28)

Task 6.1 shipped at `5941c00` (feat) + `c2be222` (review followups). The
SDD discipline ran one spec-compliance review pass + one code-quality
review pass; the orchestrator triaged 11 findings into 6 applied, 2
declined-with-reasoning, 3 audit-trail observations.

### AUDIT-20260528-40 — Lane id charset + path-traversal validation

Finding-ID: AUDIT-20260528-40
Status:     fixed-c2be222
Severity:   blocking (security)
Surface:    `packages/core/src/lanes/types.ts:57`, `packages/core/src/lanes/loader.ts:101-115`

`LaneConfigSchema.id` was `z.string().min(1)` only, with no charset
restriction and no filesystem-boundary check. `lane create
"../../etc/foo" --template editorial --content-dir docs` would have
resolved to a file outside `.deskwork/lanes/`. Same exposure on every
verb taking `<id>`; same exposure on `--content-dir` (operator passing
`../../tmp/foo` writes outside the project tree).

Fix: tightened schema to `.regex(/^[a-z0-9][a-z0-9-]*$/)` matching the
documented kebab-case convention; added `assertSafeLaneId` (regex +
path-containment) and `assertSafeContentDir` (project-root-containment)
helpers at `loader.ts:54, 86`; wired both into `loadLaneConfig`,
`createLane`, and `updateLane` (update covered as in-scope hardening —
the operator-controlled `--content-dir` flag exposes the same surface).
Tests cover invalid id chars, traversal-resolving id, and
traversal-resolving contentDir at `packages/core/test/lanes/loader.test.ts:127`
and `packages/cli/test/lane/list-show-create.test.ts:222`.

### AUDIT-20260528-41 — Atomic write in lane-config commit helper

Finding-ID: AUDIT-20260528-41
Status:     fixed-c2be222
Severity:   non-blocking (data safety)
Surface:    `packages/core/src/lanes/operations/commit.ts:38`

`writeFileSync(path, ...)` was a direct write; a crash mid-write would
have left a truncated `.deskwork/lanes/<id>.json` that `loadLaneConfig`
then rejects on every subsequent read until hand-repair.

Fix: switched to tmp + rename pattern mirroring `packages/core/src/sidecar/write.ts`;
wrapped in try/catch with tmp-file cleanup on failure; documented the
helper's purpose in the file header so the name's git-connotation
doesn't mislead future readers.

### AUDIT-20260528-42 — Move rollback when writeSidecar fails

Finding-ID: AUDIT-20260528-42
Status:     fixed-c2be222
Severity:   non-blocking (data safety)
Surface:    `packages/core/src/lanes/operations/move.ts:228-260`

Lines 228 (artifact move), 248 (scrapbook move), 260 (sidecar write)
were not atomic. A `writeSidecar` failure after the fs moves succeed
would have left the entry half-moved — artifact + scrapbook in target
lane's contentDir but sidecar still recording old lane. Subsequent
`lane move` re-runs would fail with "source artifact does not exist."

Fix: wrapped 228–260 in try block; tracks `artifactMoved` /
`scrapbookMoved` booleans; on catch, reverses successful fs moves in
LIFO order before re-throwing with context (slug + "rolled back" +
cause). Same pattern as the pre-existing collision rollback at line 240,
extended to the success-then-write-fails path. Regression test marks
the entries dir read-only post-move and confirms rollback restores
artifact + scrapbook to source.

### AUDIT-20260528-43 — handleMove pattern consistency

Finding-ID: AUDIT-20260528-43
Status:     fixed-c2be222
Severity:   non-blocking (readability)
Surface:    `packages/cli/src/commands/lane.ts:298-343`

`handleMove` used an early try/catch around `resolveEntryUuid` plus a
second try/catch around the rest; every other handler uses one trailing
try/catch.

Fix: merged the two try blocks; resolveEntryUuid lives inside the main
try; one outer catch routes through `fail(err.message)` — matches the
shape of all 7 other handlers.

### AUDIT-20260528-44 — Magic constant 5 in purge sample limit

Finding-ID: AUDIT-20260528-44
Status:     fixed-c2be222
Severity:   non-blocking (maintainability)
Surface:    `packages/core/src/lanes/operations/purge.ts:43`

`5` appeared in the slice, the file comment, and the SKILL.md — three
sites that would drift if the limit changed.

Fix: extracted `PURGE_DEPENDENTS_SAMPLE_LIMIT = 5` at module top;
referenced from the slice and the file comment. SKILL.md left numeric
per orchestrator instruction (reader-facing doc).

### AUDIT-20260528-45 — Defensive binary-presence check in test helpers

Finding-ID: AUDIT-20260528-45
Status:     fixed-c2be222
Severity:   non-blocking (DX)
Surface:    `packages/cli/test/lane/helpers.ts:25`

Tests `spawnSync(deskworkBin, ...)` would have reported `code: -1` with
empty stdout/stderr if the test runner ran without an `npm install`
pre-step — confusing failure mode for new contributors.

Fix: added `assertDeskworkBinPresent` helper at `helpers.ts:34`; each
test file invokes it once in `beforeAll`. Surfaces an actionable error
naming the missing path and the remediation step.

### AUDIT-20260528-46 — Per-handler arg-parsing dance duplicated 8 times

Finding-ID: AUDIT-20260528-46
Status:     declined-not-net-debt
Severity:   non-blocking (DRY)
Surface:    `packages/cli/src/commands/lane.ts:150-343`

The 8 verb handlers share roughly 3 lines of boilerplate each for
required-positional + required-flag checks.

Declined: extracting a `requireArg`/`requireFlag` helper would replace
3 readable lines per handler with one indirection step plus a helper
file. Current shape is the natural CLI shape and matches `cancel.ts` /
`induct.ts` precedent; the cost of helper indirection exceeds the
DRY-saving. Not net-new debt; recorded as a deliberate orchestrator
choice for the audit trail.

### AUDIT-20260528-47 — commit.ts filename overloaded with git connotations

Finding-ID: AUDIT-20260528-47
Status:     declined-no-confusion-observed
Severity:   observation
Surface:    `packages/core/src/lanes/operations/commit.ts:1-40`

The filename `commit.ts` shares vocabulary with `git commit`. The file
actually does atomic-write-lane-config-to-disk (per AUDIT-41 fix).

Declined: file header comment names the purpose ("Atomic write helper
for lane config JSON files. Mirrors packages/core/src/sidecar/write.ts.")
explicitly. No actual reader confusion has surfaced. Rename costs
the import-graph an update without surfacing user value. Recorded as
deliberate orchestrator choice for the audit trail.

### AUDIT-20260528-48 — LaneMigrationEvent shape variation from new Lane*Event variants

Finding-ID: AUDIT-20260528-48
Status:     wontfix-observation (pre-existing LaneMigrationEvent shape; not introduced by Phase 6; harmonization would touch unrelated migration path)
Severity:   observation
Surface:    `packages/core/src/schema/journal-events.ts:104-117` (pre-existing) vs `journal-events.ts:148-203` (new)

The pre-existing `LaneMigrationEvent` uses `migration / source / target`
keys; the 6 new Lane*Event variants use `laneId`. `LaneMoveEvent` is the
only new variant that uses `entryId` instead (well-justified by the
schema docstring at lines 143-146).

Pre-existing schema-shape inconsistency. Not introduced by Task 6.1.
Worth a harmonization pass that either renames `LaneMigrationEvent`
fields or documents the split; that pass should be a separate refactor
with its own clones.yaml disposition. Filed as open for future
consideration.

### Task 6.1 closing summary

- Spec-compliance review: SPEC-COMPLIANT WITH NON-BLOCKING OBSERVATIONS (3 audit-trail items recorded above).
- Code-quality review: QUALITY-APPROVED WITH NON-BLOCKING OBSERVATIONS (11 findings; 6 applied at c2be222, 2 declined-with-reasoning, 3 audit-trail observations).
- Test deltas: core 706 → 708 (+2); CLI lane suite 39 → 45 (+6).
- Builds: `@deskwork/core` exit 0; `@deskwork/cli` exit 0.
- Pre-existing CLI test failures verified unrelated to 5941c00/c2be222 by checkout-parent-and-rerun: `test/publish-entry-centric.test.ts:139`, `test/approve-entry-centric.test.ts:129`.
- AUDIT-40 (security) was the highest-value finding — closed a real attack surface the operator-facing CLI exposed unintentionally.

## Phase 6 Task 6.2 — `/deskwork:pipeline` skill family — review cycle (2026-05-28)

Task 6.2 shipped at `ae0549d` (feat) + `0a9ca59` (review followups). The
SDD discipline ran spec-compliance + code-quality reviews. Spec-review
came back SPEC-COMPLIANT WITH NON-BLOCKING OBSERVATIONS; quality-review
came back QUALITY-REJECTED with 3 BLOCKING findings + 8 NON-BLOCKING +
3 OBSERVATION. The orchestrator triaged: applied 3 BLOCKING + 6
NON-BLOCKING; declined 2 NON-BLOCKING with documented reasoning; left
3 observations alone.

### AUDIT-20260528-49 — pipeline list breaks after rename (BLOCKING)

Finding-ID: AUDIT-20260528-49
Status:     fixed-0a9ca59
Severity:   blocking
Surface:    `packages/core/src/pipelines/loader.ts:232` (`listJsonBasenames`),
            `packages/core/src/pipelines/operations/update.ts:407` (`appendRenameMigration`)

Original ae0549d wrote the rename migration sidecar at
`.deskwork/pipelines/<id>-renames.json` — same directory as pipeline
templates. `listJsonBasenames` enumerated it as a pipeline id; the
subsequent `loadPipelineTemplate('editorial-renames', ...)` Zod-failed
because the sidecar shape `{pipelineId, renames}` lacks `linearStages`.
Every `pipeline list` invocation after any `--rename-stage` call would
have thrown.

Fix: extracted `rename-migration.ts` (124 lines); relocated migration
files to `<projectRoot>/.deskwork/pipelines/migrations/<id>.json`
(sibling subdir not enumerated by the loader). All readers / writers
updated. Regression test asserts `pipeline list` exit 0 after rename.

### AUDIT-20260528-50 — pipeline delete path-traversal (BLOCKING)

Finding-ID: AUDIT-20260528-50
Status:     fixed-0a9ca59
Severity:   blocking (security)
Surface:    `packages/core/src/pipelines/operations/delete.ts:55`

`deletePipeline` resolved `opts.id` to a filesystem path via
`pipelineOverridePath` without validating against `assertSafePipelineId`.
An id like `'../../etc/foo'` would have resolved outside the override
directory; `unlinkSync(path)` would have deleted the traversed file.
Same shape as the lane exposure Task 6.1 c2be222 closed.

Fix: added `assertSafePipelineId(projectRoot, opts.id)` and a
matching check on `opts.reassignLanesTo` as the first lines of
`deletePipeline`. Regression test covers both charset (`'FOO'`) and
traversal (`'../../etc/foo'`) refusals.

### AUDIT-20260528-51 — orphan rename sidecar on pipeline delete (BLOCKING)

Finding-ID: AUDIT-20260528-51
Status:     fixed-0a9ca59
Severity:   blocking (combined with AUDIT-49)
Surface:    `packages/core/src/pipelines/operations/delete.ts:162-169`

`pipeline delete <id>` unlinked the pipeline JSON but left the rename
sidecar on disk. Combined with AUDIT-49's pre-fix shape, the orphan
would have permanently broken `pipeline list` for the project. Post
AUDIT-49 fix (migrations/ subdir), the orphan would have inherited
into a subsequent `pipeline create <same-id>`, surfacing stale rename
history.

Fix: `deletePipeline` now unlinks the migrations sidecar at the new
path (guarded by existsSync). Regression test: rename → delete →
assert migrations sidecar gone.

### AUDIT-20260528-52 — malformed rename sidecar silent reset

Finding-ID: AUDIT-20260528-52
Status:     fixed-0a9ca59
Severity:   non-blocking (data preservation)
Surface:    `packages/core/src/pipelines/operations/update.ts:418-435`
            (now `rename-migration.ts`)

When the renames file was malformed, the code silently reset to an
empty shape and overwrote — losing the prior audit trail.

Fix: malformed files are now renamed to `<id>.malformed-<timestamp>.json`
before reset; stderr warning identifies the path. Preserves the data
the operator may want to recover.

### AUDIT-20260528-53 — delete-and-reassign partial-failure recovery

Finding-ID: AUDIT-20260528-53
Status:     fixed-0a9ca59
Severity:   non-blocking (doc)
Surface:    `packages/core/src/pipelines/operations/delete.ts` (header),
            `plugins/deskwork/skills/pipeline/SKILL.md`

Order of operations (validate replacement → reassign each dependent
lane → unlink pipeline → journal-append) can fail partway. The
reassign step is data-idempotent (commitLaneConfig writes same content
on re-run), so the recovery story is "re-run the same command."

Fix: documented in delete.ts header and in SKILL.md delete subsection.
No behavioral change.

### AUDIT-20260528-54 — applyRemoveStage blank-stage guard

Finding-ID: AUDIT-20260528-54
Status:     fixed-0a9ca59
Severity:   non-blocking (DX)
Surface:    `packages/core/src/pipelines/operations/update.ts:255-282`

Sibling `applyAddStage` / `applySetLocked` / `applySetOffPipeline`
all validate `stage.trim().length === 0`; `applyRemoveStage` didn't.
Blank input fell through to a less actionable "stage not found"
error.

Fix: mirrored the trim-check; specific error message.

### AUDIT-20260528-55 — rename-stage lockedStages coverage gap

Finding-ID: AUDIT-20260528-55
Status:     fixed-0a9ca59
Severity:   non-blocking (test coverage)
Surface:    `packages/cli/test/pipeline/update.test.ts:93-182`

Tests covered renaming in linearStages and offPipelineStages but not
in lockedStages. Implementation handles all three; a regression that
dropped the locked branch would have been undetected.

Fix: added one regression test.

### AUDIT-20260528-56 — customize wrapper id-validation defense-in-depth

Finding-ID: AUDIT-20260528-56
Status:     fixed-0a9ca59
Severity:   non-blocking (defense-in-depth)
Surface:    `packages/cli/src/commands/customize.ts:137-152, 202-207`

When `category === 'pipeline'`, customize wrote to
`<projectRoot>/.deskwork/pipelines/<name>.json`. The `name` was
validated by the upstream source-existence check (which happens to
enforce charset because built-in preset names are charset-conforming).
A future preset with a non-conforming name would bypass charset
validation.

Fix: explicit `assertSafePipelineId(projectRoot, name)` for the
pipeline category. Same belt-and-suspenders rationale as the loader.

### AUDIT-20260528-57 — updatePipeline early-refusal path leak

Finding-ID: AUDIT-20260528-57
Status:     fixed-0a9ca59
Severity:   non-blocking (info disclosure)
Surface:    `packages/core/src/pipelines/operations/update.ts:96-114`

With a traversed id, the early `isPluginPresetPipeline` /
`hasPipelineOverride` checks ran before `loadPipelineTemplate`'s
implicit `assertSafePipelineId`. The error message leaked the
traversed path.

Fix: moved `assertSafePipelineId(projectRoot, opts.id)` to the top of
`updatePipeline` (parallel to `createPipeline`). Unified diagnostics.

### AUDIT-20260528-58 — rename-sidecar race condition (DECLINED)

Finding-ID: AUDIT-20260528-58
Status:     declined-single-operator-assumption-documented
Severity:   non-blocking
Surface:    `packages/core/src/pipelines/operations/rename-migration.ts` (header)

Two concurrent `--rename-stage` operations against the same sidecar
race; the second writer wins; the first rename's migration entry is
lost. The PRD documents deskwork as operator-driven at-rest.

Declined: documented the single-operator assumption in the
rename-migration.ts module header. Concurrency-safe writers (file
locks, CAS) are a significant addition; not warranted given the
operator-driven usage profile. Recorded as deliberate orchestrator
choice for the audit trail.

### AUDIT-20260528-59 — non-atomic journal-event append (DECLINED)

Finding-ID: AUDIT-20260528-59
Status:     declined-matches-lanes-precedent
Severity:   non-blocking
Surface:    `packages/core/src/pipelines/operations/update.ts:130-153` (header)

Order: commitPipelineTemplate → appendRenameMigration → appendJournalEvent.
If the journal append fails after the first two succeed, the journal
lacks the event. Same pattern as the existing lane operations where
the same shape was accepted (Phase 6 Task 6.1).

Declined: documented in module header. Matches lanes precedent;
harmonization is a separate concern.

### AUDIT-20260528-60 — clone-disposition appropriateness

Finding-ID: AUDIT-20260528-60
Status:     observation (12 new clones dispositioned keep-with-reason)
Severity:   observation
Surface:    `.dw-lifecycle/scope-discovery/clones.yaml:124-194`

The Task 6.2 implementation triggered 12 NEW clone-detector findings,
all dispositioned `keep-with-reason` for pipeline-vs-lane symmetry:
- 4 pipeline.ts ↔ lane.ts CLI dispatcher / banner shapes
- 1 intra-file handleCreate vs handleDelete envelope
- 5 test-fixture helpers (pipeline/helpers.ts ↔ lane/helpers.ts)
- 1 atomic write helper (lanes/operations/commit.ts ↔ pipelines/operations/commit.ts)
- 1 intra-file applySetLocked vs applySetOffPipeline (inverse-invariant validation)
Plus 2 line-number realignments in pre-existing dispositions.

Spec-reviewer triaged each as genuine parallel-domain symmetry. The
lanes-vs-pipelines lifecycles are diverging (lanes have
archive/restore/move/purge; pipelines have rename-stage-with-migration);
keeping them parallel keeps each independently evolveable. Recorded as
deliberate orchestrator choice.

### Task 6.2 closing summary

- Spec-compliance review: SPEC-COMPLIANT WITH NON-BLOCKING OBSERVATIONS (6 OBS items).
- Code-quality review: QUALITY-REJECTED (3 BLOCKING + 8 NON-BLOCKING + 3 OBSERVATION). Triage: 3 BLOCKING + 6 NON-BLOCKING applied at 0a9ca59; 2 declined-with-reasoning documented in module headers; 3 observations left alone.
- Test deltas: CLI pipeline suite 0 → 64 (net-new); core 711 throughout; journal-events 11 → 14 (+3); CLI customize 12 → 17 (+5).
- Builds: `@deskwork/core` exit 0; `@deskwork/cli` exit 0.
- Pre-existing CLI test failures (`publish-entry-centric:139`, `approve-entry-centric:129`) remain pre-existing — zero diff in `ae0549d` or `0a9ca59`.
- AUDIT-49 + AUDIT-50 + AUDIT-51 (all BLOCKING) were the highest-value findings. AUDIT-49 was a real "pipeline list permanently breaks after rename" data-integrity bug; AUDIT-50 was a path-traversal regression of the Task 6.1 hardening; AUDIT-51 compounded the orphan-sidecar problem with AUDIT-49. All three closed before merge.
- Quality-review pushback (REJECTED verdict) validated the value of the review pass — three production-quality bugs caught at review time rather than post-release.

## Phase 6 Task 6.3 — Studio lane-management page — review cycle (2026-05-28)

Task 6.3 shipped at `0f9fc65` (feat) + `92267b2` (review followups). Spec
review came back SPEC-COMPLIANT WITH NON-BLOCKING OBSERVATIONS (32
positive/audit-trail observations, no findings to act on). Quality review
came back QUALITY-APPROVED WITH NON-BLOCKING OBSERVATIONS (9 findings + 4
observations); orchestrator triaged: applied 7 NON-BLOCKING, accepted 6
observations.

### AUDIT-20260528-61 — Edit-form blank-clear asymmetry

Finding-ID: AUDIT-20260528-61
Status:     fixed-92267b2
Severity:   non-blocking (UX consistency)
Surface:    `plugins/deskwork-studio/public/src/lanes/lanes-page.ts:77-85`

The diff-emit logic emitted `--name ""` when the operator cleared the
name field but silently dropped `--template`/`--content-dir` when those
were cleared. Inconsistent — and the CLI's interpretation of `--name ""`
is unclear (set to empty vs reset to id?).

Fix: added the `length > 0` guard for `name` to match the symmetry.
Cleared fields are NOT emitted as flags; convention documented at the
top of the diff-emit function.

### AUDIT-20260528-62 — Slash-command builder quoting asymmetry

Finding-ID: AUDIT-20260528-62
Status:     fixed-92267b2
Severity:   non-blocking (paste-into-shell risk)
Surface:    `plugins/deskwork-studio/public/src/lanes/lanes-page.ts:68,78,81,84`

`name` was wrapped with `JSON.stringify` while `template` and
`contentDir` were interpolated raw. If an operator pasted the output
into a shell instead of Claude Code, raw interpolation is a
shell-injection surface; even within Claude Code, values with spaces
parse incorrectly.

Fix: extracted `quoteValue(s: string): string` helper using
`JSON.stringify` (handles double-quotes, backslashes, control chars).
Applied uniformly to `name`, `template`, `contentDir`, and `id`.
Existing clipboard-content test updated to assert all values are
quoted.

### AUDIT-20260528-63 — Single-open accordion for Edit forms

Finding-ID: AUDIT-20260528-63
Status:     fixed-92267b2
Severity:   non-blocking (UX bounded-state)
Surface:    `plugins/deskwork-studio/public/src/lanes/lanes-page.ts:196-231`

Opening Edit on multiple rows left them all open simultaneously. For
50 lanes the operator could pile up 50 visible forms.

Fix: tracks the currently-open row via module-level `openLaneId`. On
Edit click: if a different row is open, close it; then toggle the
clicked row. Test verifies the close-sibling behavior.

### AUDIT-20260528-64 — Reorder handle passive icon

Finding-ID: AUDIT-20260528-64
Status:     fixed-92267b2
Severity:   non-blocking (affordance-placement)
Surface:    `packages/studio/src/pages/lanes/table.ts:75-79`,
            `plugins/deskwork-studio/public/css/lanes-page.css:383-389`

The handle had `cursor: grab` and `⋮⋮` glyph — every visual signal said
draggable. But the column is inert (dashboard rail per Phase 5 Task 5.4
is the canonical reorder surface). Operator who tries to drag gets
nothing — affordance mismatch.

Fix: glyph reduced to single `⋮`; cursor changed to `cursor: help`;
title clarifies "Reorder via the dashboard lane rail." aria-hidden
remains true (decorative for AT).

### AUDIT-20260528-65 — Archived-section open state persistence

Finding-ID: AUDIT-20260528-65
Status:     fixed-92267b2
Severity:   non-blocking (UX continuity)
Surface:    `packages/studio/src/pages/lanes/archived-section.ts:48-67`,
            `plugins/deskwork-studio/public/src/lanes/lanes-page.ts`

The archived section's `<details>` open state reset on every page
reload — friction for an operator triaging archived lanes.

Fix: client-side `toggle` event listener writes the open state to
`deskwork:lanes:<projectKey>:archived-open` localStorage. On init,
state is read and applied. Mirrors Phase 5 swimlane-collapse pattern.

### AUDIT-20260528-66 — Purge button discoverability gap

Finding-ID: AUDIT-20260528-66
Status:     fixed-92267b2
Severity:   non-blocking (UX gate visibility)
Surface:    `packages/studio/src/pages/lanes/table.ts:63-70`

When `row.archived && row.entryCount > 0`, no Purge button rendered —
but no other affordance suggested the next-step workflow ("move entries
first"). Operator stalled.

Fix: renders a DISABLED-LOOKING Purge button with title naming the
prerequisite ("Cannot purge: N entries still reference this lane. Move
them to another lane first via the per-entry surface."). Gate is now
visible; next step is discoverable. Test asserts the disabled button
appears.

### AUDIT-20260528-67 — Empty-state CTA focuses first field

Finding-ID: AUDIT-20260528-67
Status:     fixed-92267b2
Severity:   non-blocking (UX action discoverability)
Surface:    `packages/studio/src/pages/lanes.ts:148`,
            `plugins/deskwork-studio/public/src/lanes/lanes-page.ts`

The empty-state CTA `href="#lanes-new-form-heading"` anchored to a
heading. The operator's actual intent on click is "let me start
typing." Anchor scroll is essentially a no-op when the form is
right below the empty state.

Fix: CTA carries `data-lanes-cta-focus`. Click handler calls
`preventDefault` and focuses the first field
(`document.querySelector('[data-lanes-field="id"]')?.focus()`). Anchor
href remains as no-JS fallback. Test simulates click and asserts
focus moves.

### AUDIT-20260528-68 — Test coverage gaps captured as observation

Finding-ID: AUDIT-20260528-68
Status:     observation (no action)
Severity:   observation
Surface:    `packages/studio/test/lanes/lanes-page-client.test.ts`

Quality reviewer noted untested scenarios: concurrent multi-row Edit
open (fixed via Fix 3 single-open accordion, now testable but not
covered by an explicit "two rows" test), keyboard navigation (Tab +
Enter on Copy), browser back/forward bfcache, slash-command builder
with special characters in name (newline, backtick, quote).

Quoting test was added as part of Fix 2. Other gaps recorded for the
audit trail; not blocking.

### Task 6.3 closing summary

- Spec-compliance review: SPEC-COMPLIANT WITH NON-BLOCKING OBSERVATIONS (32 observations, all positive/audit-trail).
- Code-quality review: QUALITY-APPROVED WITH NON-BLOCKING OBSERVATIONS (9 findings + 4 observations). Triage: 7 NON-BLOCKING applied at 92267b2; 6 observations accepted without action.
- Test deltas: studio suite 831 → 838 (+7); core 711 throughout; CLI tests unchanged.
- Builds: `@deskwork/{core, studio, cli}` all exit 0.
- Pre-existing CLI failures persist; zero diff in `packages/cli/` across `0f9fc65` and `92267b2`.
- Strongest design call: AUDIT-64 (reorder handle visual mismatch) — the workplan named the column as a per-row field but didn't address the inert-yet-draggable-looking affordance. Resolving via passive icon + title preserves the column while making the affordance honest. Matches `.claude/rules/affordance-placement.md` "an affordance whose label/glyph doesn't relate spatially to the action" anti-pattern.

## Phase 6 Task 6.4 — Studio pipeline-editor page — audit cycle (2026-05-29)

Audit scope: current `feature/graphical-entries` worktree, including the
dirty Phase 6 Task 6.4 `/dev/pipelines` surface:

- `packages/studio/src/pages/pipelines.ts`
- `packages/studio/src/pages/pipelines/*.ts`
- `plugins/deskwork-studio/public/src/pipelines/pipelines-page.ts`
- `plugins/deskwork-studio/public/css/pipelines-page.css`
- `plugins/deskwork-studio/public/css/pipelines-stage-flow.css`
- `packages/studio/test/pipelines/*.test.ts`

Track 1 controller verification:

- `npm --workspace @deskwork/core test` — passed (711 tests).
- `npm --workspace @deskwork/studio test` — passed earlier in the
  session before the latest dirty pipeline-page edits.
- `npm --workspace @deskwork/studio test -- test/pipelines/data.test.ts`
  — passed (8 tests).
- `npm --workspace @deskwork/studio test -- test/pipelines` — failed
  (4 failing client-controller tests in `pipelines-page-client.test.ts`).
- `npm --workspace @deskwork/studio run build` — passed.
- `npm pack --dry-run --workspace @deskwork/studio` — passed in the
  current worktree. Earlier failure for missing
  `src/pages/pipelines/edit-form.ts` no longer reproduces after that
  file appeared in the dirty tree.
- `npm --workspace @deskwork/cli test -- test/publish-entry-centric.test.ts test/approve-entry-centric.test.ts test/customize-skill.test.ts`
  — failed: 2 assertion-copy failures in `approve` / `publish`, plus
  sandbox-only npm-cache failures for customize packaging.
- `npm --workspace @deskwork/cli test -- test/customize-skill.test.ts`
  with approved escalation — passed (12 tests), confirming the
  customize pack failures are sandbox cache artifacts rather than
  product packaging failures.
- `npm run build --workspaces --if-present`,
  `tsx scripts/smoke-phase4-issues.mjs`, and
  `tsx scripts/smoke-phase4-migration.mjs` passed earlier in this
  audit session.

Track 2 spec-compliance review: two medium findings.
Track 3 code-quality review: one medium finding, one low finding.

### AUDIT-20260529-01 — Pipeline-page client test slice is red

Finding-ID: AUDIT-20260529-01
Status:     fixed-af1e91a (verified 2026-05-29; 9/9 in pipelines-page-client.test.ts pass; 4 originally-named failures all green)
Severity:   blocking (verification)
Surface:    `packages/studio/test/pipelines/pipelines-page-client.test.ts`,
            `packages/studio/test/pipelines/test-helpers.ts`

`npm --workspace @deskwork/studio test -- test/pipelines` fails 4 of 50
tests. The failing cases are all in the client-controller slice:

- New form copy test records zero clipboard calls after setting required
  field values without dispatching input/change events.
- Quote symmetry test records zero clipboard calls for the same reason.
- Rename validation test expects the initial notice to mention both
  `from` and `to`, but the fixture select starts on the first real stage
  instead of matching the server-rendered disabled placeholder option.
- Remove validation test expects Copy disabled initially, but the fixture
  select starts on the first real stage instead of matching the
  server-rendered disabled placeholder option.

The controller behavior and tests need reconciling before the Phase 6.4
pipeline-editor page can close with a green targeted verification gate.
Likely fix: make the DOM helpers mirror the rendered markup exactly
(including disabled selected placeholder options), and update copy tests
to either dispatch the same events a user would trigger or assert the
new disabled-until-preview-rebuilt contract explicitly.

### AUDIT-20260529-02 — Referencing lanes hidden in delete tooltip

Finding-ID: AUDIT-20260529-02
Status:     fixed-b2bcdc0
Severity:   medium
Surface:    `packages/studio/src/pages/pipelines/table.ts:124-134`

Task 6.4 says template delete is refused when lanes reference the
template and the surface must show the dependent lanes. The current
disabled delete button visibly renders only `Delete — N lanes`; the
actual dependent lane ids are only present in the button `title`.

That leaves keyboard and touch users without a reliable visible path to
the dependent ids, and makes the gate easier to miss. Render the lane ids
inline in the row or adjacent disabled-state explanation, not only in a
hover tooltip.

### AUDIT-20260529-03 — Preset edit actions copy known-refused update commands

Finding-ID: AUDIT-20260529-03
Status:     fixed-b2bcdc0
Severity:   medium
Surface:    `packages/studio/src/pages/pipelines/edit-form.ts:34-43`,
            `plugins/deskwork-studio/public/src/pipelines/pipelines-page.ts:377-384`

Plugin-preset templates correctly render a "customize first" notice, but
the five update operation Copy buttons remain active. The client can copy
`/deskwork:pipeline update "editorial" ...` for a plugin preset even
though the CLI refuses preset mutation.

Expected: preset edit actions should be disabled with the customize
command surfaced, or should copy the customize-first command path.
Actual: the page can emit commands it already knows will fail.

### AUDIT-20260529-04 — Copy-builder validation allows CLI-invalid values

Finding-ID: AUDIT-20260529-04
Status:     fixed-b2bcdc0
Severity:   medium
Surface:    `packages/studio/src/pages/pipelines/new-form.ts:42`,
            `packages/studio/src/pages/pipelines/edit-form.ts:78-81`,
            `plugins/deskwork-studio/public/src/pipelines/pipelines-page.ts:117-145`

The client copy-builder blocks missing required fields but does not
enforce the same value constraints advertised by the form and enforced
by the CLI. Examples that can still be copied:

- invalid template ids such as `Bad Id`
- invalid positions such as `1.5`
- comma-list values with blank entries such as `Idea,,Final`

The CLI rejects these later, but the Studio page's stated job is to
produce paste-ready `/deskwork:pipeline` commands. The client-side
validation should reject known-invalid values before clipboard copy, with
the same inline notice pattern used for missing fields.

### AUDIT-20260529-05 — Clear-locks disabled-state guidance is inaccurate

Finding-ID: AUDIT-20260529-05
Status:     fixed-b2bcdc0
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/pipelines/pipelines-page.ts:191-195`

When no locked-stage boxes are selected, the disabled-state message says:
"To remove individual locks, use Rename / Remove operations on the lane
configs, or edit .deskwork/pipelines/<id>.json directly."

This is inaccurate. The controls are pipeline-stage operations, not
lane-config operations, and rename/remove do not directly remove locks
except as a side effect of changing or deleting the stage itself. The
guidance should point to editing `.deskwork/pipelines/<id>.json` or a
future explicit CLI clear-locks capability.

### AUDIT-20260529-06 — CLI approve/publish tests assert stale message copy

Finding-ID: AUDIT-20260529-06
Status:     fixed-b2bcdc0
Severity:   medium (verification)
Surface:    `packages/cli/test/approve-entry-centric.test.ts:129`,
            `packages/cli/test/publish-entry-centric.test.ts:139`

The focused CLI gate still fails two assertion-copy tests:

- `approve-entry-centric.test.ts` expects stderr to contain
  `uses \`publish\``, while current behavior says
  `Use \`publish\`, not \`approve\`, to graduate to the terminal stage.`
- `publish-entry-centric.test.ts` expects `/already Published/i`, while
  current behavior says
  `entry is already at terminal stage "Published" of pipeline "editorial".`

The command behavior appears correct and arguably clearer than the
legacy assertions, but the red tests keep `@deskwork/cli` verification
from going green. Either update the assertions to match the current
diagnostics or intentionally restore the older message contract.

### AUDIT-20260529-07 — Customize packaging failures are sandbox artifacts

Finding-ID: AUDIT-20260529-07
Status:     observation (no action)
Severity:   observation
Surface:    `packages/cli/test/customize-skill.test.ts`

The non-escalated focused CLI run reported two customize-skill packaging
failures from `npm pack` exit 255. Direct pack verification passed for
`@deskwork/studio` and `@deskwork/core`, and the customize test passed
with approved escalation:

`npm --workspace @deskwork/cli test -- test/customize-skill.test.ts`
→ 12 passed.

Disposition: no product finding. The failure shape is the local sandbox
npm-cache permission issue already isolated by the escalated run.

### Task 6.4 closing summary

- Spec-compliance review (on `2cdde80`): SPEC-COMPLIANT WITH NON-BLOCKING OBSERVATIONS. All 4 workplan steps + Phase 2 follow-up + 12 architecture decisions delivered. Phase 2 follow-up verified end-to-end: malformed pipeline JSON renders as error rows with parse/Zod/id-mismatch error verbatim, NOT silently filtered; dependents on broken templates computed via direct JSON read bypassing cross-validating loader.
- Code-quality review (on `2cdde80`): QUALITY-APPROVED WITH NON-BLOCKING OBSERVATIONS — 1 CRITICAL + 4 WARNING + 5 INFO.
- Triage outcome: 1 CRITICAL + 6 NON-BLOCKING applied at `af1e91a`; 5 INFO observations accepted without action.
- Highest-value finding: the CRITICAL — set-locked / set-off-pipeline panels emitted CLI-rejected empty-list paste when the operator unchecked every box. Quality reviewer caught it AND noted the test was asserting the broken output as expected. Updated tests + disabled Copy + inline notice + per-panel error message — operator now sees the gate visibly.
- Other applied fixes: shared `quoteValue` helper, O(N*M) → O(M) inverse-index data layer, long-stage-name wrapping, empty-field Copy gating across all CRUD panels, dropped speculative scaffolding, XSS regression test for the Phase 2 follow-up error rendering.
- Worktree hygiene per [#347](https://github.com/audiocontrol-org/deskwork/issues/347): detected and removed re-derivation of v0.24.0 dw-lifecycle work that an earlier agent in this session inadvertently re-created on this stale branch base. The dw-lifecycle `detect-clones → check-clones` rename + `deprecation-scan` feature already shipped on main; cleanup via the issue's recommended `git restore` + `rm` plan brought the worktree back to graphical-entries-only diffs.
- Test deltas: studio suite 880 → 888 (+8 new tests for validation gates + XSS regression); core 711 throughout; CLI tests unchanged.
- Builds: `@deskwork/{core, studio, cli}` all exit 0.
- New clone disposition: `9e3f04426ee7` disposed `keep-with-reason` for the set-locked / set-off-pipeline panel symmetry (parallel pipeline-schema operations; collapsing would obscure per-panel error-message identity).

## Phase 6 closeout audit — Tasks 6.5/6.6 + end-state gates (2026-05-29)

Audit scope: clean `feature/graphical-entries` worktree at
`1e78a5e` (`docs(graphical-entries): Phase 6 closeout — README status
row Done`), covering the Phase 6.5 doctor rule, Phase 6.6 custom-pipeline
integration test, and Phase 6 closeout documentation.

Changed surfaces reviewed:

- `packages/core/src/doctor/rules/lane-config-missing-template.ts`
- `packages/core/src/doctor/runner.ts`
- `packages/core/src/schema/journal-events.ts`
- `packages/core/test/doctor/lane-config-missing-template.test.ts`
- `packages/cli/test/custom-pipeline-lane-integration.test.ts`
- `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md`
- `docs/1.0/001-IN-PROGRESS/graphical-entries/README.md`

Track 1 controller verification:

- `npm --workspace @deskwork/core test` — passed:
  65 files, 715 tests.
- `npm --workspace @deskwork/cli test` — passed:
  30 files passed, 2 skipped; 321 tests passed, 29 skipped.
- `npm --workspace @deskwork/studio test` — passed:
  78 files passed, 2 skipped; 893 tests passed, 11 skipped.
- `npm run build --workspaces --if-present` — passed for core, CLI,
  and Studio.
- `tsx scripts/smoke-phase4-issues.mjs` — passed. It reports two
  informational `orphan-frontmatter-id` findings in the smoke fixture,
  but the script's regression probes pass.
- `tsx scripts/smoke-phase4-migration.mjs` — passed and idempotent.
- `npm pack --dry-run --workspace @deskwork/core` — passed; tarball
  includes `dist/doctor/rules/lane-config-missing-template.{js,ts,d.ts}`.
- `npm pack --dry-run --workspace @deskwork/cli` — passed; tarball
  includes `dist/commands/{lane,pipeline}.js`.
- `npm pack --dry-run --workspace @deskwork/studio` — passed; tarball
  includes `dist/pages/pipelines/*`.

Track 2 spec-compliance review: one medium finding.
Track 3 code-quality review: no blocking/high findings beyond the same
repair-choice correctness gap.

### AUDIT-20260529-08 — Doctor repair prompt can offer malformed template ids

Finding-ID: AUDIT-20260529-08
Status:     fixed-a031183
Severity:   medium
Surface:    `packages/core/src/doctor/rules/lane-config-missing-template.ts:214-220`,
            `packages/core/src/pipelines/loader.ts:267-280`,
            `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:331`

Task 6.5.2 says the prompt plan offers one `set-template-<id>` choice per
resolvable preset/override. The implementation builds those choices from
`listAvailablePipelineTemplates(ctx.projectRoot)`, whose documented
contract intentionally does not validate templates and includes malformed
override JSON so UI pickers can show "this id exists but won't load".

Actual result: if `.deskwork/pipelines/broken.json` is malformed, the
doctor repair prompt can still offer `set-template-broken`. Choosing it
then fails later in `apply()` when `loadPipelineTemplate()` revalidates
the template. The late refusal prevents data loss, but the repair prompt
is not actionable and violates the "resolvable preset/override" contract.

Expected: `plan()` should filter choices through `loadPipelineTemplate()`
and include only template ids that resolve at plan time, while still
retaining the apply-time revalidation for races between planning and
applying. Add a fixture where one valid template and one malformed
override exist, then assert the malformed id is not present in the repair
choices.

### AUDIT-20260529-09 — Phase 6 end-state verification passed

Finding-ID: AUDIT-20260529-09
Status:     observation (no action)
Severity:   observation
Surface:    Phase 6 closeout verification

All controller-side gates listed in this audit section passed at
`1e78a5e`: core/CLI/Studio tests, workspace build, Phase 4 smoke probes,
and core/CLI/Studio package dry-runs. The one new actionable finding is
limited to repair-choice correctness in the `lane-config-missing-template`
doctor rule; it is not a build, packaging, or broad regression failure.

## 2026-05-29 audit: AUDIT-10 dual-viewport verification (post-`e228e26`)

Probe scope: `feature/graphical-entries` at `e228e26..f7ca553` — the
mobile lane-stack accordion variant landed by AUDIT-20260528-10 plus
the wave-5 observation closures. Verification protocol per
`.claude/rules/ui-verification.md` § Dual-viewport verification: run
the dev studio against this worktree's editorial-internal calendar;
probe at desktop (1920×1080) AND phone (390×844) viewports.

Probe results — desktop (1920×1080):
- `matchMedia('(max-width: 720px)')` = `false` ✓
- `.lane-stack` exists with `display: none` ✓ (correctly hidden on desktop)
- `.bay-body` wraps the desktop `.swim` cards, visible at 978×3075px ✓
- DOM both-trees-emitted: server-rendered, CSS gates which renders ✓

Probe results — mobile (390×844):
- `matchMedia('(max-width: 720px)')` = `true` ✓
- `.lane-stack` `display: block`, visible at 298×1384px ✓
- `.bay-body` `display: none`, swim cards collapsed to 0×0 ✓
- `.lane-section > .lane-head + .lane-body` structure matches the
  D3 Press Bay brief contract ✓
- `.lane-head` children: `.lh-glyph` + `.lh-name` + `.lh-count` +
  `.lh-chev.collapse-chev` + `.swim-compose.lh-compose` +
  `.view-toggle.lh-view-toggle` — matches brief's accordion-header
  affordance list ✓
- Accordion expand/collapse: chevron click toggles `aria-expanded`
  AND `[hidden]` on `.lane-body`; `aria-label="Collapse Default lane"`;
  semantic hidden attribute (not just CSS display:none) so SR users
  skip the collapsed body ✓
- List-default rendering on mobile: `.swim.view-list` class applied,
  `.lane-body` first child is `.list-body` ✓
- Compose chip: clipboard receives `/deskwork:add <SLUG> --lane
  default --stage Ideas`; `.copied` class flashes; aria-label flips
  to "Copied — paste in chat" ✓ (existing `swim-compose` data-attr
  binding from Task 5.1C works transparently on the new mobile DOM
  tree)

### AUDIT-20260529-10 — view-toggle cells under WCAG 2.2 SC 2.5.8 AA on mobile

Finding-ID: AUDIT-20260529-10
Status:     fixed-e4529ab
Severity:   medium
Surface:    `plugins/deskwork-studio/public/css/dashboard-lane-stack.css:149-153`

The lane-head's view-toggle (`.lh-view-toggle .vt-cell`) shrinks
padding and font-size to fit alongside the chevron + compose chip +
count strip on the 390px viewport. With the shrunken padding the
individual cells measure 18-19px wide × 24px tall — under the WCAG
2.2 SC 2.5.8 AA "Target Size (Minimum)" requirement of 24×24 CSS
pixels per target.

Hit-target probe at 390×844:
- `.collapse-chev`: 24×24 ✓
- `.swim-compose`: 30×30 ✓
- `.vt-cell` (Kanban): 19×24 ✗
- `.vt-cell` (List): 18×24 ✗

Desktop cells are unaffected (72×26 and 57×26) because the lane-head
chrome doesn't compete for horizontal space there.

Fix: add explicit `min-width: 24px; min-height: 24px;` floors to the
shrunken-cell rule. The view-toggle container grows from 39×26 to
50×26; cells grow to 24×24 each. No CSS cascade conflict with the
desktop swim view-toggle rule (this rule is scoped to
`.lane-head .lh-view-toggle .vt-cell` inside the
`@media (max-width: 720px)` block).

Verified post-fix at 390×844:
- view_cell_kanban: 24×24 ✓
- view_cell_list: 24×24 ✓
- view_toggle_container: 50×26 (was 39×26)

Studio test suite: 933/933 + 11 skipped (unchanged from baseline).

### AUDIT-20260529-11 — Phase 6 closeout audit completed end-to-end

Finding-ID: AUDIT-20260529-11
Status:     observation (no action)
Severity:   observation
Surface:    Phase 6 closeout dual-viewport verification

Every brief-contracted aspect of the mobile lane-stack accordion
variant verified at both desktop and phone viewports via Playwright
probe against the live dev studio. The one defect surfaced
(`AUDIT-20260529-10`) was a WCAG 2.2 SC 2.5.8 AA target-size
violation on the lane-head's view-toggle cells; that defect is fixed
in the same commit as this audit-log entry. No other contract
mismatch found.

The dual-viewport verification gap noted in the AUDIT-10 commit body
(`e228e26`) is closed. The audit-log open-count remains 0 after this
audit cycle.

## 2026-05-29 (session 2) audit: Phase 7 Task 7.1 — EntrySidecar members[] schema delta

Audit scope: one commit, `e47ed3e`. Risk classification: routine
(purely additive optional field on `EntrySchema`; 7 new tests; no
runtime call sites consume the new field yet — group readers land in
Tasks 7.2 / 7.3 / 7.5).

Track 1 verification (controller, this session):

- `npm --workspace @deskwork/core test`: 723/723 pass (716 → 723, +7
  new schema tests for `members[]`).
- `npm --workspace @deskwork/cli test`: 327/327 pass, 0 regressions.
- `npm --workspace @deskwork/studio test`: 933/933 pass, 0 regressions.
- `npm --workspace @deskwork/core --workspace @deskwork/cli --workspace
  @deskwork/studio run build`: exit 0.
- `dw-lifecycle check-clones --gate-mode`: 0 NEW, 0 DROPPED.

Track 2 spec-compliance: parallel `code-reviewer` agent against the
workplan + PRD. Pass; only informational observations (PRD-sketch
field-ordering vs. impl placement; pre-existing `artifactPath`
optionality vs. PRD sketch — both no-action).

Track 3 code-quality: parallel `code-reviewer` agent against the diff.
Pass; three informational observations recorded below.

### AUDIT-20260529-12 — doc-comments reference future workplan task numbers (phase-number rot risk)

Finding-ID: AUDIT-20260529-12
Status:     informational
Severity:   low
Surface:    `packages/core/src/schema/entry.ts:196,198-209`

The new inline doc-comments on `EntrySchema.members` and on the
`artifactPath` paragraph mention future workplan task numbers by
ordinal: "Task 7.5.1", "Task 7.5.2", "Task 7.7.2", "Tasks 7.2.3 /
7.2.4". A future reordering of the Phase 7 workplan (whether by an
operator-driven extend, a phase split, or a renumber) would leave
the comments referencing tasks that no longer exist at those
addresses, silently rotting the cross-reference.

Disposition: PUSH-BACK on the literal "remove the task numbers"
recommendation. The doc-comments already pair every task-number
reference with a behavior anchor — e.g. "Task 7.5.1's
`group-recursive` rule", "Task 7.7.2's iterate-side refusal",
"Tasks 7.2.3 / 7.2.4 — the `/deskwork:group` CLI's concern". The
behavior anchors are stable under renumbering (the rule name and
the CLI's role survive a workplan-renumber). A future reader who
greps for `group-recursive` lands in the right place regardless of
whether Phase 7 is still "Phase 7" by then.

Rationale to keep the task-number references: they ARE meaningful
right now — Phase 7 is the next several commits, and a contributor
reading `entry.ts` while picking up Task 7.5 or 7.7 benefits from
the literal back-pointer. The rot horizon is the duration of this
feature branch; the cost of rot is small (a confused reader has to
re-grep). Removing them prematurely would harm readers walking the
in-progress feature today.

No code change. Informational record of the design tradeoff.

### AUDIT-20260529-13 — schema permits both `members: undefined` and `members: []` (dual representation)

Finding-ID: AUDIT-20260529-13
Status:     acknowledged-2026-05-29-task-7.5.5
Severity:   low
Surface:    `packages/core/src/schema/entry.ts:209`

The schema accepts BOTH `members: undefined` (field absent) and
`members: []` (empty array) as valid shapes for a "regular entry"
(non-group). Both shapes round-trip cleanly through `EntrySchema.parse`;
the test at `packages/core/test/schema/entry.test.ts:259-277`
explicitly verifies the empty-array case parses. The inline
doc-comment at `entry.ts:198-209` flags the dual representation
("entries without `members` (or with `members: []`) are regular
entries").

Downstream consequence: any downstream group-ness check MUST use a
length-check (`entry.members && entry.members.length > 0`) rather than
a presence-check (`!!entry.members`). The presence-check would wrongly
classify an entry with `members: []` as a group.

Disposition: acknowledged. Defer the on-disk normalization to a new
Task 7.5.5 doctor rule (`group-empty-members-array` informational
rule) — the schema layer is the wrong place to normalize, because
forcing one shape at the schema layer would either reject legitimate
data on read (bad) or silently mutate data on read (worse). The
doctor layer is where canonical-shape conventions live in this
codebase.

Workplan annotation: Task 7.5 now carries Step 7.5.5 referencing this
audit ID; no Task 7.1 change.

### AUDIT-20260529-14 — non-UUID-rejection test asserted only first-element-invalid; last-element case untested

Finding-ID: AUDIT-20260529-14
Status:     fixed-05b6091
Severity:   low
Surface:    `packages/core/test/schema/entry.test.ts:322-336`

The existing non-UUID-rejection test asserts `members: ['not-a-uuid',
'<valid-uuid>']` fails. It does NOT prove the validator walks every
element — a (hypothetical) short-circuiting Zod implementation that
only checked the first element would pass both this assertion AND
the implementation-correct version. The test's intent is "every
element is validated", but its assertion only proves "first
element is validated."

Fix: a sibling test where the invalid UUID is the LAST element. Cheap
(~12 lines), low-value individually, but a free win that hardens the
contract against future refactors of the validation code.

Resolution: a sibling test added at
`packages/core/test/schema/entry.test.ts:338-360` titled "rejects
members[] entries that are not UUIDs (last element invalid)" —
mirrors the existing first-element test with the order swapped.
Lands in the same commit as this audit-log entry.

## 2026-05-29 (session 2) audit: Phase 7 Task 7.2 — /deskwork:group skill family

Audit scope: one commit, `15dd424`. Risk classification: high (new
core module + CLI dispatcher + schema delta + journal-events
expansion + cross-skill `--cascade` flag; 3725 insertions across 33
files).

Track 1 verification (controller, this session):

- `npm --workspace @deskwork/core test`: 755/755 pass (723 → 755,
  +32 schema + group-operations integration tests).
- `npm --workspace @deskwork/cli test`: 400/400 pass (327 → 400,
  +73 per-verb suites + cancel-cascade).
- `npm --workspace @deskwork/studio test`: 933/933 pass, unchanged.
- Workspace builds for `@deskwork/core`, `@deskwork/cli`,
  `@deskwork/studio`: exit 0.
- `dw-lifecycle check-clones --refresh-baseline`: 18 NEW clone
  groups, all dispositioned `keep-with-reason` (parallel-domain
  symmetry across lane/pipeline/group dispatchers + the universal
  stage-transition verb boilerplate).

Track 2 spec-compliance: parallel `code-reviewer` agent against the
workplan + PRD. All six workplan sub-steps (7.2.1 through 7.2.6)
literally satisfied. The implementer's two scope additions (the
`restore` subcommand and 6 group-* journal-event kinds) defensible
per project convention (sister-to-archive symmetry + audit-trail
completeness). No Phase 7.3 / 7.4 / 7.5 / 7.6 / 7.7 / 7.8 scope
pulled forward. Two informational nits (PRD-sketch field-order vs.
impl, `show.ts:71` catch{} narrowing) — no-action.

Track 3 code-quality: parallel `code-reviewer` agent against the
diff. Multiple substantive findings — recorded below.

### AUDIT-20260529-15 — `members: []` is invisible to `group list` / `group show` / `group update` (HIGH)

Finding-ID: AUDIT-20260529-15
Status:     fixed-50b0ebf
Severity:   high
Surface:    `packages/core/src/groups/types.ts:20-22`, `packages/core/src/groups/operations/list.ts:35`, `packages/core/src/groups/operations/show.ts:48`, `packages/core/src/groups/operations/update.ts:48`, `packages/core/src/groups/operations/create.ts:119`

`group create` writes `members: []` deliberately as the "intent
marker" for a newly-declared group (see `create.ts` doc-comment,
pre-fix lines 12-22). But `isGroupEntry` defined the predicate as
"`Array.isArray(members) && members.length > 0`", so `list.ts`
filtered the new group out, and `show.ts` + `update.ts` refused on
empty-members entries.

Reproduction (pre-fix):

  $ deskwork group create my-group --lane default
  {"created":true,"slug":"my-group","members":[]}
  $ deskwork group list
  {"groups":[]}
  $ deskwork group show my-group
  Cannot show group "my-group": entry has no members.

The operator's just-created group was invisible to every read-side
verb until they ran `add-member`. Per the CLI's contract that
`create` makes a group, this was a UX regression.

Resolution: `isGroupEntry` redefined to `Array.isArray(entry.members)`
— `members: []` IS a group (declared-empty marker); `members:
undefined` denotes a regular entry. Added sibling predicate
`isPopulatedGroupEntry` for the "group AND has members" semantic
(used downstream by the multi-lane composed view in Task 7.4 + the
informational `group-all-members-cancelled` doctor rule in Task
7.5.3 — both should skip empty groups). Updated show.ts + update.ts
refusal messages to refer to "entry is not a group (no `members`
field)" instead of "entry has no members".

This finding SUPERSEDES AUDIT-20260529-13's framing at the CLI/
predicate layer; the schema-layer permissiveness (both shapes parse)
stands.

### AUDIT-20260529-16 — Task 7.5.5 reframed from `group-empty-members-array` to `group-stale-empty-members` (medium)

Finding-ID: AUDIT-20260529-16
Status:     fixed-50b0ebf
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:390`

The previously-scheduled doctor rule
`group-empty-members-array` (Task 7.5.5) was framed around the
assumption that `members: []` and `members: undefined` were
"semantically equivalent" non-group shapes that needed normalizing.
AUDIT-20260529-15's resolution invalidates that assumption — the
two shapes now denote different entities (declared-empty group vs.
regular entry). Task 7.5.5 reframed to `group-stale-empty-members`:
surface declared-empty groups whose age exceeds a threshold AND
have no `group-add-member` journal events. Operator decides whether
to cancel / archive / populate.

### AUDIT-20260529-17 — journal-events docblock claimed non-existent `cascadeFrom` linkage (medium; cascadeFrom feature tracked at #359)

Finding-ID: AUDIT-20260529-17
Status:     fixed-50b0ebf
Severity:   medium
Surface:    `packages/core/src/schema/journal-events.ts:347-351`

The docblock above the group-* event kinds claimed that group
cancel `--cascade` "emits one `stage-transition` event per affected
entry... the cascade surfaces in the per-entry event's
`metadata.cascadeFrom` field carrying the originating group's
entry id." `cancel.ts:138-145, :193-197` never sets
`metadata.cascadeFrom`. The doc-code drift made the audit-trail
claim load-bearing for downstream consumers who would have searched
for the field that doesn't exist.

Resolution: docblock rewritten to match the actual behavior — the
cascade does NOT record per-event linkage today; the audit trail is
reachable only via the cancel-time stdout JSON result's
`cascadedMembers[]` / `skippedMembers[]` arrays. SKILL.md was
already correct (line 44 explicitly states this). The
`cascadeFrom`-on-event feature is captured in the follow-up issue
filed alongside this audit entry.

### AUDIT-20260529-18 — `regenerateCalendar` runs N+1 times per cascade (medium, fixed)

Finding-ID: AUDIT-20260529-18
Status:     fixed-4e3b911
Severity:   medium
Surface:    `packages/core/src/entry/cancel.ts:225`

`cancelEntry` runs `regenerateCalendar(projectRoot)` once per
invocation. The cascade path (`cancel.ts:193`) recursively invokes
`cancelEntry` for every cascaded member, so a group with N members
triggers N+1 full sidecar re-reads + calendar.md writes. Quadratic
disk I/O on large groups; the inner regenerations don't compound to
incorrect state (the journal is the source of truth and each cancel
finalizes its own write before the regenerate reads), but the work
is wasted.

Disposition: medium. The fix is a structural refactor (split
`cancelEntry` into a private walker + a public wrapper that
regenerates once at the cascade boundary) that's bigger than this
review-action commit. Filed as a follow-up GitHub issue against the
graphical-entries milestone; the issue body has the recommended
refactor shape.

Resolution: Step 7.2.7 (graphical-entries workplan) lands the
walker / wrapper split. `cancelEntryWithoutCalendarRegen` (private)
performs the per-entry transition + journal append + sidecar write
WITHOUT calling `regenerateCalendar`; the cascade walk recurses
into the walker directly rather than re-entering the public
wrapper. The public `cancelEntry` is now a thin boundary that
delegates to the walker for the head entry (which itself walks all
members) and then calls `regenerateCalendar` exactly ONCE. The new
test file `packages/core/test/entry/cancel-cascade.test.ts`
asserts the call-count invariant via
`vi.spyOn(regenerateModule, 'regenerateCalendar')` across four
scenarios (single-entry, 3-member cascade, mixed-skip cascade,
non-group with cascade flag) — each expects exactly one call where
the pre-fix shape produced N+1 / 2 / 2 respectively. All existing
CLI cascade tests (`packages/cli/test/cancel-cascade.test.ts`)
still pass; the `CancelResult` shape, refusals, and per-entry
journal semantics are behavior-preserved.

### AUDIT-20260529-19 — create→list round-trip test gap (medium)

Finding-ID: AUDIT-20260529-19
Status:     fixed-50b0ebf
Severity:   medium
Surface:    `packages/cli/test/group/create.test.ts`, `packages/cli/test/group/list.test.ts`

The original Task 7.2 test suite covered `group create` + `group
list` in isolation but had no end-to-end round-trip that drove
both verbs against the same fixture. The HIGH-1 bug
(AUDIT-20260529-15) was exactly the kind of integration mismatch
this gap was blind to.

Resolution: new test
`packages/cli/test/group/create.test.ts:create -> list round-trip`
that runs `group create round-trip-group --lane default` then
`group list` and asserts the new slug appears with `memberCount:
0`. Plus existing tests updated to assert the new (post-fix)
empty-group semantics across list / show / update.

### AUDIT-20260529-20 — journal-events docblock count off-by-one (low)

Finding-ID: AUDIT-20260529-20
Status:     fixed-50b0ebf
Severity:   low
Surface:    `packages/core/src/schema/journal-events.ts:334`

Docblock prose said "seven kinds" then enumerated six (and six are
defined). Off-by-one prose error.

Resolution: prose updated from "seven" to "six". One-character fix.

### AUDIT-20260529-21 — group SKILL.md `update` description didn't mention empty-members refusal semantics (low)

Finding-ID: AUDIT-20260529-21
Status:     fixed-50b0ebf
Severity:   low
Surface:    `plugins/deskwork/skills/group/SKILL.md:47`

The `update` verb description didn't surface that update refuses
against entries without the `members` field. AUDIT-20260529-15's
resolution changed the refusal predicate (from "empty members" to
"missing members field"); the SKILL.md needed to match.

Resolution: SKILL.md `update` description updated to read "Works
against both populated and declared-empty groups; refuses against
entries without the `members` field at all (regular entries)." The
header was also expanded to document the empty-vs-absent semantic
distinction.

### AUDIT-20260529-22 — cancel-cascade test docblock named `vi.mock` but code uses `vi.spyOn` (low)

Finding-ID: AUDIT-20260529-22
Status:     fixed-cbc53ae
Severity:   low
Surface:    `packages/core/test/entry/cancel-cascade.test.ts:15`

The header docblock of the new cascade-regenerate-count test
described the seam as `vi.mock('@/calendar/regenerate', ...)`, but
the implementation at line 102 uses `vi.spyOn(regenerateModule,
'regenerateCalendar')` — different vitest APIs producing the same
observable outcome here, but a misleading doc/code drift for a
future reader.

Resolution: docblock rewritten to describe the actual
`vi.spyOn(regenerateModule, ...)` mechanism + the namespace-import
requirement that makes the spy attach to the same binding `cancel.ts`
consumes (a destructured import would bypass the spy).

### AUDIT-20260529-23 — recursive-cascade not exercised by Step 7.2.7 tests (medium; deferred to #363)

Finding-ID: AUDIT-20260529-23
Status:     acknowledged-2026-05-29-issue-#363
Severity:   medium
Surface:    `packages/core/test/entry/cancel-cascade.test.ts:95`

The walker recursively invokes itself when a cascaded member is
itself a group (`cancel.ts:198-205`), and the result-flattening
logic on lines 212-217 handles nested `cascadedMembers` /
`skippedMembers` arrays. None of the four cascade tests exercise
this path — they only test flat 3-member groups. Doctor's
`group-recursive` rule (Task 7.5.1, not yet shipped) will refuse
recursive groups at lint time, but the cancel code path still has
to behave correctly when one exists.

Disposition: medium. Test-coverage shortfall, not an active bug
(walker's recursive behavior is correct by code reading). Filed at
[#363](https://github.com/audiocontrol-org/deskwork/issues/363)
with the regression-test shape spelled out.

### AUDIT-20260529-24 — `priorStage` not asserted for cascaded members (low; deferred to #363)

Finding-ID: AUDIT-20260529-24
Status:     acknowledged-2026-05-29-issue-#363
Severity:   low
Surface:    `packages/core/test/entry/cancel-cascade.test.ts:119`

The cascade test asserts `currentStage === 'Cancelled'` for the
head + cascaded members but does NOT assert `priorStage` is
preserved on the cascaded members. The legacy single-entry test
(`cancel.test.ts:31`) covers `priorStage` for the head entry only.
A regression that dropped `priorStage` writing in the walker (or
wrote it incorrectly) would not be caught.

Disposition: low. Test-coverage shortfall folded into the same
[#363](https://github.com/audiocontrol-org/deskwork/issues/363)
follow-up as AUDIT-20260529-23 since both extend the same test
file.

### AUDIT-20260529-25 — wider concurrent-read window during cascade (informational)

Finding-ID: AUDIT-20260529-25
Status:     informational
Severity:   informational
Surface:    `packages/core/src/entry/cancel.ts:138-274`

Pre-fix: cascade produced N "narrow" inconsistency windows —
between member-K's sidecar write and its individual regenerate, a
concurrent reader could see member-K's sidecar but stale
`calendar.md`. Post-fix: there is ONE inconsistency window that's
WIDER — between the head's sidecar write and the final regenerate
at line 274, a concurrent reader can see up to N+1 newly-written
sidecars + a stale `calendar.md`. Window count is net-better (1 vs
N), but per-window scope is larger.

Disposition: informational only. For this project's deployment
model (single-operator, batch operations) this is a non-issue.
Recording so the trade-off is explicit and not an unstated
regression.

### AUDIT-20260529-26 — recursive walker call's forced `cascade: true` undocumented (low)

Finding-ID: AUDIT-20260529-26
Status:     fixed-cbc53ae
Severity:   low
Surface:    `packages/core/src/entry/cancel.ts:198-205`

When a cascaded member is itself a group, the recursive walker
call passed `cascade: true` unconditionally — so once cascade is
opted into at the top, the entire subtree is cascaded. The
docblock mentioned the recursive behavior in passing but didn't
explicitly call out the forced-cascade-on-the-call invariant.

Resolution: three-line code comment added directly above the
recursive walker call documenting the forced cascade and the
`group-recursive` rule that normally prevents the shape but
doesn't relieve the cancel code path from behaving correctly when
one exists.

### AUDIT-20260529-27 — Step 7.2.8 shipped: `metadata.cascadeFrom` on cascade `stage-transition` events (feature; closes #359)

Finding-ID: AUDIT-20260529-27
Status:     fixed-e311698
Severity:   medium (audit-trail enhancement)
Surface:    `packages/core/src/schema/journal-events.ts:65-94`,
            `packages/core/src/entry/cancel.ts:99-260`

Step 7.2.8 (graphical-entries) shipped the `metadata.cascadeFrom`
feature originally tracked by AUDIT-20260529-17 + filed at #359.
Without it, cascade-cancel journal events were
indistinguishable from single-entry cancels once the operator's
terminal scrollback was gone — the only durable cascade audit
trail was the cancel-time stdout JSON.

Resolution:

  - **Schema.** `StageTransitionEvent.metadata` was tightened from
    the generic `z.record(z.string(), z.unknown()).optional()` to a
    typed `z.object({ cascadeFrom: z.string().uuid().optional() })
    .passthrough().optional()`. The `.passthrough()` preserves
    forward-compat for future metadata-bag enhancements without a
    schema churn; the typed `cascadeFrom` makes the field part of
    the parsed `JournalEvent` shape consumers can read without
    casting through `unknown`. A docblock above the new field
    fully specifies the contract: originator's event omits
    `cascadeFrom`; cascaded members carry the TOP-LEVEL
    originator's UUID (not the nearest parent), so transitively-
    cascaded events trace back to the cascade invocation in a
    single hop.

  - **Walker threading.** `cancelEntryWithoutCalendarRegen` was
    refactored to accept an internal `WalkerOptions` shape that
    augments the public `CancelOptions` with a `cascadeFrom?: string`
    field. The public `cancelEntry` wrapper never sets it (the
    originator is not a cascadee); the recursive walker call DOES
    set it, threading `opts.cascadeFrom ?? sidecar.uuid` so the
    top-level originator's UUID propagates through every level of
    the cascade subtree.

  - **Docblock restored.** The pre-AUDIT-20260529-17 docblock
    paragraph above the group-* event kinds was restored — it now
    correctly claims the linkage and references the
    `StageTransitionEvent` field's contract. The `cancelEntry`
    docblock at `cancel.ts:243-273` and the new walker `WalkerOptions`
    docblock explain the originator-semantic decision; the cancel
    `SKILL.md` safety-rule bullet (line 44) was rewritten to surface
    the feature to operators.

  - **Tests.** Five new `cancel-cascade.test.ts` cases assert the
    contract end-to-end (write → read → schema-parse → assert):
    (a) non-cascade cancel: no `cascadeFrom`; (b) `--cascade` on a
    non-group: no `cascadeFrom` (no recursion fires); (c) `--cascade`
    on a 2-member group: members carry `cascadeFrom = group UUID`,
    originator does not; (d) recursive (nested) group cascade:
    transitively-cascaded events carry the TOP-LEVEL originator's
    UUID, NOT the nearest parent; (e) cascade with skipped members:
    skipped entries emit no `stage-transition` event at all, cascaded
    member's event carries `cascadeFrom`.

Core test count: 759 → 764 (+5 cascadeFrom contract cases).

### AUDIT-20260529-28 — Step 7.2.8 review pass — Track 2 + Track 3 findings consolidated (informational, no actionable items)

Finding-ID: AUDIT-20260529-28
Status:     informational
Severity:   informational
Surface:    `e311698` (Step 7.2.8 commit, closes #359)

Per-commit Track 2 (spec compliance) + Track 3 (code quality)
review pass on Step 7.2.8 produced ZERO blocking findings and ZERO
fix-now or defer-to-issue items. Track 2 confirmed all 12
acceptance-criteria checkpoints pass (schema delta typed correctly
with `.passthrough()`, cascade populates `metadata.cascadeFrom` on
cascaded members, non-cascade does not populate, top-level
originator semantic verified via the recursive-cascade test's
`.not.toBe(nestedGroup)` assertion, docblock restored on group-*
events, workplan + audit-log updated, no IOU markers, no
attribution).

Track 3 surfaced six informational observations; all dispositioned
acknowledge:

1. **No compile-time test that public `CancelOptions` rejects
   `cascadeFrom`** — low. `WalkerOptions` (private, internal)
   extends `CancelOptions` with the field; not exported. External
   callers cannot pass it through `cancelEntry()` in practice. No
   type-level test guards against a future export-widening refactor,
   but the boundary is structurally enforced today.

2. **`journal-events.test.ts` has no passthrough fixture** — low.
   The schema delta tightens `metadata` from a free-form record to
   `z.object({ cascadeFrom: ... }).passthrough().optional()`. The
   cancel-cascade test exercises write→read→parse round-trip for
   the new field; the unit-level schema test does not include an
   arbitrary-unknown-metadata-key fixture. No on-disk legacy events
   exist (no prior code path wrote metadata to stage-transition
   events), so no failures today; adding a passthrough fixture would
   lock the forward-compat contract.

3. **`cascadeFrom` UUID validation could over-constrain future
   non-entry cascade sources** — informational. `z.string().uuid()`
   is correct for v1 (only group entries cascade). Future
   cascade sources (project-level cascades, lane-level cascades,
   batch-by-query) would need either a schema relaxation
   (`z.string().min(1)`) or a tagged-union shape. Docblock matches
   the schema's current contract.

4. **Recursive originator threading verified correct** —
   informational. `opts.cascadeFrom ?? sidecar.uuid` at the
   recursive call preserves the top-level UUID across transitive
   cascades. Implementation matches the documented "single-hop audit
   trail" intent.

5. **Empty-members group as a cascaded member correctly handled** —
   informational. The cascade-iteration condition short-circuits
   members-empty re-iteration; the walker still fires on it as a
   member, so its own event carries `cascadeFrom`. Matches intent.

6. **Schema `.passthrough()` is forward-compatible** —
   informational. Future metadata keys can be added without schema
   churn. Pattern consistent with `LaneMigrationEvent.details`'s
   free-form record.

Disposition: review pass complete; no commit needed to address
findings. Recording the consolidated observation for the
release-time close-shipped scanner and for future readers tracing
the review trail of Step 7.2.8.

### AUDIT-20260529-29 — Phase 7 Tasks 7.3 + 7.4 shipped: group review surface + member-of pull-tab (feature)

Finding-ID: AUDIT-20260529-29
Status:     fixed-b642cd6
Severity:   feature
Surface:    `packages/studio/src/pages/entry-review/members-section.ts`, `packages/studio/src/pages/dashboard/section.ts`, `plugins/deskwork-studio/public/css/entry-review-members.css`, `plugins/deskwork-studio/public/css/dashboard-row-affordances.css`

Implementation of Phase 7 Tasks 7.3 (group review surface — Members
section) + 7.4 (multi-lane composed view) per the accepted design at
`docs/studio-design/ACCEPTED/2026-05-29-group-review-surface/` —
Direction B (composed-default with list-toggle) for the group review
surface + Direction 1 (pull-tab on row edge) for the member-of badge
on dashboard rows.

**Files created**

- `packages/studio/src/pages/entry-review/members-section.ts` — the
  Members section renderer; `renderMembersSection(input)` returns the
  populated composed/list view OR the empty-state CTA OR `''` per the
  four-shape contract documented in the module's docblock.
- `plugins/deskwork-studio/public/css/entry-review-members.css` —
  press-check styling for the section (paper / kraft / proof-blue
  token vocabulary; no new tokens).
- `plugins/deskwork-studio/public/src/entry-review/group-members-section.ts`
  — client controller for the composed↔list toggle (localStorage
  persistence keyed on the group UUID), the empty-state CTA
  clipboard-copy, and the per-member-row URL clipboard-copy.
- `plugins/deskwork-studio/public/src/dashboard/row-member-tab.ts` —
  client controller for the row `.er-row-member-tab` toggle +
  popover back-link clipboard-copy.
- `packages/studio/test/entry-review-group-members-section-list.test.ts`
  — list-mode rendering integration test (real sidecars, real lane
  configs, real templates).
- `packages/studio/test/entry-review-group-members-section-composed.test.ts`
  — composed-mode rendering integration test (multi-lane scoped
  composition + `is-empty` stage assertion).
- `packages/studio/test/dashboard-member-row-badge.test.ts` — dashboard
  row badge integration test (solo + multi-parent + non-member).
- `packages/studio/test/entry-review-group-empty-members.test.ts` —
  empty-state CTA + artifactPath-fallback integration test (2 cases).

**Files modified**

- `packages/core/src/groups/index.ts` — barrel now exports
  `isPopulatedGroupEntry` (was previously implementation-internal
  under `./types.ts`).
- `packages/studio/src/pages/entry-review/data.ts` —
  `loadEntryReviewData` returns `groupMembers: GroupMembersBundle |
  null`; new `loadGroupMembersBundle` resolves member sidecars +
  lane configs + pipeline templates for populated groups. Missing
  members surface as `missingMemberUuids`, not silently dropped.
- `packages/studio/src/pages/entry-review/index.ts` — accepts
  `?members=<mode>` query string; wires the new section after the
  `er-draft-frame` body via `renderEntryMembersSection`; adds the
  new CSS to the page's CSS list.
- `packages/studio/src/server.ts` — threads `?members=` from the
  request to the entry-review query.
- `packages/studio/src/pages/dashboard/data.ts` — `loadDashboardData`
  now builds `parentsByMemberUuid: ReadonlyMap<string, readonly
  Entry[]>` in one pass over the sidecar set.
- `packages/studio/src/pages/dashboard/swimlane-shell.ts` — accepts
  `parentsByMemberUuid` in its input; threads through to
  `renderSwimlane`. The mobile `renderLaneStack` does NOT receive
  the index — it uses the list-body chrome, not the kanban
  `.er-row-shell`; a comment names the asymmetry explicitly so the
  next reader doesn't read it as an IOU.
- `packages/studio/src/pages/dashboard/swimlane-card.ts` —
  `renderSwimlane` + `renderStageCol` accept and thread
  `parentsByMemberUuid` to `renderRow`.
- `packages/studio/src/pages/dashboard/section.ts` — `renderRow`
  accepts `parentsByMemberUuid` (default = empty map for back-compat);
  new local helpers `renderMemberTab` + `renderMemberPopover` emit
  the kraft-color pull-tab on the row's left edge + the inline
  popover listing every parent group. The shell carries
  `.has-member-tab` when at least one parent exists (CSS uses it to
  inset the row's foreground for the 22px tab column).
- `packages/studio/src/pages/dashboard.ts` — passes
  `data.parentsByMemberUuid` into `renderSwimlanesShell`.
- `plugins/deskwork-studio/public/css/dashboard-row-affordances.css`
  — appended `.er-row-member-tab`, `.er-row-member-popover`,
  `.er-row-member-link` rules; mirrors `.er-marginalia-tab` /
  `.er-outline-tab` shape per `.claude/rules/affordance-placement.md`.
- `plugins/deskwork-studio/public/src/entry-review-client.ts` —
  invokes `initGroupMembersSection()` from the press-check init.
- `plugins/deskwork-studio/public/src/editorial-studio-client.ts` —
  invokes `initRowMemberTab()` from the dashboard init.
- `packages/studio/test/dashboard-swimlane-card-unit.test.ts` —
  threaded the new `parentsByMemberUuid` empty-map arg into the
  `renderSwimlane` call so the existing AUDIT-20260528-07 test
  keeps compiling against the widened signature.

**Test count delta** — studio suite 933 → 938 tests passing (+5
across the four new files: 1 list, 1 composed, 1 member-row-badge,
2 empty-members). Core suite unchanged (764 passing — the only
core-side delta is the `isPopulatedGroupEntry` re-export, which
trades a private subpath import for the barrel; no behavior
change).

**Phase 5 swimlane reuse pattern** — the composed view does NOT
re-instantiate the Phase 5 swimlane primitive (`renderSwimlane`
takes a `LaneBucket` shape that's bound to the dashboard's lane
machinery + focus state, which doesn't apply to the scoped
group-member-set view). Instead, `members-section.ts` rebuilds the
swim CHROME — `.er-members-swim` (header), `.er-members-stage`
(per-stage row), `.er-members-card` (per-member card) — using the
same press-check tokens and the same `stageGlyph()` lookup so the
visual signature matches Phase 5 without coupling the entry-review
surface to dashboard internals. The compositor walks the same
`template.linearStages` + `template.offPipelineStages` sequence the
dashboard swim does, so empty stages render with the same
`is-empty` modifier the dashboard convention names.

**Pull-tab affordance class** — `.er-row-member-tab` mirrors the
`.er-outline-tab` / `.er-marginalia-tab` shape per the
`.claude/rules/affordance-placement.md` § "Reference patterns in
this codebase" mandate. Vertical text via `writing-mode:
vertical-rl`, left-edge anchored, kraft accent color so it reads
distinct from stage (red-pencil) or action (proof-blue). The
expanded state inverts the colors (kraft fill, paper text) — same
inversion pattern the marginalia-tab uses on activation.

**Structural decisions made along the way**

1. `members` query param on the entry-review route — added to
   `EntryReviewQuery` and routed through `server.ts`'s
   `c.req.query('members')`. Default = composed per the picked
   direction; client controller flips + persists per-group via
   localStorage.
2. Missing-member rows — render as `.er-member-row--missing`
   instead of silently dropping. The doctor `group-member-missing`
   rule (Task 7.5.2) is the loud signal; the surface mirrors the
   same finding inline so operators see the broken reference
   without leaving the page.
3. Lane-stack (mobile) NOT wired with the pull-tab in this commit —
   the mobile lane-stack uses the list-body chrome, not the kanban
   `.er-row-shell`, so a sibling rendering pass against the list-body
   chrome is required. Track 2's spec-compliance review flagged this
   as HIGH because the picked Direction 1 mockup is mobile-first.
   Tracked as Step 7.3.5 in the workplan + GitHub issue #371; the
   feature is NOT closeout-ready until that step lands. Per the
   project's discipline rule, deferrals get both workplan + issue
   recording — see Track 2 review actions for the resolution path.
4. `loadLaneConfig` failures during member loading swallow rather
   than crash — a member with a stale lane id surfaces in the
   composed view as "unrouted" (rendered with the raw lane id) and
   in the list view's per-row meta. The list-mode test does NOT
   exercise this branch; the empty-members fallback test exercises
   the no-lane-resolution path indirectly through the bare-id
   default lane setup.
5. The composed view's `data-template-id` attribute drives the
   lane-accent color via CSS — no per-lane `class="lane-<id>"`
   coupling for non-default templates. This avoids the "we forgot
   to teach the CSS about lane X" failure mode the dashboard hit
   in pre-Task-5.2 days.

Workplan deltas + closing — Task 7.3.1, 7.3.2, 7.3.3, 7.3.4 ticked;
Task 7.4.1, 7.4.2, 7.4.3 ticked. Phase 7's remaining tasks (7.5
doctor rules + 7.6 studio group-management page + 7.7 iterate
semantics on groups + 7.8 integration tests) are explicitly out of
scope for this dispatch and remain open. Phase 7 parent issue (#306)
stays open until those tasks land. No GitHub `Closes` keyword on
the commit.

`Status` backfilled to `fixed-b642cd6` in the immediately-following
docs commit per the established two-commit pattern. (Note: the
backfill commit `3d670f5` originally wrote a markdown table format
that did NOT match the canonical `Status: fixed-<sha>` grep contract
— that's been corrected at the AUDIT-29 header above as part of the
Track 2 review actions; see AUDIT-30 below.)

### AUDIT-20260529-30 — review-action: cancelled `unsafe(laneClass)` HTML-injection risk in renderListRow

Finding-ID: AUDIT-20260529-30
Status:     fixed-cc45787
Severity:   medium
Surface:    `packages/studio/src/pages/entry-review/members-section.ts:217-228`

`renderListRow` wrapped the lane-class composition in `unsafe(...)`,
bypassing the html-template's escaping. `member.lane` is Zod-typed as
`z.string().min(1)` (`packages/core/src/schema/entry.ts:172`) — NOT
regex-bound to the canonical lane-id charset. A malformed sidecar
with `lane: 'x" onclick="alert(1)'` would have broken out of the
class attribute when rendered.

Resolution: import `LANE_ID_REGEX` from `@deskwork/core/lanes` and
validate the lane id before composing the class. If it fails the
regex, fall back to `lane-unrouted` (same shape the loader uses for
genuinely-missing lane configs). The `unsafe(...)` wrapper is now
safe because the input is regex-validated against the canonical
charset.

Track 3 finding #1 from the per-commit review of b642cd6 + 3d670f5.

### AUDIT-20260529-31 — review-action: pull-tab width 22px failed WCAG 2.5.8 (24x24 minimum)

Finding-ID: AUDIT-20260529-31
Status:     fixed-cc45787
Severity:   medium
Surface:    `plugins/deskwork-studio/public/css/dashboard-row-affordances.css:250`

`.er-row-member-tab` was 22px wide. WCAG 2.2 SC 2.5.8 (Target Size
Minimum, AA) requires 24x24 CSS pixels. The horizontal axis failed
by 2px. The spacing exception did not apply because the row
foreground is the immediate right neighbor at 4px clearance, well
under 24px.

Resolution: widened the tab from 22px to 24px; adjusted
`.er-row-shell.has-member-tab .er-row-fg`'s `padding-left` from 26px
to 28px to preserve the row's content layout. Both axes now meet
the WCAG floor.

Track 3 finding #2 from the per-commit review of b642cd6 + 3d670f5.

### AUDIT-20260529-32 — review-action: kraft-on-paper-2 text contrast 3.58:1 failed WCAG 1.4.3 AA

Finding-ID: AUDIT-20260529-32
Status:     fixed-cc45787
Severity:   medium
Surface:    `plugins/deskwork-studio/public/css/dashboard-row-affordances.css:275-304`

`.er-row-member-tab-label` and `.er-row-member-tab-count` text used
`var(--er-kraft)` (#8A7250) on `var(--er-paper-2)` (#ECE6D4),
computed contrast ratio approx 3.58:1. The label is 0.5625rem (~9px)
small text. WCAG 2.1 SC 1.4.3 AA requires 4.5:1 for small text; the
text failed by ~0.92.

Resolution: changed the resting-state label color to
`var(--er-ink-soft)` (#3A3530) on `var(--er-paper-2)` = 9.79:1; the
count badge text to `var(--er-ink)` (#1A1614) on `var(--er-paper)` =
14.91:1. Increased label font-size from 0.5625rem to 0.625rem
(~10px) and weight from 600 to 700. The kraft accent is preserved
through the count badge's border + the expanded-state background
flip, so the affordance still reads as a kraft "belonging-to"
affordance overall. Expanded-state contrast (paper on kraft, ~3.84:1)
left as-is because the expanded state is transient and the primary
information delivered is in the popover content, not the tab label
which the operator only sees while engaging the tap.

Track 3 finding #3 from the per-commit review of b642cd6 + 3d670f5.

### AUDIT-20260529-33 — review-action: AUDIT-29 used non-canonical Status format (broke queue-check grep)

Finding-ID: AUDIT-20260529-33
Status:     fixed-cc45787
Severity:   low
Surface:    `docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md:2728-2732`

The AUDIT-29 entry as originally written (b642cd6) used a markdown
table format `| fixed (b642cd6) |` for the Status field. Every
prior audit entry follows the canonical `Status:     fixed-<sha>`
field-format documented in the file's header and grep-anchored by
the canonical queue check `grep -nE "^Status:[[:space:]]+fixed-"`.
The non-canonical entry would NOT have surfaced in the standard
triage queue.

Resolution: rewrote the AUDIT-29 header block to use the canonical
`Finding-ID / Status / Severity / Surface` field-format. The
queue-check grep contract is preserved.

Track 2 finding #2 from the per-commit review of b642cd6 + 3d670f5.

### AUDIT-20260529-34 — review-action-deferred: mobile lane-stack missing pull-tab (Track 2 HIGH; deferred to #371)

Finding-ID: AUDIT-20260529-34
Status:     acknowledged-2026-05-29-issue-#371
Severity:   high
Surface:    `packages/studio/src/pages/dashboard/swimlane-shell.ts:258-271`, `packages/studio/src/pages/dashboard/lane-stack-card.ts`, `packages/studio/src/pages/dashboard/swimlane-list-body.ts`

Track 2's spec-compliance review of b642cd6 flagged HIGH: the
implementation wires the kraft pull-tab into the desktop kanban
swim path only. The mobile lane-stack rendering (the primary
viewport per the brief's "mobile-first" stance and the picked
Direction 1 mockup) does NOT render the affordance. A mobile
operator cannot discover that an entry belongs to a group.

The implementer's audit-log narrative framed this as a "future
operator need" — exactly the "Just for now is bullshit" pattern
the discipline rule names. Resolution: filed
[#371](https://github.com/audiocontrol-org/deskwork/issues/371)
with the deferral rationale + scoped Step 7.3.5 into the workplan
per the discipline rule's two-track recording requirement. The
audit-log narrative for AUDIT-29 has been amended to surface the
deferral path.

Phase 7 closeout is BLOCKED on Step 7.3.5 landing (mobile lane-stack
+ desktop list-mode-body pull-tab parity). Track 2 finding #1 + #5
from the per-commit review of b642cd6 + 3d670f5.

### AUDIT-20260529-35 — review-action-deferred: composed view silently drops unrouted members (Track 3 #4; deferred)

Finding-ID: AUDIT-20260529-35
Status:     acknowledged-2026-05-29-issue-#372
Severity:   low
Surface:    `packages/studio/src/pages/entry-review/members-section.ts:99-119`

`bucketMembersByLane` skips members whose `lane === undefined` AND
members whose `lane` is not in `laneConfigsById`. In list view they
still render (with `lane-unrouted` styling); in composed view they
vanish with no visible count discrepancy on the toggle. The operator
cannot tell composed view shows fewer entries unless they cross-check
totals. Tracked at
[#372](https://github.com/audiocontrol-org/deskwork/issues/372)
with the recommended unrouted-indicator design.

### AUDIT-20260529-36 — popover renders visible at rest on every member row (cascade order defeats `hidden`)

Finding-ID: AUDIT-20260529-36 (cross-model: AUDIT-BARRAGE-claude-01)
Status:     fixed-ffce4ba
Severity:   high
Surface:    `plugins/deskwork-studio/public/css/dashboard-row-affordances.css:347-354`, `packages/studio/src/pages/dashboard/section.ts:50` (`renderMemberPopover`)

`renderMemberPopover` emits `<div class="er-row-member-popover" data-row-member-popover hidden>`, and the client controller toggles visibility via `popover.hidden = !expanded` (`row-member-tab.ts` `setRowExpanded`). The intended design is collapsed-at-rest, expanded-on-tap. But the CSS rule `.er-row-member-popover { display: block; ... }` (same specificity 0,1,0 as `[hidden] { display: none }`, declared later by origin) WINS. The `hidden` attribute is inert; every member row's popover paints at all times.

The integration test (`dashboard-member-row-badge.test.ts`) only asserts `toContain('er-row-member-popover')` against the rendered HTML string — it never checks computed visibility. The test suite is green while the surface is functionally broken.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (claude). Fix path: drive visibility from the row-shell state class (e.g. `.er-row-shell:not(.is-member-expanded) .er-row-member-popover { display: none }` + `.er-row-shell.is-member-expanded .er-row-member-popover { display: block }`), AND extend the test to assert computed visibility via DOM (not string-contains) before declaring fixed. Per `.claude/rules/ui-verification.md`, the fix needs a live Playwright check before closing.

### AUDIT-20260529-37 — composed view has silent-drop vectors beyond AUDIT-35 (stage-not-in-template + partial-load lane configs)

Finding-ID: AUDIT-20260529-37 (cross-model: AUDIT-BARRAGE-claude-02)
Status:     fixed-fafc0e2
Severity:   medium
Surface:    `packages/studio/src/pages/entry-review/members-section.ts:99-150` (`bucketMembersByLane`), `packages/studio/src/pages/entry-review/data.ts:188-210` (`loadGroupMembersBundle`)

AUDIT-35 acknowledged composed view silently drops members with `lane === undefined` or a lane absent from `laneConfigsById`. Two additional silent-drop vectors are NOT covered:

1. In `bucketMembersByLane`, a member is bucketed under `stageMap.get(member.currentStage)`, but the emitted `byStage` only walks `template.linearStages + template.offPipelineStages`. Any member whose `currentStage` is not in its lane's template (a legacy stage, or a custom-template omission) is pushed into `stageMap` but never read back — it vanishes from composed view AND from `memberCount`, so the swim-head count is wrong with no "missing" indicator. The same member renders fine in list view, producing an invisible composed↔list discrepancy distinct from AUDIT-35.

2. In `loadGroupMembersBundle`, the load order is `laneConfigsById.set(strict.id, strict)` BEFORE `loadPipelineTemplate(...)`. If the template load throws, the `catch { continue }` fires — but the lane config is already in `laneConfigsById` while its template is absent from `templatesById`. Back in `bucketMembersByLane`, members of that lane pass the `laneConfigsById.has(member.lane)` guard, get bucketed, then hit `const template = templatesById.get(...); if (template === undefined) continue;` — dropping EVERY member of that lane from composed view, silently, and invisible in list view.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (claude). Fix path: (a) only `laneConfigsById.set` after the template successfully resolves (move the set inside the try, below the template load); (b) in `bucketMembersByLane`, emit an "unbucketed members" tail (mirroring list view's unrouted styling) so stage/template mismatches surface rather than disappear.

### AUDIT-20260529-38 — member card + list-row lane-accent CSS keys on `data-template-id` attribute the markup never emits

Finding-ID: AUDIT-20260529-38 (cross-model: AUDIT-BARRAGE-claude-03)
Status:     fixed-5234182
Severity:   medium
Surface:    `plugins/deskwork-studio/public/css/entry-review-members.css:262-265,318-321`, `packages/studio/src/pages/entry-review/members-section.ts:152-167` (`renderMemberStageCard`), `:200-235` (`renderListRow`)

AUDIT-29 structural-decision #5 claimed: "The composed view's `data-template-id` attribute drives the lane-accent color via CSS — no per-lane `class="lane-<id>"` coupling for non-default templates. This avoids the 'we forgot to teach the CSS about lane X' failure mode."

The claim holds only for the swim HEAD (`.er-members-swim` carries `data-template-id`, and CSS at entry-review-members.css:218-241 keys on it). It is FALSE for the cards and list rows. `renderMemberStageCard` emits `<a class="er-members-card lane-${member.lane ?? 'default'}">` with NO `data-template-id`, and `renderListRow` emits `<li class="er-member-row lane-<id>">` likewise with no `data-template-id`. Yet the CSS includes `.er-members-card[data-template-id="editorial"]` (line 263) and `.er-member-row[data-template-id="editorial"]` (line 319) — dead selectors that NEVER match.

Functional consequence: a lane using the `editorial` template but whose id is NOT the literal `default` (e.g. an `essays` or `articles` lane) gets a proof-blue swim head but FADED cards and list rows, because the only card/row accent rules that fire are the hardcoded `.lane-default` / `.lane-mockups` literals. The accent is inconsistent within a single swim block, and the exact "forgot to teach CSS about lane X" failure mode #5 said it avoided is reintroduced one level down.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (claude). Fix path: emit `data-template-id="${bucket.template.id}"` on the card `<a>` and the list `<li>` (the data is already in scope via the bucket/template), so the template-keyed accent rules actually drive the color; the literal `.lane-<id>` rules can be retired.

### AUDIT-20260529-39 — corrupt member sidecars misreported as missing (silent fallback violation)

Finding-ID: AUDIT-20260529-39 (cross-model: AUDIT-BARRAGE-codex-01)
Status:     fixed-d7f1ea7
Severity:   medium
Surface:    `packages/studio/src/pages/entry-review/data.ts:176-183` (`loadGroupMembersBundle`)

`loadGroupMembersBundle` catches every `readSidecar` failure and records the UUID as missing. That conflates a genuinely absent sidecar with schema parse failures, permission errors, malformed JSON, or other storage bugs. The result is an inline "missing" row instead of an explicit render/load failure, which violates the project's "no silent fallbacks" discipline (`.claude/CLAUDE.md` § "Error Handling") and can hide data corruption from the operator.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (codex). Fix path: distinguish not-found errors from other `readSidecar` failures. Only absent sidecars should enter `missingMemberUuids`; validation, parse, and I/O failures should propagate with an actionable message (either throwing or surfacing as a distinct "corrupt" row class so the operator can distinguish the two states).

### AUDIT-20260529-40 — missing-member rows lose declared insertion order (list-mode contract violation)

Finding-ID: AUDIT-20260529-40 (cross-model: AUDIT-BARRAGE-codex-02)
Status:     fixed-b01eb21
Severity:   medium
Surface:    `packages/studio/src/pages/entry-review/data.ts:176-183`, `packages/studio/src/pages/entry-review/members-section.ts:263-271` (`renderListBody`)

The loader splits resolved members and missing UUIDs into separate arrays; `renderListBody` renders all resolved rows BEFORE all missing rows. A group declared as `[missing-a, real-b, missing-c]` displays as `[real-b, missing-a, missing-c]`, even though the brief's acceptance criterion says list mode preserves `group.members[]` insertion order.

This matters because the group membership list is operator-authored ordering — the operator's expectation is that members render in the order they added them, regardless of resolution state.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (codex). Fix path: introduce an ordered member-item structure that carries either `{kind: "resolved", entry}` or `{kind: "missing", uuid}` per original UUID position; `renderListBody` walks that sequence directly so insertion order is preserved end-to-end.

### AUDIT-20260529-41 — popover left margin (22px) misaligned with WCAG-widened tab (24px) — off-by-2px drift

Finding-ID: AUDIT-20260529-41 (cross-model: AUDIT-BARRAGE-claude-04)
Status:     fixed-2274781
Severity:   low
Surface:    `plugins/deskwork-studio/public/css/dashboard-row-affordances.css:349` (`.er-row-member-popover { margin: 0 0 0 22px }`) vs `:250` (`.er-row-member-tab { width: 24px }`) and `:320` (`.has-member-tab .er-row-fg { padding-left: 28px }`)

AUDIT-31 widened `.er-row-member-tab` from 22px to 24px and bumped `.er-row-shell.has-member-tab .er-row-fg` padding-left from 26px to 28px to keep the foreground clear of the tab. The popover's left offset was NOT updated in lockstep: `.er-row-member-popover` still has `margin: 0 0 0 22px`. The popover now starts 2px inside the 24px tab column rather than flush with the row foreground, producing a small but visible left-edge misalignment.

The cross-rule drift the WCAG-fix commit introduced by touching the tab width without sweeping the dependent offsets. The 22/24/28 magic numbers should be derived from a single `--er-member-tab-width` token to prevent this class of regression.

Note: somewhat MOOT until AUDIT-20260529-36 is fixed, since the popover currently renders unconditionally — the misalignment is hidden behind the always-visible popover bug.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (claude). Fix path: align popover left margin with the tab column (24px) or the foreground inset (28px), and extract `--er-member-tab-width` as a token.

### AUDIT-20260529-42 — `initGroupMembersSection` wire helpers re-attach listeners on every call (docstring lies)

Finding-ID: AUDIT-20260529-42 (cross-model: AUDIT-BARRAGE-claude-05)
Status:     fixed-90be5c3
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/entry-review/group-members-section.ts:104-150` (`initGroupMembersSection`, `wireToggle`, `wireEmptyStateCta`, `wireMemberRowCopy`)

The `initGroupMembersSection` docblock states "Idempotent — calling twice has no visible effect." That is true for `applyMode` (it reads current state) but NOT for the three `wire*` helpers: `wireToggle`, `wireEmptyStateCta`, and `wireMemberRowCopy` each call `addEventListener` unconditionally on every invocation. There is no module-level `wired` guard analogous to the one in the sibling `row-member-tab.ts` (which correctly guards with `let wired = false`).

If `initPressCheckSurface` ever runs twice (re-init after a partial DOM swap, or a future refresh path), the section accumulates duplicate listeners — clicking a member row would fire `copyOrShowFallback` twice (two clipboard writes + two toasts), and the toggle would double-write localStorage.

LOW severity because the current single call site doesn't trigger it, but the docstring asserts a property the code doesn't have.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (claude). Fix path: mirror the `row-member-tab.ts` pattern with a module-level `wired = false` guard, OR bind via a `dataset` sentinel on the section element so re-init is a genuine no-op.

<!-- ===========================================================
     Audit-barrage sweep — 2026-05-30 — 4 retroactive barrages
     ===========================================================
     Phase 2 (pipeline templates), Phase 3 (lane data model),
     Phase 4 (verb refactor), Phase 7 small surfaces
     (T7.1 + T7.2.7 + T7.2.8). 30 raw findings consolidated into
     24 unique entries (cross-model agreement merged where same
     surface). Run dirs:
       20260530T062828859Z (P2)
       20260530T063131307Z (P3)
       20260530T063443880Z (P4)
       20260530T064014571Z (P7 small)
     -->

### AUDIT-20260530-01 — path traversal in `loadPipelineTemplate` (unsanitized id flows to filesystem path)

Finding-ID: AUDIT-20260530-01 (cross-model: AUDIT-BARRAGE-claude-01-P2 + AUDIT-BARRAGE-codex-01-P2)
Status:     fixed-7e15a61
Severity:   high
Surface:    `packages/core/src/pipelines/loader.ts:118-141` (`loadPipelineTemplate`), `:36-38` (`projectOverridesDir`), `packages/core/src/pipelines/types.ts:96` (`id: z.string().min(1)`)

`loadPipelineTemplate(id, projectRoot)` string-interpolates the caller-supplied `id` directly into both candidate paths. The only guard is `id.length === 0`. No charset constraint — the schema validates the `id` field INSIDE a loaded file, never the REQUESTED id. An `id` of `'../../../../etc/something'` normalizes out of the intended directory and reads an arbitrary `.json` from disk.

Cross-references the downstream `LANE_ID_REGEX` fix from AUDIT-30 (applied at the studio render site for the same charset gap on lane ids). The right fix is here at the canonical chokepoint, not at every consumer.

Surfaced by audit-barrage run `20260530T062828859Z-graphical-entries` (claude + codex cross-model agreement). Fix: introduce `PIPELINE_ID_REGEX` mirroring `LANE_ID_REGEX` (`^[a-z0-9][a-z0-9-]*$`); enforce in `PipelineTemplateSchema.id` AND at the top of `loadPipelineTemplate` before any path construction; have `listAvailablePipelineTemplates` ignore filenames that don't match.

### AUDIT-20260530-02 — `.passthrough()` on `PipelineTemplateSchema` silently accepts misspelled optional fields

Finding-ID: AUDIT-20260530-02 (cross-model: AUDIT-BARRAGE-claude-02-P2)
Status:     fixed-c569a61
Severity:   medium
Surface:    `packages/core/src/pipelines/types.ts:107-110` (`.passthrough()`), `:101` (`lockedStages: ...optional()`)

The schema uses blanket `.passthrough()` to tolerate a single known extra key (`$rationale`). Every unknown top-level key is silently accepted, including typos of real optional fields. An operator who writes `"lockdStages": ["Review"]` (transposed) gets zero diagnostics — `lockedStages` resolves to `undefined`, the pipeline ships with no lock gate, and iterate-at-lock-stage silently permits edits.

Surfaced by audit-barrage run `20260530T062828859Z-graphical-entries` (claude). Fix: declare `$rationale: z.string().optional()` explicitly and drop `.passthrough()` (default strip, or `.strict()` if unknown keys should be rejected outright).

### AUDIT-20260530-03 — `PLUGIN_DEFAULTS_DIR` doubles as module directory AND preset registry (stray `.json` becomes phantom template)

Finding-ID: AUDIT-20260530-03 (cross-model: AUDIT-BARRAGE-claude-03-P2)
Status:     fixed-d5303ed
Severity:   low
Surface:    `packages/core/src/pipelines/loader.ts:31`, `:148-159`, `:180-189`

`listAvailablePipelineTemplates` enumerates every `.json` in `PLUGIN_DEFAULTS_DIR` = `dirname(import.meta.url)`. The directory serves dual roles: holds loader/types modules + acts as preset registry. Any future non-template JSON that lands in `src/pipelines/` is copied to `dist/pipelines/` and appears as a bogus template id in the operator picker.

Surfaced by audit-barrage run `20260530T062828859Z-graphical-entries` (claude). Fix: name the preset set explicitly (`PRESET_IDS` constant the build also drives, or a `presets.json` index).

### AUDIT-20260530-04 — verify `dist/pipelines/*.json` actually ships in the `@deskwork/core` published tarball

Finding-ID: AUDIT-20260530-04 (cross-model: AUDIT-BARRAGE-claude-04-P2)
Status:     fixed-c99e6d1
Severity:   medium
Surface:    `packages/core/package.json:214-215` (`build`/`prepack` cp step) — `files` whitelist (not in diff; needs inspection)

Build/prepack scripts `cp src/pipelines/*.json dist/pipelines/`, but the whole feature depends on those JSON files being present in the published tarball. If `package.json`'s `files` whitelist enumerates specific dist subpaths rather than shipping `dist/` wholesale, the JSON gets excluded and every `loadPipelineTemplate` call in the marketplace-installed package throws "file not found." Same shape as v0.11.0 missing-`zod`. Tests can't catch it (no test exercises the built `dist/` resolution path).

Surfaced by audit-barrage run `20260530T062828859Z-graphical-entries` (claude). Fix: `npm pack --dry-run` in `packages/core/` and assert `dist/pipelines/blog-post.json` et al. appear. If absent, widen `files` whitelist and add a CI/smoke check.

### AUDIT-20260530-05 — `dev` watch never re-copies preset JSON after edit (build/watch asymmetry)

Finding-ID: AUDIT-20260530-05 (cross-model: AUDIT-BARRAGE-claude-05-P2)
Status:     fixed-f0090c2
Severity:   low
Surface:    `packages/core/package.json:217` (`dev` script)

`build`/`prepack` copy `src/pipelines/*.json` into `dist/pipelines/`, but `dev` is `npm run build && tsc -b --watch`. Initial build copies once; thereafter `tsc --watch` only recompiles `.ts`. An operator iterating on a preset during `dev` sees no dist update.

Surfaced by audit-barrage run `20260530T062828859Z-graphical-entries` (claude). Fix: add parallel JSON watcher OR document in the script comment that JSON edits require manual `npm run build` during dev.

### AUDIT-20260530-06 — case-insensitive filesystem produces confusing id-mismatch error in `loadPipelineTemplate`

Finding-ID: AUDIT-20260530-06 (cross-model: AUDIT-BARRAGE-claude-06-P2)
Status:     fixed-b51859b
Severity:   low
Surface:    `packages/core/src/pipelines/loader.ts:124-138`, `:73-78`

On macOS's default case-insensitive filesystem, `existsSync(...'Editorial.json')` returns true for on-disk `editorial.json`. `loadPipelineTemplate('Editorial', root)` reads the file, then trips the id-mismatch check and throws a misleading error. Behavior diverges by host OS.

Surfaced by audit-barrage run `20260530T062828859Z-graphical-entries` (claude). Fix: pair with AUDIT-01's charset guard so the regex rejects mixed-case ids up front.

### AUDIT-20260530-07 — path traversal in `loadLaneConfig` (sister to AUDIT-01; same shape, different surface)

Finding-ID: AUDIT-20260530-07 (cross-model: AUDIT-BARRAGE-claude-01-P3 + AUDIT-BARRAGE-codex-01-P3)
Status:     fixed-9edc085
Severity:   high
Surface:    `packages/core/src/lanes/loader.ts:33-49` (`laneConfigPath`), `:90-115` (`loadLaneConfig`), `packages/core/src/schema/entry.ts:148` (`lane: z.string().min(1).optional()`)

`loadLaneConfig(id, projectRoot)` builds the path via `join(lanesDir(projectRoot), \`${id}.json\`)`. Only guard is `id.trim().length === 0`. `EntrySchema.lane` is `z.string().min(1).optional()` — NOT regex-bound — so a malformed sidecar (`lane: "../../secrets"`) flows straight into `loadLaneConfig` and reads arbitrary JSON.

AUDIT-30 already fixed this at the studio render site. The canonical chokepoint still doesn't enforce the charset.

Surfaced by audit-barrage run `20260530T063131307Z-graphical-entries` (claude + codex cross-model agreement). Fix: bind `EntrySchema.lane` to `LANE_ID_REGEX` at the schema layer AND validate the loader's `id` param up-front. Same pattern as AUDIT-01's pipeline-id fix; consider a shared validator.

### AUDIT-20260530-08 — `StrictLaneConfig` / `StrictPipelineTemplate` aliases are no-op; comments misdescribe Zod `.passthrough()`

Finding-ID: AUDIT-20260530-08 (cross-model: AUDIT-BARRAGE-claude-02-P3)
Status:     fixed-16917db
Severity:   medium
Surface:    `packages/core/src/lanes/types.ts:69-78`, `packages/core/src/pipelines/types.ts:137-161`

Both aliases claim to "narrow" a `z.infer` type that `.passthrough()` "widens." In Zod v3, `.passthrough()` changes only RUNTIME parsing; it does NOT add a `[k: string]: unknown` index signature to the inferred type. So `StrictLaneConfig = Pick<LaneConfig, ...>` is structurally identical to `LaneConfig`. The alias buys zero type safety; the comment's claim about catching typos at compile time is false.

Surfaced by audit-barrage run `20260530T063131307Z-graphical-entries` (claude). Fix: verify against the project's actual Zod version with a type probe; if confirmed, delete the aliases and the misdescribing comments. If extra-key safety is genuinely wanted, switch the schemas to explicit `.catchall()`.

### AUDIT-20260530-09 — `detectArtifactKind` classifies non-existent files as valid artifacts (inconsistent disk contract)

Finding-ID: AUDIT-20260530-09 (cross-model: AUDIT-BARRAGE-claude-03-P3 + AUDIT-BARRAGE-codex-02-P3)
Status:     fixed-2b42356
Severity:   medium
Surface:    `packages/core/src/lanes/detection.ts:44-77`, `packages/core/test/lanes/detection.test.ts:15-50`

Module doc says "classifies an on-disk path," but only the `html-mockup` branch touches disk. `.md`/`.html`/image branches dispatch purely on `extname` with NO existence check. `detectArtifactKind('/deleted/post.md')` returns `'markdown'` for a non-existent file; a deleted html-mockup throws. Asymmetric failure modes for the same root cause. Test fixture locks this in but the contract drift between doc and code is unintentional.

Surfaced by audit-barrage run `20260530T063131307Z-graphical-entries` (claude + codex cross-model agreement). Fix: probe existence once at the top and refuse non-existent paths with a clear error, then dispatch on extension; OR document detection as path-shape-only.

### AUDIT-20260530-10 — `bootstrap` doc claims "no readable config → no-config" but only checks existence

Finding-ID: AUDIT-20260530-10 (cross-model: AUDIT-BARRAGE-claude-04-P3)
Status:     fixed-234ac5a
Severity:   low
Surface:    `packages/core/src/lanes/bootstrap.ts:74-83`

Docblock states "If the project has no readable `.deskwork/config.json`, returns `{ created: false, reason: 'no-config' }`." Code only guards existsSync, then calls `readConfig` unguarded — a corrupt config throws, contradicting the "best-effort hook" contract.

Surfaced by audit-barrage run `20260530T063131307Z-graphical-entries` (claude). Fix: update doc to say "absent" instead of "no readable"; consider catch+rethrow with lane-bootstrap context.

### AUDIT-20260530-11 — `StageStringSchema` accepts whitespace-only stage values (`min(1)` is not `trim()`)

Finding-ID: AUDIT-20260530-11 (cross-model: AUDIT-BARRAGE-claude-05-P3)
Status:     fixed-242a434
Severity:   low
Surface:    `packages/core/src/schema/entry.ts:108`, `packages/core/test/schema/entry.test.ts:75-101`

`StageStringSchema = z.string().min(1)` parses `currentStage: '   '` successfully. Sibling validations disagree: lane ids reject whitespace via `.trim()`; stage values accept it. A whitespace stage silently fails every editorial-default helper.

Surfaced by audit-barrage run `20260530T063131307Z-graphical-entries` (claude). Fix: `z.string().trim().min(1)` on `StageStringSchema`; add regression test.

### AUDIT-20260530-12 — `inferPriorStageFromJournal` silently skips non-editorial `from` values (semantics regression)

Finding-ID: AUDIT-20260530-12 (cross-model: AUDIT-BARRAGE-claude-06-P3)
Status:     fixed-15f7f41
Severity:   low
Surface:    `packages/core/src/doctor/migrate.ts:248-260`

Pre-diff the loop returned `e.from` unconditionally. Now returns only `if (isEditorialStage(e.from))`; non-editorial `from` is silently skipped and the loop walks past it. For editorial-only legacy migration this is a no-op, but `StageTransitionEvent.from` is broadened to `StageStringSchema` — the moment any journal carries non-editorial `from`, the function silently produces a wrong prior-stage.

Surfaced by audit-barrage run `20260530T063131307Z-graphical-entries` (claude). Fix: if migration is genuinely editorial-only, assert/refuse on non-editorial `from` rather than silently skipping; if it must tolerate lane stages, return raw `from`.

### AUDIT-20260530-13 — `bootstrapDefaultLaneIfMissing` can leave a lane file without its migration journal event (partial-success)

Finding-ID: AUDIT-20260530-13 (cross-model: AUDIT-BARRAGE-codex-03-P3)
Status:     fixed-908eb49
Severity:   medium
Surface:    `packages/core/src/lanes/bootstrap.ts:102-123`

Writes `default.json` BEFORE appending the `lane-migration` journal event. If journal append fails after the write, the project is left with a lane but no migration audit record. Next invocation returns `already-exists` and never repairs the missing event.

Surfaced by audit-barrage run `20260530T063131307Z-graphical-entries` (codex). Fix: compensating operation — if journal append fails, remove the just-created lane file; OR record enough state to retry the missing event.

### AUDIT-20260530-14 — multi-lane calendar renderer silently drops entries whose `currentStage` isn't in their lane's template (re-introduces #247)

Finding-ID: AUDIT-20260530-14 (cross-model: AUDIT-BARRAGE-claude-01-P4 + AUDIT-BARRAGE-codex-02-P4)
Status:     fixed-f345069
Severity:   high
Surface:    `packages/core/src/calendar/render.ts:86-98`, `:179-201`; test coverage at `packages/core/test/calendar/regenerate-multilane.test.ts`

#247's stated fix was "stop silently dropping entries whose stage the renderer doesn't know about." Multi-lane path reintroduces it: `bucketize` only creates buckets for `templateStageOrder(template)`; entries whose `currentStage` is not in `byStage` are never pushed. Two vectors: (a) entry bound to valid lane carrying out-of-template `currentStage` vanishes from its lane section; (b) orphan entry (lane undefined OR lane id deleted) renders through `EDITORIAL_FALLBACK`, so a deleted-visual-lane entry at `Sketched`/`Iterating` has no matching editorial-fallback bucket and disappears from "(unassigned)" too.

Same shape as just-fixed AUDIT-37 composed-view drop, but on the CANONICAL calendar surface — the doctor's SSOT. Bigger blast radius. Regression tests assert only entries in known stages appear.

Surfaced by audit-barrage run `20260530T063443880Z-graphical-entries` (claude + codex cross-model agreement). Fix: collect any entry whose `currentStage` produced no bucket into an explicit `## (unrecognized stage)` tail per lane (or unassigned block). Add regression test seeding an entry with stage outside its lane template.

### AUDIT-20260530-15 — corrupt sidecars silently skipped during lane migration (no-silent-fallback violation)

Finding-ID: AUDIT-20260530-15 (cross-model: AUDIT-BARRAGE-claude-02-P4 + AUDIT-BARRAGE-codex-03-P4)
Status:     fixed-bf2fb98
Severity:   medium
Surface:    `packages/core/src/doctor/lane-migration.ts:145-158`

`migrateLaneMembership` walks every `*.json`; `readFile`/`JSON.parse`/`EntrySchema.safeParse` failures are all swallowed via `catch { continue }`. The sidecar is not counted in `examined`, not migrated, no diagnostic. Same root cause AUDIT-39 flagged in `entry-review/data.ts` — surfacing in a new file.

Surfaced by audit-barrage run `20260530T063443880Z-graphical-entries` (claude + codex cross-model agreement). Fix: distinguish ENOENT from parse/validation/IO failures; count every `.json` examined; surface skipped-corrupt sidecars in `LaneMigrationResult` (e.g. `skippedCorrupt: string[]`) OR throw with the offending path. Migration test suite has no corrupt-sidecar case.

### AUDIT-20260530-16 — `iterateEntry` now refuses editorial `Final` stage (untested behavior change)

Finding-ID: AUDIT-20260530-16 (cross-model: AUDIT-BARRAGE-claude-03-P4)
Status:     fixed-fe21786
Severity:   medium
Surface:    `packages/core/src/iterate/iterate.ts:99-106`, `packages/core/test/iterate/iterate.test.ts:141`

Resolution: outcome A (lock the new semantic). DESKWORK-STATE-MACHINE.md is explicit that iterate is NOT available in Final ("Final locks the content; to iterate, induct backward to Drafting first" — verb iterate § "When it can be invoked"; reinforced in the stage table for Final: "Content is locked — ready to publish, no further edits or iterations allowed in this stage" + Commandment I's stage-gate example). The Phase-4 `isLockedStageInTemplate` gate is the spec-conformant implementation; the pre-Phase-4 hardcoded Published-only gate was the bug. Regression test added at `packages/core/test/iterate/iterate.test.ts` :: "refuses to iterate an editorial Final entry (locked-stage gate, DESKWORK-STATE-MACHINE.md Commandment II)" asserts iterate throws naming the locked stage + pipeline + induct recovery path AND verifies the iteration counter does not advance. Existing docstring at iterate.ts:70-79 already documents the locked-stage behavior — no code or docstring change needed; the test pins the contract.

Pre-Phase-4 `iterateEntry` refused only `Published`/`Blocked`/`Cancelled` — `Final` was iterable. Refactor adds `isLockedStageInTemplate`, editorial's `lockedStages = ['Final']`, so iterate-on-`Final` now throws. Semantic change to editorial workflow; operators who pinned new revisions while at `Final` must `induct` back to `Drafting` first. May be intended state-machine semantics but shipped untested + un-changelogged.

Surfaced by audit-barrage run `20260530T063443880Z-graphical-entries` (claude). Fix: confirm Final-refuses-iterate intent against DESKWORK-STATE-MACHINE.md; add editorial regression test asserting refusal.

### AUDIT-20260530-17 — `regenerateCalendar` couples per-entry transitions to validity of unrelated lane files

Finding-ID: AUDIT-20260530-17 (cross-model: AUDIT-BARRAGE-claude-04-P4)
Status:     fixed-165e7a7
Severity:   medium
Surface:    `packages/core/src/calendar/render.ts:111-121` (`loadLaneContexts`)

`loadLaneContexts` calls `loadLaneConfig` + `loadPipelineTemplate` per lane with no error handling. Any throw propagates out of `renderCalendar` → `regenerateCalendar`. Every verb calls `regenerateCalendar` as final step AFTER `writeSidecar` + `appendJournalEvent`. A single malformed lane file breaks all six verbs for every entry — AFTER the sidecar mutation has already landed.

Pre-Phase-4 `renderCalendar` was pure over the entry list. Lane-config read multiplies blast radius from "this entry" to "the whole project, on any verb."

Surfaced by audit-barrage run `20260530T063443880Z-graphical-entries` (claude). Fix: make `regenerateCalendar`'s failure non-fatal to the transition (calendar reconciled by `doctor --fix`, the documented recovery path); OR validate lane configs once up-front. At minimum the partial-state window should be tested.

### AUDIT-20260530-18 — `deriveArtifactKindFromPath` writes wrong `artifactKind` for multi-file HTML mockups

Finding-ID: AUDIT-20260530-18 (cross-model: AUDIT-BARRAGE-claude-05-P4)
Status:     fixed-edb8122
Severity:   medium
Surface:    `packages/core/src/doctor/lane-migration.ts:deriveArtifactKindFromPath`; test acknowledgement at `packages/core/test/doctor/lane-migration.test.ts:131-138`

Migration derives `artifactKind` purely from path extension: any `.html` → `'single-file-html'`. But authoritative `detectArtifactKind` probes the filesystem and would classify a directory of HTML as `html-mockup`. For a multi-file HTML mockup whose `artifactPath` ends in `index.html`, migration writes `'single-file-html'` — contradicting the authoritative classifier. Migration is idempotent so the wrong value is permanent.

Visual/`mockups` lane (the headline graphical-entries use case) is exactly where multi-file HTML mockups live.

Surfaced by audit-barrage run `20260530T063443880Z-graphical-entries` (claude). Fix: have migration call `detectArtifactKind` (already filesystem-touching code); OR only back-fill kinds the path heuristic can classify unambiguously (`.md`, image extensions).

### AUDIT-20260530-19 — `EDITORIAL_FALLBACK` duplicates `editorial.json` with manual "keep in sync" + Phase-8 deferral

Finding-ID: AUDIT-20260530-19 (cross-model: AUDIT-BARRAGE-claude-06-P4)
Status:     fixed-00fb2bc
Severity:   low
Surface:    `packages/core/src/calendar/render.ts:130-145`

Hardcodes editorial's `linearStages` / `lockedStages` / `offPipelineStages` inline, duplicating `packages/core/src/pipelines/editorial.json`. Code documents the hazard. Defers cleanup to "Phase 8 … this constant can be deleted" with NO issue link.

Surfaced by audit-barrage run `20260530T063443880Z-graphical-entries` (claude). Fix: load editorial preset from the bundled package resource rather than duplicating; at minimum file the Phase-8 deletion as a GitHub issue.

### AUDIT-20260530-20 — `induct` CLI still editorial-narrow (Phase 4 "verbs are universal" goal half-wired at CLI; deferral phrase in comment)

Finding-ID: AUDIT-20260530-20 (cross-model: AUDIT-BARRAGE-claude-07-P4 + AUDIT-BARRAGE-codex-01-P4)
Status:     fixed-e85bb8e
Severity:   high
Surface:    `packages/cli/src/commands/induct.ts:84-95,114`

Core `inductEntry` is template-aware, but CLI keeps editorial-only `isLinearPipelineTarget(flags.to)` guard and hardcoded error text. A visual-lane operator running `deskwork induct icon-set --to Sketched` is rejected before the request reaches the template-aware core helper. CLI comment explicitly defers ("until a lane-aware CLI lands") with no issue link — violates "Just for now is bullshit" rule.

Surfaced by audit-barrage run `20260530T063443880Z-graphical-entries` (claude + codex cross-model agreement). Fix: read sidecar in CLI, resolve template, validate `--to` against `template.linearStages`; replace deferral comment with reference to tracked issue OR widen the guard now.

### AUDIT-20260530-21 — `renderCalendar` docstring drift: promises `## Lane:` but emits `# Lane:` (h1)

Finding-ID: AUDIT-20260530-21 (cross-model: AUDIT-BARRAGE-claude-08-P4)
Status:     fixed-66f2854
Severity:   low
Surface:    `packages/core/src/calendar/render.ts:157-159` (docstring) vs `:194` and `:199` (emit)

Docstring says h2 lane headers; code writes h1. Multi-lane test asserts h1 — code consistent with test, only docstring wrong. Heading level meaningful: output opens with `# Editorial Calendar` (h1), so per-lane blocks at h1 are sibling top-level rather than nested.

Surfaced by audit-barrage run `20260530T063443880Z-graphical-entries` (claude). Fix: decide intentionally (h1 vs h2); fix docstring; verify doctor's section-agnostic UUID scan is the only consumer.

### AUDIT-20260530-22 — partial cascade failure leaves `calendar.md` persistently stale (7.2.7 single-regen regression)

Finding-ID: AUDIT-20260530-22 (cross-model: AUDIT-BARRAGE-claude-01-P7small)
Status:     fixed-8296171
Severity:   medium
Surface:    `packages/core/src/entry/cancel.ts` (public `cancelEntry` wrapper)

The wrapper's `await regenerateCalendar(projectRoot)` runs ONLY if the walker returns normally. If the walker throws partway through a cascade (member with missing/corrupt sidecar), the group + every member processed before the failure are already `Cancelled` on disk but `calendar.md` is never regenerated. PERSISTENT divergence, not the transient window AUDIT-25 dispositioned as informational.

Behavior regression vs pre-7.2.7: each invocation regenerated immediately, so mid-cascade throws left calendar consistent with completed work. The N+1→1 optimization traded for a wider, now-persistent inconsistency on the failure path. The four regenerate-count tests exercise only the happy path.

Surfaced by audit-barrage run `20260530T064014571Z-graphical-entries` (claude). Fix: `try { result = await cancelEntryWithoutCalendarRegen(...) } finally { await regenerateCalendar(projectRoot) }`. Add test seeding a missing/corrupt member that drives the throw and asserts calendar reconciles.

### AUDIT-20260530-23 — cascade catch swallows write/journal failures as "skipped member" (can hide state corruption)

Finding-ID: AUDIT-20260530-23 (cross-model: AUDIT-BARRAGE-codex-01-P7small)
Status:     fixed-5264770
Severity:   medium
Surface:    `packages/core/src/entry/cancel.ts:209-279`

Cascade loop wraps member lookup + template resolution + recursive walker call in ONE broad `try/catch`. Failures from the recursive transition path become a skipped member with `slug: '(unresolved)'` and `reason: 'read failed: ...'`, even when the failure was not a read failure. If journal append fails after sidecar write, the result claims the member was skipped while its sidecar is already `Cancelled` with no durable `stage-transition` event.

Surfaced by audit-barrage run `20260530T064014571Z-graphical-entries` (codex). Fix: narrow the recoverable catch to the specific missing-member/read case; let template/config/write/journal errors propagate. If distinct recoverable cases beyond missing-sidecar are wanted, classify them explicitly.

### AUDIT-20260530-24 — indentation regression on `CancelOptions.cascade` (3-space indent slipped through)

Finding-ID: AUDIT-20260530-24 (cross-model: AUDIT-BARRAGE-claude-02-P7small)
Status:     fixed-f283f9b
Severity:   low
Surface:    `packages/core/src/entry/cancel.ts` — `interface CancelOptions { ... }`

Pure-whitespace change with no functional purpose: `readonly cascade?: boolean;` indented with 3 spaces instead of the surrounding 2-space indentation. Signals formatting is not enforced on this file's edit path.

Surfaced by audit-barrage run `20260530T064014571Z-graphical-entries` (claude). Fix: restore 2-space indentation; consider format-on-commit enforcement.

<!-- ===========================================================
     Audit-barrage sweep — 2026-05-30 — 7 retroactive barrages
     ===========================================================
     P5 (3 sub-runs), P6 (3 sub-runs), P7 T7.2 (1 run).
     70 raw findings lifted (consolidation deferred — each model
     finding gets its own AUDIT entry; cross-model agreement is
     noted in Finding-ID where detectable from titles/surfaces.
     Run dirs:
       20260530T114826429Z-graphical-entries (P5-1)
       20260530T115127432Z-graphical-entries (P5-2)
       20260530T115517132Z-graphical-entries (P5-3)
       20260530T115914439Z-graphical-entries (P6-1)
       20260530T120247811Z-graphical-entries (P6-2)
       20260530T120643794Z-graphical-entries (P6-3)
       20260530T121000611Z-graphical-entries (P7T7.2)
     -->

### AUDIT-20260530-25 — [P5-1 claude] Lane-bucket `unbucketed` entries are silently dropped from the rendered dashboard while inflating every entry count

Finding-ID: AUDIT-20260530-25 (cross-model: AUDIT-BARRAGE-claude-P5-1)
Status:     fixed-fc192e9
Severity:   high
Surface:    `packages/studio/src/pages/dashboard/swimlane-card.ts` (`renderSwimlane`, the stage-column assembly ~lines after "const stagesRaw"), `packages/studio/src/pages/dashboard/lane-data.ts` (`LaneBucket.unbucketed` + `loadLaneBuckets` entryCount math)

`loadLaneBuckets` captures entries whose `currentStage` is not in the lane's resolved template into `bucket.unbucketed`, and folds them into `entryCount`: `let total = unbucketed.length; for (const stageBucket of builder.byStage.values()) total += stageBucket.length; finalByLane.set(id, freezeBucket(builder, unbucketed, total))`. But `renderSwimlane` only renders columns for `template.linearStages` + `template.offPipelineStages` — it never reads `bucket.unbucketed`. The list-body (`swimlane-list-body.ts:renderListBody`) walks the same template stages and likewise never renders unbucketed entries. The result: an entry sitting in a valid-but-out-of-template stage (reachable since Phase 3 widened `currentStage` to an arbitrary non-empty string — stale stage, typo, mid-migration drift) **vanishes from the dashboard entirely**, while the swim-head meta (`${bucket.entryCount} entries`), the focus chip count, the rail row count, and the swim-compact strip all show the inflated total. The operator reads "5 entries" but sees 4 cards, with no visible indicator of the discrepancy.

This is the same failure shape the prior audit log calls out as a regression of #247 / AUDIT-20260530-14 ("renderer silently drops entries whose currentStage isn't in their lane's template"), now on the canonical studio dashboard surface. The `lane-data.ts` docstring actively misdescribes the behavior: *"the dashboard surfaces it instead of crashing — the operator sees the count and can run doctor."* The count is surfaced but the entries are not, and there is no "unbucketed" / "unrecognized stage" affordance anywhere in the render. Contrast with `unroutedEntries`, which at least gets a `${n} unrouted · ` token in `swimlane-shell.ts:metaRaw` — unbucketed gets nothing. The integration test (`dashboard-swimlane.test.ts`) only seeds entries in valid stages, so it cannot catch this. Fix: render `bucket.unbucketed` into an explicit `(unrecognized stage)` tail section per swim (mirroring the unrouted treatment), or — at minimum — surface the per-lane unbucketed count distinctly so the count never silently exceeds the visible cards.

Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T114826429Z-graphical-entries/claude.md`.

### AUDIT-20260530-26 — [P5-1 claude] No clear-on-version-bump for swimlane localStorage state — schema drift silently persists stale per-operator state

Finding-ID: AUDIT-20260530-26 (cross-model: AUDIT-BARRAGE-claude-P5-1)
Status:     fixed-ec51035
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts` (`STORAGE_KEY_PREFIX`, `resolveProjectKey`, `readStoredObjectMap`) and the four key suffixes in `swimlane.ts` / `swimlane-collapse.ts` / `swimlane-view-toggle.ts`

The audit scope explicitly names "client-state persistence + restore (localStorage corruption resilience; clear-on-version-bump)" as a focus. Corruption resilience is handled well — every reader (`readStoredObjectMap`, `readStoredSet`, `readStoredLanes`, `readStoredStages`) wraps `JSON.parse` in try/catch and validates the parsed shape, degrading to an empty collection on any failure. But there is **no version segment in the storage keys and no clear-on-version-bump mechanism**. Keys are `deskwork:dashboard:<projectKey>:<suffix>` with no schema-version component anywhere in `swimlane-storage.ts`.

This matters because the corruption guards only protect against *shape* changes (an array becoming an object, an unknown value type). They do not protect against *semantic* drift within a stable shape — e.g., if a future release changes how `view-mode` values map, or repurposes the `stage-collapse` `Record<laneId, string[]>`, the old data parses cleanly and is silently honored, restoring stale or wrong state for every returning operator. Since this is per-operator browser state that survives plugin upgrades indefinitely, there is no natural eviction. The fix is a version token in the key prefix (e.g. `deskwork:dashboard:v1:<projectKey>:<suffix>`) bumped whenever a value's semantics change, so an upgrade starts from clean defaults rather than reinterpreting prior-version state. The absence is auditable here precisely because the operator listed it as expected.

Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T114826429Z-graphical-entries/claude.md`.

### AUDIT-20260530-27 — [P5-1 claude] Rail eye-toggle `.r-eye-btn` is a 14px-wide interactive target with no min-height — below WCAG 2.5.8 while every sibling affordance was sized to 24×24

Finding-ID: AUDIT-20260530-27 (cross-model: AUDIT-BARRAGE-claude-P5-1)
Status:     fixed-94d7213
Severity:   low
Surface:    `plugins/deskwork-studio/public/css/dashboard-swimlane.css` (`.rail-lane .r-eye-btn` rule: `width: 14px; ... padding: 0;`)

The diff is otherwise meticulous about WCAG 2.2 SC 2.5.8 target-size minimums — `.collapse-chev` is `min-width: 24px; min-height: 24px`, `.view-toggle .vt-cell` is `min-height: 24px`, `.swim-compose` is `min-height: 26px` (30px mobile), `.lb-overflow` is `min-width: 24px; min-height: 24px`. But the rail visibility toggle, promoted in the F6 a11y fix from a `<span>` to a real focusable `<button class="r-eye-btn">`, is styled `width: 14px; ... padding: 0;` with no min-height — well under the 24×24 floor. It is a distinct interactive control (its own click handler in `swimlane.ts:bindRailEyeToggles`, with `stopPropagation` so it does not share the row's focus-toggle gesture), so it is independently subject to the target-size rule.

The WCAG 2.5.8 spacing exception (a 24px-diameter undisturbed circle around the target) is the only thing that might save it, and that depends on the eye glyph being far enough from the row's other clickable region — but the whole `.rail-lane` row is itself `role="button"` and clickable, so the eye button sits *inside* another target rather than in clear space, which the spacing exception does not cover. Given the F6 fix deliberately made this a real button for keyboard/AT access, sizing it to 24×24 (min-width/min-height + centered glyph, matching the `.collapse-chev` pattern already in the same file) finishes the job. Low severity because it is reachable and operable, just below the measured-target threshold the rest of the feature honors.

Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T114826429Z-graphical-entries/claude.md`.

### AUDIT-20260530-28 — [P5-1 codex] Compose chip copies an invalid command for stage names with spaces

Finding-ID: AUDIT-20260530-28 (cross-model: AUDIT-BARRAGE-codex-P5-1)
Status:     fixed-19cf21d
Severity:   medium
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts:90-98; packages/studio/src/pages/dashboard/swimlane-card.ts:297-307

The copied command is assembled as `/deskwork:add <SLUG> --lane ${laneId} --stage ${firstStage}` with no argument quoting or escaping. That works for the current preset first stages (`Ideas`, `Sketched`, `Drafted`, etc.), but pipeline templates allow arbitrary non-empty stage strings, including names with spaces. A custom lane whose first stage is `QA Review` would copy `/deskwork:add <SLUG> --lane qa --stage QA Review`, which a normal argv parser reads as stage `QA` plus an extra `Review` token.

The server puts the raw first stage in `data-first-stage` at `swimlane-card.ts:303-307`, and the client serializes that value directly at `swimlane-compose.ts:90-98`. Fix by using the same command-argument quoting convention the slash-command parser expects, and add a regression with a custom template whose first linear stage contains whitespace and shell-sensitive characters.

Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T114826429Z-graphical-entries/codex.md`.

### AUDIT-20260530-29 — [P5-1 codex] Dashboard localStorage has no schema/version segment despite version-bump reset being in scope

Finding-ID: AUDIT-20260530-29 (cross-model: AUDIT-BARRAGE-codex-P5-1)
Status:     fixed-ec51035 (duplicate of AUDIT-20260530-26; closed by the same commit)
Severity:   medium
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts:21-27; plugins/deskwork-studio/public/src/dashboard/swimlane.ts:64-69; plugins/deskwork-studio/public/src/dashboard/swimlane-collapse.ts:60-65; plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle.ts:68-70

The audit scope explicitly calls out “clear-on-version-bump,” but all persisted dashboard keys are stable forever under `deskwork:dashboard:<projectKey>:<suffix>`. The readers tolerate malformed JSON, but they do not distinguish old valid shapes from current valid shapes. If the meaning of `:focus`, `:visibility`, `:lane-collapse`, `:stage-collapse`, or `:view-mode` changes, old operator state continues to apply silently.

This is most visible in `STORAGE_KEY_PREFIX = 'deskwork:dashboard:'`; every controller appends only project key and suffix. A reasonable fix is to add a storage schema version to the prefix or store a version sentinel and clear the known swimlane keys when it mismatches. Tests should seed an older-version key and assert the controller ignores or removes it while preserving current-version state.

Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T114826429Z-graphical-entries/codex.md`.

### AUDIT-20260530-30 — [P5-1 codex] Re-running swimlane initializers stacks duplicate event listeners with stale state closures

Finding-ID: AUDIT-20260530-30 (cross-model: AUDIT-BARRAGE-codex-P5-1)
Status:     fixed-7b6543e
Severity:   low
Surface:    plugins/deskwork-studio/public/src/editorial-studio-client.ts:527-530; plugins/deskwork-studio/public/src/dashboard/swimlane.ts:469-490; plugins/deskwork-studio/public/src/dashboard/swimlane-collapse.ts:464-477; plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle.ts:292-312; plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts:270-282

`init()` calls four swimlane controllers, and each controller unconditionally binds listeners to existing DOM nodes. `initSwimlane` also replaces `activeState` at lines 480-481, while previously bound handlers still close over their older `state` object. The same shape exists in collapse, view-toggle, and compose: re-invocation binds again without a module guard or per-element sentinel.

Current page boot may call these once, but the code already introduces `reapply*FromStorage` paths and singleton state for client-side refresh-style operations. If a partial DOM re-init calls any initializer twice, clicks can fire multiple handlers and mutate different closure-captured state objects. Fix with per-controller idempotence: a module-level wired guard for whole-page singletons, or `dataset` sentinels per bound element when dynamic DOM replacement is expected.

Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T114826429Z-graphical-entries/codex.md`.

### AUDIT-20260530-31 — [P5-1 gemini] The stage ID slugification logic in `renderStageCol` (and implicitly in `renderListGroup` through shared stage name derivation) still uses `stage.toLowerCase().replace(/[^a-z0-9-]+/g, '-')`. This can lead to DOM ID collisions when a single lane has distinct stage names that slugify to the same value (e.g., `QA Review` and `QA_Review` both become `qa-review`). This issue is explicitly flagged as AUDIT-20260528-07 in the provided `audit-log.md` and remains unfixed in this diff. The proposed fix in AUDIT-20260528-07 is to use `stageNameToFilesystemToken(stage)` or a dedicated DOM-token helper, neither of which is implemented or used in `swimlane-card.ts`.

Finding-ID: AUDIT-20260530-31 (cross-model: AUDIT-BARRAGE-gemini-P5-1)
Status:     fixed-fdf9621
Severity:   medium
Surface:    `packages/studio/src/pages/dashboard/swimlane-card.ts:127`

The stage ID slugification logic in `renderStageCol` (and implicitly in `renderListGroup` through shared stage name derivation) still uses `stage.toLowerCase().replace(/[^a-z0-9-]+/g, '-')`. This can lead to DOM ID collisions when a single lane has distinct stage names that slugify to the same value (e.g., `QA Review` and `QA_Review` both become `qa-review`). This issue is explicitly flagged as AUDIT-20260528-07 in the provided `audit-log.md` and remains unfixed in this diff. The proposed fix in AUDIT-20260528-07 is to use `stageNameToFilesystemToken(stage)` or a dedicated DOM-token helper, neither of which is implemented or used in `swimlane-card.ts`.

Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (gemini). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T114826429Z-graphical-entries/gemini.md`.

### AUDIT-20260530-32 — [P5-1 gemini] The list-view overflow affordance (`.lb-overflow`) is rendered as a `<span>` with `role="button"` and `tabindex="0"` inside an `<a>` element (`.lb-row`). This makes it a focusable and semantically interactive control. However, the accompanying comment explicitly states, "Task 5.1C / 5.2 wires a click handler to the affordance; the markup ships with `role="button"` + `tabindex="0"` + `aria-label` so the semantics are correct at the affordance level even when no handler is bound." This creates an operator-discipline trap (per the prompt's definition): a user can focus and attempt to activate this "button," but it will be inert until a future task implements its behavior. Interactive elements should not be focusable if they perform no action, as this leads to a confusing and frustrating user experience. This issue is explicitly flagged as AUDIT-20260528-08 in `audit-log.md` and remains unfixed.

Finding-ID: AUDIT-20260530-32 (cross-model: AUDIT-BARRAGE-gemini-P5-1)
Status:     fixed-e309f00 (duplicate of AUDIT-20260528-08; closed by the same commit)
Severity:   medium
Surface:    `packages/studio/src/pages/dashboard/swimlane-list-body.ts:109`

The list-view overflow affordance (`.lb-overflow`) is rendered as a `<span>` with `role="button"` and `tabindex="0"` inside an `<a>` element (`.lb-row`). This makes it a focusable and semantically interactive control. However, the accompanying comment explicitly states, "Task 5.1C / 5.2 wires a click handler to the affordance; the markup ships with `role="button"` + `tabindex="0"` + `aria-label` so the semantics are correct at the affordance level even when no handler is bound." This creates an operator-discipline trap (per the prompt's definition): a user can focus and attempt to activate this "button," but it will be inert until a future task implements its behavior. Interactive elements should not be focusable if they perform no action, as this leads to a confusing and frustrating user experience. This issue is explicitly flagged as AUDIT-20260528-08 in `audit-log.md` and remains unfixed.

Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (gemini). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T114826429Z-graphical-entries/gemini.md`.

### AUDIT-20260530-33 — [P5-1 gemini] The logic for the "All" focus chip in `bindFocusChips` contains an unconditional `state.focused.clear()` before conditionally re-populating `state.focused`. This means that if all visible lanes are already focused (`isAlreadyAll` is true), clicking the "All" chip will still clear the `state.focused` set and leave no lanes focused. This directly contradicts the expected behavior in AUDIT-20260528-09, which states, "Expected: clicking `All` restores or keeps every visibility-on lane focused. Actual: when every visible lane is already focused, clicking `All` leaves the focus set empty." The suggested fix was to make "All" idempotently select all visible lanes, which the current implementation does not achieve.

Finding-ID: AUDIT-20260530-33 (cross-model: AUDIT-BARRAGE-gemini-P5-1)
Status:     fixed-9eff7af (duplicate of AUDIT-20260528-09; closed by the same commit)
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane.ts:251-254`

The logic for the "All" focus chip in `bindFocusChips` contains an unconditional `state.focused.clear()` before conditionally re-populating `state.focused`. This means that if all visible lanes are already focused (`isAlreadyAll` is true), clicking the "All" chip will still clear the `state.focused` set and leave no lanes focused. This directly contradicts the expected behavior in AUDIT-20260528-09, which states, "Expected: clicking `All` restores or keeps every visibility-on lane focused. Actual: when every visible lane is already focused, clicking `All` leaves the focus set empty." The suggested fix was to make "All" idempotently select all visible lanes, which the current implementation does not achieve.

Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (gemini). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T114826429Z-graphical-entries/gemini.md`.

### AUDIT-20260530-34 — [P5-1 gemini] The mobile dashboard lane-stack/lane-head variant, specified in `docs/studio-design/ACCEPTED/2026-05-27-multi-lane-dashboard-d3-press-bay/brief.md:14` as a "vertical lane-stack of accordion sections on mobile," appears to be incompletely implemented. While `workplan.md` marks Step 5.1B.4 as completed and the CSS (`dashboard-swimlane.css`) includes media queries for mobile, the implementation primarily adapts the desktop swim markup using CSS (`flex-direction: column` for `.stage-grid`). The audit finding AUDIT-20260528-10 points out this discrepancy, stating "mobile gets desktop swim markup adapted by CSS while the 5.1B workplan text marks the lane-head mobile variant as shipped." The "accordion sections" and a distinct "lane-head" renderer path for mobile seem absent, suggesting a gap between the accepted design and the delivered implementation.

Finding-ID: AUDIT-20260530-34 (cross-model: AUDIT-BARRAGE-gemini-P5-1)
Status:     fixed-e228e26 (duplicate of AUDIT-20260528-10; closed by the same commit)
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:231` (and related mobile rendering)

The mobile dashboard lane-stack/lane-head variant, specified in `docs/studio-design/ACCEPTED/2026-05-27-multi-lane-dashboard-d3-press-bay/brief.md:14` as a "vertical lane-stack of accordion sections on mobile," appears to be incompletely implemented. While `workplan.md` marks Step 5.1B.4 as completed and the CSS (`dashboard-swimlane.css`) includes media queries for mobile, the implementation primarily adapts the desktop swim markup using CSS (`flex-direction: column` for `.stage-grid`). The audit finding AUDIT-20260528-10 points out this discrepancy, stating "mobile gets desktop swim markup adapted by CSS while the 5.1B workplan text marks the lane-head mobile variant as shipped." The "accordion sections" and a distinct "lane-head" renderer path for mobile seem absent, suggesting a gap between the accepted design and the delivered implementation.

Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (gemini). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T114826429Z-graphical-entries/gemini.md`.

### AUDIT-20260530-35 — [P5-1 gemini] The `tooling-feedback.md` explicitly lists TF-008, TF-009, and TF-010 as `Open` issues related to the scope-discovery tooling. While these are not directly bugs in the feature under audit, they represent acknowledged friction points with the development tooling. The resolution paths for TF-008 and TF-009 are documented as updates to `GRAMMAR_INSTRUCTION` (documentation-only fixes), and TF-010 is an upstream stub (#318). It's important for the operator to note that these tooling-related issues persist and might affect agent performance or developer experience, even if they don't block the feature's functional correctness.

Finding-ID: AUDIT-20260530-35 (cross-model: AUDIT-BARRAGE-gemini-P5-1)
Status:     acknowledged-informational-tooling-status (TF entries tracked separately in tooling-feedback.md; not a feature bug)
Severity:   low
Surface:    `docs/1.0/001-IN-PROGRESS/graphical-entries/tooling-feedback.md`

The `tooling-feedback.md` explicitly lists TF-008, TF-009, and TF-010 as `Open` issues related to the scope-discovery tooling. While these are not directly bugs in the feature under audit, they represent acknowledged friction points with the development tooling. The resolution paths for TF-008 and TF-009 are documented as updates to `GRAMMAR_INSTRUCTION` (documentation-only fixes), and TF-010 is an upstream stub (#318). It's important for the operator to note that these tooling-related issues persist and might affect agent performance or developer experience, even if they don't block the feature's functional correctness.

Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (gemini). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T114826429Z-graphical-entries/gemini.md`.

### AUDIT-20260530-36 — [P5-2 claude] Template-aware verb dispatch recomputes `classifyStage` + rebuilds the full verb set 4× per row

Finding-ID: AUDIT-20260530-36 (cross-model: AUDIT-BARRAGE-claude-P5-2)
Status:     fixed-9f17e72
Severity:   low
Surface:    `packages/studio/src/pages/dashboard/affordances.ts:178` (`verbsForStage`), `:370` (`renderMenu`), `:419-475` (`renderRowActions` / `renderRowDrawer` / `renderRowMenu`)

`renderRow` (`section.ts:62-78`) calls `renderRowDrawer`, `renderRowActions`, and `renderRowMenu` for every entry. Each of those calls `verbsForStage`, which (a) calls `classifyStage` and (b) constructs the *entire* verb object set (`iterate`, `approve`, `block`, `induct`, `cancel`, `view`, `scrapbook`, `inductForward`) from scratch — even though each caller consumes only one of the three returned views. `renderRowMenu` is worse: it calls `verbsForStage` (one `classifyStage`) and then `renderMenu` (a second `classifyStage` on the same stage+template). Net per row: `classifyStage` runs ~4×, `verbsForStage` rebuilds ~7 verb objects 3×.

This is wasted allocation that scales linearly with entry count (a 100-entry dashboard does ~300 `verbsForStage` invocations) and, more importantly, spreads the categorization decision across two functions that must agree. A reasonable fix: classify once in `renderRow`, thread the `StageCategory` (or the resolved verb set) into the three sub-renderers, and have `renderMenu` accept the already-computed category rather than re-deriving it. Low severity — correctness is unaffected — but it's a duplicated-source-of-truth + redundant-work pattern worth collapsing before more renderers consume the verb set.

Surfaced by audit-barrage run `20260530T115127432Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115127432Z-graphical-entries/claude.md`.

### AUDIT-20260530-37 — [P5-2 claude] `classifyStage` throw converts a single out-of-template entry into a whole-dashboard 500

Finding-ID: AUDIT-20260530-37 (cross-model: AUDIT-BARRAGE-claude-P5-2)
Status:     fixed-07a3ccd
Severity:   medium
Surface:    `packages/studio/src/pages/dashboard/affordances.ts:99-107` (throw), `packages/studio/src/pages/dashboard/swimlane-card.ts:186-193` (`renderStageCol` body map)

`classifyStage` throws when a stage is absent from both `linearStages` and `offPipelineStages`. That throw now propagates through `renderRow`, which is invoked inside `entries.map((e, i) => renderRow(e, i, template, defaultSite).__raw).join('')` in `renderStageCol`. A throw on any single entry aborts the entire `.map`, the whole `renderSwimlane`, and therefore the whole `/dev/editorial-studio` page render (HTTP 500) — not just the offending row.

Pre-5.2, `renderRowActions`/`renderRowDrawer`/`renderRowMenu` early-returned `unsafe('')` for non-editorial stages (the `isLegacyEditorialStage` guard), so an unknown stage produced an empty-chrome row, never a crash. The new dispatch removes that guard and replaces "render nothing" with "throw." Whether an out-of-template `currentStage` can actually reach `renderStageCol` depends on `loadLaneBuckets`/`bucketize` (not in this diff) filtering entries to template stages — but this is exactly the AUDIT-20260530-14 shape (entries carrying a `currentStage` not in their lane's template) on the dashboard surface. If that data-layer filtering is the only thing standing between a stale sidecar and a 500, the coupling is fragile. The no-fallback rule wants a loud failure, but a loud *per-entry* failure (skip the row, surface a diagnostic) is preferable to taking down the operator's entire dashboard. Recommend catching at the `renderStageCol` map boundary and rendering an explicit "unrecognized stage" row, mirroring the calendar renderer's `(unrecognized stage)` tail from AUDIT-14's fix. There is no test seeding an entry whose stage is outside its lane template to pin this path.

Surfaced by audit-barrage run `20260530T115127432Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115127432Z-graphical-entries/claude.md`.

### AUDIT-20260530-38 — [P5-2 claude] Mobile lane-sheet focus-trap contract is unverified — no test asserts Tab is contained

Finding-ID: AUDIT-20260530-38 (cross-model: AUDIT-BARRAGE-claude-P5-2)
Status:     fixed-1a25b84
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-mobile-sheet.ts:60-90`, `packages/studio/test/dashboard-swimlane-mobile-sheet-client.test.ts:1-30` (coverage docblock)

The audit scope explicitly names "mobile-sheet a11y (focus trap, scrim, dismiss)." The controller implements scrim (backdrop), three dismiss paths (trigger/backdrop/Escape), focus-into-sheet on open (`focusFirstSheetTarget`), and focus-return-to-trigger on close. It does **not** implement an explicit focus trap, and delegates open/close mechanics to `createSlideUpSheet` (`../mobile-shell/sheet-controller.ts`, not in this diff). The new test suite's own coverage list enumerates open/close/escape/backdrop/row-activation/eye-button/focus-return — but there is no assertion that Tab/Shift+Tab is contained within the sheet while it is open.

A bottom sheet rendered over a dimmed scrim with a `max-height: 70vh` panel is the canonical case where Tab can silently walk focus into the page content behind the scrim — a WCAG 2.4.3 (Focus Order) / 2.1.2 (No Keyboard Trap, inverse) concern. Either the shared `createSlideUpSheet` traps focus (in which case this diff should have a regression test asserting it, since the sheet is a new consumer) or it does not (in which case the sheet ships without the trap the audit scope requires). As-is, the contract is unverified for a surface the audit flags by name. Add a test that opens the sheet, Tabs from the last focusable element, and asserts focus wraps to the first sheet element rather than escaping to `document.body` / background rows — and if the shared controller doesn't trap, add the trap.

Surfaced by audit-barrage run `20260530T115127432Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115127432Z-graphical-entries/claude.md`.

### AUDIT-20260530-39 — [P5-2 claude] `EDITORIAL_STAGE_EMPTY_HINTS` hardcodes editorial pipeline knowledge in the studio — sibling of AUDIT-20260530-19

Finding-ID: AUDIT-20260530-39 (cross-model: AUDIT-BARRAGE-claude-P5-2)
Status:     fixed-c6810a0
Severity:   low
Surface:    `packages/studio/src/pages/dashboard/swimlane-card.ts:84-115` (`EDITORIAL_STAGE_EMPTY_HINTS` + `stageEmptyHint`)

The empty-state copy map gates on `templateId === 'editorial'` and hardcodes the eight editorial stage names (`Ideas`/`Planned`/`Outlining`/`Drafting`/`Final`/`Published`/`Blocked`/`Cancelled`) with bespoke strings, falling through to `Nothing in ${stage.toLowerCase()}.` otherwise. This duplicates the editorial pipeline's stage vocabulary inside the studio layer — the same drift hazard AUDIT-20260530-19 flagged for `EDITORIAL_FALLBACK` duplicating `editorial.json`. If `editorial.json` ever renames or adds a linear stage, this map silently desyncs: the renamed stage gets the generic `Nothing in <stage>.` fallback while the operator (and the `dashboard.test.ts` assertions that pin these verbatim phrasings) expect the editorial copy.

It's low severity because the editorial template is stable and the fallback is benign, but it's a hardcoded coupling between the studio render layer and a core preset that the "collection model is renderer-independent" principle wants to avoid. A cleaner shape would source the per-stage hint from the template definition itself (an optional `emptyHint` per stage in the pipeline JSON) so each template — not just editorial — carries its own empty-state copy without a studio-side special case. At minimum, note the editorial.json ↔ studio-map coupling so a future stage rename touches both.

Surfaced by audit-barrage run `20260530T115127432Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115127432Z-graphical-entries/claude.md`.

### AUDIT-20260530-40 — [P5-2 claude] Mobile sheet open/closed state is tracked redundantly across a body attribute and a container class that must be kept in sync by hand

Finding-ID: AUDIT-20260530-40 (cross-model: AUDIT-BARRAGE-claude-P5-2)
Status:     fixed-316c693
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-mobile-sheet.ts:62-86`, `plugins/deskwork-studio/public/css/dashboard-swimlane.css` (`body[data-lane-sheet-open] .lane-sheet-backdrop` vs `.lane-sheet-container.is-open .lane-rail`)

The sheet's visual state is driven by two independent flags that the CSS keys off separately: the backdrop reveal uses `body[data-lane-sheet-open]` (set by the shared `createSlideUpSheet` controller), while the rail's slide-up uses `.lane-sheet-container.is-open` (set by the local `openSheet`/`onClose`). Keeping them coherent depends on every state transition going through both: `openSheet` adds `.is-open` *and* calls `sheetController.open()`; `onClose` removes `.is-open` when the controller fires its close. If the shared controller ever closes the sheet through a path that doesn't invoke the supplied `onClose` (e.g. an internal auto-dismiss, a future resize handler, or a second `close()` that early-returns before firing callbacks), the body attribute and the container class diverge — backdrop fades but the panel stays slid-up, or vice-versa, with no single source of truth to reconcile them.

This is a fragility/coupling note, not a confirmed bug (the current callbacks keep them in sync), but routing one piece of state through two mechanisms across two files is the kind of seam that breaks silently on the next change. Preferring a single state signal — e.g. drive both CSS rules off `body[data-lane-sheet-open]`, or off the container class, but not split across both — would remove the hand-sync requirement. The new test suite asserts both the class and the body attribute flip together on the happy paths, but does not exercise any controller-internal close that bypasses `onClose`.

Surfaced by audit-barrage run `20260530T115127432Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115127432Z-graphical-entries/claude.md`.

### AUDIT-20260530-41 — [P5-2 codex] Mobile lane sheet opens like a modal but does not trap focus

Finding-ID: AUDIT-20260530-41 (cross-model: AUDIT-BARRAGE-codex-P5-2)
Status:     fixed-1a25b84 (duplicate of AUDIT-20260530-38; closed by the same Task 0.14 commit)
Severity:   high
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-mobile-sheet.ts:54-131; plugins/deskwork-studio/public/src/mobile-shell/sheet-controller.ts:96-123

`initSwimlaneMobileSheet` opens a scrim-backed bottom sheet, moves focus into it, and returns focus to the trigger on close, but it never traps `Tab` / `Shift+Tab` while open. The shared `createSlideUpSheet` controller only toggles the body attribute and handles Escape/scrim/drag close; it also has no focus-trap behavior. Keyboard users can tab out of the open sheet into the page behind the scrim, which violates the stated Task 5.3 audit target for mobile-sheet a11y.

Fix by adding an open-state `keydown` handler for `Tab` that cycles through focusable controls inside `[data-lane-sheet]`, or by extending `createSlideUpSheet` with an opt-in focus-trap contract and enabling it here. Add a jsdom test that opens the lane sheet, presses `Tab` from the last focusable element, and asserts focus wraps inside the sheet.

Surfaced by audit-barrage run `20260530T115127432Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115127432Z-graphical-entries/codex.md`.

### AUDIT-20260530-42 — [P5-2 codex] Unbucketed template-stage entries are counted but never rendered

Finding-ID: AUDIT-20260530-42 (cross-model: AUDIT-BARRAGE-codex-P5-2)
Status:     fixed-fc192e9 (duplicate of AUDIT-20260530-25; closed by the same Task 0.1 commit)
Severity:   high
Surface:    packages/studio/src/pages/dashboard/lane-data.ts:266-273; packages/studio/src/pages/dashboard/swimlane-card.ts:391-422

`bucketIntoLanes` explicitly captures entries whose `currentStage` is not in the lane template into `bucket.unbucketed`, and `entryCount` includes those rows. But `renderSwimlane` only renders `template.linearStages` and `template.offPipelineStages`; it never emits `bucket.unbucketed`. The operator sees the lane count include the entry, but the row itself disappears from the stage grid/list chrome.

This recreates the “unknown stage drops content” shape on the studio dashboard, even though the data layer has already preserved the rows. Fix by rendering an explicit unbucketed/unknown-stage tail column or diagnostic row per lane, with a visible label and the affected entries.

Surfaced by audit-barrage run `20260530T115127432Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115127432Z-graphical-entries/codex.md`.

### AUDIT-20260530-43 — [P5-2 codex] Held Space repeat on compose/empty CTA still allows page scroll

Finding-ID: AUDIT-20260530-43 (cross-model: AUDIT-BARRAGE-codex-P5-2)
Status:     fixed-a37a05f
Severity:   low
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts:250-262

The new Space handler returns early on `ev.repeat` before calling `preventDefault`. That stops repeated clipboard writes, but held Space keydown repeats can still perform the browser’s default scroll behavior while focus remains on the button. The comment says Space activation suppresses page scroll, but the repeat path does not.

Fix by calling `ev.preventDefault()` for every Space keydown before the repeat guard, then returning on repeat before activation.

Surfaced by audit-barrage run `20260530T115127432Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115127432Z-graphical-entries/codex.md`.

### AUDIT-20260530-44 — [P5-3 claude] Save button flashes success even when preset persistence silently fails

Finding-ID: AUDIT-20260530-44 (cross-model: AUDIT-BARRAGE-claude-P5-3)
Status:     fixed-3e9d77b
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-presets.ts:handleSaveClick` (the `savePresetFromCurrent → renderPresetList → flashSaveConfirm` sequence) + `swimlane-presets-store.ts:writePresets` (the swallowed `try/catch`)

`writePresets` swallows every `localStorage.setItem` failure (`catch { /* localStorage unavailable */ }`), and `savePresetFromCurrent` returns the constructed preset unconditionally regardless of whether the write landed. `handleSaveClick` then calls `renderPresetList` (which re-reads storage via `listPresets`) and `flashSaveConfirm(saveBtn)` (which always paints the green "is-flashing" success state). When the write fails — quota exceeded after many presets, or Safari private-mode `setItem` throwing — the operator sees the green success flash but the new row never appears in the list, because `renderPresetList` re-read storage that never received the preset. The two signals contradict each other.

This is the audit's named "localStorage quota" concern made concrete: there is no quota-aware error path and no cap on preset count, so the failure mode is reachable. A reasonable fix: have `savePresetFromCurrent`/`writePresets` return a boolean success, and gate `flashSaveConfirm` + `renderPresetList` on it — surfacing a visible error (e.g. a red flash + message) when the write failed rather than a false success.

Surfaced by audit-barrage run `20260530T115517132Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115517132Z-graphical-entries/claude.md`.

### AUDIT-20260530-45 — [P5-3 claude] Presets are never reconciled when a lane is renamed/archived/purged — asymmetry with the drag-order path

Finding-ID: AUDIT-20260530-45 (cross-model: AUDIT-BARRAGE-claude-P5-3)
Status:     fixed-81fb028
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:applyPreset` + `snapshotCurrentState`; contrast `swimlane-drag.ts:reconcileOrder`

The drag-order controller defends against stale lane ids: `reconcileOrder` (`swimlane-drag.ts`) checks every stored id against the live lane set and collapses to the server order if any stored id is missing. The preset store has no equivalent. `applyPreset` writes `preset.focusedLanes` verbatim into the `:focus` key, including ids for lanes that no longer exist on disk (renamed/archived/purged). `snapshotCurrentState`/`savePresetFromCurrent` likewise persist whatever stale ids are in the focus key. There is no pruning, migration, or validity check anywhere in the preset lifecycle.

This is exactly the audit's "preset migration when lane id changes" concern. The consequence is benign-but-accumulating: presets retain dead lane references indefinitely, and `applyPreset`'s visibility computation (`allLanes.filter(id => !visibleSet.has(id))`) silently drops unknown lanes while focus retains them — producing a focus set referencing nonexistent lanes. A fix should mirror `reconcileOrder`: intersect each preset axis against the live lane set at apply time (and optionally rewrite the stored preset to drop dead ids), so presets self-heal across lane renames the way lane-order already does.

Surfaced by audit-barrage run `20260530T115517132Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115517132Z-graphical-entries/claude.md`.

### AUDIT-20260530-46 — [P5-3 claude] `applyPreset` does not enforce the hidden⇒not-focused invariant the live controllers maintain

Finding-ID: AUDIT-20260530-46 (cross-model: AUDIT-BARRAGE-claude-P5-3)
Status:     fixed-378fb46
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:applyPreset` (visibility write at the `writeJsonOrIgnore(visibilityKey...)` step + focus write at `writeJsonOrIgnore(focusKey..., preset.focusedLanes)`)

`applyPreset` writes `visibleLanes` and `focusedLanes` to storage as two independent verbatim writes. Its own docstring acknowledges the hazard: focus is written last "because the visibility pass … may force-hide a lane that the preset's `focusedLanes` then re-includes." Nothing intersects the two — a preset whose `focusedLanes` contains a lane absent from `visibleLanes` is written through as-is, yielding a stored state where a hidden lane is also focused. In normal interactive operation the swimlane controller keeps these consistent (hiding a lane drops it from focus), so this invalid combination only arises from a hand-edited/migrated/imported preset — but `applyPreset` is precisely the import boundary where the invariant should be re-asserted.

The downstream `reapplyFromStorage` builds state from both keys with no documented intersection, so the invalid combo can paint a lane as both stub-hidden and focus-styled. A fix: at apply time, filter `focusedLanes` to the intersection with the resolved visible set before writing, so the stored state is always internally consistent regardless of preset provenance.

Surfaced by audit-barrage run `20260530T115517132Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115517132Z-graphical-entries/claude.md`.

### AUDIT-20260530-47 — [P5-3 claude] Deep-link `?preset=<id>` only resolves in the originating browser — silent no-op everywhere else

Finding-ID: AUDIT-20260530-47 (cross-model: AUDIT-BARRAGE-claude-P5-3)
Status:     fixed-e0ff622
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:savePresetFromCurrent` (id minting: `const id = \`p${now.getTime().toString(36)}\``) + `swimlane-presets.ts:applyDeepLinkPreset`

The deep-link contract (`/dev/editorial-studio?preset=<id>`, PRD Task 5.5) reads the id from the URL and looks it up in localStorage; on miss it is a silent no-op (`applyDeepLinkPreset`: `if (preset === undefined) return;`). But preset ids are minted from a per-browser local timestamp (`p<getTime base36>`) and presets live only in that browser's localStorage. A URL copied to a collaborator, a different machine, or even an incognito window resolves to nothing, with no message explaining why the deep link did nothing.

"Deep-link URL" in the PRD framing implies shareability; the implementation delivers same-browser cold-load rehydration only. This may be acceptable under THESIS Consequence 2 (collaborators see their own local state), but the gap between the "deep-link" label and the actual scope is worth an explicit operator decision and, at minimum, a visible "preset not found" affordance instead of a silent return so the operator isn't left wondering whether the link is broken.

Surfaced by audit-barrage run `20260530T115517132Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115517132Z-graphical-entries/claude.md`.

### AUDIT-20260530-48 — [P5-3 claude] SSR "no flash-of-empty-content" claim is false for operators who have saved presets

Finding-ID: AUDIT-20260530-48 (cross-model: AUDIT-BARRAGE-claude-P5-3)
Status:     fixed-4ca60b6
Severity:   low
Surface:    `packages/studio/src/pages/dashboard/swimlane-rail.ts:renderPresetSurface` docstring ("re-rendered identically by the client … no flash-of-empty-content") vs `plugins/deskwork-studio/public/src/dashboard/swimlane-presets.ts:renderPresetList`

The server always renders the preset list with the empty-state child `<span class="preset-empty">No saved presets</span>` because the server has no access to the operator's localStorage. The docstring claims the client "re-renders identically … no flash-of-empty-content." That holds only for an operator with zero presets. An operator who has saved presets gets SSR "No saved presets" on first paint, then `renderPresetList` wipes it (`container.textContent = ''`) and populates the real rows once the client boots — i.e. exactly the empty→populated flash the comment asserts is avoided.

The claim is an overstatement of the SSR/CSR symmetry. Either soften the docstring to scope the no-flash guarantee to the empty case, or accept the flash and document it honestly — the current wording will mislead the next reader into assuming hydration is flash-free in all cases.

Surfaced by audit-barrage run `20260530T115517132Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115517132Z-graphical-entries/claude.md`.

### AUDIT-20260530-49 — [P5-3 claude] DRY regression: `readJsonArrayOfStrings` re-implements the very reader this diff extracted to dedupe

Finding-ID: AUDIT-20260530-49 (cross-model: AUDIT-BARRAGE-claude-P5-3)
Status:     fixed-043b775
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:readJsonArrayOfStrings` (and the trio `writePresets`/`writeJsonOrIgnore`/`writeStoredOrder` across the three files)

This diff's stated cleanup extracted `readStoredStringArray` into `swimlane-storage.ts` specifically to dedupe the JSON-array read between `swimlane.ts` and `swimlane-drag.ts` (see the new export's docstring). In the same diff, `swimlane-presets-store.ts` imports `readStoredObjectMap` and `STORAGE_KEY_PREFIX` from that module but does **not** use the new `readStoredStringArray` — it defines its own `readJsonArrayOfStrings` doing the identical try/parse/filter logic (just returning `[]` instead of `null` on failure). The same pattern repeats on the write side: `writePresets`, `writeJsonOrIgnore` (presets-store), and `writeStoredOrder` (drag) are three near-identical `try { setItem(JSON.stringify) } catch {}` helpers.

Introducing a fourth copy of the reader in the same changeset that was consolidating copies is a maintainability regression — the next bug fix to the read/parse path now has to be applied in two places that look intentionally unified. Fix: have `readJsonArrayOfStrings` delegate to `readStoredStringArray` (coercing `null → []`), and factor the write-with-swallow helper into `swimlane-storage.ts` so all four call sites share one implementation.

Surfaced by audit-barrage run `20260530T115517132Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115517132Z-graphical-entries/claude.md`.

### AUDIT-20260530-50 — [P5-3 claude] Test suite never exercises localStorage write-failure / quota for either feature

Finding-ID: AUDIT-20260530-50 (cross-model: AUDIT-BARRAGE-claude-P5-3)
Status:     fixed-9ab86b1
Severity:   low
Surface:    `packages/studio/test/dashboard-swimlane-presets-client.test.ts` + `packages/studio/test/dashboard-swimlane-drag-client.test.ts`

Both new test files assert happy-path persistence (`localStorage.getItem(...)` equals the expected JSON) but neither simulates a `setItem` that throws — the exact failure the production code defends against with swallowed `try/catch` blocks in `writePresets`, `writeJsonOrIgnore`, `writeStoredOrder`, and `writeStoredSet`. Because the catch is silent, the only way to know the fallback behaves as documented ("in-page state still works"; "the operator just loses persistence across reloads") is a test that stubs `setItem` to throw and asserts the DOM reorder/apply still happened without an exception escaping the handler.

This matters specifically because finding-01 shows the swallow currently produces a misleading success flash — a test that drives the throw path would have surfaced that contradiction. Add a case per file that monkeypatches `window.localStorage.setItem` to throw, then asserts (a) no exception propagates out of the drop/save handler and (b) the in-DOM reorder/preset-apply still completed.

Surfaced by audit-barrage run `20260530T115517132Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115517132Z-graphical-entries/claude.md`.

### AUDIT-20260530-51 — [P5-3 codex] Preset storage write failures are reported as successful saves/applies

Finding-ID: AUDIT-20260530-51 (cross-model: AUDIT-BARRAGE-codex-P5-3)
Status:     fixed-3e9d77b (duplicate of AUDIT-20260530-44; closed by the same Task 0.20 commit)
Severity:   medium
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:209-221,349-414; plugins/deskwork-studio/public/src/dashboard/swimlane-presets.ts:188-205

`writePresets` and `writeJsonOrIgnore` catch every `localStorage.setItem` failure, including quota and private-mode failures, then return normally. `savePresetFromCurrent` still returns a preset, `handleSaveClick` re-renders from storage and flashes success, and `applyPreset` re-reads storage after ignored writes, so a preset load can silently apply stale or partially updated state.

This directly intersects the audit scope's localStorage quota concern. A reasonable fix is to make write helpers return success/failure or throw a typed error, then avoid success UI and avoid reapplying from storage when the requested state was not durably written.

Surfaced by audit-barrage run `20260530T115517132Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115517132Z-graphical-entries/codex.md`.

### AUDIT-20260530-52 — [P5-3 codex] Workplan marks a scoped server-side preset path as postponed

Finding-ID: AUDIT-20260530-52 (cross-model: AUDIT-BARRAGE-codex-P5-3)
Status:     tracked-issue-382 (server-side preset path tracked at #382; workplan line tightened to reference issue)
Severity:   low
Surface:    docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:267-271

Task 5.5.2 is checked complete while the line explicitly says the `.deskwork/personal/<operator-id>/focus-presets.json` server-side path is postponed to Phase 6. The project instructions reject open-ended postponement language because it turns scope changes into untracked project debt.

If localStorage-only is the intended Phase 5 contract, the workplan should state that as the accepted scope without a Phase 6 promise. If the file-backed path remains required by the PRD, the task should not be marked complete until that path exists or a tracked issue records the changed scope.

Surfaced by audit-barrage run `20260530T115517132Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115517132Z-graphical-entries/codex.md`.

### AUDIT-20260530-53 — [P5-3 codex] Stored lane order accepts duplicate IDs and can poison reorder state

Finding-ID: AUDIT-20260530-53 (cross-model: AUDIT-BARRAGE-codex-P5-3)
Status:     fixed-57bd93d
Severity:   low
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts:53-63; plugins/deskwork-studio/public/src/dashboard/swimlane-drag.ts:72-89,371-392

`readStoredStringArray` preserves duplicate strings, and `reconcileOrder` only checks that each stored id exists in the live lane set. A corrupted or manually edited value like `["qa","qa","default"]` passes validation, becomes `state.order`, and can be written back after the next real reorder. DOM appends of the same element are mostly harmless visually, but the controller's order model is no longer a one-to-one lane permutation.

The order reader should validate uniqueness and exact permutation semantics after appending newly added lanes. Duplicate stored ids should be treated like stale ids: discard the stored order and use the live server-rendered order.

Surfaced by audit-barrage run `20260530T115517132Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115517132Z-graphical-entries/codex.md`.

### AUDIT-20260530-54 — [P6-1 claude] `pipeline update --rename-stage` writes `<id>-renames.json` into the override dir, which the loader enumerates as a phantom template — breaks `pipeline list` after any rename

Finding-ID: AUDIT-20260530-54 (cross-model: AUDIT-BARRAGE-claude-P6-1)
Status:     fixed-ec38100
Severity:   high
Surface:    `packages/core/src/pipelines/operations/update.ts:appendRenameMigration` (writes `${pipelineId}-renames.json` into `pipelineOverridesDir`) vs `packages/core/src/pipelines/loader.ts:listAvailablePipelineTemplates` (`:251`) + `packages/core/src/pipelines/operations/list.ts:listPipelines`

`appendRenameMigration` writes the migration sidecar to `join(pipelineOverridesDir(projectRoot), \`${pipelineId}-renames.json\`)` — i.e. *the same directory* `listAvailablePipelineTemplates` scans for templates. That function returns every `.json` basename in the override dir with no exclusion for the `-renames` suffix, so after a single `pipeline update my-blog --rename-stage X --to-stage Y`, the id `my-blog-renames` is emitted as a pipeline template. `listPipelines` then calls `loadPipelineTemplate('my-blog-renames', …)` for *every* id, which finds `my-blog-renames.json`, reads it, and Zod-validates it against `PipelineTemplateSchema` — it has `pipelineId`/`renames` keys, not `linearStages`, so validation throws. The throw propagates out of `listPipelines`, so **both `pipeline list` and `pipeline list --full` break for the whole project after any rename**. `customize pipeline`'s `listAvailable` picker is polluted identically, and `pipeline show my-blog-renames` resolves to a confusing schema error.

This is the same class as AUDIT-20260530-03 (stray `.json` becomes phantom template) but it is *guaranteed* on every rename rather than hypothetical, and the `update.test.ts` rename tests never run `pipeline list` afterward so it shipped untested. Fix: store the migration sidecar outside the enumerated namespace (e.g. `.deskwork/pipelines/.renames/<id>.json` or a single non-`.json` index), OR have `listJsonBasenames`/`listAvailablePipelineTemplates` skip the `-renames.json` suffix, AND add a regression test that runs `pipeline list` after a rename.

---

Surfaced by audit-barrage run `20260530T115914439Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115914439Z-graphical-entries/claude.md`.

### AUDIT-20260530-55 — [P6-1 claude] `pipeline delete --reassign-lanes-to ""` (empty string) bypasses the dependent-lane refusal and orphans every dependent lane

Finding-ID: AUDIT-20260530-55 (cross-model: AUDIT-BARRAGE-claude-P6-1)
Status:     fixed-b034cb9
Severity:   high
Surface:    `packages/core/src/pipelines/operations/delete.ts:deletePipeline` (refusal guard, validation guard, rebind loop)

The dependent-lane refusal is gated on `dependents.length > 0 && opts.reassignLanesTo === undefined`, while validation and the rebind loop are both gated on `opts.reassignLanesTo !== undefined && opts.reassignLanesTo.length > 0`. An empty-string value (`--reassign-lanes-to ""`, or `--reassign-lanes-to=`, or an unset shell variable) sets `reassignLanesTo === ''`, which is **neither `undefined` nor length-`> 0`**. Trace with one dependent lane: the refusal check is `true && ('' === undefined)` → `false` (no refusal); the validation block is `('' !== undefined) && (0 > 0)` → `false` (no `loadPipelineTemplate` check); the rebind loop is skipped for the same reason; then `unlinkSync(path)` fires. The override is deleted and the dependent lanes are left pointing at a now-missing `pipelineTemplate` — exactly the data-integrity failure the guard exists to prevent, executed silently with exit 0.

The sibling `lane move --to ""` path is incidentally protected (`assertSafeLaneId('')` fails the regex), and `lane create --content-dir ""` is caught by the schema's `min(1)` — `delete`'s reassign value is the one operator-controlled flag that reaches a destructive `unlinkSync` without an empty-string guard. Fix: normalize empty-string flags to `undefined` at the CLI boundary, or change the guards to `opts.reassignLanesTo == null || opts.reassignLanesTo.length === 0` so an empty reassign target is treated as "no target" and the dependent-lane refusal fires. Add a refusal test for `--reassign-lanes-to ''` with a dependent lane.

---

Surfaced by audit-barrage run `20260530T115914439Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115914439Z-graphical-entries/claude.md`.

### AUDIT-20260530-56 — [P6-1 claude] `appendRenameMigration` is non-atomic and silently discards a corrupt renames file, contradicting the append-only audit-trail promise

Finding-ID: AUDIT-20260530-56 (cross-model: AUDIT-BARRAGE-claude-P6-1)
Status:     fixed-cb78c6b
Severity:   medium
Surface:    `packages/core/src/pipelines/operations/update.ts:appendRenameMigration` (read + `writeFileSync` direct), and `plugins/deskwork/skills/pipeline/SKILL.md` Safety-rules ("migration sidecar is append-only … deleting it loses the audit trail")

Every other write in this feature uses the tmp+rename atomic pattern (`lanes/operations/commit.ts`, `pipelines/operations/commit.ts`), but `appendRenameMigration` does a direct `writeFileSync(path, …)` — a crash mid-write truncates `<id>-renames.json`. Worse, on the read side the function catches a `JSON.parse` failure and sets `parsed = null`, after which `RenameMigrationSchema.safeParse(null)` fails and it falls back to `{ pipelineId, renames: [] }` — **silently discarding the entire prior rename history** on any corruption. The SKILL.md tells the operator this file is the append-only audit trail that doctor (Task 6.5) will consume for affected-entry remediation, but the code itself will reset it to empty without surfacing the loss, defeating the remediation path the rename feature exists to enable.

There is also an ordering hazard: the rename is committed by `commitPipelineTemplate` first, then `appendRenameMigration` runs synchronously; if it throws (disk full, permissions), the template is already renamed on disk but no migration record exists and the journal event never fires. Fix: write the renames file via the same tmp+rename helper, and on a corrupt existing file refuse/throw with the path (or quarantine it) rather than silently starting fresh — losing the audit trail is the exact "silent fallback" the project's no-fallback rule prohibits.

---

Surfaced by audit-barrage run `20260530T115914439Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115914439Z-graphical-entries/claude.md`.

### AUDIT-20260530-57 — [P6-1 claude] `listLanes` / `listPipelines` throw on a single malformed config, breaking the entire list command — undermining the loader's deliberate graceful-degradation contract

Finding-ID: AUDIT-20260530-57 (cross-model: AUDIT-BARRAGE-claude-P6-1)
Status:     fixed-5c8ec5c
Severity:   medium
Surface:    `packages/core/src/lanes/operations/list.ts:listLanes` (N+1 `loadLaneConfig`), `packages/core/src/pipelines/operations/list.ts:listPipelines` (N+1 `loadPipelineTemplate`), vs `packages/core/src/lanes/loader.ts:listLaneConfigs` + `isArchivedOnDisk`

`listLaneConfigs` was deliberately written to tolerate corrupt files — its `isArchivedOnDisk` helper catches parse errors and returns `false` so "a malformed lane still appears in the list" (the `broken.json` test at `loader.test.ts:285` asserts `['broken', 'default']`). But the operation layer immediately undoes that: `listLanes` maps every returned id through `loadLaneConfig(id)`, which throws on the malformed lane, so `lane list` fails wholesale and the operator can't see *any* of their lanes — the opposite of what the loader's graceful degradation was protecting. `listPipelines` has the identical shape via `loadPipelineTemplate`, and this is also the propagation vector for finding -01 (the phantom `-renames` template). This is the same coupling shape as the already-dispositioned AUDIT-20260530-17 (one bad lane file breaks an operation for the whole project), surfacing on the read path.

Fix: have `listLanes`/`listPipelines` collect per-id load failures into the result (e.g. a `malformed: {id, error}[]` channel the CLI surfaces) rather than letting the first corrupt file abort the enumeration — so `lane list` shows the healthy lanes plus a flagged-broken section. Add a `lane list` test with one corrupt lane JSON present asserting the healthy lanes still emit.

---

Surfaced by audit-barrage run `20260530T115914439Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115914439Z-graphical-entries/claude.md`.

### AUDIT-20260530-58 — [P6-1 claude] `lane move` of a pre-migration entry (no `lane` field) fails confusingly when no `default` lane config exists

Finding-ID: AUDIT-20260530-58 (cross-model: AUDIT-BARRAGE-claude-P6-1)
Status:     fixed-138164f
Severity:   low
Surface:    `packages/core/src/lanes/operations/move.ts:moveEntryToLane` (`sourceLaneId = sidecar.lane ?? DEFAULT_LANE_ID`, then `loadLaneConfig(sourceLaneId, projectRoot)`)

The docblock states an entry without a `lane` field "is treated as belonging to the `default` lane (matches the doctor's lane-back-fill default)." But the very next use of `sourceLaneId` is `loadLaneConfig('default', projectRoot)`, which throws `Lane config "default" not found` if the project never created a `default` lane (a real migration-window state, since lanes are project-owned with no plugin defaults). The error surfaced to the operator is about a *missing default lane config*, not about the entry they asked to move, and the `sourceLane` is only consumed for `sourceContentDir` resolution. An operator moving a freshly-ingested pre-lane entry into a new lane gets a confusing failure pointing at the wrong object.

Fix: when `sidecar.lane` is undefined and no `default` lane exists, either fall back to the project's configured `contentDir` for the source path, or refuse with a message naming the *entry* and instructing the operator to run lane back-fill (doctor) first. No test covers the no-`default`-lane move path.

---

Surfaced by audit-barrage run `20260530T115914439Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115914439Z-graphical-entries/claude.md`.

### AUDIT-20260530-59 — [P6-1 claude] Rollback-test silently no-ops (returns "pass") when it cannot simulate the write failure — the contract goes unverified on root/CI sandboxes

Finding-ID: AUDIT-20260530-59 (cross-model: AUDIT-BARRAGE-claude-P6-1)
Status:     fixed-c4f0f5c
Severity:   low
Surface:    `packages/cli/test/lane/move.test.ts:264-280` ("rolls back artifact + scrapbook when writeSidecar fails")

The test chmods the entries dir to `0o555`, then pre-flights a write; if the write *succeeds* (running as root, common in CI sandboxes) it `return`s early — which Vitest records as a passing test, not a skip. So the move-rollback path (the headline data-safety fix from AUDIT-20260528-42) is silently unverified in exactly the environments most likely to run as root, and the green checkmark misrepresents coverage. Per the project's UI-verification ethos ("a passing test of the wrong assertions is worse than no test"), a test that can't exercise its contract should announce that, not pass quietly.

Fix: call Vitest's `ctx.skip()` (or `it.skipIf`) on the can't-simulate branch so the run reports SKIPPED with a reason, rather than a bare `return` that reads as a pass. Optionally drive the failure deterministically by mocking `writeSidecar` to throw instead of relying on filesystem permissions.

Surfaced by audit-barrage run `20260530T115914439Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115914439Z-graphical-entries/claude.md`.

### AUDIT-20260530-60 — [P6-1 codex] Pipeline template rename/archive/restore/purge are missing

Finding-ID: AUDIT-20260530-60 (cross-model: AUDIT-BARRAGE-codex-P6-1)
Status:     acknowledged-spec-confirmed
Severity:   blocking
Surface:    `packages/cli/src/commands/pipeline.ts:5-15`, `packages/cli/src/commands/pipeline.ts:80-136`, `packages/core/src/pipelines/operations/index.ts:11-28`, `plugins/deskwork/skills/pipeline/SKILL.md:13-25`

The audited feature scope says Task 6.2 ships the `/deskwork:pipeline` family with `list/show/create/update/archive/restore/purge/rename`, and specifically that rename migrates lane `pipelineTemplate` bindings from the old id to the new id atomically. The implementation exposes only `list | show | create | update | delete`; there is no pipeline-id `rename`, no soft archive/restore, and no purge verb matching the lane lifecycle.

This is not just naming drift. The only “rename” implemented is `update --rename-stage`, which changes stage labels and writes a stage-rename sidecar. It does not rename the template id or migrate lanes bound to the old template id. A reasonable fix is to add the missing pipeline lifecycle verbs and core operations, including a template-id rename path that writes the new override, migrates every dependent lane config, removes the old override, and rolls back on partial failure.

Surfaced by audit-barrage run `20260530T115914439Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115914439Z-graphical-entries/codex.md`.

**Disposition (2026-05-30): acknowledged-spec-confirmed.** The audit's premise misstates the workplan. Task 6.2's actual spec (`workplan.md:304-310` Step 6.2.1) defines `/deskwork:pipeline` as `list / show / create / update (with --add-stage / --rename-stage / --remove-stage / --set-locked / --set-off-pipeline) / delete (with --reassign-lanes-to)`. The verbs the audit names as missing (`archive`, `restore`, `purge`, template-id `rename`) were NEVER specced for pipelines — they belong to `/deskwork:lane`, where workspace state needs a soft-archive lifecycle distinct from destructive purge. The asymmetry between lane CRUD and pipeline CRUD is intentional: pipelines are reference data (schema definitions: install / edit / delete pattern), lanes are workspace state (entries-bearing: create / archive / restore / purge lifecycle). The implementation matches the actual workplan. The codex finding's "audited feature scope" wording reflects the audit-barrage dispatch's vars-summary text (which over-extended the lane verb set onto pipelines by mistake), not the canonical workplan. If symmetric archive/restore/purge/rename verbs are wanted for pipelines later (e.g., to soft-deprecate a custom pipeline template without deleting it), that is a forward feature request — file as a new task in a future phase, not a backlog fix here. No code change required; closing per the operator decision dated 2026-05-30.

### AUDIT-20260530-61 — [P6-1 codex] Stage-rename sidecar is enumerated as a fake pipeline template

Finding-ID: AUDIT-20260530-61 (cross-model: AUDIT-BARRAGE-codex-P6-1)
Status:     fixed-ec38100 (duplicate of AUDIT-20260530-54; closed by the same Task 0.30 commit)
Severity:   high
Surface:    `packages/core/src/pipelines/operations/update.ts:410-459`, `packages/core/src/pipelines/loader.ts:251-260`, `packages/core/src/pipelines/operations/list.ts:38-40`

`appendRenameMigration` writes `<projectRoot>/.deskwork/pipelines/<id>-renames.json` next to real template override files. `listAvailablePipelineTemplates` enumerates every `*.json` basename in `.deskwork/pipelines`, and `listPipelines` immediately calls `loadPipelineTemplate(id, projectRoot)` for each returned id.

After the first successful `deskwork pipeline update my-blog --rename-stage ...`, `deskwork pipeline list --full` will discover `my-blog-renames` as a template id and try to parse the migration sidecar as a `PipelineTemplate`. That fails schema validation or id matching, so a successful rename poisons the template picker. Store migration files outside the template override directory, or make the enumerator ignore sidecar filenames with a strict template-file index.

Surfaced by audit-barrage run `20260530T115914439Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115914439Z-graphical-entries/codex.md`.

### AUDIT-20260530-62 — [P6-1 codex] `remove-stage` misses legacy default-lane entries

Finding-ID: AUDIT-20260530-62 (cross-model: AUDIT-BARRAGE-codex-P6-1)
Status:     fixed-0d76ec5
Severity:   medium
Surface:    `packages/core/src/pipelines/operations/update.ts:367-395`

`refuseRemoveStageWhenReferenced` skips every sidecar whose `entry.lane` is `undefined`. That conflicts with the lane migration convention used elsewhere in this diff: `lane move` treats missing `lane` as the migration-window `default` lane. If a project has a `default` lane bound to `my-blog` and legacy entries without a `lane` field at `currentStage: "Review"`, `pipeline update my-blog --remove-stage Review` will allow the stage removal even though those entries still occupy it.

The refusal check should resolve missing `entry.lane` the same way the rest of the lane-aware code does: treat it as `default`, load that lane, and only skip when the entry truly cannot be associated with the mutated template. Add a regression test with a default-lane entry whose sidecar lacks `lane`.

Surfaced by audit-barrage run `20260530T115914439Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115914439Z-graphical-entries/codex.md`.

### AUDIT-20260530-63 — [P6-1 codex] `delete --reassign-lanes-to` can leave a partial rebind

Finding-ID: AUDIT-20260530-63 (cross-model: AUDIT-BARRAGE-codex-P6-1)
Status:     fixed-2c928d3
Severity:   medium
Surface:    `packages/core/src/pipelines/operations/delete.ts:179-222`

The batch reassign path commits each dependent lane one by one, then unlinks the pipeline override, then appends the journal event. If a later lane write fails, earlier lanes remain rebound while the old pipeline still exists. If `unlinkSync` fails, all lane reassignments may already be on disk. If `appendJournalEvent` fails after unlink, the template is gone and lanes are rebound without the lifecycle event.

Each individual lane write is atomic, but the multi-file operation is not. Since this command is explicitly a batch mutation, it needs transaction-style rollback or a staging order with compensating writes: preserve original lane configs, restore already-reassigned lanes on failure, and avoid deleting the template until the reassign set is known to be durable.

Surfaced by audit-barrage run `20260530T115914439Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115914439Z-graphical-entries/codex.md`.

### AUDIT-20260530-64 — [P6-1 codex] `lane move` trusts sidecar paths when moving files

Finding-ID: AUDIT-20260530-64 (cross-model: AUDIT-BARRAGE-codex-P6-1)
Status:     fixed-e4a3dcb71a60944b24750a3d10812968f451eac1
Severity:   high
Surface:    `packages/core/src/lanes/operations/move.ts:210-231`, `packages/core/src/schema/entry.ts:213-218`

`lane move` builds filesystem paths with `join(sourceContentDir, sidecar.artifactPath)` and `join(targetContentDir, sidecar.artifactPath)` without verifying that the resolved paths stay under the lane content directories. `EntrySchema` leaves `artifactPath` as an unconstrained optional string. A malformed sidecar with `artifactPath: "../outside.md"` can make the move operate outside the lane content tree. The scrapbook path has the same shape through `sidecar.slug`.

This is the same class of path-boundary issue that the diff hardens for lane ids and `contentDir`, but the entry-controlled relative paths remain unchecked at the move boundary. Resolve both source and target paths, compare them against the resolved content directories, and refuse any artifact or scrapbook path that escapes.

Surfaced by audit-barrage run `20260530T115914439Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T115914439Z-graphical-entries/codex.md`.

### AUDIT-20260530-65 — [P6-2 claude] Pipelines data layer re-reads + re-parses every lane file once per template (O(templates × lanes) redundant IO)

Finding-ID: AUDIT-20260530-65 (cross-model: AUDIT-BARRAGE-claude-P6-2)
Status:     fixed-43bd0ee
Severity:   high
Surface:    `packages/studio/src/pages/pipelines/data.ts` — `loadPipelinesPageData` (loop), `findReferencingLanes`, `readLanePipelineTemplate`

`loadPipelinesPageData` loops over every enumerated template id and calls `findReferencingLanes(projectRoot, id, laneIds)` inside the loop. `findReferencingLanes` walks **all** lane ids and calls `readLanePipelineTemplate` for each — which does `existsSync` + `readFileSync` + `JSON.parse` on the lane's JSON every time. So for N templates and M lanes, the page performs N×M file reads and N×M `JSON.parse` calls, re-reading and re-parsing the *same* M lane files once per template. With the 5 shipped presets plus overrides and a non-trivial lane count this is hundreds-to-thousands of synchronous reads on the cold-path render, all redundant.

The audit scope explicitly names "page-render performance on large lane/pipeline lists." This is the concrete offender. The fix is a single pass: read each lane's `pipelineTemplate` once into a `Map<laneId, templateId>` (or `Map<templateId, laneId[]>`) before the template loop, then index into it per template — turning N×M disk reads into M. The current shape also blocks the event loop with synchronous `readFileSync` repeated across the same files.

Surfaced by audit-barrage run `20260530T120247811Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120247811Z-graphical-entries/claude.md`.

### AUDIT-20260530-66 — [P6-2 claude] `/dev/lanes` hard-fails the entire page on one malformed lane config, where `/dev/pipelines` degrades gracefully

Finding-ID: AUDIT-20260530-66 (cross-model: AUDIT-BARRAGE-claude-P6-2)
Status:     fixed-039e734
Severity:   medium
Surface:    `packages/studio/src/pages/lanes/data.ts` — `loadLanesPageData` loop (`loadLaneConfig(id, projectRoot)` with no try/catch); `packages/studio/src/server.ts:/dev/lanes` route

`loadLanesPageData` calls `loadLaneConfig(id, projectRoot)` directly in its loop with no error handling; the docstring even states "Throws if any lane config is malformed." The route handler is `async (c) => c.html(await renderLanesPage(ctx))` with no catch, so a single corrupt/invalid lane JSON makes the **whole** `/dev/lanes` page throw (500) — the operator can't see *any* lane, including the healthy ones, and can't use the page to triage the broken one.

This is the exact opposite of the deliberate design on the sibling pipelines page, which surfaces malformed templates as inline error rows + a banner ("this id exists but won't load — fix it") specifically so one bad file doesn't blind the operator. The two pages were built in the same task pair and should share that robustness posture. The lanes page should collect per-lane load failures into an error-row list (mirroring `PipelineErrorRow`) instead of letting the first throw kill the render. This interacts with the still-open AUDIT-07 charset gap in `loadLaneConfig`: any lane whose stored id/path the loader rejects becomes a total-page outage here.

Surfaced by audit-barrage run `20260530T120247811Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120247811Z-graphical-entries/claude.md`.

### AUDIT-20260530-67 — [P6-2 claude] Corrupt/unreadable lane JSON is silently dropped from `referencingLanes`, so the pipelines Delete gate can under-count dependents

Finding-ID: AUDIT-20260530-67 (cross-model: AUDIT-BARRAGE-claude-P6-2)
Status:     fixed-b44f042
Severity:   medium
Surface:    `packages/studio/src/pages/pipelines/data.ts` — `readLanePipelineTemplate` (returns `null` on `readFile`/`JSON.parse` failure), `findReferencingLanes`, consumed by `renderDeleteButton` in `pipelines/table.ts`

`readLanePipelineTemplate` returns `null` whenever the lane file is missing, unreadable, unparseable, or the `pipelineTemplate` field isn't a string — and `findReferencingLanes` treats `null` as "no reference here." Consequence: a lane whose JSON is corrupt but which *does* reference template X is silently excluded from X's `referencingLanes`. The pipelines table then renders an **active** Delete button for X (`renderDeleteButton` gates the disabled variant on `referencingLanes.length > 0`), telling the operator X is safe to delete when a real (if broken) dependent still points at it.

This is the same silent-skip class flagged repeatedly on this feature (AUDIT-15 lane-migration, AUDIT-23 cascade catch) — a `catch { return null }` that converts "I couldn't read this" into "this doesn't reference anything," which is a fallback that hides a failure mode per the project's no-silent-fallback rule. The comment claims "the lanes page surfaces the lane-side defect," but the Delete-gate decision is made here on incomplete data regardless of what the other page shows. Fix: distinguish missing (ENOENT → genuinely no reference) from parse/read failure, and either count the unreadable lane as an unknown-dependent (so the gate stays conservative) or surface it explicitly.

Surfaced by audit-barrage run `20260530T120247811Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120247811Z-graphical-entries/claude.md`.

### AUDIT-20260530-68 — [P6-2 claude] Lanes page never emits `data-project-key`, so archived-section persistence is not project-scoped despite the docstring — and the test masks the gap

Finding-ID: AUDIT-20260530-68 (cross-model: AUDIT-BARRAGE-claude-P6-2)
Status:     fixed-ba190d6
Severity:   medium
Surface:    `packages/studio/src/pages/lanes.ts` (`<main ... data-lanes-container>`); `plugins/deskwork-studio/public/src/lanes/lanes-page.ts` — `archivedOpenKey`/`initArchivedSection` via `resolveProjectKey(container)`; `packages/studio/test/lanes/lanes-page-client.test.ts` (`container.dataset.projectKey = 'test-proj'`)

`initArchivedSection` builds its localStorage key from `resolveProjectKey(container)`, and the docstring claims the open state is "Namespaces by project key … so two operators sharing a machine but working on different projects don't see each other's collapse state." But the server-rendered lanes container (`<main class="er-container lanes-container" data-lanes-container>`) carries **no** `data-project-key` attribute. The two client tests that exercise persistence set `container.dataset.projectKey = 'test-proj'` by hand before calling `initLanesPage`, then assert the key `deskwork:lanes:test-proj:archived-open` — i.e. they inject the attribute the real page never emits, so the project-scoping promise is asserted against a fixture the server doesn't produce.

On the real page, `resolveProjectKey` will fall back to whatever its no-attribute default is, so every project on the machine shares one archived-open key — the exact cross-project bleed the docstring says it prevents. This is a client/server contract gap papered over by a test that builds the missing attribute itself (the TDD-blind-spot pattern). Fix: emit `data-project-key` on the lanes container the same way the dashboard does, and add an integration assertion against the server-rendered markup (not a hand-built fixture) that the attribute is present.

Surfaced by audit-barrage run `20260530T120247811Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120247811Z-graphical-entries/claude.md`.

### AUDIT-20260530-69 — [P6-2 claude] Edit-form diff-emit trims the live value but not `data-current`, producing a spurious `--flag` when the stored value has surrounding whitespace

Finding-ID: AUDIT-20260530-69 (cross-model: AUDIT-BARRAGE-claude-P6-2)
Status:     fixed-2712118
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/lanes/lanes-page.ts` — `readFieldValue` (`el?.value.trim()`), `readFieldCurrent` (`el?.dataset.current` — untrimmed), `buildUpdateCommand`

`readFieldValue` trims the live input value; `readFieldCurrent` reads `dataset.current` raw. `buildUpdateCommand` then emits a flag when `values.x !== values.xCurrent && values.x.length > 0`. If the persisted `data-current` for a field carries leading/trailing whitespace (most plausibly `contentDir`), the untouched form compares trimmed-live (`"docs"`) against untrimmed-current (`" docs "`), they differ, and the builder emits `--content-dir "docs"` even though the operator changed nothing — silently "normalizing" the value via a command the operator didn't intend to scope.

Low severity because lane names/dirs rarely carry surrounding whitespace, but the asymmetry is a latent correctness bug in the very diff-emit logic AUDIT-61 was added to make consistent. Fix: trim both sides (or neither) so the comparison is apples-to-apples; if normalization-on-save is desired it should be explicit, not a side effect of one side being trimmed.

Surfaced by audit-barrage run `20260530T120247811Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120247811Z-graphical-entries/claude.md`.

### AUDIT-20260530-70 — [P6-2 claude] No XSS regression test feeds an operator-controlled name/contentDir through the server render — the stated audit focus is entirely uncovered

Finding-ID: AUDIT-20260530-70 (cross-model: AUDIT-BARRAGE-claude-P6-2)
Status:     fixed-3cbe4c7
Severity:   low
Surface:    `packages/studio/src/pages/lanes/edit-form.ts` (`value="${row.name}"`, `data-current="${row.name}"`, `data-current="${row.contentDir}"`); `packages/studio/src/pages/pipelines/view-panel.ts`/`table.ts`; `packages/studio/test/lanes/*` + `test/pipelines/*`

Lane `name`/`contentDir` and pipeline `name`/`description` are the only genuinely free-text operator-controlled values reaching markup, and several land in *double-quoted attribute context* (`value="${row.name}"`, `data-current="${row.name}"`). The feature's entire XSS safety therefore rests on the `html` tagged template escaping `"` (and `<`/`>`/`&`) in attribute context — but `html.ts` is not in this diff, and **none** of the four new test files exercises it: every assertion uses benign ids/names like `editorial`, `docs`, `mockups`. The audit scope explicitly names "XSS via lane/pipeline name in rendered markup" and "clipboard-builder XSS," yet there is zero coverage feeding e.g. a lane named `"><img src=x onerror=alert(1)>` through `renderLanesPage`/`renderPipelinesPage` and asserting the payload is escaped.

This is a coverage gap, not a confirmed vuln — but for the one threat the audit centers on, the suite proves only that well-behaved input renders correctly. Add an integration test that writes a lane/template whose name + contentDir contain `"`, `<`, `>`, and `onerror=` and asserts the rendered HTML contains the escaped forms (and that the `data-current`/`value` attributes can't be broken out of). That test also pins the `html.ts` contract this feature silently depends on.

Surfaced by audit-barrage run `20260530T120247811Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120247811Z-graphical-entries/claude.md`.

### AUDIT-20260530-71 — [P6-2 claude] View and Edit panels are rendered in full (5 sub-forms + stage chips/checkboxes) for every pipeline row even though every panel ships hidden

Finding-ID: AUDIT-20260530-71 (cross-model: AUDIT-BARRAGE-claude-P6-2)
Status:     acknowledged-known-tradeoff (render-weight; lazy hydration is a candidate when DOM weight measurably regresses — flag for operator to file follow-up issue)
Severity:   low
Surface:    `packages/studio/src/pages/pipelines/table.ts` — `renderHealthyRow` (always emits `renderViewPanel(row)` + `renderEditForm(row, …)`); `edit-form.ts`, `view-panel.ts`

Every healthy template row eagerly server-renders both a full View panel (stage-flow chips for all linear + off-pipeline stages) and a full Edit panel (five `<details>` sub-forms, including a checkbox per `linearStage` in the set-locked op), all emitted with `hidden` and only revealed client-side. Page weight scales as template_count × (5 sub-forms + per-stage controls), so a project with many overrides pays the full DOM cost up front for panels the operator may never open. Combined with finding -01's redundant lane IO, the pipelines page render cost grows multiplicatively on exactly the "large list" case the audit scope calls out.

Low severity (correctness is fine; this is render-weight), but worth noting because the structure forecloses the cheap mitigation. If/when this bites, the panels are good candidates for lazy hydration (render the row, build the panel on first toggle) — the client controller already owns the toggle path, so the panel HTML doesn't need to exist until first open.

Surfaced by audit-barrage run `20260530T120247811Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120247811Z-graphical-entries/claude.md`.

### AUDIT-20260530-72 — [P6-2 claude] `classifyLoadError` substring matching can misclassify a Zod message as `missing`

Finding-ID: AUDIT-20260530-72 (cross-model: AUDIT-BARRAGE-claude-P6-2)
Status:     acknowledged-known-tradeoff (substring matching is fragile but verbatim message is shown; refactor to structured error codes if/when kind drives differential UI)
Severity:   informational
Surface:    `packages/studio/src/pages/pipelines/data.ts` — `classifyLoadError`

`classifyLoadError` branches on `message.includes('not found') || message.includes('not valid JSON')` and, inside that branch, returns `'missing'` for anything not containing `'not valid JSON'`. Any loader error whose message merely *contains* the substring `not found` — including a future Zod or id-mismatch message phrased that way — is then mislabeled `missing` ("File not found"), which is the one kind the comment itself says "should not happen for ids returned by the enumerator." The verbatim `message` is preserved and shown, so the operator still sees the truth; only the one-line `kind` hint can be wrong.

Informational because the impact is a cosmetically-wrong category label, and the code comment already flags the coupling to the loader's exact strings. If the kind label is to be relied on (e.g. for differential UI), classification should key off a structured discriminant from the loader (an error subclass or code) rather than English substrings.

Surfaced by audit-barrage run `20260530T120247811Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120247811Z-graphical-entries/claude.md`.

### AUDIT-20260530-73 — [P6-2 codex] Required-field copy builders can copy placeholder commands

Finding-ID: AUDIT-20260530-73 (cross-model: AUDIT-BARRAGE-codex-P6-2)
Status:     fixed-115a5383f774
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/lanes/lanes-page.ts:95-103,182-189`; `plugins/deskwork-studio/public/src/pipelines/pipelines-page.ts:88-102,205-228`

The New Lane and New Pipeline builders render placeholders (`<id>`, `<template>`, `<path>`, `<stages>`) when required fields are empty, but the Copy handlers still copy that preview verbatim. That means an operator can click Copy on an incomplete form and paste `/deskwork:lane create <id> ...` or `/deskwork:pipeline create <id> --shape <stages>`, which is not a valid, relevant command and is especially risky if pasted into a shell.

Reasonable fix: disable the Copy button while required fields are blank or invalid, surface a short inline validation message, and keep the placeholder only as a preview shape.

Surfaced by audit-barrage run `20260530T120247811Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120247811Z-graphical-entries/codex.md`.

### AUDIT-20260530-74 — [P6-2 codex] Set-locked builder advertises a CLI-refused empty lock command

Finding-ID: AUDIT-20260530-74 (cross-model: AUDIT-BARRAGE-codex-P6-2)
Status:     fixed-5ceee19
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/pipelines/pipelines-page.ts:157-163`; `packages/studio/test/pipelines/pipelines-page-client.test.ts:214-238`

`buildSetLockedCommand` turns an empty checkbox selection into `--set-locked ""`, and the test explicitly asserts that shape. The CLI’s `splitStageList` refuses an empty comma-separated stage list, so the studio presents a command that looks like “clear all locks” but will fail when pasted.

Reasonable fix: either add a supported CLI clear-locks behavior, or make the UI refuse empty selection with an inline message instead of copying a doomed command.

Surfaced by audit-barrage run `20260530T120247811Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120247811Z-graphical-entries/codex.md`.

Resolution (Task 0.49 — commit 5ceee19): adopted option (2). The Copy gate already disabled paste-out via the inline notice; the remaining bug was that the live preview still advertised the literal `--set-locked ""` shape. Fixed `buildSetLockedCommand` to emit a `<stages>` placeholder in the preview for empty selection (mirrors the New form's `<id>` / `<stages>` unfilled-required-field convention). TDD regression in `packages/studio/test/pipelines/pipelines-page-client-validation.test.ts` asserts the preview text does NOT contain `--set-locked ""` and DOES match `... --set-locked <stages>` for zero-checked state; re-ticking a box snaps to the assembled `... --set-locked "Final"` value. Option (1) — adding a CLI `--clear-locks` verb — is a separate scope; out of Task 0.49 per the task brief.

### AUDIT-20260530-75 — [P6-2 codex] Page init is not actually idempotent

Finding-ID: AUDIT-20260530-75 (cross-model: AUDIT-BARRAGE-codex-P6-2)
Status:     fixed-6d8a400
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/lanes/lanes-page.ts:167-189,193-221,240-289,322-344,347-364`; `plugins/deskwork-studio/public/src/pipelines/pipelines-page.ts:141-174,177-231,240-267,294-347,350-367`

Both controllers describe init as idempotent, but every init path calls `addEventListener` unconditionally. A second `initLanesPage()` or `initPipelinesPage()` call on the same DOM attaches duplicate input, toggle, and copy handlers; copy buttons can write/flash twice and toggle handlers can perform redundant state changes.

Reasonable fix: add a module-level or container-level wired guard, or mark each wired element with a dataset sentinel before attaching listeners.

Surfaced by audit-barrage run `20260530T120247811Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120247811Z-graphical-entries/codex.md`.

Resolution (Task 0.50 — commit 6d8a400): adopted the container-dataset variant of the wired guard, mirroring the swimlane shell-attribute pattern from Task 0.6 (AUDIT-20260530-30). `data-lanes-wired="true"` flips on the lanes container; `data-pipelines-wired="true"` flips on the pipelines container. Container-dataset over module-level boolean was required for test isolation: the existing client-test suite rebuilds the container in `beforeEach`, and a fresh container element naturally resets the sentinel — a module-level boolean would latch true after the first test and silently no-op every subsequent one. TDD regression at `packages/studio/test/lanes/lanes-page-idempotent.test.ts` + `packages/studio/test/pipelines/pipelines-page-idempotent.test.ts` (3 cases each) asserts the observable signal: one click => one clipboard write, one input event => one preview rebuild, one toggle click => one open transition. Full studio suite (1059 tests) stays green.

### AUDIT-20260530-76 — [P6-2 codex] Lanes and pipelines pages mark Dashboard as the current page

Finding-ID: AUDIT-20260530-76 (cross-model: AUDIT-BARRAGE-codex-P6-2)
Status:     fixed-056528c
Severity:   low
Surface:    `packages/studio/src/pages/lanes.ts:76-80`; `packages/studio/src/pages/pipelines.ts:72-75`; `packages/studio/src/pages/chrome.ts:63-67`

Both new pages call `renderEditorialFolio('dashboard', ...)`, and `renderEditorialFolio` maps that to `aria-current="page"` on the Dashboard link. On `/dev/lanes` and `/dev/pipelines`, assistive tech is told the Dashboard link is the current page, which is incorrect link semantics.

Reasonable fix: extend the folio active key set for `lanes` and `pipelines`, or pass a no-current key for these pages until they have explicit nav entries.

Surfaced by audit-barrage run `20260530T120247811Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120247811Z-graphical-entries/codex.md`.

Resolution (Task 0.51 — commit 056528c): chose the "no-current key" variant of the fix, mirroring the existing `'longform'` precedent in `chrome.ts`. Extended `ChromeActiveLink` with `'lanes'` and `'pipelines'` keys and the `FolioLink.key` Exclude list — both new keys are deliberately omitted from `NAV_LINKS`, so `renderEditorialFolio` finds no match and stamps neither `class="active"` nor `aria-current="page"` on any anchor. Lanes + pipelines surfaces now render the full 5-item folio without any link claiming to be the current page. Picked "no-current" over "add new nav-items" because the existing 5-item nav surface design is settled (per `folio-cross-page.test.ts` cross-page contract) and Lanes is reachable from the Dashboard masthead's back-link pattern. TDD regression at `packages/studio/test/chrome/folio-aria-current.test.ts` (12 cases) asserts: (a) Dashboard anchor does NOT carry `aria-current="page"` on `/dev/lanes` or `/dev/pipelines`, (b) zero `aria-current="page"` inside the folio nav block, (c) zero `class="active"` inside the folio nav block, (d) all 5 folio nav links remain present at their canonical routes. Full studio suite stays green (1071 passing, +12 from the new test file).

### AUDIT-20260530-77 — [P6-3 claude] Delete-refusal message lists entry UUIDs but instructs a slug-based `lane move` command

Finding-ID: AUDIT-20260530-77 (cross-model: AUDIT-BARRAGE-claude-P6-3)
Status:     fixed-041db67
Severity:   medium
Surface:    `packages/core/src/doctor/rules/lane-config-missing-template.ts:290-309` (delete dependency check + refusal message)

In the `delete` branch, `dependents` is built as `sidecars.filter((entry) => entry.lane === laneId).map((entry) => entry.uuid)` (line ~292), so the sample interpolated into the refusal message is a list of **UUIDs**. But the same message then tells the operator: *"Move each entry to another lane with `deskwork lane move <slug> --to <other>`"* (line ~305). The operator is handed UUIDs and instructed to act with slugs. They cannot paste the listed identifiers into the suggested command.

This also diverges from the sibling surface the rule claims to mirror. The integration test for `lane purge` (`packages/cli/test/custom-pipeline-lane-integration.test.ts:294-297`) asserts the purge refusal names `first-post` / `second-post` — i.e. **slugs**. So `lane purge` refuses with slugs while this doctor rule refuses with UUIDs, for the identical "entries reference this lane" condition. Two repair surfaces for the same guard speak two different identifier vocabularies.

Fix: map dependents to `entry.slug` (with UUID as a tiebreaker if slugs can collide) so the listed names match both the `lane move <slug>` instruction and the `purge.ts` precedent. The test at `lane-config-missing-template.test.ts:267` asserting `result.message` contains the bound UUID would need to switch to asserting the slug — which is the correct contract anyway.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/claude.md`.

### AUDIT-20260530-78 — [P6-3 claude] Entry-binding guard can false-negative on corrupt sidecars, orphaning entries on delete

Finding-ID: AUDIT-20260530-78 (cross-model: AUDIT-BARRAGE-claude-P6-3)
Status:     fixed-d39551c
Severity:   medium
Surface:    `packages/core/src/doctor/rules/lane-config-missing-template.ts:280-300` (`readAllSidecars` dependency check)

The delete safety guard depends entirely on `readAllSidecars(ctx.projectRoot)` enumerating every entry that references the lane. Per the established codebase pattern flagged in AUDIT-20260530-15 (sidecar walkers `catch { continue }` and silently skip unparseable files), if `readAllSidecars` swallows corrupt/unparseable sidecars, an entry whose sidecar references the doomed lane but fails to parse will **not** appear in `dependents`. The guard then sees zero dependents and the `unlinkSync(laneFilePath)` (line ~315) proceeds, leaving a corrupt entry bound to a now-deleted lane — exactly the orphan condition the guard exists to prevent.

This is the false-negative branch the audit focus calls out ("entry-binding detection … false negatives"). It matters more here than in a normal read path because the consequence is destructive (lane file deleted) and irreversible from the doctor's perspective.

Fix: verify `readAllSidecars`' error handling. If it silently skips corrupt files, the delete branch must surface the count of unreadable sidecars and refuse (or warn) rather than treat "couldn't parse" as "doesn't reference the lane." A safe guard fails closed, not open. The 4-scenario test suite has no corrupt-sidecar-bound case to pin this.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/claude.md`.

### AUDIT-20260530-79 — [P6-3 claude] Lane mutation lands on disk before the journal append; an append failure leaves no audit record

Finding-ID: AUDIT-20260530-79 (cross-model: AUDIT-BARRAGE-claude-P6-3)
Status:     fixed-7de9a07
Severity:   medium
Surface:    `packages/core/src/doctor/rules/lane-config-missing-template.ts:243-262` (set-template) and `:314-333` (delete)

Both repair actions mutate disk first, then append the journal event. In `set-template`: `atomicWriteLaneJson(...)` (line ~246) runs, then `await appendJournalEvent(...)` (line ~252). In `delete`: `unlinkSync(laneFilePath)` (line ~315), then `await appendJournalEvent(...)` (line ~324). If the journal append throws after the file mutation, the rebind/delete has already landed but no `lane-config-repair` event records it — the audit trail the new `LaneConfigRepairEvent` schema exists to provide is silently absent. For the delete case this is worse: the lane file is gone with zero durable record that the doctor removed it.

This is the same partial-success shape as AUDIT-20260530-13 (`bootstrapDefaultLaneIfMissing` writing the lane before its migration event), surfacing in a new file. The set-template path is recoverable (re-running audit shows it's now clean), but the delete path loses the only evidence the action occurred.

Fix: at minimum, if the journal append fails after a delete, the `RepairResult` should report the file was deleted but the audit record could not be written (so the operator knows), rather than letting the append error propagate as an opaque throw out of `apply`. Consider ordering or a compensating note.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/claude.md`.

### AUDIT-20260530-80 — [P6-3 claude] Audit scans archived lanes at severity=error, producing persistent noise for intentionally-retired lanes

Finding-ID: AUDIT-20260530-80 (cross-model: AUDIT-BARRAGE-claude-P6-3)
Status:     fixed-d2eede1
Severity:   medium
Surface:    `packages/core/src/doctor/rules/lane-config-missing-template.ts:165` (`listLaneConfigs(ctx.projectRoot, { includeArchived: true })`)

`audit()` enumerates lanes with `includeArchived: true`, so a soft-archived lane whose `pipelineTemplate` no longer resolves emits a `severity: 'error'` finding. Archiving is the soft-delete path; deleting the custom pipeline a since-archived lane was bound to is a normal, intentional sequence. After that, `doctor` reports a permanent error on a lane the operator already retired, and the only offered repairs are "rebind it" or "delete it" — neither of which the operator necessarily wants for a lane they archived precisely to stop thinking about.

An archived lane carrying a dangling template reference is not an active-pipeline defect; it's a frozen historical record. Surfacing it at `error` conflates "this active lane is broken" with "this retired lane references a template that's since been removed."

Fix: either exclude archived lanes from this rule's scan (`includeArchived: false`), or emit a lower severity (`warning`/`info`) for archived lanes while keeping `error` for active ones. The header comment justifies the first-site gating in detail but is silent on why archived lanes are in scope at all.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/claude.md`.

### AUDIT-20260530-81 — [P6-3 claude] `laneFilePath` is persisted as an absolute path in the journal event and finding details

Finding-ID: AUDIT-20260530-81 (cross-model: AUDIT-BARRAGE-claude-P6-3)
Status:     fixed-b9784cc
Severity:   low
Surface:    `packages/core/src/doctor/rules/lane-config-missing-template.ts:200-210` (finding.details), `:324-329` (journal event); `packages/core/src/schema/journal-events.ts:228` (`laneFilePath: z.string().min(1)`)

The rule computes `laneFilePath = laneConfigPath(ctx.projectRoot, laneId)` (absolute) and stores it both in `finding.details.laneFilePath` and in the persisted `lane-config-repair` journal event's `details.laneFilePath`. The user-facing message correctly uses `relative(ctx.projectRoot, laneFilePath)` (line ~196, and again at the delete success line ~331) — but the persisted/structured values are absolute. The journal is an append-only on-disk record; embedding an absolute path makes the audit trail machine-specific. A project moved/cloned to a different absolute root carries journal events pointing at a path that no longer exists, and the value isn't reproducible across the team.

The test at `lane-config-missing-template.test.ts:97-99` and `:217` pins the absolute value, so this is intentional, not accidental — but it's the same non-portability the project flags elsewhere.

Fix: store the project-relative path in `details.laneFilePath` (the message already derives relative for display); keep absolute only for transient logging if needed. The lane is already identified by `laneId`, which is the portable key.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/claude.md`.

### AUDIT-20260530-82 — [P6-3 claude] Integration test silently depends on a prebuilt `node_modules/.bin/deskwork` with no build step

Finding-ID: AUDIT-20260530-82 (cross-model: AUDIT-BARRAGE-claude-P6-3)
Status:     fixed-8d51f00
Severity:   low
Surface:    `packages/cli/test/custom-pipeline-lane-integration.test.ts:46-47, 60-69`

`deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork')` and every `spawnSync` invokes it as a real subprocess. `assertDeskworkBinPresent()` checks the bin *exists*, but not that it reflects current source — if the bin dispatches to a stale `dist/` (or to a workspace symlink that points at un-rebuilt output), the test validates yesterday's CLI while reporting green. There's no `npm run build` precondition and no assertion that the resolved binary is current. The audit focus names "integration test reliability"; this is the silent-stale-state vector. In CI without a guaranteed build-before-test ordering, this either fails confusingly (bin absent) or passes against stale code.

Fix: document the build precondition in the test header (it currently only documents the spawn semantics), or have the test assert the bin's resolution path is the workspace symlink rather than a stale standalone copy. At minimum the `assertDeskworkBinPresent` error should mention the build requirement, not just `npm install`.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/claude.md`.

### AUDIT-20260530-83 — [P6-3 claude] Integration test bypasses the entry-creation CLI, weakening the "add 2 entries" + "state-intact" claims

Finding-ID: AUDIT-20260530-83 (cross-model: AUDIT-BARRAGE-claude-P6-3)
Status:     fixed-0bc4763
Severity:   low
Surface:    `packages/cli/test/custom-pipeline-lane-integration.test.ts:130-152` (`writeSidecarFile`), workplan step 6.6.1

Step 6.6.1's acceptance criterion is "add 2 entries," but the test hand-writes sidecar JSON directly (`writeSidecarFile`, line ~130) rather than driving `deskwork add`/`ingest`. Because the lane archive/restore/purge operations only touch the lane file, the byte-equivalence assertion at lines 318-330 (`finalBytes === sidecarPreBytes.get(...)`) is close to tautological: nothing in the exercised lane lifecycle ever writes a sidecar, so "bytes unchanged" would hold even if entry binding were completely broken. The test proves "lane ops don't touch sidecars" (worth having) but is presented as end-to-end entry-state verification, which it only weakly is.

Fix: either create the entries through the real CLI so the entry-creation path is genuinely covered, or scope the test's claim in the header to "lane-lifecycle operations do not mutate pre-existing sidecars" rather than implying it verifies entry creation. The current header (lines 1-23) claims "the full surface implicated by … acceptance criteria," which overstates what's exercised.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/claude.md`.

### AUDIT-20260530-84 — [P6-3 claude] `spawnSync` calls have no timeout; a hung CLI stalls the suite until vitest's global timeout

Finding-ID: AUDIT-20260530-84 (cross-model: AUDIT-BARRAGE-claude-P6-3)
Status:     fixed-dd7de48
Severity:   low
Surface:    `packages/cli/test/custom-pipeline-lane-integration.test.ts:99-108` (`pipeline`), `:111-120` (`lane`)

Both subprocess helpers call `spawnSync(deskworkBin, [...], { encoding: 'utf-8' })` with no `timeout` option. If any CLI invocation deadlocks (e.g. waiting on stdin, or a future interactive prompt sneaks into a verb), the test blocks until vitest's outer timeout rather than failing fast with a diagnostic naming the offending command. The audit focus calls out "subprocess timing" — a per-call `timeout` plus an explicit `r.signal === 'SIGTERM'` assertion is the standard guard for subprocess-driven tests.

Fix: pass `{ encoding: 'utf-8', timeout: 30_000 }` to each `spawnSync` and surface a clear error when `r.signal` indicates a timeout kill, so a hang is attributable to the specific verb rather than the whole suite.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/claude.md`.

### AUDIT-20260530-85 — [P6-3 codex] Repair can mutate lane state without recording the repair event

Finding-ID: AUDIT-20260530-85 (cross-model: AUDIT-BARRAGE-codex-P6-3)
Status:     fixed-7de9a07 (duplicate of AUDIT-20260530-79; closed by the same Task 0.54 commit)
Severity:   medium
Surface:    packages/core/src/doctor/rules/lane-config-missing-template.ts:303-320 and packages/core/src/doctor/rules/lane-config-missing-template.ts:364-381

Both repair actions perform the filesystem mutation before appending the `lane-config-repair` journal event. In `set-template`, the lane JSON is rewritten at lines 303-304, then `appendJournalEvent` is awaited at lines 314-320 with no catch or compensation. In `delete`, the lane file is unlinked at lines 364-366, then the journal event is appended at lines 376-381.

If journal append fails, the operator gets a thrown repair failure after the lane was already rebound or deleted, and there is no durable audit record for the state change. This is worse for delete because the lane file is already gone. A reasonable fix is to make these repair operations transactional enough for this repository’s filesystem model: restore the prior lane JSON if `set-template` journal append fails, and use a staged delete path or compensating restore for delete so “applied” and “journaled” cannot diverge silently.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/codex.md`.

### AUDIT-20260530-86 — [P6-3 codex] Rebind prompt can offer templates that cannot actually be selected

Finding-ID: AUDIT-20260530-86 (cross-model: AUDIT-BARRAGE-codex-P6-3)
Status:     fixed-a031183e (duplicate of AUDIT-20260529-08; closed by commit a031183e on 2026-05-28, prior to this audit run)
Severity:   medium
Surface:    packages/core/src/doctor/rules/lane-config-missing-template.ts:214-229 and packages/core/src/doctor/rules/lane-config-missing-template.ts:287-299

The prompt choices are built directly from `listAvailablePipelineTemplates(ctx.projectRoot)` at lines 214-229. The apply path then separately revalidates the selected template with `loadPipelineTemplate` at lines 287-299 and can reject the same choice the prompt just offered.

That creates a bad repair loop when a project contains a malformed or otherwise unresolvable pipeline override whose filename is still enumerable. The operator sees it as a valid rebind target, selects it, and then gets an apply failure. Since Task 6.5 specifically calls for a prompt plan with per-template rebind choices, the choices should be only templates that resolve cleanly. Filter the available ids through `loadPipelineTemplate` before constructing `set-template-*` choices, while keeping the apply-time validation for races between planning and application.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/codex.md`.

### AUDIT-20260530-87 — [P6-3 codex] CLI subprocess integration test can hang indefinitely

Finding-ID: AUDIT-20260530-87 (cross-model: AUDIT-BARRAGE-codex-P6-3)
Status:     fixed-dd7de48 (duplicate of AUDIT-20260530-84; closed by the same Task 0.59 commit)
Severity:   medium
Surface:    packages/cli/test/custom-pipeline-lane-integration.test.ts:86-104

The new integration test wraps the real CLI with `spawnSync` in `pipeline()` and `lane()`, but neither call sets a timeout. If the CLI blocks on unexpected I/O, a stuck child process, or a regression that waits for input, the test process can hang instead of failing with a bounded diagnostic. That also means `afterEach` cleanup at lines 156-157 may never run for the tmp project.

Because this test is intentionally exercising real subprocesses, it needs a timeout per invocation and should surface `r.error`, `r.signal`, stdout, and stderr in the failure path. A small helper-level timeout is enough to keep the end-to-end coverage reliable in local and CI runs.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/codex.md`.

### AUDIT-20260530-88 — [P7T7.2 claude] SKILL.md error-handling catalog contradicts the shipped refusal messages AND re-asserts the pre-AUDIT-15 "non-empty members = group" semantic

Finding-ID: AUDIT-20260530-88 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)
Status:     fixed-a11aa60
Severity:   medium
Surface:    `plugins/deskwork/skills/group/SKILL.md` (Error handling section, `show`/`update` bullets) vs `packages/core/src/groups/operations/show.ts:54-60` and `packages/core/src/groups/operations/update.ts:48-54`

The new SKILL.md error catalog documents the `show`/`update` non-group refusal as: `Cannot show group "<slug>": entry has no members. Per the Task 7.1.2 invariant, only entries with a non-empty members[] are groups.` and `update ... Refused with the same "entry has no members" shape as show`. But the actual code throws `Cannot show group "<slug>": entry is not a group (no \`members\` field on the sidecar)...` (show.ts) / `Cannot update group "<slug>": entry is not a group (no \`members\` field on the sidecar)...` (update.ts). The `show.test.ts` and `update.test.ts` assert `/entry is not a group/`, confirming the code — so the SKILL.md is the drifted artifact. An adopter grepping the documented error string will not find it.

Worse than a string mismatch: the quoted SKILL.md sentence *"only entries with a non-empty members[] are groups"* directly re-asserts the exact pre-fix semantic that AUDIT-20260529-15 reversed. That whole fix established that `members: []` IS a group (declared-empty marker) and `members`-absent is the regular entry. The SKILL.md header and `update`-description (fixed by AUDIT-20260529-21) now say the right thing, but the error catalog still carries the old, contradictory framing. The two halves of the same SKILL.md disagree about the core predicate. Note also the catalog inconsistency the doc fails to capture: `show`/`update` emit "entry is not a group", while `add-member`/`remove-member`/`archive`/`restore` emit "entry has no `members` field" — two distinct message families the catalog conflates. Fix: rewrite the `show`/`update` catalog bullets to quote the literal `entry is not a group (no \`members\` field...)` text and drop the "non-empty members[] are groups" clause.

---

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/claude.md`.

### AUDIT-20260530-89 — [P7T7.2 claude] `showGroup` member-enrichment swallows corrupt-sidecar parse/config errors as `missing: true` (same class as AUDIT-23, new surface)

Finding-ID: AUDIT-20260530-89 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)
Status:     fixed-6f16c45
Severity:   medium
Surface:    `packages/core/src/groups/operations/show.ts:66-78` (the per-member `try { readSidecar } catch { ...missing: true }` loop)

The member-enrichment loop wraps `readSidecar(projectRoot, memberUuid)` in a bare `catch {}` that pushes `{ uuid, missing: true }` for ANY failure. `readSidecar` throws on three distinct conditions: (a) the sidecar file genuinely doesn't exist (dangling UUID — the case `missing: true` is meant for), (b) the file exists but is corrupt JSON / fails `EntrySchema` validation, and (c) a lower-level IO error. Cases (b) and (c) are reported identically to (a) — a member whose sidecar is on disk but corrupt is mislabeled as a dangling reference.

This is the same swallow-corruption shape that AUDIT-20260530-23 narrowed in `cancel.ts` (now using an `existsSync` probe so only the genuinely-absent case is recoverable and parse/config/IO errors propagate). `show.ts` did not get the same treatment. The downstream consequence is concrete: doctor's `group-member-missing` rule (Task 7.5.2) acts on `missing: true` members and "prompts to remove the dangling reference" — so a corrupt-but-recoverable member sidecar surfaces as missing, and the operator's repair path is to *delete the reference to it*, compounding the data loss. Fix: mirror the cancel.ts pattern — probe `existsSync(sidecarPath(projectRoot, memberUuid))` first; only the absent case yields `missing: true`; let parse/validation/IO errors propagate so corruption surfaces loudly rather than masquerading as a dangling UUID.

---

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/claude.md`.

### AUDIT-20260530-90 — [P7T7.2 claude] `isPopulatedGroupEntry` is defined and documented as downstream public API but not barrel-exported — unreachable via `@deskwork/core/groups`

Finding-ID: AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)
Status:     fixed-b642cd6 (already addressed at Task 7.3/7.4 implementation time — barrel export added with the first consumer)
Severity:   low
Surface:    `packages/core/src/groups/types.ts:46-49` (definition + doc) vs `packages/core/src/groups/index.ts:11` (`export { isArchivedEntry, isGroupEntry } from './types.ts';`)

`isPopulatedGroupEntry` is defined in `types.ts` with a doc-comment that explicitly names its future consumers: *"used downstream by the multi-lane composed view in Task 7.4 + the informational `group-all-members-cancelled` doctor rule in Task 7.5.3 — both should skip empty groups."* But the package barrel `groups/index.ts` only re-exports `isArchivedEntry` and `isGroupEntry`. The predicate is therefore unreachable through the documented public module path `@deskwork/core/groups`; a Task 7.4/7.5.3 consumer would either have to deep-import `groups/types.ts` (bypassing the barrel contract every other group symbol follows) or re-derive the check inline.

In this diff the function has zero call sites, so it is effectively dead code that the doc-comment advertises as the canonical way to express "group with ≥1 member." That's an invitation for the exact failure the predicate exists to prevent: a future implementer who can't see it via the barrel will write `entry.members.length > 0` inline, re-fragmenting the semantic the two-predicate design was meant to centralize. Fix: add `isPopulatedGroupEntry` to the `groups/index.ts` export (and `groups/operations`/barrel as appropriate), or remove the function + the forward-referencing doc until a consumer lands.

---

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/claude.md`.

### AUDIT-20260530-91 — [P7T7.2 claude] Inconsistent exit codes for a bad `--at` argument: out-of-range exits 1, malformed exits 2

Finding-ID: AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)
Status:     fixed-570e257
Severity:   low
Surface:    `packages/cli/src/commands/group.ts:233-245` (handleAddMember `--at` parse) and `packages/core/src/groups/operations/add-member.ts:124-135` (out-of-range throw)

The CLI parses `--at` and rejects non-integer / negative values via `fail(..., 2)` (exit 2 = usage error). But a syntactically-valid-but-out-of-range index (e.g. `--at 5` on a 2-member group) passes the CLI gate and is rejected only by the core operation, which throws a plain `Error` routed through `fail(...)` with the default exit 1. The tests encode this split: `refuses --at <negative>` and `refuses --at <not-an-integer>` assert `code === 2`, while `refuses --at <out-of-range>` asserts only `code !== 0` (it is actually 1).

From an operator's or scripting perspective, `--at -1`, `--at 1.5`, and `--at 5` are all "the `--at` argument is bad" — but they yield exit 2, 2, and 1 respectively. A script branching on exit code to distinguish "usage error, fix my invocation" (2) from "runtime/state error" (1) will misclassify the out-of-range case. The range check is arguably a usage error too (the operator supplied an invalid argument value), so the cleaner contract is exit 2 for all three. Fix: either validate the upper bound at the CLI layer against the resolved group's member count and `fail(..., 2)`, or accept the split explicitly and document that out-of-range is a state-dependent (exit-1) condition because the valid range isn't known until the group is read.

---

I walked the new group operations module, the CLI dispatcher, the cancel cascade (noting its on-disk state already carries the AUDIT-22/23 fixes, so I did not re-report those), the `archivedAt` schema delta, and the journal-event additions. I confirmed `source: z.string()` accepts the new `'group-create'` value (no validation break), the `lane` field's `LANE_ID_REGEX` binding closes the traversal vector, the `--at` integer parse is sound, and there is no HTML/XSS surface in this diff (the CLI emits JSON; studio surfaces are later tasks). The four findings above are the ones worth triage; the strongest are the SKILL.md error-catalog drift (#1) and the `showGroup` corrupt-sidecar swallow (#2).

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/claude.md`.

### AUDIT-20260530-92 — [P7T7.2 codex] `isPopulatedGroupEntry` is implemented but not exported from the public groups entrypoint

Finding-ID: AUDIT-20260530-92 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
Status:     open
Severity:   medium
Surface:    `packages/core/src/groups/index.ts:11`, `packages/core/src/groups/types.ts:39-45`

`isPopulatedGroupEntry` is introduced in `types.ts` as the predicate consumers should use when they need "group AND has at least one member", and the docblock names downstream use cases. But the package-facing barrel only exports `isArchivedEntry` and `isGroupEntry`. Since `packages/core/package.json` exposes `./groups` as the public subpath, downstream code cannot import the populated predicate from `@deskwork/core/groups` without reaching into internals.

This is a composition trap for the next group surfaces: they either duplicate the predicate, use the looser `isGroupEntry` by mistake, or import an internal path. Fix is to export `isPopulatedGroupEntry` from `packages/core/src/groups/index.ts` next to `isGroupEntry`.

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/codex.md`.

### AUDIT-20260530-93 — [P7T7.2 codex] Group mutators can commit sidecar changes without the required group journal event

Finding-ID: AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
Status:     open
Severity:   medium
Surface:    `packages/core/src/groups/operations/create.ts:106-121`, `packages/core/src/groups/operations/update.ts:84-94`, `packages/core/src/groups/operations/add-member.ts:126-145`, `packages/core/src/groups/operations/remove-member.ts:72-89`, `packages/core/src/groups/operations/archive.ts:68-77`, `packages/core/src/groups/operations/archive.ts:104-109`

Every group mutator writes the sidecar before appending its `group-*` journal event. If the journal write fails after the sidecar write, the on-disk group state is changed with no audit event, despite the feature explicitly adding six group event kinds for mutating-verb audit completeness.

This matters most for `add-member` / `remove-member` and archive/restore, where the journal is the only durable explanation of why the membership or visibility changed. A reasonable fix is to make the write+journal sequence transactional enough for this filesystem model: write a recoverable pending record, or perform a compensating sidecar restore/delete when `appendJournalEvent` fails, and add a test that forces journal append failure after sidecar write.

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/codex.md`.

### AUDIT-20260530-94 — [P7T7.2 codex] Extra positional arguments are silently ignored by group subcommands

Finding-ID: AUDIT-20260530-94 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
Status:     open
Severity:   medium
Surface:    `packages/cli/src/commands/group.ts:151-163`, `packages/cli/src/commands/group.ts:182-213`, `packages/cli/src/commands/group.ts:221-248`, `packages/cli/src/commands/group.ts:274-296`, `packages/cli/src/commands/group.ts:302-318`, `packages/cli/src/commands/group.ts:324-340`

The handlers only check minimum positional counts. `show`, `create`, `update`, `add-member`, `remove-member`, `archive`, and `restore` all accept extra positionals and discard them. For example, `deskwork group <root> archive group-a group-b` archives only `group-a`; `group create slug accidental --lane default` creates `slug` and ignores `accidental`.

This is a CLI correctness issue because these verbs mutate state and the project convention prefers explicit refusal over hiding operator typos. The handlers should require exact arity per verb, with `create` still accepting optional values only through flags.

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/codex.md`.

### AUDIT-20260530-95 — [P7T7.2 codex] Group skill documentation still describes the superseded empty-members doctor rule and stale refusal text

Finding-ID: AUDIT-20260530-95 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
Status:     open
Severity:   low
Surface:    `plugins/deskwork/skills/group/SKILL.md:53`, `plugins/deskwork/skills/group/SKILL.md:58-66`

The skill header and workplan now define `members: []` as the canonical declared-empty group state, and the workplan renames Task 7.5.5 to `group-stale-empty-members`. But the group skill default section still says Doctor’s `group-empty-members-array` rule surfaces the “dual representation” for normalization. Its error catalog also says non-group `show` / `update` refusals use the old “entry has no members” / “non-empty members[]” wording, while the implementation now refuses on absence of the `members` field.

This is documentation drift on the operator-facing skill. The fix is to align the skill with the implemented semantics: `members: []` is not a normalization target, and non-group refusal text should mention “no `members` field” rather than “no members” or “non-empty members[]”.

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/codex.md`.

## 2026-05-31 — audit-barrage lift (20260531T061519667Z-graphical-entries)

### AUDIT-20260531-01 — Collapsed compact strip (`renderSwimCompact`) still drops unbucketed entries — the same count-vs-visible defect AUDIT-25 set out to close, on a third surface the fix didn't touch

Finding-ID: AUDIT-20260531-01 (claude-01 + claude-03 + codex-01 + codex-02; cross-model)
Status:     fixed-5cd5294
Severity:   medium
Surface:    `packages/studio/src/pages/dashboard/swimlane-card.ts:358-382` (`renderSwimCompact`), called unconditionally at `:476`

The fix updates the kanban grid (`renderSwimlane` → `renderUnbucketedStageCol`, `:427`) and the list-body (`renderListBody` → `renderUnbucketedListGroup`) so `bucket.unbucketed` renders. But `renderSwimCompact` — the per-stage compact strip emitted on every swim at `:476` and revealed by CSS when the lane is `.collapsed` (docstring `:48-50`) — was not updated. It iterates **only** `template.linearStages` + `template.offPipelineStages` (`:359-362`) and sums `bucket.byStage.get(stage)` per cell (`:370`). `bucket.unbucketed` is never read.

Consequence: for a lane with unbucketed entries in collapsed view, the swim-head `quick-meta` reads `${bucket.entryCount} entries` (which the docstring confirms folds unbucketed in), while the sum of the visible `.sc-count` cells is `entryCount − unbucketed.length`, and the unbucketed entries have **no** representation in the compact strip at all. This is the identical "count inflated while entries silently dropped" shape the HIGH AUDIT-20260530-25 finding named — the fix closed it on two of three surfaces and the `lane-data.ts` docstring's claim that "the swim-head count reconciles with the visible cards" is false on the collapsed compact view. The new test file does not exercise the compact strip, so the gap is unguarded. Fix: append an unbucketed compact cell in `renderSwimCompact` (e.g. when `bucket.unbucketed.length > 0`, emit a trailing `.sc-stage.is-unbucketed` cell with the `⊘` glyph and `bucket.unbucketed.length`), mirroring the two surfaces already fixed, and add a collapsed-view assertion to the test.

---

### AUDIT-20260531-02 — Count-consistency test asserts the count *text* and two slugs but never counts the rendered cards — it does not verify the reconciliation it claims

Finding-ID: AUDIT-20260531-02
Status:     fixed-f9b5888
Severity:   medium
Surface:    `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts:90-138` (the `count consistency` test)

The test's stated contract (header `:91-94`) is *"swim-head `${n} entries` matches the visible cards once unbucketed renders"* and the inline comment `:91-96` says the block *"must contain 3 row-shell / lb-row markers (1 template-bucketed + 2 unbucketed)."* But the assertions only check (a) the literal text `<span class="quick-meta">3 entries</span>` (`:126`), and (b) that the two unbucketed slugs and their raw stages appear (`:130-137`). Nothing counts the actual rendered `data-row-shell` / `.lb-row` elements. Per `.claude/rules/ui-verification.md` § "spec-compliance probes," this is exactly the trap where a probe verifies the mechanism it imagines rather than the contract it names: the `quick-meta` text is computed from `bucket.entryCount`, **independent** of how many cards render — so a regression where the template-bucketed `a-draft` card vanished (count still 3, only 2 cards visible) would pass this test green. The number "3" and "the cards actually present" are never compared.

Fix: assert the rendered card count directly — e.g. `(stageGrid.match(/data-row-shell/g) ?? []).length === 3` (or count `.lb-row` in the list body) — so the test fails if the visible-card count diverges from the displayed entry count. That is the falsifiable form of the reconciliation claim.

---

### AUDIT-20260531-03 — Checks that came back clean (recorded so the operator can see what was ruled out)

Finding-ID: AUDIT-20260531-03
Status:     acknowledged-clean-check
Severity:   informational
Surface:    (escaping, grid layout, class reuse, overflow affordance)

I checked four things that looked suspect from the diff and confirmed each is fine: (1) **Escaping** — `entry.currentStage` is a drift-controlled/unvalidated value now rendered into text and `data-*` attributes, but it flows through the project's `html` escaping tag (same path as every other row), so no XSS surface. (2) **Grid layout** — `.stage-grid` is `display:flex` with `.stage-col{flex:1 1 0}` (`dashboard-swimlane-shell.css:253-272`), so the appended unbucketed column flows naturally and needs no `stageCount` increment; the `${stageCount} stages` tag correctly excludes it. (3) **Class reuse** — the hand-rolled kanban row's `er-calendar-row`/`er-calendar-body`/`er-row-slug` classes are the dashboard's own row classes (`section.ts`, `affordances.ts`), not borrowed cross-surface. (4) **List overflow `⋮`** — the `data-lb-overflow` span is currently inert decoration (`swimlane-list-body.ts:78-85` confirms no verb wiring), so reusing it on the unbucketed row does not reintroduce the `verbsForStage`-throws hazard the kanban row deliberately avoids. Had any of these been live (unescaped stage, count-based grid template, a wired overflow dispatching verbs for the unknown stage) it would have been a high finding.

## 2026-05-31 — audit-barrage lift (20260531T071454028Z-graphical-entries)

### AUDIT-20260531-04 — Dead variable `swimCompactClose` in the new compact-strip test — computed then explicitly discarded

Finding-ID: AUDIT-20260531-04
Status:     fixed-fa2014f
Severity:   low
Surface:    `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` (the AUDIT-20260531-01 test, the `swimCompactClose` line + its `void swimCompactClose;`)

The new test computes `const swimCompactClose = editorialBlock.indexOf('</div>', swimCompactOpen);` and then never uses it — the actual end of the `.swim-compact` element is located by the hand-rolled depth-matching loop that advances `cursor`, and the slice uses `cursor`, not `swimCompactClose`. The author noticed the variable was unused and silenced the linter with `void swimCompactClose;` rather than deleting the line.

`indexOf('</div>', swimCompactOpen)` returns the position of the *first* nested `</div>` (the close of the first inner `.sc-stage`), which is not the boundary of the compact strip at all — so the value is not only unused but semantically misleading if a future editor mistakes it for "the close of swim-compact." Per the project's hygiene guidance (no dead code, names that reveal intent), delete both the declaration and the `void` discard. The depth-matching loop is the sole, correct mechanism for finding the boundary; the leftover line is scaffolding that should not have survived to commit.

---

### AUDIT-20260531-05 — Compact-strip test asserts DOM presence but never exercises the collapsed state its name claims — CSS reveal path is unverified

Finding-ID: AUDIT-20260531-05
Status:     fixed-168af95
Severity:   informational
Surface:    `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` (`renders unbucketed compact cell in swim compact strip when lane is collapsed (AUDIT-20260531-01)`); CSS at `plugins/deskwork-studio/public/css/dashboard-swimlane-shell.css:197-206`

The test name and comments say the cell renders "when lane is collapsed," but the test is a server-render integration test that only asserts the cell is present in the emitted HTML. `.swim-compact` is **always** server-rendered for every swim — it is `display: none` by default (`:197-202`) and revealed only by the CSS rule `.swim.collapsed .swim-compact { display: flex }` (`:204-206`). The test never sets the lane to `.collapsed`, never toggles the client-side collapse handler, and cannot observe CSS visibility from a string-match assertion. So the assertions prove "the server now emits the `is-unbucketed` `.sc-stage` cell into the compact strip" — which is the real fix — but not "the cell is visible in collapsed view."

This is acceptable for an HTML-presence test, but per `.claude/rules/ui-verification.md` the collapsed-view *visibility* (the CSS-gated reveal, the equal-flex distribution of the now-9th cell, the `align-items: stretch` row height when the longer `(unrecognized stage)` label wraps) is the kind of claim that rule asks to verify by actually toggling collapse in a browser at a real viewport. The operator should know the DOM is covered and the CSS-reveal path is not. A precise test name (`…emits unbucketed cell into the compact strip`) plus a one-line note that collapse visibility is CSS-only and unverified by this test would make the scope auditable.

---

### AUDIT-20260531-06 — New `.sc-stage.is-unbucketed` compact cell has no dedicated CSS and a label far longer than real stage names — only the inline glyph distinguishes it

Finding-ID: AUDIT-20260531-06
Status:     fixed-b0da816
Severity:   informational
Surface:    `packages/studio/src/pages/dashboard/swimlane-unbucketed.ts:135-139` (`renderUnbucketedCompactCell`); CSS at `dashboard-swimlane-shell.css:208-246`

The docstring (`swimlane-unbucketed.ts:113-117`) claims the existing flex layout "handles the trailing cell with no template changes" — verified true: `.swim-compact` is `display: flex` and `.sc-stage { flex: 1 }` (`css:208-209`), so the appended cell flows and the `:last-child` border rule (`:217-219`) correctly moves to the new last cell. No layout defect.

Two consistency gaps worth the operator's eye, neither a bug: (1) there is **no** `.swim-compact .sc-stage.is-unbucketed` rule — the cell inherits generic `.sc-stage` styling, so unlike the kanban tail (`.stage-col.is-unbucketed`, which carries distinct chrome) the *only* signal that this cell is the routing-drift bucket is the `⊘ (unrecognized stage)` text in `.sc-name`. The regular compact cells render their glyphless stage name; this cell inlines `⊘` directly into `.sc-name` rather than in a separate `aria-hidden` glyph span the way the kanban (`:102`) and list (`:181`) tails do, so a screen reader will voice the raw `⊘`. (2) `.sc-name` (`:221-227`) has `text-transform: uppercase` + `0.14em` letter-spacing and no `white-space: nowrap`/`text-overflow`; "(UNRECOGNIZED STAGE)" is much wider than a one-word stage name, so in the editorial lane's ~9 equal-flex cells it will wrap to multiple lines (tolerable because `align-items: stretch` levels the row). If visual parity with the other two unbucketed surfaces matters, add a scoped `.swim-compact .sc-stage.is-unbucketed` rule and move the glyph into an `aria-hidden` span to match the kanban/list precedent the docstring says it mirrors.

---

I walked the production change (`renderSwimCompact` + `renderUnbucketedCompactCell`), the reconciliation invariant, escaping, the CSS layout, and the strengthened count-consistency test. The core fix is **correct**: the compact cell is count-only (the right shape for a summary strip), the `data-row-shell` counts the strengthened test relies on are genuinely emitted by both the kanban (`swimlane-unbucketed.ts:58`) and list (`:163`) unbucketed rows, the empty-input guard returns `unsafe('')` so callers append unconditionally, no `currentStage` value reaches the compact cell so there's no new escaping surface, and the `.swim-compact` flex layout absorbs the trailing cell as the docstring claims. The three findings above are hygiene/informational, not correctness defects.
