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
Status:     open
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
Status:     open
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
Status:     open
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
Status:     open
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
Status:     open
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
Status:     open
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
Status:     open
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
Status:     open
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
Status:     open
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
Status:     open
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
Status:     open
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
Status:     open
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
Status:     open
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
Status:     open
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
Status:     open
Severity:   informational
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-drag.ts

`swimlane-drag.ts` post-followup is 396 lines (was 365 pre-followup).
Approaching the 500-line cap. The recent additions (orderEquals,
stale-class sweep, CSS.escape, comments) consumed ~30 lines. Future
Phase 5 expansions (e.g., touch-drag via Pointer Events, or
animation polish) would push past the cap.

Trajectory note alongside AUDIT-14 / -20 / -26.
