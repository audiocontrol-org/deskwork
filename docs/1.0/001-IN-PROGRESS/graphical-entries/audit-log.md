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
Status:     open
Severity:   blocking
Surface:    packages/studio build

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
Status:     open
Severity:   high
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane.ts

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
Status:     open
Severity:   high
Surface:    dashboard lane visibility UI

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
Status:     open
Severity:   medium
Surface:    packages/studio/src/pages/dashboard/swimlane-shell.ts

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

