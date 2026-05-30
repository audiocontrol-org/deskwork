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
Status:     open
Severity:   medium
Surface:    `packages/studio/src/pages/entry-review/members-section.ts:99-150` (`bucketMembersByLane`), `packages/studio/src/pages/entry-review/data.ts:188-210` (`loadGroupMembersBundle`)

AUDIT-35 acknowledged composed view silently drops members with `lane === undefined` or a lane absent from `laneConfigsById`. Two additional silent-drop vectors are NOT covered:

1. In `bucketMembersByLane`, a member is bucketed under `stageMap.get(member.currentStage)`, but the emitted `byStage` only walks `template.linearStages + template.offPipelineStages`. Any member whose `currentStage` is not in its lane's template (a legacy stage, or a custom-template omission) is pushed into `stageMap` but never read back — it vanishes from composed view AND from `memberCount`, so the swim-head count is wrong with no "missing" indicator. The same member renders fine in list view, producing an invisible composed↔list discrepancy distinct from AUDIT-35.

2. In `loadGroupMembersBundle`, the load order is `laneConfigsById.set(strict.id, strict)` BEFORE `loadPipelineTemplate(...)`. If the template load throws, the `catch { continue }` fires — but the lane config is already in `laneConfigsById` while its template is absent from `templatesById`. Back in `bucketMembersByLane`, members of that lane pass the `laneConfigsById.has(member.lane)` guard, get bucketed, then hit `const template = templatesById.get(...); if (template === undefined) continue;` — dropping EVERY member of that lane from composed view, silently, and invisible in list view.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (claude). Fix path: (a) only `laneConfigsById.set` after the template successfully resolves (move the set inside the try, below the template load); (b) in `bucketMembersByLane`, emit an "unbucketed members" tail (mirroring list view's unrouted styling) so stage/template mismatches surface rather than disappear.

### AUDIT-20260529-38 — member card + list-row lane-accent CSS keys on `data-template-id` attribute the markup never emits

Finding-ID: AUDIT-20260529-38 (cross-model: AUDIT-BARRAGE-claude-03)
Status:     open
Severity:   medium
Surface:    `plugins/deskwork-studio/public/css/entry-review-members.css:262-265,318-321`, `packages/studio/src/pages/entry-review/members-section.ts:152-167` (`renderMemberStageCard`), `:200-235` (`renderListRow`)

AUDIT-29 structural-decision #5 claimed: "The composed view's `data-template-id` attribute drives the lane-accent color via CSS — no per-lane `class="lane-<id>"` coupling for non-default templates. This avoids the 'we forgot to teach the CSS about lane X' failure mode."

The claim holds only for the swim HEAD (`.er-members-swim` carries `data-template-id`, and CSS at entry-review-members.css:218-241 keys on it). It is FALSE for the cards and list rows. `renderMemberStageCard` emits `<a class="er-members-card lane-${member.lane ?? 'default'}">` with NO `data-template-id`, and `renderListRow` emits `<li class="er-member-row lane-<id>">` likewise with no `data-template-id`. Yet the CSS includes `.er-members-card[data-template-id="editorial"]` (line 263) and `.er-member-row[data-template-id="editorial"]` (line 319) — dead selectors that NEVER match.

Functional consequence: a lane using the `editorial` template but whose id is NOT the literal `default` (e.g. an `essays` or `articles` lane) gets a proof-blue swim head but FADED cards and list rows, because the only card/row accent rules that fire are the hardcoded `.lane-default` / `.lane-mockups` literals. The accent is inconsistent within a single swim block, and the exact "forgot to teach CSS about lane X" failure mode #5 said it avoided is reintroduced one level down.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (claude). Fix path: emit `data-template-id="${bucket.template.id}"` on the card `<a>` and the list `<li>` (the data is already in scope via the bucket/template), so the template-keyed accent rules actually drive the color; the literal `.lane-<id>` rules can be retired.

### AUDIT-20260529-39 — corrupt member sidecars misreported as missing (silent fallback violation)

Finding-ID: AUDIT-20260529-39 (cross-model: AUDIT-BARRAGE-codex-01)
Status:     open
Severity:   medium
Surface:    `packages/studio/src/pages/entry-review/data.ts:176-183` (`loadGroupMembersBundle`)

`loadGroupMembersBundle` catches every `readSidecar` failure and records the UUID as missing. That conflates a genuinely absent sidecar with schema parse failures, permission errors, malformed JSON, or other storage bugs. The result is an inline "missing" row instead of an explicit render/load failure, which violates the project's "no silent fallbacks" discipline (`.claude/CLAUDE.md` § "Error Handling") and can hide data corruption from the operator.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (codex). Fix path: distinguish not-found errors from other `readSidecar` failures. Only absent sidecars should enter `missingMemberUuids`; validation, parse, and I/O failures should propagate with an actionable message (either throwing or surfacing as a distinct "corrupt" row class so the operator can distinguish the two states).

### AUDIT-20260529-40 — missing-member rows lose declared insertion order (list-mode contract violation)

Finding-ID: AUDIT-20260529-40 (cross-model: AUDIT-BARRAGE-codex-02)
Status:     open
Severity:   medium
Surface:    `packages/studio/src/pages/entry-review/data.ts:176-183`, `packages/studio/src/pages/entry-review/members-section.ts:263-271` (`renderListBody`)

The loader splits resolved members and missing UUIDs into separate arrays; `renderListBody` renders all resolved rows BEFORE all missing rows. A group declared as `[missing-a, real-b, missing-c]` displays as `[real-b, missing-a, missing-c]`, even though the brief's acceptance criterion says list mode preserves `group.members[]` insertion order.

This matters because the group membership list is operator-authored ordering — the operator's expectation is that members render in the order they added them, regardless of resolution state.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (codex). Fix path: introduce an ordered member-item structure that carries either `{kind: "resolved", entry}` or `{kind: "missing", uuid}` per original UUID position; `renderListBody` walks that sequence directly so insertion order is preserved end-to-end.

### AUDIT-20260529-41 — popover left margin (22px) misaligned with WCAG-widened tab (24px) — off-by-2px drift

Finding-ID: AUDIT-20260529-41 (cross-model: AUDIT-BARRAGE-claude-04)
Status:     open
Severity:   low
Surface:    `plugins/deskwork-studio/public/css/dashboard-row-affordances.css:349` (`.er-row-member-popover { margin: 0 0 0 22px }`) vs `:250` (`.er-row-member-tab { width: 24px }`) and `:320` (`.has-member-tab .er-row-fg { padding-left: 28px }`)

AUDIT-31 widened `.er-row-member-tab` from 22px to 24px and bumped `.er-row-shell.has-member-tab .er-row-fg` padding-left from 26px to 28px to keep the foreground clear of the tab. The popover's left offset was NOT updated in lockstep: `.er-row-member-popover` still has `margin: 0 0 0 22px`. The popover now starts 2px inside the 24px tab column rather than flush with the row foreground, producing a small but visible left-edge misalignment.

The cross-rule drift the WCAG-fix commit introduced by touching the tab width without sweeping the dependent offsets. The 22/24/28 magic numbers should be derived from a single `--er-member-tab-width` token to prevent this class of regression.

Note: somewhat MOOT until AUDIT-20260529-36 is fixed, since the popover currently renders unconditionally — the misalignment is hidden behind the always-visible popover bug.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (claude). Fix path: align popover left margin with the tab column (24px) or the foreground inset (28px), and extract `--er-member-tab-width` as a token.

### AUDIT-20260529-42 — `initGroupMembersSection` wire helpers re-attach listeners on every call (docstring lies)

Finding-ID: AUDIT-20260529-42 (cross-model: AUDIT-BARRAGE-claude-05)
Status:     open
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/entry-review/group-members-section.ts:104-150` (`initGroupMembersSection`, `wireToggle`, `wireEmptyStateCta`, `wireMemberRowCopy`)

The `initGroupMembersSection` docblock states "Idempotent — calling twice has no visible effect." That is true for `applyMode` (it reads current state) but NOT for the three `wire*` helpers: `wireToggle`, `wireEmptyStateCta`, and `wireMemberRowCopy` each call `addEventListener` unconditionally on every invocation. There is no module-level `wired` guard analogous to the one in the sibling `row-member-tab.ts` (which correctly guards with `let wired = false`).

If `initPressCheckSurface` ever runs twice (re-init after a partial DOM swap, or a future refresh path), the section accumulates duplicate listeners — clicking a member row would fire `copyOrShowFallback` twice (two clipboard writes + two toasts), and the toggle would double-write localStorage.

LOW severity because the current single call site doesn't trigger it, but the docstring asserts a property the code doesn't have.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (claude). Fix path: mirror the `row-member-tab.ts` pattern with a module-level `wired = false` guard, OR bind via a `dataset` sentinel on the section element so re-init is a genuine no-op.
