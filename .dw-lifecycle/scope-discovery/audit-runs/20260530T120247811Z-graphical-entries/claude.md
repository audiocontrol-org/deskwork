I walked the Phase 6 Task 6.3/6.4 diff with focus on the data-layer IO cost, the server-render robustness asymmetry between the two pages, silent-skip fallbacks, client/server state-sync, and XSS coverage. Findings below.

### Pipelines data layer re-reads + re-parses every lane file once per template (O(templates × lanes) redundant IO)

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   high
Surface:    `packages/studio/src/pages/pipelines/data.ts` — `loadPipelinesPageData` (loop), `findReferencingLanes`, `readLanePipelineTemplate`

`loadPipelinesPageData` loops over every enumerated template id and calls `findReferencingLanes(projectRoot, id, laneIds)` inside the loop. `findReferencingLanes` walks **all** lane ids and calls `readLanePipelineTemplate` for each — which does `existsSync` + `readFileSync` + `JSON.parse` on the lane's JSON every time. So for N templates and M lanes, the page performs N×M file reads and N×M `JSON.parse` calls, re-reading and re-parsing the *same* M lane files once per template. With the 5 shipped presets plus overrides and a non-trivial lane count this is hundreds-to-thousands of synchronous reads on the cold-path render, all redundant.

The audit scope explicitly names "page-render performance on large lane/pipeline lists." This is the concrete offender. The fix is a single pass: read each lane's `pipelineTemplate` once into a `Map<laneId, templateId>` (or `Map<templateId, laneId[]>`) before the template loop, then index into it per template — turning N×M disk reads into M. The current shape also blocks the event loop with synchronous `readFileSync` repeated across the same files.

### `/dev/lanes` hard-fails the entire page on one malformed lane config, where `/dev/pipelines` degrades gracefully

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    `packages/studio/src/pages/lanes/data.ts` — `loadLanesPageData` loop (`loadLaneConfig(id, projectRoot)` with no try/catch); `packages/studio/src/server.ts:/dev/lanes` route

`loadLanesPageData` calls `loadLaneConfig(id, projectRoot)` directly in its loop with no error handling; the docstring even states "Throws if any lane config is malformed." The route handler is `async (c) => c.html(await renderLanesPage(ctx))` with no catch, so a single corrupt/invalid lane JSON makes the **whole** `/dev/lanes` page throw (500) — the operator can't see *any* lane, including the healthy ones, and can't use the page to triage the broken one.

This is the exact opposite of the deliberate design on the sibling pipelines page, which surfaces malformed templates as inline error rows + a banner ("this id exists but won't load — fix it") specifically so one bad file doesn't blind the operator. The two pages were built in the same task pair and should share that robustness posture. The lanes page should collect per-lane load failures into an error-row list (mirroring `PipelineErrorRow`) instead of letting the first throw kill the render. This interacts with the still-open AUDIT-07 charset gap in `loadLaneConfig`: any lane whose stored id/path the loader rejects becomes a total-page outage here.

### Corrupt/unreadable lane JSON is silently dropped from `referencingLanes`, so the pipelines Delete gate can under-count dependents

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   medium
Surface:    `packages/studio/src/pages/pipelines/data.ts` — `readLanePipelineTemplate` (returns `null` on `readFile`/`JSON.parse` failure), `findReferencingLanes`, consumed by `renderDeleteButton` in `pipelines/table.ts`

`readLanePipelineTemplate` returns `null` whenever the lane file is missing, unreadable, unparseable, or the `pipelineTemplate` field isn't a string — and `findReferencingLanes` treats `null` as "no reference here." Consequence: a lane whose JSON is corrupt but which *does* reference template X is silently excluded from X's `referencingLanes`. The pipelines table then renders an **active** Delete button for X (`renderDeleteButton` gates the disabled variant on `referencingLanes.length > 0`), telling the operator X is safe to delete when a real (if broken) dependent still points at it.

This is the same silent-skip class flagged repeatedly on this feature (AUDIT-15 lane-migration, AUDIT-23 cascade catch) — a `catch { return null }` that converts "I couldn't read this" into "this doesn't reference anything," which is a fallback that hides a failure mode per the project's no-silent-fallback rule. The comment claims "the lanes page surfaces the lane-side defect," but the Delete-gate decision is made here on incomplete data regardless of what the other page shows. Fix: distinguish missing (ENOENT → genuinely no reference) from parse/read failure, and either count the unreadable lane as an unknown-dependent (so the gate stays conservative) or surface it explicitly.

### Lanes page never emits `data-project-key`, so archived-section persistence is not project-scoped despite the docstring — and the test masks the gap

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   medium
Surface:    `packages/studio/src/pages/lanes.ts` (`<main ... data-lanes-container>`); `plugins/deskwork-studio/public/src/lanes/lanes-page.ts` — `archivedOpenKey`/`initArchivedSection` via `resolveProjectKey(container)`; `packages/studio/test/lanes/lanes-page-client.test.ts` (`container.dataset.projectKey = 'test-proj'`)

`initArchivedSection` builds its localStorage key from `resolveProjectKey(container)`, and the docstring claims the open state is "Namespaces by project key … so two operators sharing a machine but working on different projects don't see each other's collapse state." But the server-rendered lanes container (`<main class="er-container lanes-container" data-lanes-container>`) carries **no** `data-project-key` attribute. The two client tests that exercise persistence set `container.dataset.projectKey = 'test-proj'` by hand before calling `initLanesPage`, then assert the key `deskwork:lanes:test-proj:archived-open` — i.e. they inject the attribute the real page never emits, so the project-scoping promise is asserted against a fixture the server doesn't produce.

On the real page, `resolveProjectKey` will fall back to whatever its no-attribute default is, so every project on the machine shares one archived-open key — the exact cross-project bleed the docstring says it prevents. This is a client/server contract gap papered over by a test that builds the missing attribute itself (the TDD-blind-spot pattern). Fix: emit `data-project-key` on the lanes container the same way the dashboard does, and add an integration assertion against the server-rendered markup (not a hand-built fixture) that the attribute is present.

### Edit-form diff-emit trims the live value but not `data-current`, producing a spurious `--flag` when the stored value has surrounding whitespace

Finding-ID: AUDIT-BARRAGE-claude-05
Status:     open
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/lanes/lanes-page.ts` — `readFieldValue` (`el?.value.trim()`), `readFieldCurrent` (`el?.dataset.current` — untrimmed), `buildUpdateCommand`

`readFieldValue` trims the live input value; `readFieldCurrent` reads `dataset.current` raw. `buildUpdateCommand` then emits a flag when `values.x !== values.xCurrent && values.x.length > 0`. If the persisted `data-current` for a field carries leading/trailing whitespace (most plausibly `contentDir`), the untouched form compares trimmed-live (`"docs"`) against untrimmed-current (`" docs "`), they differ, and the builder emits `--content-dir "docs"` even though the operator changed nothing — silently "normalizing" the value via a command the operator didn't intend to scope.

Low severity because lane names/dirs rarely carry surrounding whitespace, but the asymmetry is a latent correctness bug in the very diff-emit logic AUDIT-61 was added to make consistent. Fix: trim both sides (or neither) so the comparison is apples-to-apples; if normalization-on-save is desired it should be explicit, not a side effect of one side being trimmed.

### No XSS regression test feeds an operator-controlled name/contentDir through the server render — the stated audit focus is entirely uncovered

Finding-ID: AUDIT-BARRAGE-claude-06
Status:     open
Severity:   low
Surface:    `packages/studio/src/pages/lanes/edit-form.ts` (`value="${row.name}"`, `data-current="${row.name}"`, `data-current="${row.contentDir}"`); `packages/studio/src/pages/pipelines/view-panel.ts`/`table.ts`; `packages/studio/test/lanes/*` + `test/pipelines/*`

Lane `name`/`contentDir` and pipeline `name`/`description` are the only genuinely free-text operator-controlled values reaching markup, and several land in *double-quoted attribute context* (`value="${row.name}"`, `data-current="${row.name}"`). The feature's entire XSS safety therefore rests on the `html` tagged template escaping `"` (and `<`/`>`/`&`) in attribute context — but `html.ts` is not in this diff, and **none** of the four new test files exercises it: every assertion uses benign ids/names like `editorial`, `docs`, `mockups`. The audit scope explicitly names "XSS via lane/pipeline name in rendered markup" and "clipboard-builder XSS," yet there is zero coverage feeding e.g. a lane named `"><img src=x onerror=alert(1)>` through `renderLanesPage`/`renderPipelinesPage` and asserting the payload is escaped.

This is a coverage gap, not a confirmed vuln — but for the one threat the audit centers on, the suite proves only that well-behaved input renders correctly. Add an integration test that writes a lane/template whose name + contentDir contain `"`, `<`, `>`, and `onerror=` and asserts the rendered HTML contains the escaped forms (and that the `data-current`/`value` attributes can't be broken out of). That test also pins the `html.ts` contract this feature silently depends on.

### View and Edit panels are rendered in full (5 sub-forms + stage chips/checkboxes) for every pipeline row even though every panel ships hidden

Finding-ID: AUDIT-BARRAGE-claude-07
Status:     open
Severity:   low
Surface:    `packages/studio/src/pages/pipelines/table.ts` — `renderHealthyRow` (always emits `renderViewPanel(row)` + `renderEditForm(row, …)`); `edit-form.ts`, `view-panel.ts`

Every healthy template row eagerly server-renders both a full View panel (stage-flow chips for all linear + off-pipeline stages) and a full Edit panel (five `<details>` sub-forms, including a checkbox per `linearStage` in the set-locked op), all emitted with `hidden` and only revealed client-side. Page weight scales as template_count × (5 sub-forms + per-stage controls), so a project with many overrides pays the full DOM cost up front for panels the operator may never open. Combined with finding -01's redundant lane IO, the pipelines page render cost grows multiplicatively on exactly the "large list" case the audit scope calls out.

Low severity (correctness is fine; this is render-weight), but worth noting because the structure forecloses the cheap mitigation. If/when this bites, the panels are good candidates for lazy hydration (render the row, build the panel on first toggle) — the client controller already owns the toggle path, so the panel HTML doesn't need to exist until first open.

### `classifyLoadError` substring matching can misclassify a Zod message as `missing`

Finding-ID: AUDIT-BARRAGE-claude-08
Status:     open
Severity:   informational
Surface:    `packages/studio/src/pages/pipelines/data.ts` — `classifyLoadError`

`classifyLoadError` branches on `message.includes('not found') || message.includes('not valid JSON')` and, inside that branch, returns `'missing'` for anything not containing `'not valid JSON'`. Any loader error whose message merely *contains* the substring `not found` — including a future Zod or id-mismatch message phrased that way — is then mislabeled `missing` ("File not found"), which is the one kind the comment itself says "should not happen for ids returned by the enumerator." The verbatim `message` is preserved and shown, so the operator still sees the truth; only the one-line `kind` hint can be wrong.

Informational because the impact is a cosmetically-wrong category label, and the code comment already flags the coupling to the loader's exact strings. If the kind label is to be relied on (e.g. for differential UI), classification should key off a structured discriminant from the loader (an error subclass or code) rather than English substrings.
