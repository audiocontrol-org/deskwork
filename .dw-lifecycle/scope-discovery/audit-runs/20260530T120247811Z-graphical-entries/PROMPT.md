# Audit-barrage — multi-model audit prompt template

You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface bugs, design issues, missed edge cases, and code-quality concerns in the work product captured in the diff below.

You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.

## Feature under audit

graphical-entries

## Feature scope (workplan / PRD summary)

Phase 6 Tasks 6.3 + 6.4 of graphical-entries: studio lane-management + pipeline-editor pages. Task 6.3 ships /dev/lanes — server-rendered HTML page listing every lane (id / name / template / contentDir / archived status); per-lane row affordances clipboard-copy the relevant /deskwork:lane verb; clipboard-builder client TS. 30 tests + 7 quality polish. Task 6.4 ships /dev/pipelines — similar shape for pipelines (list + per-pipeline editor showing linearStages / lockedStages / offPipelineStages); Phase-2 follow-up error rows for invalid templates; 70 tests + 7 quality polish + 6 audit followups. Audit focus: server-rendered HTML correctness across all 5 templates + 0..N lanes; XSS via lane/pipeline name in rendered markup; clipboard-builder XSS; client-server state sync; accessibility (heading hierarchy, link semantics); page-render performance on large lane/pipeline lists.

## Commit subjects in the audited range

627721f feat(graphical-entries): Phase 6 Task 6.4 — studio pipeline-editor page
0b41159 docs(graphical-entries): Phase 6 Task 6.3 — workplan boxes + audit-log
b53bc3c fix(graphical-entries): Phase 6 Task 6.3 review followups (7 non-blocking)
84a1c82 feat(graphical-entries): Phase 6 Task 6.3 — studio lane-management page


## Recent audit-log excerpt (prior findings on this feature)

Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.


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

## Diff under audit

The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).

diff --git a/.dw-lifecycle/scope-discovery/clones.yaml b/.dw-lifecycle/scope-discovery/clones.yaml
index e18ce68..9d01797 100644
--- a/.dw-lifecycle/scope-discovery/clones.yaml
+++ b/.dw-lifecycle/scope-discovery/clones.yaml
@@ -1,4 +1,4 @@
-generated_at: 2026-05-29T00:02:23.242Z
+generated_at: 2026-05-29T01:51:21.646Z
 clones:
   - id: 014b49040fe1
     lines: 13
@@ -325,14 +325,14 @@ clones:
     lines: 9
     members:
       - packages/core/src/lanes/loader.ts:120:128
-      - packages/core/src/pipelines/loader.ts:163:171
+      - packages/core/src/pipelines/loader.ts:183:191
     disposition: keep-with-reason
     reason: "lanes/loader mirrors pipelines/loader by workplan design: JSON-read+Zod-validate+id-match-filename idiom across two parallel module-shaped readers; extracting a shared helper would couple lane evolution to pipeline evolution"
   - id: b223f2def90d
     lines: 7
     members:
       - packages/core/src/lanes/loader.ts:130:136
-      - packages/core/src/pipelines/loader.ts:173:179
+      - packages/core/src/pipelines/loader.ts:193:199
     disposition: keep-with-reason
     reason: second half of the lanes/loader vs pipelines/loader mirroring (Zod-validate + id-mismatch refusal); same rationale as c20b4e4f0469
   - id: 93e1ae2c9a27
@@ -345,8 +345,8 @@ clones:
   - id: b1fd648407e9
     lines: 10
     members:
-      - packages/core/src/pipelines/operations/update.ts:284:293
-      - packages/core/src/pipelines/operations/update.ts:307:316
+      - packages/core/src/pipelines/operations/update.ts:301:310
+      - packages/core/src/pipelines/operations/update.ts:324:333
     disposition: keep-with-reason
     reason: "Phase 6 Task 6.2: in-file similarity between applySetLocked and applySetOffPipeline — both validate each comma-separated stage against linearStages with mirror invariants. Collapsing into a shared helper would obscure the asymmetry (set-locked enforces subset, set-off-pipeline enforces disjoint) that matters at the error-message level."
   - id: 68e3966349bd
@@ -440,6 +440,14 @@ clones:
       - packages/studio/src/pages/content.ts:347:352
     disposition: pending
     reason: null
+  - id: 6cdca5bc1a40
+    lines: 7
+    members:
+      - packages/studio/src/pages/dashboard.ts:37:43
+      - packages/studio/src/pages/lanes.ts:36:42
+      - packages/studio/src/pages/pipelines.ts:40:47
+    disposition: keep-with-reason
+    reason: shared page-renderer imports (StudioContext, html, layout, masthead) are foundational and re-exporting would add indirection without savings
   - id: a1cac4b2512f
     lines: 15
     members:
@@ -550,36 +558,36 @@ clones:
   - id: d6093f110268
     lines: 10
     members:
-      - packages/studio/src/server.ts:386:395
-      - packages/studio/src/server.ts:395:404
+      - packages/studio/src/server.ts:406:415
+      - packages/studio/src/server.ts:415:424
     disposition: pending
     reason: null
   - id: 14579dae3bdf
     lines: 20
     members:
-      - plugins/deskwork-studio/public/src/editorial-studio-client.ts:113:125
-      - plugins/deskwork-studio/public/src/editorial-studio-client.ts:145:164
+      - plugins/deskwork-studio/public/src/editorial-studio-client.ts:115:127
+      - plugins/deskwork-studio/public/src/editorial-studio-client.ts:147:166
     disposition: pending
     reason: null
   - id: 8a46fe453209
     lines: 17
     members:
-      - plugins/deskwork-studio/public/src/editorial-studio-client.ts:114:125
-      - plugins/deskwork-studio/public/src/editorial-studio-client.ts:478:494
+      - plugins/deskwork-studio/public/src/editorial-studio-client.ts:116:127
+      - plugins/deskwork-studio/public/src/editorial-studio-client.ts:480:496
     disposition: pending
     reason: null
   - id: 82d6dc44c67e
     lines: 11
     members:
-      - plugins/deskwork-studio/public/src/editorial-studio-client.ts:115:125
-      - plugins/deskwork-studio/public/src/editorial-studio-client.ts:199:209
+      - plugins/deskwork-studio/public/src/editorial-studio-client.ts:117:127
+      - plugins/deskwork-studio/public/src/editorial-studio-client.ts:201:211
     disposition: pending
     reason: null
   - id: f0e04e87d0e2
     lines: 7
     members:
-      - plugins/deskwork-studio/public/src/editorial-studio-client.ts:166:172
-      - plugins/deskwork-studio/public/src/editorial-studio-client.ts:87:93
+      - plugins/deskwork-studio/public/src/editorial-studio-client.ts:168:174
+      - plugins/deskwork-studio/public/src/editorial-studio-client.ts:89:95
     disposition: pending
     reason: null
   - id: 7c1800068cfe
diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
index a99ea72..d51afb9 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
@@ -1651,3 +1651,154 @@ deliberate orchestrator choice.
 - Pre-existing CLI test failures (`publish-entry-centric:139`, `approve-entry-centric:129`) remain pre-existing — zero diff in `ae0549d` or `0a9ca59`.
 - AUDIT-49 + AUDIT-50 + AUDIT-51 (all BLOCKING) were the highest-value findings. AUDIT-49 was a real "pipeline list permanently breaks after rename" data-integrity bug; AUDIT-50 was a path-traversal regression of the Task 6.1 hardening; AUDIT-51 compounded the orphan-sidecar problem with AUDIT-49. All three closed before merge.
 - Quality-review pushback (REJECTED verdict) validated the value of the review pass — three production-quality bugs caught at review time rather than post-release.
+
+## Phase 6 Task 6.3 — Studio lane-management page — review cycle (2026-05-28)
+
+Task 6.3 shipped at `0f9fc65` (feat) + `92267b2` (review followups). Spec
+review came back SPEC-COMPLIANT WITH NON-BLOCKING OBSERVATIONS (32
+positive/audit-trail observations, no findings to act on). Quality review
+came back QUALITY-APPROVED WITH NON-BLOCKING OBSERVATIONS (9 findings + 4
+observations); orchestrator triaged: applied 7 NON-BLOCKING, accepted 6
+observations.
+
+### AUDIT-20260528-61 — Edit-form blank-clear asymmetry
+
+Finding-ID: AUDIT-20260528-61
+Status:     fixed-92267b2
+Severity:   non-blocking (UX consistency)
+Surface:    `plugins/deskwork-studio/public/src/lanes/lanes-page.ts:77-85`
+
+The diff-emit logic emitted `--name ""` when the operator cleared the
+name field but silently dropped `--template`/`--content-dir` when those
+were cleared. Inconsistent — and the CLI's interpretation of `--name ""`
+is unclear (set to empty vs reset to id?).
+
+Fix: added the `length > 0` guard for `name` to match the symmetry.
+Cleared fields are NOT emitted as flags; convention documented at the
+top of the diff-emit function.
+
+### AUDIT-20260528-62 — Slash-command builder quoting asymmetry
+
+Finding-ID: AUDIT-20260528-62
+Status:     fixed-92267b2
+Severity:   non-blocking (paste-into-shell risk)
+Surface:    `plugins/deskwork-studio/public/src/lanes/lanes-page.ts:68,78,81,84`
+
+`name` was wrapped with `JSON.stringify` while `template` and
+`contentDir` were interpolated raw. If an operator pasted the output
+into a shell instead of Claude Code, raw interpolation is a
+shell-injection surface; even within Claude Code, values with spaces
+parse incorrectly.
+
+Fix: extracted `quoteValue(s: string): string` helper using
+`JSON.stringify` (handles double-quotes, backslashes, control chars).
+Applied uniformly to `name`, `template`, `contentDir`, and `id`.
+Existing clipboard-content test updated to assert all values are
+quoted.
+
+### AUDIT-20260528-63 — Single-open accordion for Edit forms
+
+Finding-ID: AUDIT-20260528-63
+Status:     fixed-92267b2
+Severity:   non-blocking (UX bounded-state)
+Surface:    `plugins/deskwork-studio/public/src/lanes/lanes-page.ts:196-231`
+
+Opening Edit on multiple rows left them all open simultaneously. For
+50 lanes the operator could pile up 50 visible forms.
+
+Fix: tracks the currently-open row via module-level `openLaneId`. On
+Edit click: if a different row is open, close it; then toggle the
+clicked row. Test verifies the close-sibling behavior.
+
+### AUDIT-20260528-64 — Reorder handle passive icon
+
+Finding-ID: AUDIT-20260528-64
+Status:     fixed-92267b2
+Severity:   non-blocking (affordance-placement)
+Surface:    `packages/studio/src/pages/lanes/table.ts:75-79`,
+            `plugins/deskwork-studio/public/css/lanes-page.css:383-389`
+
+The handle had `cursor: grab` and `⋮⋮` glyph — every visual signal said
+draggable. But the column is inert (dashboard rail per Phase 5 Task 5.4
+is the canonical reorder surface). Operator who tries to drag gets
+nothing — affordance mismatch.
+
+Fix: glyph reduced to single `⋮`; cursor changed to `cursor: help`;
+title clarifies "Reorder via the dashboard lane rail." aria-hidden
+remains true (decorative for AT).
+
+### AUDIT-20260528-65 — Archived-section open state persistence
+
+Finding-ID: AUDIT-20260528-65
+Status:     fixed-92267b2
+Severity:   non-blocking (UX continuity)
+Surface:    `packages/studio/src/pages/lanes/archived-section.ts:48-67`,
+            `plugins/deskwork-studio/public/src/lanes/lanes-page.ts`
+
+The archived section's `<details>` open state reset on every page
+reload — friction for an operator triaging archived lanes.
+
+Fix: client-side `toggle` event listener writes the open state to
+`deskwork:lanes:<projectKey>:archived-open` localStorage. On init,
+state is read and applied. Mirrors Phase 5 swimlane-collapse pattern.
+
+### AUDIT-20260528-66 — Purge button discoverability gap
+
+Finding-ID: AUDIT-20260528-66
+Status:     fixed-92267b2
+Severity:   non-blocking (UX gate visibility)
+Surface:    `packages/studio/src/pages/lanes/table.ts:63-70`
+
+When `row.archived && row.entryCount > 0`, no Purge button rendered —
+but no other affordance suggested the next-step workflow ("move entries
+first"). Operator stalled.
+
+Fix: renders a DISABLED-LOOKING Purge button with title naming the
+prerequisite ("Cannot purge: N entries still reference this lane. Move
+them to another lane first via the per-entry surface."). Gate is now
+visible; next step is discoverable. Test asserts the disabled button
+appears.
+
+### AUDIT-20260528-67 — Empty-state CTA focuses first field
+
+Finding-ID: AUDIT-20260528-67
+Status:     fixed-92267b2
+Severity:   non-blocking (UX action discoverability)
+Surface:    `packages/studio/src/pages/lanes.ts:148`,
+            `plugins/deskwork-studio/public/src/lanes/lanes-page.ts`
+
+The empty-state CTA `href="#lanes-new-form-heading"` anchored to a
+heading. The operator's actual intent on click is "let me start
+typing." Anchor scroll is essentially a no-op when the form is
+right below the empty state.
+
+Fix: CTA carries `data-lanes-cta-focus`. Click handler calls
+`preventDefault` and focuses the first field
+(`document.querySelector('[data-lanes-field="id"]')?.focus()`). Anchor
+href remains as no-JS fallback. Test simulates click and asserts
+focus moves.
+
+### AUDIT-20260528-68 — Test coverage gaps captured as observation
+
+Finding-ID: AUDIT-20260528-68
+Status:     observation (no action)
+Severity:   observation
+Surface:    `packages/studio/test/lanes/lanes-page-client.test.ts`
+
+Quality reviewer noted untested scenarios: concurrent multi-row Edit
+open (fixed via Fix 3 single-open accordion, now testable but not
+covered by an explicit "two rows" test), keyboard navigation (Tab +
+Enter on Copy), browser back/forward bfcache, slash-command builder
+with special characters in name (newline, backtick, quote).
+
+Quoting test was added as part of Fix 2. Other gaps recorded for the
+audit trail; not blocking.
+
+### Task 6.3 closing summary
+
+- Spec-compliance review: SPEC-COMPLIANT WITH NON-BLOCKING OBSERVATIONS (32 observations, all positive/audit-trail).
+- Code-quality review: QUALITY-APPROVED WITH NON-BLOCKING OBSERVATIONS (9 findings + 4 observations). Triage: 7 NON-BLOCKING applied at 92267b2; 6 observations accepted without action.
+- Test deltas: studio suite 831 → 838 (+7); core 711 throughout; CLI tests unchanged.
+- Builds: `@deskwork/{core, studio, cli}` all exit 0.
+- Pre-existing CLI failures persist; zero diff in `packages/cli/` across `0f9fc65` and `92267b2`.
+- Strongest design call: AUDIT-64 (reorder handle visual mismatch) — the workplan named the column as a per-row field but didn't address the inert-yet-draggable-looking affordance. Resolving via passive icon + title preserves the column while making the affordance honest. Matches `.claude/rules/affordance-placement.md` "an affordance whose label/glyph doesn't relate spatially to the action" anti-pattern.
diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
index c58e9ed..c0073ad 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
@@ -311,10 +311,10 @@ The picked design **pivots away from the PRD's original "per-lane tab strip" fra
 
 ### Task 6.3: Studio lane-management page
 
-- [ ] Step 6.3.1: Server-render page at `/dev/lanes/` listing every lane with create / archive / restore buttons; each row shows lane ID, name, bound template, content-dir, entry count, visibility toggle, reorder handle.
-- [ ] Step 6.3.2: "New lane" form: prompts for id, name, template (dropdown of available templates from `listAvailablePipelineTemplates`), contentDir.
-- [ ] Step 6.3.3: Edit form: same fields, editable; clipboard-copies the equivalent `/deskwork:lane update` invocation per THESIS Consequence 2.
-- [ ] Step 6.3.4: Archive / restore actions: clipboard-copy `/deskwork:lane archive <id>` or `/deskwork:lane restore <id>` — studio never mutates sidecar state.
+- [x] Step 6.3.1: Server-render page at `/dev/lanes/` listing every lane with create / archive / restore buttons; each row shows lane ID, name, bound template, content-dir, entry count, visibility toggle, reorder handle. (Reorder handle ships as a passive visual indicator — dashboard rail at Phase 5 Task 5.4 is the canonical reorder surface; the per-row glyph is `⋮` with `cursor: help` + a title pointing at the rail.)
+- [x] Step 6.3.2: "New lane" form: prompts for id, name, template (dropdown of available templates from `listAvailablePipelineTemplates`), contentDir. (Copy-builder pattern: change events live-update a slash-command preview; copy button writes to clipboard. No server-side mutation per THESIS Consequence 2.)
+- [x] Step 6.3.3: Edit form: same fields, editable; clipboard-copies the equivalent `/deskwork:lane update` invocation per THESIS Consequence 2. (Diff-emit: only diverged fields produce flags; cleared fields are silently skipped; convention documented inline. Single-open accordion across rows.)
+- [x] Step 6.3.4: Archive / restore actions: clipboard-copy `/deskwork:lane archive <id>` or `/deskwork:lane restore <id>` — studio never mutates sidecar state. (Plus disabled-looking Purge button when archived + entries remain, surfacing the gate visibly with a title pointing at the next-step workflow.)
 
 ### Task 6.4: Studio pipeline-editor page
 
diff --git a/packages/studio/package.json b/packages/studio/package.json
index 90a6a84..eb2b3db 100644
--- a/packages/studio/package.json
+++ b/packages/studio/package.json
@@ -34,8 +34,8 @@
     "./package.json": "./package.json"
   },
   "scripts": {
-    "build": "tsc -b tsconfig.build.json && mkdir -p dist/pages/dashboard && cp src/pages/*.ts dist/pages/ && cp src/pages/dashboard/*.ts dist/pages/dashboard/ && chmod +x dist/server.js",
-    "prepack": "tsc -b tsconfig.build.json && mkdir -p dist/pages/dashboard && cp src/pages/*.ts dist/pages/ && cp src/pages/dashboard/*.ts dist/pages/dashboard/ && chmod +x dist/server.js",
+    "build": "tsc -b tsconfig.build.json && mkdir -p dist/pages/dashboard dist/pages/lanes dist/pages/pipelines && cp src/pages/*.ts dist/pages/ && cp src/pages/dashboard/*.ts dist/pages/dashboard/ && cp src/pages/lanes/*.ts dist/pages/lanes/ && cp src/pages/pipelines/*.ts dist/pages/pipelines/ && chmod +x dist/server.js",
+    "prepack": "tsc -b tsconfig.build.json && mkdir -p dist/pages/dashboard dist/pages/lanes dist/pages/pipelines && cp src/pages/*.ts dist/pages/ && cp src/pages/dashboard/*.ts dist/pages/dashboard/ && cp src/pages/lanes/*.ts dist/pages/lanes/ && cp src/pages/pipelines/*.ts dist/pages/pipelines/ && chmod +x dist/server.js",
     "dev": "DESKWORK_DEV=1 tsx --watch src/server.ts --project-root ../..",
     "test": "vitest run",
     "test:watch": "vitest",
diff --git a/packages/studio/src/pages/lanes.ts b/packages/studio/src/pages/lanes.ts
new file mode 100644
index 0000000..f4225b9
--- /dev/null
+++ b/packages/studio/src/pages/lanes.ts
@@ -0,0 +1,163 @@
+/**
+ * Studio lane-management page — `/dev/lanes` (Phase 6 Task 6.3).
+ *
+ * Server-renders the project's lane registry: active lanes in a
+ * primary table, archived lanes in a collapse-by-default section,
+ * plus a "New lane" copy-builder form.
+ *
+ * Per THESIS Consequence 2, this page never mutates sidecar state.
+ * Every action button — Edit, Archive, Restore, Purge, Copy command —
+ * is a clipboard-copy of the equivalent `/deskwork:lane <verb>`
+ * slash command. The operator pastes the command into Claude Code;
+ * the agent runs the CLI; the CLI writes the sidecar. The studio's
+ * job is to route the operator's intent into a paste-ready command
+ * with the right arguments pre-filled.
+ *
+ * Page structure (mirrors the dashboard pattern):
+ *
+ *   - Editorial folio (cross-page nav strip)
+ *   - Mobile masthead (hub-shape — "Lanes" title + "the compositor's
+ *     desk" kicker; back-link to /dev/editorial-studio)
+ *   - Main container
+ *     - Header (page heading + count meta + integrity warning if
+ *       any unrouted entries)
+ *     - New Lane form
+ *     - Active lanes table (or empty-state CTA)
+ *     - Archived lanes section
+ *   - Toast slot (success / fallback panel)
+ *
+ * The page registers `editorial-studio-client` as a script module
+ * because the existing client carries the `[data-lanes-*]` handlers
+ * (added alongside this page). Loading the same bundle keeps the
+ * folio nav active state, the masthead popover, and the existing
+ * copy-button vocabulary consistent across the studio.
+ */
+
+import type { StudioContext } from '../routes/api.ts';
+import { html, unsafe, type RawHtml } from './html.ts';
+import { layout } from './layout.ts';
+import { renderEditorialFolio } from './chrome.ts';
+import { renderMasthead } from './masthead.ts';
+import { renderMastheadMenu } from './masthead-menu.ts';
+import { loadLanesPageData, type LanesPageData } from './lanes/data.ts';
+import { renderLaneTable } from './lanes/table.ts';
+import { renderNewLaneForm } from './lanes/new-form.ts';
+import { renderArchivedSection } from './lanes/archived-section.ts';
+
+export async function renderLanesPage(ctx: StudioContext): Promise<string> {
+  const data = await loadLanesPageData(ctx.projectRoot);
+
+  const masthead = renderMasthead({
+    kicker: "The compositor's desk",
+    title: 'Lanes',
+    metaInline: lanesMastheadMeta(data),
+    isHub: false,
+  });
+
+  const header = renderHeader(data);
+  const newForm = renderNewLaneForm({
+    availableTemplates: data.availableTemplates,
+  });
+  const activeTable =
+    data.active.length === 0
+      ? renderEmptyActiveState()
+      : renderLaneTable({
+          rows: data.active,
+          availableTemplates: data.availableTemplates,
+          emptyMessage: 'No active lanes.',
+          tableLabel: 'Active lanes',
+          archivedTable: false,
+        });
+  const archivedSection = renderArchivedSection({
+    rows: data.archived,
+    availableTemplates: data.availableTemplates,
+  });
+
+  const body = html`
+    ${masthead}
+    ${renderMastheadMenu()}
+    ${renderEditorialFolio('dashboard', "the compositor's desk")}
+    <main class="er-container lanes-container" data-lanes-container>
+      ${header}
+      ${newForm}
+      <section class="lanes-active" data-lanes-active aria-labelledby="lanes-active-heading">
+        <h2 class="lanes-active-heading" id="lanes-active-heading">Active lanes</h2>
+        ${activeTable}
+      </section>
+      ${archivedSection}
+    </main>
+    <div class="er-toast" data-toast hidden></div>`;
+
+  return layout({
+    title: 'Lanes — dev',
+    cssHrefs: [
+      '/static/css/editorial-review.css',
+      '/static/css/editorial-nav.css',
+      '/static/css/editorial-studio.css',
+      '/static/css/lanes-page.css',
+    ],
+    bodyAttrs: 'data-review-ui="lanes"',
+    bodyHtml: body,
+    scriptModules: ['editorial-studio-client'],
+  });
+}
+
+function lanesMastheadMeta(data: LanesPageData): string {
+  const activeCount = data.active.length;
+  const archivedCount = data.archived.length;
+  const archivedFragment =
+    archivedCount > 0 ? ` · ${archivedCount} archived` : '';
+  return `${activeCount} active${archivedFragment} · ${data.totalEntries} entries`;
+}
+
+function renderHeader(data: LanesPageData): RawHtml {
+  const unroutedBadge =
+    data.unroutedEntries > 0
+      ? unsafe(html`
+        <span class="lanes-header-warn" role="status">
+          ${data.unroutedEntries} unrouted entr${unsafe(data.unroutedEntries === 1 ? 'y' : 'ies')} — check <code>/deskwork:doctor</code> for binding repair.
+        </span>`)
+      : '';
+
+  return unsafe(html`
+    <header class="er-pagehead lanes-header" data-lanes-header>
+      <p class="er-pagehead__kicker">Lane registry</p>
+      <h1 class="er-pagehead__title">Lanes</h1>
+      <p class="er-pagehead__deck">
+        Each lane binds a content directory to a pipeline template.
+        Every action on this page copies the equivalent <code>/deskwork:lane</code>
+        command to your clipboard — paste into Claude Code to run.
+      </p>
+      ${unroutedBadge}
+    </header>`);
+}
+
+/**
+ * Empty-state for the active table — no lanes configured at all.
+ * Renders a prominent "Create your first lane" CTA pointed at the
+ * New Lane form (which is rendered above in the page body).
+ *
+ * The CTA carries both a `href="#lanes-new-form-heading"` anchor
+ * (no-JS fallback that scrolls to the form heading) AND a
+ * `data-lanes-cta-focus` attribute the client controller hooks. On
+ * click with JS available, the client intercepts the anchor and
+ * focuses the first field of the New Lane form instead — the
+ * operator's intent on click is "let me start typing," not "scroll
+ * me there."
+ */
+function renderEmptyActiveState(): RawHtml {
+  return unsafe(html`
+    <div class="lanes-empty" data-lanes-empty>
+      <p class="lanes-empty-message">
+        No lanes configured. A project needs at least one lane to
+        track entries.
+      </p>
+      <a
+        class="lanes-btn lanes-btn--primary"
+        href="#lanes-new-form-heading"
+        data-lanes-cta-focus
+      >
+        Create your first lane
+      </a>
+    </div>`);
+}
diff --git a/packages/studio/src/pages/lanes/archived-section.ts b/packages/studio/src/pages/lanes/archived-section.ts
new file mode 100644
index 0000000..3741025
--- /dev/null
+++ b/packages/studio/src/pages/lanes/archived-section.ts
@@ -0,0 +1,67 @@
+/**
+ * Archived-lanes section renderer for `/dev/lanes` (Phase 6 Task 6.3
+ * step 6.3.4).
+ *
+ * Wraps `renderLaneTable` for the archived rows inside a
+ * collapse-by-default `<details>` element. The chevron-toggle
+ * vocabulary matches Phase 5's swimlane-collapse pattern (universal
+ * chevron convention from DESIGN-STANDARDS): closed → click → open.
+ *
+ * Empty-state: when no archived lanes exist, the section renders as
+ * a stub line ("No archived lanes") with no `<details>` chrome — a
+ * collapse affordance for zero rows would be wrong (nothing to
+ * collapse into).
+ */
+
+import { html, unsafe, type RawHtml } from '../html.ts';
+import type { LaneRow } from './data.ts';
+import { renderLaneTable } from './table.ts';
+
+interface ArchivedSectionInput {
+  readonly rows: readonly LaneRow[];
+  readonly availableTemplates: readonly string[];
+}
+
+export function renderArchivedSection(input: ArchivedSectionInput): RawHtml {
+  if (input.rows.length === 0) {
+    return unsafe(html`
+      <section
+        class="lanes-archived lanes-archived--empty"
+        data-lanes-archived
+        aria-labelledby="lanes-archived-heading"
+      >
+        <h2 class="lanes-archived-heading" id="lanes-archived-heading">
+          Archived lanes
+        </h2>
+        <p class="lanes-archived-empty">No archived lanes.</p>
+      </section>`);
+  }
+
+  const table = renderLaneTable({
+    rows: input.rows,
+    availableTemplates: input.availableTemplates,
+    emptyMessage: 'No archived lanes.',
+    tableLabel: 'Archived lanes',
+    archivedTable: true,
+  });
+
+  return unsafe(html`
+    <section
+      class="lanes-archived"
+      data-lanes-archived
+      aria-labelledby="lanes-archived-heading"
+    >
+      <details class="lanes-archived-details" data-lanes-archived-details>
+        <summary class="lanes-archived-summary">
+          <span class="lanes-archived-chevron" aria-hidden="true">▸</span>
+          <span class="lanes-archived-heading" id="lanes-archived-heading">
+            Archived lanes
+          </span>
+          <span class="lanes-archived-count">${input.rows.length}</span>
+        </summary>
+        <div class="lanes-archived-body">
+          ${table}
+        </div>
+      </details>
+    </section>`);
+}
diff --git a/packages/studio/src/pages/lanes/data.ts b/packages/studio/src/pages/lanes/data.ts
new file mode 100644
index 0000000..4f3880c
--- /dev/null
+++ b/packages/studio/src/pages/lanes/data.ts
@@ -0,0 +1,152 @@
+/**
+ * Data layer for the `/dev/lanes` studio page (Phase 6 Task 6.3).
+ *
+ * Loads two parallel views of the project's lane registry:
+ *
+ *   - **Active lanes:** every lane whose JSON does not carry an
+ *     `archivedAt` field. The page shows these in the primary table.
+ *   - **Archived lanes:** every lane whose JSON carries an `archivedAt`.
+ *     The page shows these in a collapsed-by-default section.
+ *
+ * Per Phase 5 Task 5.4 the operator's preferred lane order lives
+ * client-side (`localStorage` keyed by project + the `lane-order`
+ * suffix). Server-side ordering is the alphabetical-by-id contract
+ * `listLaneConfigs` returns; the client applies its preferred order
+ * to the rendered table after hydration. This module does not read
+ * any localStorage state — page-render is purely server-driven.
+ *
+ * Per-lane entry counts are computed from `readAllSidecars` + the
+ * `entry.lane` field. Entries whose `lane` is missing or references
+ * a lane that does not exist on disk are counted into an `unrouted`
+ * tally surfaced separately. The dashboard already surfaces unrouted
+ * entries (per `dashboard/lane-data.ts`); this page surfaces the
+ * tally too so the operator sees the integrity signal here as well.
+ *
+ * Pipeline-template availability (used by the New Lane and Edit
+ * forms) is sourced from `listAvailablePipelineTemplates` — the
+ * union of plugin presets and project overrides. The page does NOT
+ * validate each template at enumeration time (per the doctor
+ * separation of concerns + the Task 6.4 follow-up note for inline
+ * select-time errors).
+ */
+
+import {
+  listLaneConfigs,
+  loadLaneConfig,
+  type LaneConfig,
+} from '@deskwork/core/lanes';
+import { listAvailablePipelineTemplates } from '@deskwork/core/pipelines';
+import { readAllSidecars } from '@deskwork/core/sidecar';
+
+/**
+ * Per-lane summary surfaced to the renderer. The `archived` boolean
+ * is derived from the `archivedAt` field being a non-empty string.
+ */
+export interface LaneRow {
+  readonly id: string;
+  readonly name: string;
+  readonly pipelineTemplate: string;
+  readonly contentDir: string;
+  readonly archived: boolean;
+  readonly archivedAt: string | null;
+  readonly entryCount: number;
+}
+
+export interface LanesPageData {
+  readonly active: readonly LaneRow[];
+  readonly archived: readonly LaneRow[];
+  /** Total number of entries on disk (independent of lane routing). */
+  readonly totalEntries: number;
+  /**
+   * Entries whose `entry.lane` is undefined OR references a lane id
+   * that does not exist in the active+archived set. Surfaced as a
+   * diagnostic; the page renders the count next to the active-lane
+   * tally so the operator sees the integrity drift here too.
+   */
+  readonly unroutedEntries: number;
+  /** Sorted list of available pipeline-template ids (plugin + project). */
+  readonly availableTemplates: readonly string[];
+}
+
+function laneRowFromConfig(
+  id: string,
+  config: LaneConfig,
+  entryCount: number,
+): LaneRow {
+  const archivedAt =
+    typeof config.archivedAt === 'string' && config.archivedAt.length > 0
+      ? config.archivedAt
+      : null;
+  return {
+    id,
+    name: config.name,
+    pipelineTemplate: config.pipelineTemplate,
+    contentDir: config.contentDir,
+    archived: archivedAt !== null,
+    archivedAt,
+    entryCount,
+  };
+}
+
+/**
+ * Compute per-lane entry counts from a flat sidecar list. Returns a
+ * `Map<laneId, count>` plus an `unrouted` tally for entries whose
+ * `lane` is undefined or references a lane id outside `knownLaneIds`.
+ *
+ * The function does NOT mutate input; it walks the entry list once.
+ */
+function countEntriesByLane(
+  entries: ReadonlyArray<{ readonly lane?: string | undefined }>,
+  knownLaneIds: ReadonlySet<string>,
+): { byLane: ReadonlyMap<string, number>; unrouted: number } {
+  const byLane = new Map<string, number>();
+  let unrouted = 0;
+  for (const entry of entries) {
+    const laneId = entry.lane;
+    if (laneId === undefined || !knownLaneIds.has(laneId)) {
+      unrouted += 1;
+      continue;
+    }
+    byLane.set(laneId, (byLane.get(laneId) ?? 0) + 1);
+  }
+  return { byLane, unrouted };
+}
+
+/**
+ * Load the full lanes-page data view. Resolves every lane config
+ * (active + archived) and joins per-lane entry counts. Throws if any
+ * lane config is malformed — the studio's renderer surfaces the
+ * error rather than swallowing it (per the project's no-fallback
+ * rule).
+ *
+ * @param projectRoot - Absolute project root.
+ */
+export async function loadLanesPageData(
+  projectRoot: string,
+): Promise<LanesPageData> {
+  const allIds = listLaneConfigs(projectRoot, { includeArchived: true });
+  const known = new Set(allIds);
+
+  const entries = await readAllSidecars(projectRoot);
+  const { byLane, unrouted } = countEntriesByLane(entries, known);
+
+  const active: LaneRow[] = [];
+  const archived: LaneRow[] = [];
+  for (const id of allIds) {
+    const config = loadLaneConfig(id, projectRoot);
+    const count = byLane.get(id) ?? 0;
+    const row = laneRowFromConfig(id, config, count);
+    if (row.archived) archived.push(row);
+    else active.push(row);
+  }
+
+  const availableTemplates = listAvailablePipelineTemplates(projectRoot);
+
+  return {
+    active,
+    archived,
+    totalEntries: entries.length,
+    unroutedEntries: unrouted,
+    availableTemplates,
+  };
+}
diff --git a/packages/studio/src/pages/lanes/edit-form.ts b/packages/studio/src/pages/lanes/edit-form.ts
new file mode 100644
index 0000000..c45455f
--- /dev/null
+++ b/packages/studio/src/pages/lanes/edit-form.ts
@@ -0,0 +1,114 @@
+/**
+ * Per-lane Edit form renderer for `/dev/lanes` (Phase 6 Task 6.3
+ * step 6.3.3).
+ *
+ * Each active or archived lane row gets an inline edit form
+ * rendered in a hidden sibling `<tr>`. The row's Edit button
+ * toggles the form's visibility client-side.
+ *
+ * The form is a CLIENT-SIDE copy-builder. Per THESIS Consequence 2
+ * the studio never mutates state — the form's copy button produces
+ * `/deskwork:lane update <id> [--name <label>] [--template <id>]
+ * [--content-dir <path>]` with ONLY the fields that differ from
+ * the current lane config. The client controller in `lanes-page.ts`
+ * compares the form's live values against `data-current-*`
+ * attributes on each field and rebuilds the slash command on
+ * every change event.
+ *
+ * The lane's `id` is immutable (per Task 6.1's CLI contract); the
+ * form does not present an id field.
+ */
+
+import { html, unsafe, type RawHtml } from '../html.ts';
+import type { LaneRow } from './data.ts';
+
+export function renderEditForm(
+  row: LaneRow,
+  availableTemplates: readonly string[],
+): RawHtml {
+  const templateOptions = availableTemplates.map(
+    (id) =>
+      unsafe(
+        html`<option value="${id}"${unsafe(id === row.pipelineTemplate ? ' selected' : '')}>${id}</option>`,
+      ),
+  );
+
+  return unsafe(html`
+    <section
+      class="lanes-form lanes-form--edit"
+      id="lanes-edit-form-${row.id}"
+      data-lanes-edit-form
+      data-lane-id="${row.id}"
+      aria-labelledby="lanes-edit-form-heading-${row.id}"
+    >
+      <header class="lanes-form-head">
+        <h3 class="lanes-form-heading" id="lanes-edit-form-heading-${row.id}">
+          Edit <code>${row.id}</code>
+        </h3>
+        <p class="lanes-form-desc">
+          Mutate <code>name</code> / <code>template</code> / <code>contentDir</code>.
+          The slash command below carries only the fields that changed.
+        </p>
+      </header>
+      <div class="lanes-form-grid">
+        <label class="lanes-field">
+          <span class="lanes-field-label">Name</span>
+          <input
+            class="lanes-input"
+            type="text"
+            name="name"
+            data-lanes-field="name"
+            data-current="${row.name}"
+            value="${row.name}"
+            autocomplete="off"
+          >
+        </label>
+        <label class="lanes-field">
+          <span class="lanes-field-label">Pipeline template</span>
+          <select
+            class="lanes-select"
+            name="template"
+            data-lanes-field="template"
+            data-current="${row.pipelineTemplate}"
+          >
+            ${templateOptions}
+          </select>
+        </label>
+        <label class="lanes-field">
+          <span class="lanes-field-label">Content dir</span>
+          <input
+            class="lanes-input"
+            type="text"
+            name="contentDir"
+            data-lanes-field="contentDir"
+            data-current="${row.contentDir}"
+            value="${row.contentDir}"
+            autocomplete="off"
+            spellcheck="false"
+          >
+        </label>
+      </div>
+      <div class="lanes-form-preview">
+        <span class="lanes-form-preview-label">Command preview</span>
+        <code
+          class="lanes-form-preview-cmd"
+          data-lanes-preview
+          data-lane-id="${row.id}"
+        >/deskwork:lane update ${row.id}</code>
+      </div>
+      <div class="lanes-form-actions">
+        <button
+          class="lanes-btn lanes-btn--primary"
+          type="button"
+          data-lanes-copy-button="edit"
+          data-lane-id="${row.id}"
+        >Copy command</button>
+        <button
+          class="lanes-btn lanes-btn--secondary"
+          type="button"
+          data-lane-edit-cancel
+          data-lane-id="${row.id}"
+        >Close</button>
+      </div>
+    </section>`);
+}
diff --git a/packages/studio/src/pages/lanes/new-form.ts b/packages/studio/src/pages/lanes/new-form.ts
new file mode 100644
index 0000000..86653de
--- /dev/null
+++ b/packages/studio/src/pages/lanes/new-form.ts
@@ -0,0 +1,112 @@
+/**
+ * "New lane" form renderer for `/dev/lanes` (Phase 6 Task 6.3 step
+ * 6.3.2).
+ *
+ * The form is a CLIENT-SIDE copy-builder. Per THESIS Consequence 2,
+ * the studio never mutates state — the form's submit button copies
+ * the equivalent `/deskwork:lane create <id> --template <id> --content-
+ * dir <path> [--name <label>]` slash command to the clipboard. The
+ * operator then pastes the command into Claude Code; the agent runs
+ * the CLI; the CLI writes the lane config.
+ *
+ * The form has a live preview <code> element showing the slash
+ * command as the operator types. The client controller in
+ * `lanes-page.ts` rebuilds the preview on every change event.
+ *
+ * Required fields: id, template, contentDir. Name is optional and
+ * defaults to the id on the CLI side; the preview omits `--name`
+ * when name is empty.
+ */
+
+import { html, unsafe, type RawHtml } from '../html.ts';
+
+interface NewFormInput {
+  readonly availableTemplates: readonly string[];
+}
+
+export function renderNewLaneForm(input: NewFormInput): RawHtml {
+  const templateOptions = input.availableTemplates
+    .map(
+      (id) =>
+        unsafe(html`<option value="${id}">${id}</option>`),
+    );
+
+  return unsafe(html`
+    <section class="lanes-form lanes-form--new" data-lanes-new-form aria-labelledby="lanes-new-form-heading">
+      <header class="lanes-form-head">
+        <h2 class="lanes-form-heading" id="lanes-new-form-heading">New lane</h2>
+        <p class="lanes-form-desc">
+          Configure a new lane. Fields update the slash command below;
+          copy it and paste into Claude Code to run.
+        </p>
+      </header>
+      <div class="lanes-form-grid">
+        <label class="lanes-field">
+          <span class="lanes-field-label">Lane id</span>
+          <input
+            class="lanes-input"
+            type="text"
+            name="id"
+            data-lanes-field="id"
+            placeholder="e.g. mockups"
+            pattern="[a-z0-9][a-z0-9-]*"
+            required
+            autocomplete="off"
+            spellcheck="false"
+          >
+          <span class="lanes-field-hint">kebab-case, starts with [a-z0-9]</span>
+        </label>
+        <label class="lanes-field">
+          <span class="lanes-field-label">Name (optional)</span>
+          <input
+            class="lanes-input"
+            type="text"
+            name="name"
+            data-lanes-field="name"
+            placeholder="Human-readable label"
+            autocomplete="off"
+          >
+          <span class="lanes-field-hint">defaults to the id</span>
+        </label>
+        <label class="lanes-field">
+          <span class="lanes-field-label">Pipeline template</span>
+          <select
+            class="lanes-select"
+            name="template"
+            data-lanes-field="template"
+            required
+          >
+            <option value="" disabled selected>Pick a template…</option>
+            ${templateOptions}
+          </select>
+          <span class="lanes-field-hint">union of plugin presets and project overrides</span>
+        </label>
+        <label class="lanes-field">
+          <span class="lanes-field-label">Content dir</span>
+          <input
+            class="lanes-input"
+            type="text"
+            name="contentDir"
+            data-lanes-field="contentDir"
+            placeholder="e.g. mockups"
+            required
+            autocomplete="off"
+            spellcheck="false"
+          >
+          <span class="lanes-field-hint">relative to the project root</span>
+        </label>
+      </div>
+      <div class="lanes-form-preview">
+        <span class="lanes-form-preview-label">Command preview</span>
+        <code class="lanes-form-preview-cmd" data-lanes-preview>/deskwork:lane create &lt;id&gt; --template &lt;template&gt; --content-dir &lt;path&gt;</code>
+      </div>
+      <div class="lanes-form-actions">
+        <button
+          class="lanes-btn lanes-btn--primary"
+          type="button"
+          data-lanes-copy-button="new"
+          aria-controls="lanes-new-form"
+        >Copy command</button>
+      </div>
+    </section>`);
+}
diff --git a/packages/studio/src/pages/lanes/table.ts b/packages/studio/src/pages/lanes/table.ts
new file mode 100644
index 0000000..9703ff4
--- /dev/null
+++ b/packages/studio/src/pages/lanes/table.ts
@@ -0,0 +1,206 @@
+/**
+ * Lane-table renderer for `/dev/lanes` (Phase 6 Task 6.3).
+ *
+ * Renders the active-lane table: one row per lane with id, name,
+ * bound pipeline template, contentDir, entry count, plus per-row
+ * Edit / Archive buttons and a reorder handle.
+ *
+ * Per `.claude/rules/affordance-placement.md`, the row's controls
+ * live ON the row (component-attached, not toolbar-attached) —
+ * each lane's Edit / Archive button addresses that one lane.
+ *
+ * Per THESIS Consequence 2, none of the buttons mutate state on
+ * the server. Each carries the `data-copy` payload — the slash
+ * command the operator would run — and the client-side
+ * `lanes-page` controller wires the click handler to copy the
+ * payload + flash a confirmation. The studio does not write to
+ * any sidecar from this page.
+ *
+ * Reorder handle is a visual stub at this layer — Phase 5 Task 5.4
+ * established the project-wide lane-order vocabulary as a
+ * localStorage concern on the dashboard. This page's reorder
+ * handle is visual-only; cross-page lane-order management belongs
+ * on the dashboard rail.
+ */
+
+import { html, unsafe, type RawHtml } from '../html.ts';
+import type { LaneRow } from './data.ts';
+import { renderEditForm } from './edit-form.ts';
+
+const COPY_BTN_ARCHIVE_LABEL = 'Archive';
+const COPY_BTN_RESTORE_LABEL = 'Restore';
+const COPY_BTN_PURGE_LABEL = 'Purge';
+const COPY_BTN_EDIT_LABEL = 'Edit';
+
+interface RenderLaneTableInput {
+  readonly rows: readonly LaneRow[];
+  readonly availableTemplates: readonly string[];
+  readonly emptyMessage: string;
+  readonly tableLabel: string;
+  /** When true, each row is rendered with a `data-archived` flag. */
+  readonly archivedTable: boolean;
+}
+
+function renderTableRow(
+  row: LaneRow,
+  availableTemplates: readonly string[],
+): RawHtml {
+  const archiveOrRestore = row.archived
+    ? renderCopyButton({
+        label: COPY_BTN_RESTORE_LABEL,
+        copy: `/deskwork:lane restore ${row.id}`,
+        variant: 'restore',
+      })
+    : renderCopyButton({
+        label: COPY_BTN_ARCHIVE_LABEL,
+        copy: `/deskwork:lane archive ${row.id}`,
+        variant: 'archive',
+      });
+
+  // Purge is gated to archived + zero-entry rows. The CLI enforces
+  // the gate too; the page surfaces it visually to reduce the chance
+  // the operator runs a refused command.
+  //
+  // When the lane is archived but still has entries, render a
+  // visibly-disabled Purge button that names the gate ("N entries")
+  // and explains the next step in its title. The disabled state
+  // makes the gate discoverable — without it, the operator sees no
+  // affordance at all and stalls.
+  let purgeButton: RawHtml | '' = '';
+  if (row.archived && row.entryCount === 0) {
+    purgeButton = renderCopyButton({
+      label: COPY_BTN_PURGE_LABEL,
+      copy: `/deskwork:lane purge ${row.id}`,
+      variant: 'purge',
+    });
+  } else if (row.archived && row.entryCount > 0) {
+    purgeButton = renderDisabledPurgeButton(row.entryCount);
+  }
+
+  return unsafe(html`
+    <tr class="lanes-row" data-lane-row data-lane-id="${row.id}"${unsafe(row.archived ? ' data-archived' : '')}>
+      <td class="lanes-cell lanes-cell--handle">
+        <span
+          class="lanes-reorder-handle"
+          aria-hidden="true"
+          title="Reorder via the dashboard lane rail"
+        >⋮</span>
+      </td>
+      <td class="lanes-cell lanes-cell--id"><code>${row.id}</code></td>
+      <td class="lanes-cell lanes-cell--name">${row.name}</td>
+      <td class="lanes-cell lanes-cell--template"><code>${row.pipelineTemplate}</code></td>
+      <td class="lanes-cell lanes-cell--content-dir"><code>${row.contentDir}</code></td>
+      <td class="lanes-cell lanes-cell--count">${row.entryCount}</td>
+      <td class="lanes-cell lanes-cell--visibility">
+        <span
+          class="lanes-visibility-icon"
+          aria-label="${row.archived ? 'Archived' : 'Visible'}"
+          title="${row.archived ? 'Archived — hidden by default in the dashboard.' : 'Visible in the dashboard (operator may flip per-operator visibility client-side).'}"
+        >${row.archived ? '◌' : '◉'}</span>
+      </td>
+      <td class="lanes-cell lanes-cell--actions">
+        <button
+          class="lanes-btn lanes-btn--edit"
+          type="button"
+          data-lane-edit-toggle
+          data-lane-id="${row.id}"
+          aria-expanded="false"
+          aria-controls="lanes-edit-form-${row.id}"
+        >${COPY_BTN_EDIT_LABEL}</button>
+        ${archiveOrRestore}
+        ${purgeButton}
+      </td>
+    </tr>
+    <tr class="lanes-row lanes-row--edit-form" data-lane-edit-row data-lane-id="${row.id}" hidden>
+      <td class="lanes-cell" colspan="8">
+        ${renderEditForm(row, availableTemplates)}
+      </td>
+    </tr>`);
+}
+
+interface CopyButtonInput {
+  readonly label: string;
+  readonly copy: string;
+  readonly variant: 'archive' | 'restore' | 'purge';
+}
+
+function renderCopyButton(input: CopyButtonInput): RawHtml {
+  return unsafe(html`
+    <button
+      class="lanes-btn lanes-btn--${input.variant}"
+      type="button"
+      data-lane-copy
+      data-copy="${input.copy}"
+      title="Copy ${input.copy} to clipboard"
+    >${input.label}</button>`);
+}
+
+/**
+ * Render a visibly-disabled Purge button for an archived lane that
+ * still has entries bound to it. The disabled state makes the gate
+ * (move entries first) discoverable; the title explains the next
+ * step. Carries no `data-copy` and no `data-lane-copy` — the client
+ * controller never wires it for clipboard copy. The CLI also gates
+ * purge on zero entries; this is the visual mirror of the CLI gate.
+ */
+function renderDisabledPurgeButton(entryCount: number): RawHtml {
+  const noun = entryCount === 1 ? 'entry' : 'entries';
+  return unsafe(html`
+    <button
+      class="lanes-btn lanes-btn--purge-disabled"
+      type="button"
+      disabled
+      aria-disabled="true"
+      title="Cannot purge: ${entryCount} ${noun} still reference this lane. Move them to another lane first via the per-entry surface."
+    >${COPY_BTN_PURGE_LABEL} — ${entryCount} ${noun}</button>`);
+}
+
+/**
+ * Render a lane table with caption + thead + tbody. Empty rows fall
+ * back to the supplied empty-message inside a single colspan cell so
+ * the table chrome is still visible (per DESIGN-STANDARDS structure-
+ * over-scrolling — even an empty hierarchy node communicates the
+ * shape of the page).
+ */
+export function renderLaneTable(input: RenderLaneTableInput): RawHtml {
+  if (input.rows.length === 0) {
+    return unsafe(html`
+      <table
+        class="lanes-table${unsafe(input.archivedTable ? ' lanes-table--archived' : '')}"
+        data-lanes-table${unsafe(input.archivedTable ? ' data-archived' : '')}
+      >
+        <caption class="lanes-table-caption">${input.tableLabel}</caption>
+        <thead>${renderHeadRow()}</thead>
+        <tbody>
+          <tr class="lanes-row lanes-row--empty">
+            <td class="lanes-cell lanes-cell--empty" colspan="8">${input.emptyMessage}</td>
+          </tr>
+        </tbody>
+      </table>`);
+  }
+  return unsafe(html`
+    <table
+      class="lanes-table${unsafe(input.archivedTable ? ' lanes-table--archived' : '')}"
+      data-lanes-table${unsafe(input.archivedTable ? ' data-archived' : '')}
+    >
+      <caption class="lanes-table-caption">${input.tableLabel}</caption>
+      <thead>${renderHeadRow()}</thead>
+      <tbody>
+        ${input.rows.map((row) => renderTableRow(row, input.availableTemplates))}
+      </tbody>
+    </table>`);
+}
+
+function renderHeadRow(): RawHtml {
+  return unsafe(html`
+    <tr>
+      <th class="lanes-th lanes-th--handle" scope="col" aria-label="Reorder handle"></th>
+      <th class="lanes-th lanes-th--id" scope="col">ID</th>
+      <th class="lanes-th lanes-th--name" scope="col">Name</th>
+      <th class="lanes-th lanes-th--template" scope="col">Template</th>
+      <th class="lanes-th lanes-th--content-dir" scope="col">Content dir</th>
+      <th class="lanes-th lanes-th--count" scope="col">Entries</th>
+      <th class="lanes-th lanes-th--visibility" scope="col">State</th>
+      <th class="lanes-th lanes-th--actions" scope="col">Actions</th>
+    </tr>`);
+}
diff --git a/packages/studio/src/pages/pipelines.ts b/packages/studio/src/pages/pipelines.ts
new file mode 100644
index 0000000..a8e2544
--- /dev/null
+++ b/packages/studio/src/pages/pipelines.ts
@@ -0,0 +1,132 @@
+/**
+ * Studio pipeline-editor page — `/dev/pipelines` (Phase 6 Task 6.4).
+ *
+ * Server-renders the project's pipeline registry: every plugin-preset
+ * and project-override template in a primary table, with per-row View
+ * (stage flow visualization), Edit (5-operation accordion), and
+ * Delete (clipboard or disabled-with-explanation). Above the table a
+ * "New pipeline template" copy-builder form composes the equivalent
+ * `/deskwork:pipeline create` slash command.
+ *
+ * Per THESIS Consequence 2, this page never mutates state. Every
+ * action button — Copy command, View, Edit-op Copy, Delete — is a
+ * clipboard-copy of the equivalent `/deskwork:pipeline <verb>` slash
+ * command. The studio's job is to route the operator's intent into a
+ * paste-ready command with the right arguments pre-filled.
+ *
+ * Per the Phase 2 follow-up captured in the workplan, the data layer
+ * surfaces malformed override JSON as error rows rather than
+ * silently filtering — so the operator sees "this id exists but
+ * won't load — fix this file" rather than "this id is missing." A
+ * top-of-page banner names the count + affected ids.
+ *
+ * Page structure (mirrors the lanes-page shape):
+ *
+ *   - Editorial folio (cross-page nav strip)
+ *   - Masthead ("Pipelines" title + lane-binding meta + back link)
+ *   - Main container
+ *     - Header (page heading + count meta + integrity banner)
+ *     - New template form
+ *     - Pipeline table (healthy rows + error rows)
+ *   - Toast slot (success / fallback panel)
+ *
+ * The page loads the `editorial-studio-client` bundle for the
+ * cross-cutting affordances (folio nav state, masthead popover, copy
+ * vocabulary) and `pipelines-page.css` for the page-specific chrome.
+ * The pipeline-page client controller lives inside the same bundle
+ * as `initPipelinesPage`, registered alongside `initLanesPage`.
+ */
+
+import type { StudioContext } from '../routes/api.ts';
+import { html, unsafe, type RawHtml } from './html.ts';
+import { layout } from './layout.ts';
+import { renderEditorialFolio } from './chrome.ts';
+import { renderMasthead } from './masthead.ts';
+import { renderMastheadMenu } from './masthead-menu.ts';
+import {
+  loadPipelinesPageData,
+  type PipelinesPageData,
+} from './pipelines/data.ts';
+import { renderPipelineTable } from './pipelines/table.ts';
+import { renderNewPipelineForm } from './pipelines/new-form.ts';
+import { renderErrorBanner } from './pipelines/error-banner.ts';
+
+export async function renderPipelinesPage(ctx: StudioContext): Promise<string> {
+  const data = await loadPipelinesPageData(ctx.projectRoot);
+
+  const masthead = renderMasthead({
+    kicker: 'Pipeline registry',
+    title: 'Pipelines',
+    metaInline: pipelinesMastheadMeta(data),
+    isHub: false,
+  });
+
+  const header = renderHeader(data);
+  const newForm = renderNewPipelineForm();
+  const errorBanner = renderErrorBanner(data.errors);
+  const availableTemplates = [...data.rows.map((r) => r.id)].sort();
+  const table = renderPipelineTable({
+    rows: data.rows,
+    errors: data.errors,
+    availableTemplates,
+  });
+
+  const body = html`
+    ${masthead}
+    ${renderMastheadMenu()}
+    ${renderEditorialFolio('dashboard', 'the pipeline registry')}
+    <main class="er-container pipelines-container" data-pipelines-container>
+      ${header}
+      ${errorBanner}
+      ${newForm}
+      <section class="pipelines-table-section" aria-labelledby="pipelines-table-heading">
+        <h2 class="pipelines-section-heading" id="pipelines-table-heading">Templates</h2>
+        ${table}
+      </section>
+    </main>
+    <div class="er-toast" data-toast hidden></div>`;
+
+  return layout({
+    title: 'Pipelines — dev',
+    cssHrefs: [
+      '/static/css/editorial-review.css',
+      '/static/css/editorial-nav.css',
+      '/static/css/editorial-studio.css',
+      '/static/css/pipelines-page.css',
+      '/static/css/pipelines-stage-flow.css',
+    ],
+    bodyAttrs: 'data-review-ui="pipelines"',
+    bodyHtml: body,
+    scriptModules: ['editorial-studio-client'],
+  });
+}
+
+function pipelinesMastheadMeta(data: PipelinesPageData): string {
+  const healthy = data.rows.length;
+  const errorFragment =
+    data.errors.length > 0 ? ` · ${data.errors.length} error${data.errors.length === 1 ? '' : 's'}` : '';
+  const noun = data.totalLanes === 1 ? 'lane' : 'lanes';
+  return `${healthy} template${healthy === 1 ? '' : 's'}${errorFragment} · ${data.totalLanes} ${noun}`;
+}
+
+function renderHeader(data: PipelinesPageData): RawHtml {
+  const counts =
+    data.errors.length === 0
+      ? ''
+      : unsafe(html`
+        <span class="pipelines-header-warn" role="status">
+          ${data.errors.length} template${unsafe(data.errors.length === 1 ? '' : 's')} failed to load — fix the offending JSON before running update / delete.
+        </span>`);
+  return unsafe(html`
+    <header class="er-pagehead pipelines-header" data-pipelines-header>
+      <p class="er-pagehead__kicker">Pipeline registry</p>
+      <h1 class="er-pagehead__title">Pipelines</h1>
+      <p class="er-pagehead__deck">
+        Pipeline templates name the stages a lane's entries flow through.
+        Every action on this page copies the equivalent
+        <code>/deskwork:pipeline</code> command to your clipboard —
+        paste into Claude Code to run.
+      </p>
+      ${counts}
+    </header>`);
+}
diff --git a/packages/studio/src/pages/pipelines/data.ts b/packages/studio/src/pages/pipelines/data.ts
new file mode 100644
index 0000000..c905c36
--- /dev/null
+++ b/packages/studio/src/pages/pipelines/data.ts
@@ -0,0 +1,304 @@
+/**
+ * Data layer for the `/dev/pipelines` studio page (Phase 6 Task 6.4).
+ *
+ * Enumerates every pipeline template visible to the project — the
+ * union of plugin-shipped presets and operator-authored project
+ * overrides — and joins per-template metadata the page needs to
+ * render: source (`plugin-preset` vs `project-override`), the resolved
+ * template (linearStages / lockedStages / offPipelineStages), and the
+ * number of active+archived lanes that reference each template id.
+ *
+ * Per the Phase 2 follow-up captured in the workplan (Task 6.4 lead-in
+ * note), `listAvailablePipelineTemplates` returns id strings without
+ * pre-validating each template. A malformed
+ * `<projectRoot>/.deskwork/pipelines/<id>.json` (parse error, Zod
+ * violation, id-mismatch) appears in the picker but fails when the
+ * page tries to load it. The data layer surfaces such failures as
+ * `PipelineLoadError` rows so the renderer can show them inline —
+ * "this id exists but won't load — fix it" rather than silently
+ * filtering the id out and making the malformation invisible.
+ *
+ * The same posture as the lanes data layer: read-only, no fallbacks,
+ * one pass through disk per page render. No caching — the page is a
+ * cold-path operator surface.
+ */
+
+import { existsSync, readFileSync } from 'node:fs';
+import { join } from 'node:path';
+import {
+  listAvailablePipelineTemplates,
+  loadPipelineTemplate,
+  isPluginPresetPipeline,
+  hasPipelineOverride,
+  pipelineOverridePath,
+  pipelinePluginDefaultPath,
+  type PipelineTemplate,
+} from '@deskwork/core/pipelines';
+import { listLaneConfigs } from '@deskwork/core/lanes';
+
+/**
+ * Where a template's authoritative JSON came from. A template that
+ * has BOTH an override and a plugin preset is reported as
+ * `project-override` (override-takes-precedence; the loader resolves
+ * the override first).
+ */
+export type PipelineSource = 'plugin-preset' | 'project-override';
+
+/**
+ * Why a template failed to load when the loader was invoked. Surfaced
+ * by the data layer so the renderer can show the operator a row with
+ * an actionable next step (fix the JSON; mismatched id; missing file).
+ *
+ * `parse` — JSON.parse threw.
+ * `zod` — schema validation rejected the parsed value.
+ * `id-mismatch` — JSON's `id` field disagrees with the filename basename.
+ * `missing` — file did not exist (should not happen for ids returned
+ *   by the enumerator; included for completeness).
+ * `unknown` — any other Error shape; the underlying message is
+ *   preserved verbatim so the operator can see what the loader said.
+ */
+export type PipelineLoadErrorKind =
+  | 'parse'
+  | 'zod'
+  | 'id-mismatch'
+  | 'missing'
+  | 'unknown';
+
+/**
+ * Per-template load-error record. The renderer maps these to error
+ * rows in the table; the `path` names the file on disk the operator
+ * should open, and `message` is the loader's verbatim diagnostic.
+ */
+export interface PipelineLoadError {
+  readonly kind: PipelineLoadErrorKind;
+  readonly path: string;
+  readonly message: string;
+}
+
+/**
+ * Per-template summary surfaced to the renderer for a healthy
+ * (loadable) template.
+ */
+export interface PipelineRow {
+  readonly id: string;
+  readonly source: PipelineSource;
+  readonly name: string;
+  readonly description: string;
+  readonly linearStages: readonly string[];
+  readonly lockedStages: readonly string[];
+  readonly offPipelineStages: readonly string[];
+  /**
+   * Active + archived lanes whose `pipelineTemplate` equals this id.
+   * Used by the renderer to gate Delete and surface dependents in the
+   * disabled-state tooltip.
+   */
+  readonly referencingLanes: readonly string[];
+}
+
+/**
+ * Per-template error record (template id appeared in the enumerator
+ * but failed to load).
+ */
+export interface PipelineErrorRow {
+  readonly id: string;
+  readonly source: PipelineSource;
+  readonly error: PipelineLoadError;
+  /**
+   * Lanes that reference this id, computed against the id-string only
+   * (no template load needed). Surfaced so the operator sees who
+   * depends on this broken template.
+   */
+  readonly referencingLanes: readonly string[];
+}
+
+export interface PipelinesPageData {
+  readonly rows: readonly PipelineRow[];
+  readonly errors: readonly PipelineErrorRow[];
+  /** Total lane count surveyed (active + archived). */
+  readonly totalLanes: number;
+}
+
+/**
+ * Determine the source of a template id. Override-takes-precedence:
+ * an id with both an override and a preset is reported as
+ * `project-override` (mirrors the loader's resolution order).
+ */
+function sourceForId(projectRoot: string, id: string): PipelineSource {
+  if (hasPipelineOverride(projectRoot, id)) return 'project-override';
+  if (isPluginPresetPipeline(id)) return 'plugin-preset';
+  // The enumerator only emits ids whose JSON exists on disk; a
+  // disappearing-file race between enumeration and source-classification
+  // surfaces as `plugin-preset` so the renderer's load attempt will
+  // fail with `missing`, naming the path. This is a non-fallback —
+  // we're not pretending the template exists; we're routing the
+  // failure to the load-error code path.
+  return 'plugin-preset';
+}
+
+/**
+ * Resolve the on-disk JSON path for a template id, picking the
+ * override path when one exists and falling back to the plugin
+ * default. Used for the error-row `path` so the operator can open
+ * the offending file.
+ */
+function pathForId(projectRoot: string, id: string): string {
+  if (hasPipelineOverride(projectRoot, id)) {
+    return pipelineOverridePath(projectRoot, id);
+  }
+  return pipelinePluginDefaultPath(id);
+}
+
+/**
+ * Classify a thrown loader error into a `PipelineLoadErrorKind` so the
+ * renderer can present a tailored hint. The loader's error messages
+ * are stable (see `packages/core/src/pipelines/loader.ts`'s
+ * `readAndValidate`), so substring matching against those strings is
+ * a contract-level signal, not a brittle parse.
+ */
+function classifyLoadError(message: string): PipelineLoadErrorKind {
+  if (message.includes('not found') || message.includes('not valid JSON')) {
+    if (message.includes('not valid JSON')) return 'parse';
+    return 'missing';
+  }
+  if (message.includes('failed Zod validation')) return 'zod';
+  if (message.includes('declares id') && message.includes('was loaded as')) {
+    return 'id-mismatch';
+  }
+  return 'unknown';
+}
+
+/**
+ * Read a lane config's raw JSON for ONLY the `pipelineTemplate`
+ * field, without the cross-validating `loadLaneConfig` path that
+ * insists the referenced template also resolves. The pipelines page
+ * needs to count which lanes reference a given template id even when
+ * the template itself is broken — using `loadLaneConfig` would skip
+ * those lanes (its loader throws when the cross-validation fails),
+ * making a broken template's dependents invisible exactly when the
+ * operator most needs to see them.
+ *
+ * Returns `null` when the file is missing or its JSON cannot be
+ * parsed or the `pipelineTemplate` field is not a string. The
+ * caller treats those lanes as "no reference here" — the lanes page
+ * surfaces the lane-side defect.
+ */
+function readLanePipelineTemplate(
+  projectRoot: string,
+  laneId: string,
+): string | null {
+  const path = join(projectRoot, '.deskwork', 'lanes', `${laneId}.json`);
+  if (!existsSync(path)) return null;
+  let raw: string;
+  try {
+    raw = readFileSync(path, 'utf8');
+  } catch {
+    return null;
+  }
+  let parsed: unknown;
+  try {
+    parsed = JSON.parse(raw);
+  } catch {
+    return null;
+  }
+  if (
+    parsed === null
+    || typeof parsed !== 'object'
+    || !('pipelineTemplate' in parsed)
+  ) {
+    return null;
+  }
+  // After the `in` narrowing, `parsed.pipelineTemplate` is `unknown` —
+  // no cast needed; the runtime `typeof` check below is the type
+  // guard. Returning `null` for non-string values is the contract
+  // (callers treat the lane as "no reference here").
+  const value: unknown = parsed.pipelineTemplate;
+  return typeof value === 'string' ? value : null;
+}
+
+/**
+ * Compute the list of lane ids whose `pipelineTemplate` equals
+ * `templateId`. Walks every lane config (active + archived) once,
+ * reading each lane's raw JSON directly for the field rather than
+ * routing through `loadLaneConfig` — see `readLanePipelineTemplate`
+ * for the rationale (broken templates must still show their
+ * dependents).
+ */
+function findReferencingLanes(
+  projectRoot: string,
+  templateId: string,
+  laneIds: readonly string[],
+): string[] {
+  const out: string[] = [];
+  for (const laneId of laneIds) {
+    const ref = readLanePipelineTemplate(projectRoot, laneId);
+    if (ref === templateId) out.push(laneId);
+  }
+  return out;
+}
+
+/**
+ * Build a `PipelineRow` from a successfully-loaded template. The
+ * `linearStages` / `lockedStages` / `offPipelineStages` arrays are
+ * defensively re-copied as frozen arrays so the renderer can iterate
+ * without aliasing the loader's internal state.
+ */
+function rowFromTemplate(
+  id: string,
+  source: PipelineSource,
+  template: PipelineTemplate,
+  referencingLanes: readonly string[],
+): PipelineRow {
+  return {
+    id,
+    source,
+    name: template.name,
+    description: template.description,
+    linearStages: [...template.linearStages],
+    lockedStages:
+      template.lockedStages === undefined ? [] : [...template.lockedStages],
+    offPipelineStages: [...template.offPipelineStages],
+    referencingLanes,
+  };
+}
+
+/**
+ * Load the full pipelines-page data view. Resolves every enumerated
+ * template id through `loadPipelineTemplate`; healthy loads land in
+ * `rows`, failures land in `errors` with the offending path + kind +
+ * verbatim message. Lane-reference counts are computed once per
+ * template id against the active+archived lane set.
+ *
+ * @param projectRoot - Absolute project root.
+ */
+export async function loadPipelinesPageData(
+  projectRoot: string,
+): Promise<PipelinesPageData> {
+  const templateIds = listAvailablePipelineTemplates(projectRoot);
+  const laneIds = listLaneConfigs(projectRoot, { includeArchived: true });
+
+  const rows: PipelineRow[] = [];
+  const errors: PipelineErrorRow[] = [];
+
+  for (const id of templateIds) {
+    const source = sourceForId(projectRoot, id);
+    const referencingLanes = findReferencingLanes(projectRoot, id, laneIds);
+    try {
+      const template = loadPipelineTemplate(id, projectRoot);
+      rows.push(rowFromTemplate(id, source, template, referencingLanes));
+    } catch (err) {
+      const message = err instanceof Error ? err.message : String(err);
+      const error: PipelineLoadError = {
+        kind: classifyLoadError(message),
+        path: pathForId(projectRoot, id),
+        message,
+      };
+      errors.push({ id, source, error, referencingLanes });
+    }
+  }
+
+  return {
+    rows,
+    errors,
+    totalLanes: laneIds.length,
+  };
+}
diff --git a/packages/studio/src/pages/pipelines/edit-form.ts b/packages/studio/src/pages/pipelines/edit-form.ts
new file mode 100644
index 0000000..6d0cfb2
--- /dev/null
+++ b/packages/studio/src/pages/pipelines/edit-form.ts
@@ -0,0 +1,307 @@
+/**
+ * Per-template Edit form renderer for `/dev/pipelines` (Phase 6 Task
+ * 6.4 step 6.4.2 + step 6.4.3 — mutation side).
+ *
+ * Each healthy template row gets an inline edit panel rendered in a
+ * hidden sibling `<tr>`. The panel exposes the FIVE mutually-exclusive
+ * `pipeline update` operations as their own `<details>` sub-forms.
+ * The CLI accepts only one operation per invocation, so the panel
+ * reflects that contract by giving each operation its own preview +
+ * Copy button. The operator runs the operations one at a time.
+ *
+ * Sub-forms (mirroring the CLI flags):
+ *
+ *   1. Add stage — `--add-stage <name> [--position N]`
+ *   2. Rename stage — `--rename-stage <from> --to-stage <to>`
+ *   3. Remove stage — `--remove-stage <name>`
+ *   4. Set locked — `--set-locked "<s1>,<s2>,..."`
+ *   5. Set off-pipeline — `--set-off-pipeline "<s1>,<s2>,..."`
+ *
+ * The five panels form a single-open accordion: clicking one opens
+ * it and closes any previously-open sibling. The accordion is wired
+ * client-side; server-side every panel renders closed.
+ *
+ * Plugin-preset templates get a notice at the top of the panel
+ * directing the operator to `/deskwork:customize pipeline <id>`
+ * before mutating — the CLI refuses to mutate a plugin preset, and
+ * surfacing the refusal here means the operator doesn't have to
+ * paste a copy command into Claude Code to learn the gate exists.
+ */
+
+import { html, unsafe, type RawHtml } from '../html.ts';
+import type { PipelineRow } from './data.ts';
+
+interface EditFormInput {
+  readonly row: PipelineRow;
+  readonly availableTemplates: readonly string[];
+}
+
+function renderCustomizeNotice(row: PipelineRow): RawHtml {
+  if (row.source !== 'plugin-preset') return unsafe('');
+  return unsafe(html`
+    <div class="pipelines-edit-notice" role="status">
+      <strong>Plugin preset — customize first.</strong>
+      Plugin-shipped templates are read-only. To mutate, run
+      <code>/deskwork:customize pipeline ${row.id}</code> first;
+      that writes a project-override under <code>.deskwork/pipelines/${row.id}.json</code>
+      which the update operations below can then mutate.
+    </div>`);
+}
+
+function renderStageOptions(
+  stages: readonly string[],
+  selected?: string,
+): readonly RawHtml[] {
+  return stages.map((stage) =>
+    unsafe(
+      html`<option value="${stage}"${unsafe(stage === selected ? ' selected' : '')}>${stage}</option>`,
+    ),
+  );
+}
+
+function renderAddPanel(row: PipelineRow): RawHtml {
+  return unsafe(html`
+    <details class="pipelines-edit-op" data-pipelines-op="add">
+      <summary class="pipelines-edit-op-summary">Add stage</summary>
+      <div class="pipelines-edit-op-body" data-pipelines-op-form="add" data-pipeline-id="${row.id}">
+        <div class="pipelines-form-grid">
+          <label class="pipelines-field">
+            <span class="pipelines-field-label">Stage name</span>
+            <input
+              class="pipelines-input"
+              type="text"
+              data-pipelines-field="add-name"
+              placeholder="e.g. Review"
+              autocomplete="off"
+              spellcheck="false"
+            >
+          </label>
+          <label class="pipelines-field">
+            <span class="pipelines-field-label">Position (optional)</span>
+            <input
+              class="pipelines-input"
+              type="number"
+              min="0"
+              max="${row.linearStages.length}"
+              data-pipelines-field="add-position"
+              placeholder="${row.linearStages.length}"
+            >
+            <span class="pipelines-field-hint">0-indexed; defaults to append</span>
+          </label>
+        </div>
+        <div class="pipelines-form-preview">
+          <span class="pipelines-form-preview-label">Command preview</span>
+          <code class="pipelines-form-preview-cmd" data-pipelines-preview="add" data-pipeline-id="${row.id}">/deskwork:pipeline update ${row.id} --add-stage &lt;name&gt;</code>
+        </div>
+        <div class="pipelines-form-actions">
+          <button
+            class="pipelines-btn pipelines-btn--primary"
+            type="button"
+            data-pipelines-copy-button="add"
+            data-pipeline-id="${row.id}"
+          >Copy command</button>
+        </div>
+      </div>
+    </details>`);
+}
+
+function renderRenamePanel(row: PipelineRow): RawHtml {
+  const allStages = [...row.linearStages, ...row.offPipelineStages];
+  const fromOptions = renderStageOptions(allStages);
+  return unsafe(html`
+    <details class="pipelines-edit-op" data-pipelines-op="rename">
+      <summary class="pipelines-edit-op-summary">Rename stage</summary>
+      <div class="pipelines-edit-op-body" data-pipelines-op-form="rename" data-pipeline-id="${row.id}">
+        <div class="pipelines-form-grid">
+          <label class="pipelines-field">
+            <span class="pipelines-field-label">From</span>
+            <select class="pipelines-select" data-pipelines-field="rename-from" required>
+              <option value="" disabled selected>Pick a stage…</option>
+              ${fromOptions}
+            </select>
+          </label>
+          <label class="pipelines-field">
+            <span class="pipelines-field-label">To</span>
+            <input
+              class="pipelines-input"
+              type="text"
+              data-pipelines-field="rename-to"
+              placeholder="new name"
+              autocomplete="off"
+              spellcheck="false"
+            >
+          </label>
+        </div>
+        <div class="pipelines-form-preview">
+          <span class="pipelines-form-preview-label">Command preview</span>
+          <code class="pipelines-form-preview-cmd" data-pipelines-preview="rename" data-pipeline-id="${row.id}">/deskwork:pipeline update ${row.id} --rename-stage &lt;from&gt; --to-stage &lt;to&gt;</code>
+        </div>
+        <div class="pipelines-form-actions">
+          <button
+            class="pipelines-btn pipelines-btn--primary"
+            type="button"
+            data-pipelines-copy-button="rename"
+            data-pipeline-id="${row.id}"
+          >Copy command</button>
+        </div>
+      </div>
+    </details>`);
+}
+
+function renderRemovePanel(row: PipelineRow): RawHtml {
+  const allStages = [...row.linearStages, ...row.offPipelineStages];
+  const options = renderStageOptions(allStages);
+  return unsafe(html`
+    <details class="pipelines-edit-op" data-pipelines-op="remove">
+      <summary class="pipelines-edit-op-summary">Remove stage</summary>
+      <div class="pipelines-edit-op-body" data-pipelines-op-form="remove" data-pipeline-id="${row.id}">
+        <div class="pipelines-form-grid">
+          <label class="pipelines-field">
+            <span class="pipelines-field-label">Stage</span>
+            <select class="pipelines-select" data-pipelines-field="remove-name" required>
+              <option value="" disabled selected>Pick a stage…</option>
+              ${options}
+            </select>
+          </label>
+        </div>
+        <div class="pipelines-form-preview">
+          <span class="pipelines-form-preview-label">Command preview</span>
+          <code class="pipelines-form-preview-cmd" data-pipelines-preview="remove" data-pipeline-id="${row.id}">/deskwork:pipeline update ${row.id} --remove-stage &lt;name&gt;</code>
+        </div>
+        <div class="pipelines-form-actions">
+          <button
+            class="pipelines-btn pipelines-btn--primary"
+            type="button"
+            data-pipelines-copy-button="remove"
+            data-pipeline-id="${row.id}"
+          >Copy command</button>
+        </div>
+      </div>
+    </details>`);
+}
+
+function renderSetLockedPanel(row: PipelineRow): RawHtml {
+  const lockedSet = new Set(row.lockedStages);
+  const checkboxes = row.linearStages.map((stage) =>
+    unsafe(html`
+      <label class="pipelines-checkbox-field">
+        <input
+          type="checkbox"
+          value="${stage}"
+          data-pipelines-field="set-locked"
+          ${unsafe(lockedSet.has(stage) ? 'checked' : '')}
+        >
+        <span>${stage}</span>
+      </label>`),
+  );
+  return unsafe(html`
+    <details class="pipelines-edit-op" data-pipelines-op="set-locked">
+      <summary class="pipelines-edit-op-summary">Set locked stages</summary>
+      <div class="pipelines-edit-op-body" data-pipelines-op-form="set-locked" data-pipeline-id="${row.id}">
+        <div class="pipelines-field">
+          <span class="pipelines-field-label">Tick the linearStages to lock (pre-terminal review-freeze stages)</span>
+          <div class="pipelines-checkbox-grid">
+            ${checkboxes}
+          </div>
+        </div>
+        <div class="pipelines-form-preview">
+          <span class="pipelines-form-preview-label">Command preview</span>
+          <code class="pipelines-form-preview-cmd" data-pipelines-preview="set-locked" data-pipeline-id="${row.id}">/deskwork:pipeline update ${row.id} --set-locked &lt;comma-sep&gt;</code>
+        </div>
+        <div class="pipelines-form-actions">
+          <button
+            class="pipelines-btn pipelines-btn--primary"
+            type="button"
+            data-pipelines-copy-button="set-locked"
+            data-pipeline-id="${row.id}"
+          >Copy command</button>
+        </div>
+      </div>
+    </details>`);
+}
+
+function renderSetOffPanel(row: PipelineRow): RawHtml {
+  return unsafe(html`
+    <details class="pipelines-edit-op" data-pipelines-op="set-off-pipeline">
+      <summary class="pipelines-edit-op-summary">Set off-pipeline stages</summary>
+      <div class="pipelines-edit-op-body" data-pipelines-op-form="set-off-pipeline" data-pipeline-id="${row.id}">
+        <div class="pipelines-form-grid">
+          <label class="pipelines-field">
+            <span class="pipelines-field-label">Off-pipeline stage names (comma-separated)</span>
+            <input
+              class="pipelines-input"
+              type="text"
+              data-pipelines-field="set-off-pipeline"
+              value="${row.offPipelineStages.join(',')}"
+              placeholder="Blocked,Cancelled"
+              autocomplete="off"
+              spellcheck="false"
+            >
+            <span class="pipelines-field-hint">Cancelled is the cancel verb's destination — most templates include it.</span>
+          </label>
+        </div>
+        <div class="pipelines-form-preview">
+          <span class="pipelines-form-preview-label">Command preview</span>
+          <code class="pipelines-form-preview-cmd" data-pipelines-preview="set-off-pipeline" data-pipeline-id="${row.id}">/deskwork:pipeline update ${row.id} --set-off-pipeline &lt;comma-sep&gt;</code>
+        </div>
+        <div class="pipelines-form-actions">
+          <button
+            class="pipelines-btn pipelines-btn--primary"
+            type="button"
+            data-pipelines-copy-button="set-off-pipeline"
+            data-pipeline-id="${row.id}"
+          >Copy command</button>
+        </div>
+      </div>
+    </details>`);
+}
+
+export function renderEditForm(
+  row: PipelineRow,
+  // availableTemplates kept in the signature for parity with the lanes
+  // edit-form even though the pipeline update verbs don't take a
+  // template id; future extensions (e.g. deletion's --reassign-lanes-to)
+  // can use it without re-threading.
+  _availableTemplates: readonly string[],
+): RawHtml {
+  return unsafe(html`
+    <section
+      class="pipelines-edit-panel"
+      id="pipelines-edit-panel-${row.id}"
+      data-pipelines-edit-panel
+      data-pipeline-id="${row.id}"
+      aria-labelledby="pipelines-edit-heading-${row.id}"
+    >
+      <header class="pipelines-edit-head">
+        <h3 class="pipelines-edit-heading" id="pipelines-edit-heading-${row.id}">
+          Edit <code>${row.id}</code>
+        </h3>
+        <p class="pipelines-edit-desc">
+          The five operations are <strong>mutually exclusive</strong> per
+          <code>deskwork pipeline update</code>. Open one, copy its
+          command, paste into Claude Code. The CLI runs one operation
+          at a time.
+        </p>
+      </header>
+      ${renderCustomizeNotice(row)}
+      <div class="pipelines-edit-ops" data-pipelines-edit-ops>
+        ${renderAddPanel(row)}
+        ${renderRenamePanel(row)}
+        ${renderRemovePanel(row)}
+        ${renderSetLockedPanel(row)}
+        ${renderSetOffPanel(row)}
+      </div>
+      <div class="pipelines-form-actions">
+        <button
+          class="pipelines-btn pipelines-btn--secondary"
+          type="button"
+          data-pipeline-edit-cancel
+          data-pipeline-id="${row.id}"
+        >Close</button>
+      </div>
+    </section>`);
+}
+
+// Keep the input interface exported in case future callers want to
+// thread availableTemplates via the structured object form.
+export type { EditFormInput };
diff --git a/packages/studio/src/pages/pipelines/error-banner.ts b/packages/studio/src/pages/pipelines/error-banner.ts
new file mode 100644
index 0000000..cec1617
--- /dev/null
+++ b/packages/studio/src/pages/pipelines/error-banner.ts
@@ -0,0 +1,27 @@
+/**
+ * Page-level error banner for `/dev/pipelines` (Phase 6 Task 6.4
+ * Phase 2 follow-up).
+ *
+ * When one or more enumerated templates failed to load, the page
+ * surfaces a top-of-page banner naming the count and the affected
+ * ids. The per-row error rows in the table carry the file paths and
+ * loader messages; this banner is the operator's first signal that
+ * something needs fixing before any other action makes sense.
+ *
+ * When no templates failed to load the banner renders nothing —
+ * the function returns an empty `RawHtml`.
+ */
+
+import { html, unsafe, type RawHtml } from '../html.ts';
+import type { PipelineErrorRow } from './data.ts';
+
+export function renderErrorBanner(errors: readonly PipelineErrorRow[]): RawHtml {
+  if (errors.length === 0) return unsafe('');
+  const noun = errors.length === 1 ? 'template' : 'templates';
+  const ids = errors.map((e) => e.id).join(', ');
+  return unsafe(html`
+    <aside class="pipelines-banner pipelines-banner--errors" role="alert" data-pipelines-error-banner>
+      <strong>${errors.length} pipeline ${noun} failed to load.</strong>
+      <span>Affected ids: <code>${ids}</code>. Each row below shows the offending file path and the loader's diagnostic.</span>
+    </aside>`);
+}
diff --git a/packages/studio/src/pages/pipelines/new-form.ts b/packages/studio/src/pages/pipelines/new-form.ts
new file mode 100644
index 0000000..8586f01
--- /dev/null
+++ b/packages/studio/src/pages/pipelines/new-form.ts
@@ -0,0 +1,99 @@
+/**
+ * "New pipeline template" form renderer for `/dev/pipelines` (Phase 6
+ * Task 6.4 step 6.4.1).
+ *
+ * Client-side copy-builder mirroring the lanes-page New form. Per
+ * THESIS Consequence 2 the studio never mutates state — the form's
+ * Copy button clipboards the equivalent
+ * `/deskwork:pipeline create <id> --shape "Stage1,Stage2,..."
+ * [--name <label>] [--description <text>]` slash command.
+ *
+ * Required fields: id, shape. Name and description are optional and
+ * the CLI uses sensible defaults when omitted; the preview leaves
+ * them off when empty.
+ *
+ * The client controller rebuilds the preview on every change event;
+ * the operator-supplied values flow through `quoteValue` for symmetric
+ * quoting across all four fields.
+ */
+
+import { html, unsafe, type RawHtml } from '../html.ts';
+
+export function renderNewPipelineForm(): RawHtml {
+  return unsafe(html`
+    <section class="pipelines-form pipelines-form--new" data-pipelines-new-form aria-labelledby="pipelines-new-form-heading">
+      <header class="pipelines-form-head">
+        <h2 class="pipelines-form-heading" id="pipelines-new-form-heading">New pipeline template</h2>
+        <p class="pipelines-form-desc">
+          A new template lives at <code>.deskwork/pipelines/&lt;id&gt;.json</code>
+          and becomes a project override. Fields update the slash command
+          below; copy it and paste into Claude Code to run.
+        </p>
+      </header>
+      <div class="pipelines-form-grid">
+        <label class="pipelines-field">
+          <span class="pipelines-field-label">Template id</span>
+          <input
+            class="pipelines-input"
+            type="text"
+            name="id"
+            data-pipelines-field="new-id"
+            placeholder="e.g. mockup-workflow"
+            pattern="[a-z0-9][a-z0-9-]*"
+            required
+            autocomplete="off"
+            spellcheck="false"
+          >
+          <span class="pipelines-field-hint">kebab-case, starts with [a-z0-9]</span>
+        </label>
+        <label class="pipelines-field">
+          <span class="pipelines-field-label">Shape (comma-separated linearStages)</span>
+          <input
+            class="pipelines-input"
+            type="text"
+            name="shape"
+            data-pipelines-field="new-shape"
+            placeholder="Idea,Sketch,Inked,Final"
+            required
+            autocomplete="off"
+            spellcheck="false"
+          >
+          <span class="pipelines-field-hint">Last stage is terminal; "Cancelled" is appended as off-pipeline by default.</span>
+        </label>
+        <label class="pipelines-field">
+          <span class="pipelines-field-label">Name (optional)</span>
+          <input
+            class="pipelines-input"
+            type="text"
+            name="name"
+            data-pipelines-field="new-name"
+            placeholder="Human-readable label"
+            autocomplete="off"
+          >
+          <span class="pipelines-field-hint">defaults to the id</span>
+        </label>
+        <label class="pipelines-field">
+          <span class="pipelines-field-label">Description (optional)</span>
+          <input
+            class="pipelines-input"
+            type="text"
+            name="description"
+            data-pipelines-field="new-description"
+            placeholder="Short description"
+            autocomplete="off"
+          >
+        </label>
+      </div>
+      <div class="pipelines-form-preview">
+        <span class="pipelines-form-preview-label">Command preview</span>
+        <code class="pipelines-form-preview-cmd" data-pipelines-preview="new">/deskwork:pipeline create &lt;id&gt; --shape &lt;stages&gt;</code>
+      </div>
+      <div class="pipelines-form-actions">
+        <button
+          class="pipelines-btn pipelines-btn--primary"
+          type="button"
+          data-pipelines-copy-button="new"
+        >Copy command</button>
+      </div>
+    </section>`);
+}
diff --git a/packages/studio/src/pages/pipelines/table.ts b/packages/studio/src/pages/pipelines/table.ts
new file mode 100644
index 0000000..ab8aa43
--- /dev/null
+++ b/packages/studio/src/pages/pipelines/table.ts
@@ -0,0 +1,229 @@
+/**
+ * Pipeline-table renderer for `/dev/pipelines` (Phase 6 Task 6.4).
+ *
+ * Renders one row per template: id, source (plugin-preset vs
+ * project-override), linear-stage count, locked-stage count,
+ * off-pipeline-stage count, referencing-lane count, plus per-row
+ * View / Edit / Delete buttons.
+ *
+ * Per `.claude/rules/affordance-placement.md`, every per-row action
+ * lives ON the row — the View toggle, the Edit toggle, and the
+ * Delete copy button (or its disabled-with-explanation variant).
+ *
+ * Per THESIS Consequence 2 the page never mutates state on the
+ * server. Each button is a clipboard payload — the client controller
+ * (`pipelines-page.ts`) copies it on click.
+ *
+ * Gates rendered visibly so the operator sees them before clicking:
+ *
+ *   - **Delete on a plugin preset** — disabled, title reads
+ *     "Cannot delete plugin preset; customize to project override
+ *     first." The next-step suggestion names `/deskwork:customize`.
+ *
+ *   - **Delete on a template with referencing lanes** — disabled,
+ *     title enumerates the dependent lane ids and suggests the
+ *     `--reassign-lanes-to <other-id>` workflow. Mirrors Task 6.3's
+ *     disabled-Purge pattern.
+ *
+ *   - **Edit on a plugin preset** — the toggle is still present (the
+ *     operator can view the form) but the form-side notice surfaces
+ *     a "Customize first" CTA pointing at `/deskwork:customize
+ *     pipeline <id>`. The edit-form module owns that markup; this
+ *     table just passes through the source.
+ */
+
+import { html, unsafe, type RawHtml } from '../html.ts';
+import type {
+  PipelineRow,
+  PipelineErrorRow,
+  PipelineLoadErrorKind,
+} from './data.ts';
+import { renderViewPanel } from './view-panel.ts';
+import { renderEditForm } from './edit-form.ts';
+
+const COPY_BTN_VIEW_LABEL = 'View';
+const COPY_BTN_EDIT_LABEL = 'Edit';
+const COPY_BTN_DELETE_LABEL = 'Delete';
+
+interface RenderPipelineTableInput {
+  readonly rows: readonly PipelineRow[];
+  readonly errors: readonly PipelineErrorRow[];
+  readonly availableTemplates: readonly string[];
+}
+
+function renderHealthyRow(
+  row: PipelineRow,
+  availableTemplates: readonly string[],
+): RawHtml {
+  const deleteButton = renderDeleteButton(row);
+  const sourceBadge = renderSourceBadge(row.source);
+
+  return unsafe(html`
+    <tr class="pipelines-row" data-pipeline-row data-pipeline-id="${row.id}" data-pipeline-source="${row.source}">
+      <td class="pipelines-cell pipelines-cell--id"><code>${row.id}</code></td>
+      <td class="pipelines-cell pipelines-cell--source">${sourceBadge}</td>
+      <td class="pipelines-cell pipelines-cell--linear-count">${row.linearStages.length}</td>
+      <td class="pipelines-cell pipelines-cell--locked-count">${row.lockedStages.length}</td>
+      <td class="pipelines-cell pipelines-cell--off-count">${row.offPipelineStages.length}</td>
+      <td class="pipelines-cell pipelines-cell--lanes-count">${row.referencingLanes.length}</td>
+      <td class="pipelines-cell pipelines-cell--actions">
+        <button
+          class="pipelines-btn pipelines-btn--view"
+          type="button"
+          data-pipeline-view-toggle
+          data-pipeline-id="${row.id}"
+          aria-expanded="false"
+          aria-controls="pipelines-view-panel-${row.id}"
+        >${COPY_BTN_VIEW_LABEL}</button>
+        <button
+          class="pipelines-btn pipelines-btn--edit"
+          type="button"
+          data-pipeline-edit-toggle
+          data-pipeline-id="${row.id}"
+          aria-expanded="false"
+          aria-controls="pipelines-edit-panel-${row.id}"
+        >${COPY_BTN_EDIT_LABEL}</button>
+        ${deleteButton}
+      </td>
+    </tr>
+    <tr class="pipelines-row pipelines-row--view-panel" data-pipeline-view-row data-pipeline-id="${row.id}" hidden>
+      <td class="pipelines-cell" colspan="7">
+        ${renderViewPanel(row)}
+      </td>
+    </tr>
+    <tr class="pipelines-row pipelines-row--edit-panel" data-pipeline-edit-row data-pipeline-id="${row.id}" hidden>
+      <td class="pipelines-cell" colspan="7">
+        ${renderEditForm(row, availableTemplates)}
+      </td>
+    </tr>`);
+}
+
+function renderSourceBadge(source: PipelineRow['source']): RawHtml {
+  if (source === 'project-override') {
+    return unsafe(html`
+      <span class="pipelines-source pipelines-source--override" title="Project override at .deskwork/pipelines/&lt;id&gt;.json">
+        override
+      </span>`);
+  }
+  return unsafe(html`
+    <span class="pipelines-source pipelines-source--preset" title="Plugin-shipped preset; customize to mutate">
+      preset
+    </span>`);
+}
+
+function renderDeleteButton(row: PipelineRow): RawHtml {
+  // Two gates surface as visibly-disabled chrome so the operator sees
+  // the obstruction before clicking. The CLI enforces the same gates;
+  // these are the visual mirrors.
+  if (row.source === 'plugin-preset') {
+    return unsafe(html`
+      <button
+        class="pipelines-btn pipelines-btn--delete-disabled"
+        type="button"
+        disabled
+        aria-disabled="true"
+        title="Cannot delete a plugin preset. Customize to a project override first: /deskwork:customize pipeline ${row.id}"
+      >${COPY_BTN_DELETE_LABEL}</button>`);
+  }
+  if (row.referencingLanes.length > 0) {
+    const noun = row.referencingLanes.length === 1 ? 'lane' : 'lanes';
+    const list = row.referencingLanes.join(', ');
+    return unsafe(html`
+      <button
+        class="pipelines-btn pipelines-btn--delete-disabled"
+        type="button"
+        disabled
+        aria-disabled="true"
+        title="Cannot delete: ${row.referencingLanes.length} ${noun} reference this template (${list}). Reassign first via /deskwork:pipeline delete ${row.id} --reassign-lanes-to <other-id>."
+      >${COPY_BTN_DELETE_LABEL} — ${row.referencingLanes.length} ${noun}</button>`);
+  }
+  return unsafe(html`
+    <button
+      class="pipelines-btn pipelines-btn--delete"
+      type="button"
+      data-pipeline-copy
+      data-copy="/deskwork:pipeline delete ${row.id}"
+      title="Copy /deskwork:pipeline delete ${row.id} to clipboard"
+    >${COPY_BTN_DELETE_LABEL}</button>`);
+}
+
+function describeErrorKind(kind: PipelineLoadErrorKind): string {
+  switch (kind) {
+    case 'parse':
+      return 'JSON parse error';
+    case 'zod':
+      return 'Schema validation failed';
+    case 'id-mismatch':
+      return 'id field disagrees with filename basename';
+    case 'missing':
+      return 'File not found';
+    case 'unknown':
+      return 'Load error';
+  }
+}
+
+function renderErrorRow(row: PipelineErrorRow): RawHtml {
+  const noun = row.referencingLanes.length === 1 ? 'lane' : 'lanes';
+  const dependents =
+    row.referencingLanes.length > 0
+      ? html`<p class="pipelines-error-dependents">${row.referencingLanes.length} ${noun} reference this template: <code>${row.referencingLanes.join(', ')}</code></p>`
+      : '';
+
+  return unsafe(html`
+    <tr class="pipelines-row pipelines-row--error" data-pipeline-row data-pipeline-id="${row.id}" data-pipeline-error>
+      <td class="pipelines-cell pipelines-cell--id"><code>${row.id}</code></td>
+      <td class="pipelines-cell pipelines-cell--source">
+        <span class="pipelines-source pipelines-source--error" title="Template failed to load">error</span>
+      </td>
+      <td class="pipelines-cell" colspan="5">
+        <div class="pipelines-error" data-pipeline-error-detail>
+          <p class="pipelines-error-kind">${describeErrorKind(row.error.kind)}</p>
+          <p class="pipelines-error-path">at <code>${row.error.path}</code></p>
+          <pre class="pipelines-error-message">${row.error.message}</pre>
+          ${unsafe(dependents)}
+        </div>
+      </td>
+    </tr>`);
+}
+
+function renderHeadRow(): RawHtml {
+  return unsafe(html`
+    <tr>
+      <th class="pipelines-th pipelines-th--id" scope="col">ID</th>
+      <th class="pipelines-th pipelines-th--source" scope="col">Source</th>
+      <th class="pipelines-th pipelines-th--linear-count" scope="col" title="Linear stage count">Stages</th>
+      <th class="pipelines-th pipelines-th--locked-count" scope="col" title="Locked stage count">Locked</th>
+      <th class="pipelines-th pipelines-th--off-count" scope="col" title="Off-pipeline stage count">Off-pipeline</th>
+      <th class="pipelines-th pipelines-th--lanes-count" scope="col" title="Lanes referencing this template">Lanes</th>
+      <th class="pipelines-th pipelines-th--actions" scope="col">Actions</th>
+    </tr>`);
+}
+
+export function renderPipelineTable(input: RenderPipelineTableInput): RawHtml {
+  if (input.rows.length === 0 && input.errors.length === 0) {
+    return unsafe(html`
+      <table class="pipelines-table" data-pipelines-table>
+        <caption class="pipelines-table-caption">Pipeline templates</caption>
+        <thead>${renderHeadRow()}</thead>
+        <tbody>
+          <tr class="pipelines-row pipelines-row--empty">
+            <td class="pipelines-cell pipelines-cell--empty" colspan="7">
+              No pipeline templates visible. Plugin presets should always
+              appear here; if you see this, the @deskwork/core build is
+              missing its preset JSON.
+            </td>
+          </tr>
+        </tbody>
+      </table>`);
+  }
+
+  return unsafe(html`
+    <table class="pipelines-table" data-pipelines-table>
+      <caption class="pipelines-table-caption">Pipeline templates</caption>
+      <thead>${renderHeadRow()}</thead>
+      <tbody>
+        ${input.rows.map((row) => renderHealthyRow(row, input.availableTemplates))}
+        ${input.errors.map((row) => renderErrorRow(row))}
+      </tbody>
+    </table>`);
+}
diff --git a/packages/studio/src/pages/pipelines/view-panel.ts b/packages/studio/src/pages/pipelines/view-panel.ts
new file mode 100644
index 0000000..3de7154
--- /dev/null
+++ b/packages/studio/src/pages/pipelines/view-panel.ts
@@ -0,0 +1,101 @@
+/**
+ * Stage-flow visualization for `/dev/pipelines` (Phase 6 Task 6.4
+ * step 6.4.2 — read-side).
+ *
+ * Renders a horizontal flow of pill-shaped stage chips for
+ * `linearStages`, with `lockedStages` marked by a proof-blue lock
+ * outline so they're visually distinct from the freely-iterable
+ * stages. `offPipelineStages` render in a separate section below the
+ * linear flow, with kraft chrome so they read as cul-de-sacs rather
+ * than parts of the main spine.
+ *
+ * The visualization is READ-ONLY. The edit form (separate module)
+ * surfaces the 5 mutation operations as their own slash-command
+ * builders. This panel exists so the operator can see the current
+ * shape before deciding what to change.
+ *
+ * Per `.claude/rules/design-standards.md`: the press-check vocabulary
+ * already in editorial-review.css (proof-blue, kraft, ink, paper) is
+ * the source for chip colors. The pipelines page does NOT introduce
+ * any new color or shape language; it composes the existing tokens.
+ */
+
+import { html, unsafe, type RawHtml } from '../html.ts';
+import type { PipelineRow } from './data.ts';
+
+function renderLinearStage(
+  stage: string,
+  isLocked: boolean,
+  isLast: boolean,
+): RawHtml {
+  const lockClass = isLocked ? ' pipelines-stage--locked' : '';
+  const lockBadge = isLocked
+    ? unsafe(html`<span class="pipelines-stage-badge" aria-label="locked stage">lock</span>`)
+    : '';
+  const arrow = isLast
+    ? ''
+    : unsafe(html`<span class="pipelines-stage-arrow" aria-hidden="true">→</span>`);
+  return unsafe(html`
+    <li class="pipelines-stage-item">
+      <span class="pipelines-stage pipelines-stage--linear${unsafe(lockClass)}" data-pipeline-stage="${stage}">
+        <span class="pipelines-stage-label">${stage}</span>
+        ${lockBadge}
+      </span>
+      ${arrow}
+    </li>`);
+}
+
+function renderOffPipelineStage(stage: string): RawHtml {
+  return unsafe(html`
+    <li class="pipelines-stage-item">
+      <span class="pipelines-stage pipelines-stage--off" data-pipeline-stage="${stage}">
+        <span class="pipelines-stage-label">${stage}</span>
+      </span>
+    </li>`);
+}
+
+export function renderViewPanel(row: PipelineRow): RawHtml {
+  const lockedSet = new Set(row.lockedStages);
+  const linearItems = row.linearStages.map((stage, idx) =>
+    renderLinearStage(
+      stage,
+      lockedSet.has(stage),
+      idx === row.linearStages.length - 1,
+    ),
+  );
+  const offItems = row.offPipelineStages.map(renderOffPipelineStage);
+
+  const offSection =
+    row.offPipelineStages.length === 0
+      ? ''
+      : unsafe(html`
+        <section class="pipelines-view-off" aria-labelledby="pipelines-view-off-heading-${row.id}">
+          <h4 class="pipelines-view-subheading" id="pipelines-view-off-heading-${row.id}">Off-pipeline</h4>
+          <ul class="pipelines-stage-list pipelines-stage-list--off">
+            ${offItems}
+          </ul>
+        </section>`);
+
+  return unsafe(html`
+    <section
+      class="pipelines-view-panel"
+      id="pipelines-view-panel-${row.id}"
+      data-pipelines-view-panel
+      data-pipeline-id="${row.id}"
+      aria-labelledby="pipelines-view-heading-${row.id}"
+    >
+      <header class="pipelines-view-head">
+        <h3 class="pipelines-view-heading" id="pipelines-view-heading-${row.id}">
+          <code>${row.id}</code>: ${row.name}
+        </h3>
+        <p class="pipelines-view-desc">${row.description}</p>
+      </header>
+      <section class="pipelines-view-linear" aria-labelledby="pipelines-view-linear-heading-${row.id}">
+        <h4 class="pipelines-view-subheading" id="pipelines-view-linear-heading-${row.id}">Linear flow</h4>
+        <ul class="pipelines-stage-list pipelines-stage-list--linear">
+          ${linearItems}
+        </ul>
+      </section>
+      ${offSection}
+    </section>`);
+}
diff --git a/packages/studio/src/server.ts b/packages/studio/src/server.ts
index 7db0e7c..4c4dac9 100755
--- a/packages/studio/src/server.ts
+++ b/packages/studio/src/server.ts
@@ -44,6 +44,8 @@ import { renderShortformReviewPage } from './pages/shortform-review.ts';
 import { renderEntryReviewPage } from './pages/entry-review.ts';
 import { renderShortformPage } from './pages/shortform.ts';
 import { renderHelpPage } from './pages/help.ts';
+import { renderLanesPage } from './pages/lanes.ts';
+import { renderPipelinesPage } from './pages/pipelines.ts';
 import { renderScrapbookPage, ScrapbookPageError } from './pages/scrapbook.ts';
 import {
   renderContentTopLevel,
@@ -256,6 +258,24 @@ export function createApp(ctx: StudioContext): Hono {
     if (overridden !== null) return c.html(overridden);
     return c.html(renderHelpPage(ctx));
   });
+  // Phase 6 Task 6.3: studio lane-management page. Server-renders
+  // the lane registry + a copy-builder New Lane form + per-row
+  // Edit / Archive / Restore / Purge clipboard buttons. The page
+  // never mutates sidecar state — every button copies an equivalent
+  // /deskwork:lane <verb> slash command per THESIS Consequence 2.
+  app.get('/dev/lanes', async (c) => c.html(await renderLanesPage(ctx)));
+  app.get('/dev/lanes/', async (c) => c.html(await renderLanesPage(ctx)));
+  // Phase 6 Task 6.4: studio pipeline-editor page. Server-renders
+  // the pipeline registry (plugin presets + project overrides) with
+  // a copy-builder New form, per-row View / Edit / Delete affordances
+  // (Edit surfaces the five mutually-exclusive update operations as
+  // collapsed sub-forms), and an error banner + inline error rows
+  // when any override JSON fails to load. Per THESIS Consequence 2
+  // no button mutates server state — every action copies an
+  // equivalent /deskwork:pipeline <verb> slash command to the
+  // clipboard.
+  app.get('/dev/pipelines', async (c) => c.html(await renderPipelinesPage(ctx)));
+  app.get('/dev/pipelines/', async (c) => c.html(await renderPipelinesPage(ctx)));
   app.get('/dev/editorial-review-shortform', (c) =>
     c.html(renderShortformPage(ctx)),
   );
diff --git a/packages/studio/test/lanes/data.test.ts b/packages/studio/test/lanes/data.test.ts
new file mode 100644
index 0000000..c44f250
--- /dev/null
+++ b/packages/studio/test/lanes/data.test.ts
@@ -0,0 +1,212 @@
+/**
+ * Unit tests for the lanes-page data layer (Phase 6 Task 6.3).
+ *
+ * Covers:
+ *   - active + archived split (rows whose JSON carries `archivedAt`
+ *     are routed to the archived bucket).
+ *   - per-lane entry-count aggregation from sidecars.
+ *   - unrouted-entry tally (entries with no `lane` field, or with a
+ *     lane id that doesn't exist on disk).
+ *   - available-templates enumeration (plugin presets visible to the
+ *     project).
+ *   - empty-project shape (no lanes, no entries → all zeros, no
+ *     throws).
+ *
+ * Fixture project trees on disk per `.claude/rules/testing.md`.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { writeSidecar } from '@deskwork/core/sidecar';
+import type { Entry } from '@deskwork/core/schema/entry';
+import { loadLanesPageData } from '../../src/pages/lanes/data.ts';
+
+function makeEntry(overrides: Partial<Entry>): Entry {
+  return {
+    uuid: '11111111-1111-4111-8111-111111111111',
+    slug: 'placeholder',
+    title: 'Placeholder',
+    keywords: [],
+    source: 'manual',
+    currentStage: 'Drafting',
+    iterationByStage: { Drafting: 0 },
+    createdAt: '2026-05-28T10:00:00.000Z',
+    updatedAt: '2026-05-28T10:00:00.000Z',
+    ...overrides,
+  };
+}
+
+function writeLane(
+  root: string,
+  id: string,
+  name: string,
+  pipelineTemplate: string,
+  contentDir: string,
+  archivedAt?: string,
+): void {
+  const json: Record<string, string> = { id, name, pipelineTemplate, contentDir };
+  if (archivedAt !== undefined) json.archivedAt = archivedAt;
+  writeFileSync(
+    join(root, '.deskwork', 'lanes', `${id}.json`),
+    JSON.stringify(json, null, 2),
+    'utf8',
+  );
+}
+
+describe('loadLanesPageData', () => {
+  let root: string;
+
+  beforeEach(() => {
+    root = mkdtempSync(join(tmpdir(), 'deskwork-lanes-data-'));
+    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
+    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
+  });
+
+  afterEach(() => {
+    rmSync(root, { recursive: true, force: true });
+  });
+
+  it('returns zeroed shape on an empty project (no lanes, no entries)', async () => {
+    const data = await loadLanesPageData(root);
+    expect(data.active).toEqual([]);
+    expect(data.archived).toEqual([]);
+    expect(data.totalEntries).toBe(0);
+    expect(data.unroutedEntries).toBe(0);
+    // Plugin presets ship with the @deskwork/core build; the enumerator
+    // surfaces them even on an empty project. We only assert non-empty
+    // here so the test doesn't couple to the exact preset list.
+    expect(data.availableTemplates.length).toBeGreaterThan(0);
+  });
+
+  it('routes active vs archived lanes by archivedAt presence', async () => {
+    writeLane(root, 'editorial-lane', 'Editorial', 'editorial', 'docs');
+    writeLane(
+      root,
+      'old-lane',
+      'Old',
+      'editorial',
+      'docs-old',
+      '2026-04-01T10:00:00.000Z',
+    );
+
+    const data = await loadLanesPageData(root);
+    expect(data.active.map((r) => r.id)).toEqual(['editorial-lane']);
+    expect(data.archived.map((r) => r.id)).toEqual(['old-lane']);
+    expect(data.active[0].archived).toBe(false);
+    expect(data.archived[0].archived).toBe(true);
+    expect(data.archived[0].archivedAt).toBe('2026-04-01T10:00:00.000Z');
+  });
+
+  it('aggregates per-lane entry counts from sidecars', async () => {
+    writeLane(root, 'editorial-lane', 'Editorial', 'editorial', 'docs');
+    writeLane(root, 'visual-lane', 'Visual', 'visual', 'mockups');
+
+    await writeSidecar(
+      root,
+      makeEntry({
+        uuid: '11111111-1111-4111-8111-111111111111',
+        slug: 'a',
+        lane: 'editorial-lane',
+      }),
+    );
+    await writeSidecar(
+      root,
+      makeEntry({
+        uuid: '22222222-2222-4222-8222-222222222222',
+        slug: 'b',
+        lane: 'editorial-lane',
+      }),
+    );
+    await writeSidecar(
+      root,
+      makeEntry({
+        uuid: '33333333-3333-4333-8333-333333333333',
+        slug: 'c',
+        lane: 'visual-lane',
+        currentStage: 'Sketched',
+        iterationByStage: { Sketched: 0 },
+      }),
+    );
+
+    const data = await loadLanesPageData(root);
+    const byId = new Map(data.active.map((r) => [r.id, r]));
+    expect(byId.get('editorial-lane')?.entryCount).toBe(2);
+    expect(byId.get('visual-lane')?.entryCount).toBe(1);
+    expect(data.totalEntries).toBe(3);
+    expect(data.unroutedEntries).toBe(0);
+  });
+
+  it('counts entries with no lane field as unrouted', async () => {
+    writeLane(root, 'editorial-lane', 'Editorial', 'editorial', 'docs');
+    await writeSidecar(
+      root,
+      makeEntry({
+        uuid: '11111111-1111-4111-8111-111111111111',
+        slug: 'no-lane-1',
+      }),
+    );
+    await writeSidecar(
+      root,
+      makeEntry({
+        uuid: '22222222-2222-4222-8222-222222222222',
+        slug: 'with-lane',
+        lane: 'editorial-lane',
+      }),
+    );
+
+    const data = await loadLanesPageData(root);
+    expect(data.unroutedEntries).toBe(1);
+    expect(data.active[0].entryCount).toBe(1);
+  });
+
+  it('counts entries whose lane references a missing lane as unrouted', async () => {
+    writeLane(root, 'editorial-lane', 'Editorial', 'editorial', 'docs');
+    await writeSidecar(
+      root,
+      makeEntry({
+        uuid: '11111111-1111-4111-8111-111111111111',
+        slug: 'orphan',
+        lane: 'does-not-exist',
+      }),
+    );
+
+    const data = await loadLanesPageData(root);
+    expect(data.unroutedEntries).toBe(1);
+    expect(data.totalEntries).toBe(1);
+  });
+
+  it('routes entry counts to archived lanes too (archived lanes still own their entries)', async () => {
+    writeLane(
+      root,
+      'archived-lane',
+      'Archived',
+      'editorial',
+      'docs-archived',
+      '2026-04-01T10:00:00.000Z',
+    );
+    await writeSidecar(
+      root,
+      makeEntry({
+        uuid: '11111111-1111-4111-8111-111111111111',
+        slug: 'in-archived',
+        lane: 'archived-lane',
+      }),
+    );
+
+    const data = await loadLanesPageData(root);
+    expect(data.archived[0].entryCount).toBe(1);
+    expect(data.unroutedEntries).toBe(0);
+  });
+
+  it('preserves the lane fields in each row', async () => {
+    writeLane(root, 'editorial-lane', 'Editorial', 'editorial', 'docs');
+    const data = await loadLanesPageData(root);
+    const row = data.active[0];
+    expect(row.id).toBe('editorial-lane');
+    expect(row.name).toBe('Editorial');
+    expect(row.pipelineTemplate).toBe('editorial');
+    expect(row.contentDir).toBe('docs');
+  });
+});
diff --git a/packages/studio/test/lanes/lanes-page-client.test.ts b/packages/studio/test/lanes/lanes-page-client.test.ts
new file mode 100644
index 0000000..7b5edc9
--- /dev/null
+++ b/packages/studio/test/lanes/lanes-page-client.test.ts
@@ -0,0 +1,507 @@
+/**
+ * @vitest-environment jsdom
+ *
+ * Client-controller tests for the `/dev/lanes` page (Phase 6 Task
+ * 6.3).
+ *
+ * Coverage:
+ *   - New form: editing fields rebuilds the slash-command preview
+ *     live.
+ *   - New form: copy button calls navigator.clipboard.writeText with
+ *     the assembled `/deskwork:lane create ...` command.
+ *   - Edit form: only changed fields appear in the
+ *     `/deskwork:lane update ...` command.
+ *   - Edit form: untouched form copies a bare `/deskwork:lane update
+ *     <id>` (no flags) — the CLI rejects this; the studio's job is
+ *     to surface the no-op shape so the operator sees the gate.
+ *   - Edit toggle: clicking Edit reveals the hidden form row +
+ *     flips aria-expanded; clicking Close hides it again.
+ *   - Row Archive button: clicking copies the `/deskwork:lane archive
+ *     <id>` command from the button's data-copy attribute.
+ *   - Missing container: initLanesPage is a no-op (no throws) when
+ *     `[data-lanes-container]` is absent.
+ */
+
+import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
+import { initLanesPage } from '../../../../plugins/deskwork-studio/public/src/lanes/lanes-page';
+
+function buildContainer(): HTMLElement {
+  document.body.innerHTML = '';
+  const container = document.createElement('main');
+  container.dataset.lanesContainer = '';
+  document.body.appendChild(container);
+  return container;
+}
+
+function buildNewForm(container: HTMLElement, templates: readonly string[]): HTMLElement {
+  const form = document.createElement('section');
+  form.dataset.lanesNewForm = '';
+
+  // id
+  const idInput = document.createElement('input');
+  idInput.dataset.lanesField = 'id';
+  form.appendChild(idInput);
+  // name
+  const nameInput = document.createElement('input');
+  nameInput.dataset.lanesField = 'name';
+  form.appendChild(nameInput);
+  // template
+  const select = document.createElement('select');
+  select.dataset.lanesField = 'template';
+  const blank = document.createElement('option');
+  blank.value = '';
+  select.appendChild(blank);
+  for (const t of templates) {
+    const opt = document.createElement('option');
+    opt.value = t;
+    opt.textContent = t;
+    select.appendChild(opt);
+  }
+  form.appendChild(select);
+  // contentDir
+  const contentDir = document.createElement('input');
+  contentDir.dataset.lanesField = 'contentDir';
+  form.appendChild(contentDir);
+  // preview + copy
+  const preview = document.createElement('code');
+  preview.dataset.lanesPreview = '';
+  form.appendChild(preview);
+  const copy = document.createElement('button');
+  copy.type = 'button';
+  copy.dataset.lanesCopyButton = 'new';
+  copy.textContent = 'Copy command';
+  form.appendChild(copy);
+
+  container.appendChild(form);
+  return form;
+}
+
+function buildEditFormRow(
+  container: HTMLElement,
+  laneId: string,
+  current: { name: string; template: string; contentDir: string },
+  templates: readonly string[],
+): { toggleRow: HTMLElement; editRow: HTMLElement; toggle: HTMLButtonElement; form: HTMLElement } {
+  // Toggle row
+  const toggleRow = document.createElement('tr');
+  toggleRow.dataset.laneRow = '';
+  toggleRow.dataset.laneId = laneId;
+  const actionsCell = document.createElement('td');
+  const toggle = document.createElement('button');
+  toggle.type = 'button';
+  toggle.dataset.laneEditToggle = '';
+  toggle.dataset.laneId = laneId;
+  toggle.setAttribute('aria-expanded', 'false');
+  actionsCell.appendChild(toggle);
+
+  // Archive button (carries data-lane-copy)
+  const archiveBtn = document.createElement('button');
+  archiveBtn.type = 'button';
+  archiveBtn.dataset.laneCopy = '';
+  archiveBtn.dataset.copy = `/deskwork:lane archive ${laneId}`;
+  archiveBtn.textContent = 'Archive';
+  actionsCell.appendChild(archiveBtn);
+  toggleRow.appendChild(actionsCell);
+  container.appendChild(toggleRow);
+
+  // Edit form row (hidden)
+  const editRow = document.createElement('tr');
+  editRow.dataset.laneEditRow = '';
+  editRow.dataset.laneId = laneId;
+  editRow.hidden = true;
+  const cell = document.createElement('td');
+  const form = document.createElement('section');
+  form.dataset.lanesEditForm = '';
+  form.dataset.laneId = laneId;
+
+  const nameInput = document.createElement('input');
+  nameInput.dataset.lanesField = 'name';
+  nameInput.dataset.current = current.name;
+  nameInput.value = current.name;
+  form.appendChild(nameInput);
+
+  const select = document.createElement('select');
+  select.dataset.lanesField = 'template';
+  select.dataset.current = current.template;
+  for (const t of templates) {
+    const opt = document.createElement('option');
+    opt.value = t;
+    opt.textContent = t;
+    if (t === current.template) opt.selected = true;
+    select.appendChild(opt);
+  }
+  form.appendChild(select);
+
+  const contentDirInput = document.createElement('input');
+  contentDirInput.dataset.lanesField = 'contentDir';
+  contentDirInput.dataset.current = current.contentDir;
+  contentDirInput.value = current.contentDir;
+  form.appendChild(contentDirInput);
+
+  const preview = document.createElement('code');
+  preview.dataset.lanesPreview = '';
+  preview.dataset.laneId = laneId;
+  form.appendChild(preview);
+
+  const copy = document.createElement('button');
+  copy.type = 'button';
+  copy.dataset.lanesCopyButton = 'edit';
+  copy.dataset.laneId = laneId;
+  copy.textContent = 'Copy command';
+  form.appendChild(copy);
+
+  const cancel = document.createElement('button');
+  cancel.type = 'button';
+  cancel.dataset.laneEditCancel = '';
+  cancel.dataset.laneId = laneId;
+  cancel.textContent = 'Close';
+  form.appendChild(cancel);
+
+  cell.appendChild(form);
+  editRow.appendChild(cell);
+  container.appendChild(editRow);
+
+  return { toggleRow, editRow, toggle, form };
+}
+
+function installClipboardStub(): { calls: string[] } {
+  const calls: string[] = [];
+  const clipboardStub = {
+    writeText: async (text: string) => {
+      calls.push(text);
+    },
+  };
+  Object.defineProperty(navigator, 'clipboard', {
+    value: clipboardStub,
+    configurable: true,
+    writable: false,
+  });
+  Object.defineProperty(window, 'isSecureContext', {
+    value: true,
+    configurable: true,
+    writable: false,
+  });
+  return { calls };
+}
+
+function inputEvent(): Event {
+  const ev = new Event('input', { bubbles: true });
+  return ev;
+}
+
+function changeEvent(): Event {
+  const ev = new Event('change', { bubbles: true });
+  return ev;
+}
+
+describe('lanes-page client controller', () => {
+  beforeEach(() => {
+    document.body.innerHTML = '';
+  });
+
+  afterEach(() => {
+    vi.restoreAllMocks();
+  });
+
+  it('is a no-op when [data-lanes-container] is absent', () => {
+    document.body.innerHTML = '<div>no container</div>';
+    expect(() => initLanesPage()).not.toThrow();
+  });
+
+  it('New form: live-updates the slash-command preview on input', () => {
+    const container = buildContainer();
+    buildNewForm(container, ['editorial', 'visual']);
+    initLanesPage();
+    const preview = container.querySelector<HTMLElement>('[data-lanes-preview]')!;
+
+    // Initial preview is the placeholder shape (no values yet)
+    expect(preview.textContent).toMatch(/^\/deskwork:lane create <id>/);
+
+    // Every operator-supplied value is JSON-stringified into the
+    // command (quoted symmetrically across id / name / template /
+    // contentDir). Placeholders stay un-quoted angle-brackets.
+    const idInput = container.querySelector<HTMLInputElement>('[data-lanes-field="id"]')!;
+    idInput.value = 'mockups';
+    idInput.dispatchEvent(inputEvent());
+    expect(preview.textContent).toContain('/deskwork:lane create "mockups"');
+
+    const select = container.querySelector<HTMLSelectElement>('[data-lanes-field="template"]')!;
+    select.value = 'visual';
+    select.dispatchEvent(changeEvent());
+    expect(preview.textContent).toContain('--template "visual"');
+
+    const contentDir = container.querySelector<HTMLInputElement>('[data-lanes-field="contentDir"]')!;
+    contentDir.value = 'mockups';
+    contentDir.dispatchEvent(inputEvent());
+    expect(preview.textContent).toContain('--content-dir "mockups"');
+
+    // Optional name appears only when filled
+    expect(preview.textContent).not.toContain('--name');
+    const name = container.querySelector<HTMLInputElement>('[data-lanes-field="name"]')!;
+    name.value = 'Mockup Lane';
+    name.dispatchEvent(inputEvent());
+    expect(preview.textContent).toContain('--name "Mockup Lane"');
+  });
+
+  it('New form: copy button writes the assembled slash command to the clipboard', async () => {
+    const container = buildContainer();
+    const form = buildNewForm(container, ['editorial', 'visual']);
+    const { calls } = installClipboardStub();
+    initLanesPage();
+
+    (container.querySelector<HTMLInputElement>('[data-lanes-field="id"]')!).value = 'mockups';
+    (container.querySelector<HTMLSelectElement>('[data-lanes-field="template"]')!).value = 'visual';
+    (container.querySelector<HTMLInputElement>('[data-lanes-field="contentDir"]')!).value = 'mockups';
+
+    const copy = form.querySelector<HTMLButtonElement>('[data-lanes-copy-button="new"]')!;
+    copy.click();
+    // Allow the async copyAndFlash to flush.
+    await Promise.resolve();
+    await Promise.resolve();
+
+    expect(calls.length).toBe(1);
+    expect(calls[0]).toContain(
+      '/deskwork:lane create "mockups" --template "visual" --content-dir "mockups"',
+    );
+  });
+
+  it('Edit form: only changed fields appear in the update command', () => {
+    const container = buildContainer();
+    buildEditFormRow(
+      container,
+      'editorial-lane',
+      { name: 'Editorial', template: 'editorial', contentDir: 'docs' },
+      ['editorial', 'visual'],
+    );
+    initLanesPage();
+
+    const preview = container.querySelector<HTMLElement>(
+      '[data-lanes-preview][data-lane-id="editorial-lane"]',
+    )!;
+    // No changes yet → bare update shape. Lane id is JSON-stringified
+    // for symmetry with the value flags.
+    expect(preview.textContent).toBe('/deskwork:lane update "editorial-lane"');
+
+    // Change contentDir only — its flag value is quoted symmetrically
+    // with name (per the slash-command quoting convention).
+    const contentDir = container.querySelector<HTMLInputElement>(
+      '[data-lanes-edit-form][data-lane-id="editorial-lane"] [data-lanes-field="contentDir"]',
+    )!;
+    contentDir.value = 'docs-new';
+    contentDir.dispatchEvent(inputEvent());
+    expect(preview.textContent).toBe(
+      '/deskwork:lane update "editorial-lane" --content-dir "docs-new"',
+    );
+
+    // Also change name
+    const name = container.querySelector<HTMLInputElement>(
+      '[data-lanes-edit-form][data-lane-id="editorial-lane"] [data-lanes-field="name"]',
+    )!;
+    name.value = 'Edit Lane';
+    name.dispatchEvent(inputEvent());
+    expect(preview.textContent).toContain('--name "Edit Lane"');
+    expect(preview.textContent).toContain('--content-dir "docs-new"');
+  });
+
+  it('Edit toggle reveals + hides the hidden edit row + flips aria-expanded', () => {
+    const container = buildContainer();
+    const { toggle, editRow } = buildEditFormRow(
+      container,
+      'editorial-lane',
+      { name: 'Editorial', template: 'editorial', contentDir: 'docs' },
+      ['editorial'],
+    );
+    initLanesPage();
+
+    expect(editRow.hidden).toBe(true);
+    expect(toggle.getAttribute('aria-expanded')).toBe('false');
+
+    toggle.click();
+    expect(editRow.hidden).toBe(false);
+    expect(toggle.getAttribute('aria-expanded')).toBe('true');
+
+    toggle.click();
+    expect(editRow.hidden).toBe(true);
+    expect(toggle.getAttribute('aria-expanded')).toBe('false');
+  });
+
+  it('Cancel button hides the edit form + resets the toggle aria state', () => {
+    const container = buildContainer();
+    const { toggle, editRow, form } = buildEditFormRow(
+      container,
+      'editorial-lane',
+      { name: 'Editorial', template: 'editorial', contentDir: 'docs' },
+      ['editorial'],
+    );
+    initLanesPage();
+
+    toggle.click();
+    expect(editRow.hidden).toBe(false);
+
+    const cancel = form.querySelector<HTMLButtonElement>('[data-lane-edit-cancel]')!;
+    cancel.click();
+    expect(editRow.hidden).toBe(true);
+    expect(toggle.getAttribute('aria-expanded')).toBe('false');
+  });
+
+  it('Edit form: cleared fields are NOT emitted as --flag "" (blank-clear is a no-op for diff emit)', () => {
+    const container = buildContainer();
+    buildEditFormRow(
+      container,
+      'editorial-lane',
+      { name: 'Editorial', template: 'editorial', contentDir: 'docs' },
+      ['editorial', 'visual'],
+    );
+    initLanesPage();
+    const preview = container.querySelector<HTMLElement>(
+      '[data-lanes-preview][data-lane-id="editorial-lane"]',
+    )!;
+
+    // Clear the name — should NOT emit `--name ""`.
+    const name = container.querySelector<HTMLInputElement>(
+      '[data-lanes-edit-form][data-lane-id="editorial-lane"] [data-lanes-field="name"]',
+    )!;
+    name.value = '';
+    name.dispatchEvent(inputEvent());
+    expect(preview.textContent).toBe('/deskwork:lane update "editorial-lane"');
+    expect(preview.textContent).not.toContain('--name');
+
+    // Clear the contentDir — same, no `--content-dir ""`.
+    const contentDir = container.querySelector<HTMLInputElement>(
+      '[data-lanes-edit-form][data-lane-id="editorial-lane"] [data-lanes-field="contentDir"]',
+    )!;
+    contentDir.value = '';
+    contentDir.dispatchEvent(inputEvent());
+    expect(preview.textContent).toBe('/deskwork:lane update "editorial-lane"');
+    expect(preview.textContent).not.toContain('--content-dir');
+  });
+
+  it('Edit toggle: single-open accordion — opening row B closes row A', () => {
+    const container = buildContainer();
+    const a = buildEditFormRow(
+      container,
+      'lane-a',
+      { name: 'A', template: 'editorial', contentDir: 'docs-a' },
+      ['editorial'],
+    );
+    const b = buildEditFormRow(
+      container,
+      'lane-b',
+      { name: 'B', template: 'editorial', contentDir: 'docs-b' },
+      ['editorial'],
+    );
+    initLanesPage();
+
+    // Open A
+    a.toggle.click();
+    expect(a.editRow.hidden).toBe(false);
+    expect(a.toggle.getAttribute('aria-expanded')).toBe('true');
+    expect(b.editRow.hidden).toBe(true);
+
+    // Open B — A should close automatically
+    b.toggle.click();
+    expect(b.editRow.hidden).toBe(false);
+    expect(b.toggle.getAttribute('aria-expanded')).toBe('true');
+    expect(a.editRow.hidden).toBe(true);
+    expect(a.toggle.getAttribute('aria-expanded')).toBe('false');
+  });
+
+  it('row Archive button clipboards the slash command from data-copy', async () => {
+    const container = buildContainer();
+    buildEditFormRow(
+      container,
+      'editorial-lane',
+      { name: 'Editorial', template: 'editorial', contentDir: 'docs' },
+      ['editorial'],
+    );
+    const { calls } = installClipboardStub();
+    initLanesPage();
+
+    const archiveBtn = container.querySelector<HTMLButtonElement>('[data-lane-copy]')!;
+    archiveBtn.click();
+    await Promise.resolve();
+    await Promise.resolve();
+
+    expect(calls.length).toBe(1);
+    expect(calls[0]).toBe('/deskwork:lane archive editorial-lane');
+  });
+
+  it('archived section: toggle event persists open state to localStorage (project-scoped)', () => {
+    const container = buildContainer();
+    container.dataset.projectKey = 'test-proj';
+
+    // Build a <details> archived section
+    const section = document.createElement('section');
+    const details = document.createElement('details');
+    details.dataset.lanesArchivedDetails = '';
+    const summary = document.createElement('summary');
+    summary.textContent = 'Archived lanes';
+    details.appendChild(summary);
+    section.appendChild(details);
+    container.appendChild(section);
+
+    window.localStorage.clear();
+    initLanesPage();
+
+    // Open the details (which fires `toggle`)
+    details.open = true;
+    details.dispatchEvent(new Event('toggle'));
+    expect(window.localStorage.getItem('deskwork:lanes:test-proj:archived-open')).toBe('true');
+
+    // Close again
+    details.open = false;
+    details.dispatchEvent(new Event('toggle'));
+    expect(window.localStorage.getItem('deskwork:lanes:test-proj:archived-open')).toBe('false');
+  });
+
+  it('archived section: stored open=true is restored on init', () => {
+    const container = buildContainer();
+    container.dataset.projectKey = 'test-proj';
+
+    const section = document.createElement('section');
+    const details = document.createElement('details');
+    details.dataset.lanesArchivedDetails = '';
+    const summary = document.createElement('summary');
+    summary.textContent = 'Archived lanes';
+    details.appendChild(summary);
+    section.appendChild(details);
+    container.appendChild(section);
+
+    // Section was server-rendered closed; storage says it should
+    // be open from a previous session.
+    expect(details.open).toBe(false);
+    window.localStorage.setItem('deskwork:lanes:test-proj:archived-open', 'true');
+
+    initLanesPage();
+    expect(details.open).toBe(true);
+  });
+
+  it('empty-state CTA: click focuses the New Lane id field (overrides anchor scroll)', () => {
+    const container = buildContainer();
+
+    // Build the New Lane form (so the focus target exists)
+    buildNewForm(container, ['editorial']);
+
+    // Build the empty-state CTA
+    const empty = document.createElement('div');
+    empty.dataset.lanesEmpty = '';
+    const cta = document.createElement('a');
+    cta.href = '#lanes-new-form-heading';
+    cta.dataset.lanesCtaFocus = '';
+    cta.textContent = 'Create your first lane';
+    empty.appendChild(cta);
+    container.appendChild(empty);
+
+    initLanesPage();
+
+    // Click the CTA: default should be prevented + focus should
+    // move to the id field
+    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
+    cta.dispatchEvent(event);
+    expect(event.defaultPrevented).toBe(true);
+    const idInput = container.querySelector<HTMLInputElement>(
+      '[data-lanes-new-form] [data-lanes-field="id"]',
+    )!;
+    expect(document.activeElement).toBe(idInput);
+  });
+});
diff --git a/packages/studio/test/lanes/lanes-page.test.ts b/packages/studio/test/lanes/lanes-page.test.ts
new file mode 100644
index 0000000..a17a00d
--- /dev/null
+++ b/packages/studio/test/lanes/lanes-page.test.ts
@@ -0,0 +1,329 @@
+/**
+ * Integration test for the `/dev/lanes` studio page (Phase 6 Task
+ * 6.3).
+ *
+ * Boots the studio against a fixture project with two active lanes
+ * plus one archived lane plus per-lane entries, hits the route, and
+ * asserts the markup contract:
+ *
+ *   - route returns 200 HTML
+ *   - active table contains one row per active lane with id / name /
+ *     template / contentDir / entry count
+ *   - per-row Edit toggle button is present
+ *   - per-row Archive button carries data-copy with
+ *     `/deskwork:lane archive <id>`
+ *   - archived section is rendered as `<details>` (collapse-by-default)
+ *   - archived lane's Restore button carries data-copy with
+ *     `/deskwork:lane restore <id>`
+ *   - New Lane form is present with a slash-command preview
+ *   - empty project renders the empty-state CTA
+ *
+ * Pure integration — uses real sidecars + real lane configs + real
+ * pipeline templates. No mocks. Per `.claude/rules/testing.md`,
+ * fixture project trees live on disk via `mkdtempSync`.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import type { DeskworkConfig } from '@deskwork/core/config';
+import { writeSidecar } from '@deskwork/core/sidecar';
+import type { Entry } from '@deskwork/core/schema/entry';
+import { createApp } from '../../src/server.ts';
+
+const UUID_A = '11111111-1111-4111-8111-111111111111';
+const UUID_B = '22222222-2222-4222-8222-222222222222';
+
+function makeConfig(): DeskworkConfig {
+  return {
+    version: 1,
+    sites: {
+      d: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
+    },
+    defaultSite: 'd',
+  };
+}
+
+function makeEntry(overrides: Partial<Entry>): Entry {
+  return {
+    uuid: UUID_A,
+    slug: 'placeholder',
+    title: 'Placeholder',
+    keywords: [],
+    source: 'manual',
+    currentStage: 'Drafting',
+    iterationByStage: { Drafting: 0 },
+    createdAt: '2026-05-28T10:00:00.000Z',
+    updatedAt: '2026-05-28T10:00:00.000Z',
+    ...overrides,
+  };
+}
+
+function writeLane(
+  root: string,
+  id: string,
+  name: string,
+  pipelineTemplate: string,
+  contentDir: string,
+  archivedAt?: string,
+): void {
+  const json: Record<string, string> = { id, name, pipelineTemplate, contentDir };
+  if (archivedAt !== undefined) json.archivedAt = archivedAt;
+  writeFileSync(
+    join(root, '.deskwork', 'lanes', `${id}.json`),
+    JSON.stringify(json, null, 2),
+    'utf8',
+  );
+}
+
+async function getHtml(
+  app: ReturnType<typeof createApp>,
+  path: string,
+): Promise<{ status: number; html: string }> {
+  const res = await app.fetch(new Request(`http://x${path}`));
+  return { status: res.status, html: await res.text() };
+}
+
+describe('lanes-page — `/dev/lanes`', () => {
+  let root: string;
+  let app: ReturnType<typeof createApp>;
+
+  beforeEach(async () => {
+    root = mkdtempSync(join(tmpdir(), 'deskwork-lanes-page-'));
+    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
+    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
+    writeLane(root, 'editorial-lane', 'Editorial', 'editorial', 'docs');
+    writeLane(root, 'visual-lane', 'Visual', 'visual', 'mockups');
+    writeLane(
+      root,
+      'old-lane',
+      'Old',
+      'editorial',
+      'docs-old',
+      '2026-04-01T10:00:00.000Z',
+    );
+    await writeSidecar(
+      root,
+      makeEntry({
+        uuid: UUID_A,
+        slug: 'a-draft',
+        title: 'A Draft',
+        currentStage: 'Drafting',
+        iterationByStage: { Drafting: 1 },
+        lane: 'editorial-lane',
+      }),
+    );
+    await writeSidecar(
+      root,
+      makeEntry({
+        uuid: UUID_B,
+        slug: 'logo-rough',
+        title: 'Logo Rough',
+        currentStage: 'Sketched',
+        iterationByStage: { Sketched: 0 },
+        lane: 'visual-lane',
+      }),
+    );
+    app = createApp({ projectRoot: root, config: makeConfig() });
+  });
+
+  afterEach(() => {
+    rmSync(root, { recursive: true, force: true });
+  });
+
+  it('returns 200 HTML at /dev/lanes', async () => {
+    const r = await getHtml(app, '/dev/lanes');
+    expect(r.status).toBe(200);
+    expect(r.html).toContain('<!DOCTYPE html>');
+  });
+
+  it('returns 200 HTML at /dev/lanes/ (trailing-slash twin)', async () => {
+    const r = await getHtml(app, '/dev/lanes/');
+    expect(r.status).toBe(200);
+    expect(r.html).toContain('Lanes');
+  });
+
+  it('renders the New Lane copy-builder form', async () => {
+    const r = await getHtml(app, '/dev/lanes');
+    expect(r.html).toContain('data-lanes-new-form');
+    expect(r.html).toContain('data-lanes-field="id"');
+    expect(r.html).toContain('data-lanes-field="name"');
+    expect(r.html).toContain('data-lanes-field="template"');
+    expect(r.html).toContain('data-lanes-field="contentDir"');
+    expect(r.html).toContain('data-lanes-copy-button="new"');
+    expect(r.html).toContain('data-lanes-preview');
+    // pipeline-template select carries available preset ids
+    expect(r.html).toMatch(/<option value="editorial">/);
+  });
+
+  it('renders one active row per active lane with template + contentDir + count', async () => {
+    const r = await getHtml(app, '/dev/lanes');
+    expect(r.html).toMatch(/data-lane-row[^>]*data-lane-id="editorial-lane"/);
+    expect(r.html).toMatch(/data-lane-row[^>]*data-lane-id="visual-lane"/);
+    // contentDir and template values
+    expect(r.html).toMatch(/<code>editorial<\/code>/);
+    expect(r.html).toMatch(/<code>visual<\/code>/);
+    expect(r.html).toMatch(/<code>docs<\/code>/);
+    expect(r.html).toMatch(/<code>mockups<\/code>/);
+  });
+
+  it('archived lane is rendered in a separate <details> section, not the active table', async () => {
+    const r = await getHtml(app, '/dev/lanes');
+    expect(r.html).toContain('data-lanes-archived');
+    expect(r.html).toMatch(/<details[^>]*data-lanes-archived-details/);
+    // The archived row must appear inside the archived details section,
+    // not in the active section that opens before the archived section.
+    const archivedSectionIndex = r.html.indexOf('data-lanes-archived');
+    const archivedRowIndex = r.html.indexOf('data-lane-id="old-lane"');
+    expect(archivedRowIndex).toBeGreaterThan(archivedSectionIndex);
+  });
+
+  it('per-row Archive button carries data-copy with the slash command', async () => {
+    const r = await getHtml(app, '/dev/lanes');
+    expect(r.html).toContain('data-copy="/deskwork:lane archive editorial-lane"');
+    expect(r.html).toContain('data-copy="/deskwork:lane archive visual-lane"');
+  });
+
+  it('archived lane row carries Restore button (not Archive)', async () => {
+    const r = await getHtml(app, '/dev/lanes');
+    expect(r.html).toContain('data-copy="/deskwork:lane restore old-lane"');
+    expect(r.html).not.toContain('data-copy="/deskwork:lane archive old-lane"');
+  });
+
+  it('archived lane with zero entries shows a Purge button; with entries it does not', async () => {
+    // old-lane has zero entries in the fixture → purge button shows
+    const r = await getHtml(app, '/dev/lanes');
+    expect(r.html).toContain('data-copy="/deskwork:lane purge old-lane"');
+    // active lanes never get a Purge button regardless of count
+    expect(r.html).not.toContain('data-copy="/deskwork:lane purge editorial-lane"');
+  });
+
+  it('archived lane with entries shows a DISABLED Purge button (gate is visible, next step is named)', async () => {
+    // Create a fresh fixture: one archived lane that still has an
+    // entry bound to it. The page must render a visibly-disabled
+    // Purge button (no data-copy) so the operator sees the gate and
+    // the title explains the next step ("move entries first").
+    const root2 = mkdtempSync(join(tmpdir(), 'deskwork-lanes-purge-disabled-'));
+    mkdirSync(join(root2, '.deskwork', 'entries'), { recursive: true });
+    mkdirSync(join(root2, '.deskwork', 'lanes'), { recursive: true });
+    writeLane(
+      root2,
+      'archived-with-entries',
+      'Archived w/ Entries',
+      'editorial',
+      'docs-archived',
+      '2026-04-01T10:00:00.000Z',
+    );
+    await writeSidecar(
+      root2,
+      makeEntry({
+        uuid: UUID_A,
+        slug: 'still-here',
+        title: 'Still Here',
+        currentStage: 'Drafting',
+        iterationByStage: { Drafting: 1 },
+        lane: 'archived-with-entries',
+      }),
+    );
+    const app2 = createApp({ projectRoot: root2, config: makeConfig() });
+    try {
+      const r = await getHtml(app2, '/dev/lanes');
+      // The disabled Purge button is rendered.
+      expect(r.html).toContain('lanes-btn--purge-disabled');
+      expect(r.html).toMatch(/disabled[^>]*aria-disabled="true"/);
+      // It carries no data-copy / data-lane-copy (the client never
+      // clipboards a disabled gate).
+      expect(r.html).not.toContain('data-copy="/deskwork:lane purge archived-with-entries"');
+      // The label names the entry count so the gate is concrete.
+      expect(r.html).toMatch(/Purge — 1 entry/);
+      // The title explains the next step.
+      expect(r.html).toContain('Move them to another lane first');
+    } finally {
+      rmSync(root2, { recursive: true, force: true });
+    }
+  });
+
+  it('per-row Edit toggle button is present with aria-controls', async () => {
+    const r = await getHtml(app, '/dev/lanes');
+    expect(r.html).toMatch(/data-lane-edit-toggle[^>]*data-lane-id="editorial-lane"/);
+    expect(r.html).toMatch(/aria-controls="lanes-edit-form-editorial-lane"/);
+  });
+
+  it('per-row Edit form renders hidden with all three editable fields', async () => {
+    const r = await getHtml(app, '/dev/lanes');
+    expect(r.html).toMatch(/data-lane-edit-row[^>]*data-lane-id="editorial-lane"[^>]*hidden/);
+    expect(r.html).toMatch(/data-lanes-edit-form[^>]*data-lane-id="editorial-lane"/);
+    // Each edit form has the three editable fields with data-current
+    // mirroring the persisted value (so the client can compute the
+    // diff between current and live values).
+    expect(r.html).toContain('id="lanes-edit-form-editorial-lane"');
+    expect(r.html).toMatch(/data-lanes-field="template"[^>]*data-current="editorial"/);
+  });
+
+  it('reorder handle is a passive single-glyph indicator (no drag affordance)', async () => {
+    const r = await getHtml(app, '/dev/lanes');
+    // Single-character glyph (not the double-character grab affordance)
+    expect(r.html).toContain('<span\n          class="lanes-reorder-handle"');
+    expect(r.html).toMatch(/lanes-reorder-handle[^>]*>⋮<\/span>/);
+    expect(r.html).not.toMatch(/lanes-reorder-handle[^>]*>⋮⋮/);
+    // aria-hidden so AT skip the decorative glyph
+    expect(r.html).toMatch(/lanes-reorder-handle"[^>]*aria-hidden="true"/);
+    // Title discloses where reorder happens
+    expect(r.html).toContain('title="Reorder via the dashboard lane rail"');
+  });
+
+  it('renders per-lane entry counts', async () => {
+    const r = await getHtml(app, '/dev/lanes');
+    // editorial-lane has 1 entry, visual-lane has 1 entry, old-lane has 0
+    expect(r.html).toMatch(/<td class="lanes-cell lanes-cell--count">1<\/td>/);
+    expect(r.html).toMatch(/<td class="lanes-cell lanes-cell--count">0<\/td>/);
+  });
+
+  it('renders Back-to-Desk link (masthead back-link to /dev/editorial-studio)', async () => {
+    const r = await getHtml(app, '/dev/lanes');
+    expect(r.html).toMatch(/class="er-masthead-back"[^>]*href="\/dev\/editorial-studio"/);
+  });
+
+  it('loads the editorial-studio-client script bundle', async () => {
+    const r = await getHtml(app, '/dev/lanes');
+    expect(r.html).toMatch(/editorial-studio-client/);
+  });
+
+  it('loads the lanes-page.css stylesheet', async () => {
+    const r = await getHtml(app, '/dev/lanes');
+    expect(r.html).toMatch(/lanes-page\.css/);
+  });
+});
+
+describe('lanes-page — empty project', () => {
+  let root: string;
+  let app: ReturnType<typeof createApp>;
+
+  beforeEach(() => {
+    root = mkdtempSync(join(tmpdir(), 'deskwork-lanes-empty-'));
+    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
+    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
+    app = createApp({ projectRoot: root, config: makeConfig() });
+  });
+
+  afterEach(() => {
+    rmSync(root, { recursive: true, force: true });
+  });
+
+  it('renders the empty-state CTA when no lanes exist', async () => {
+    const r = await getHtml(app, '/dev/lanes');
+    expect(r.status).toBe(200);
+    expect(r.html).toContain('data-lanes-empty');
+    expect(r.html).toContain('Create your first lane');
+    // New Lane form still renders above the empty state so the
+    // operator can click straight into it.
+    expect(r.html).toContain('data-lanes-new-form');
+  });
+
+  it('still shows zero entries + zero archived lanes', async () => {
+    const r = await getHtml(app, '/dev/lanes');
+    // Archived section's empty-state class
+    expect(r.html).toContain('No archived lanes');
+  });
+});
diff --git a/packages/studio/test/pipelines/data.test.ts b/packages/studio/test/pipelines/data.test.ts
new file mode 100644
index 0000000..57ad5c1
--- /dev/null
+++ b/packages/studio/test/pipelines/data.test.ts
@@ -0,0 +1,186 @@
+/**
+ * Unit tests for the pipelines-page data layer (Phase 6 Task 6.4).
+ *
+ * Coverage:
+ *   - lists all 5 plugin presets on an empty project
+ *   - distinguishes plugin-preset vs project-override sources
+ *   - counts referencing lanes (active + archived) per template
+ *   - surfaces a parse-error row when a project override JSON is
+ *     malformed (does NOT silently filter — operator must see "fix
+ *     this file")
+ *   - surfaces a zod-error row when an override JSON is schema-invalid
+ *   - surfaces an id-mismatch row when the JSON's `id` field
+ *     disagrees with the filename basename
+ *
+ * Fixture project trees on disk per `.claude/rules/testing.md`.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { loadPipelinesPageData } from '../../src/pages/pipelines/data.ts';
+
+function writeLane(
+  root: string,
+  id: string,
+  pipelineTemplate: string,
+  archivedAt?: string,
+): void {
+  const json: Record<string, string> = {
+    id,
+    name: id,
+    pipelineTemplate,
+    contentDir: id,
+  };
+  if (archivedAt !== undefined) json.archivedAt = archivedAt;
+  writeFileSync(
+    join(root, '.deskwork', 'lanes', `${id}.json`),
+    JSON.stringify(json, null, 2),
+    'utf8',
+  );
+}
+
+function writePipelineOverride(root: string, id: string, body: unknown): void {
+  writeFileSync(
+    join(root, '.deskwork', 'pipelines', `${id}.json`),
+    typeof body === 'string' ? body : JSON.stringify(body, null, 2),
+    'utf8',
+  );
+}
+
+describe('loadPipelinesPageData', () => {
+  let root: string;
+
+  beforeEach(() => {
+    root = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-data-'));
+    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
+    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
+    mkdirSync(join(root, '.deskwork', 'pipelines'), { recursive: true });
+  });
+
+  afterEach(() => {
+    rmSync(root, { recursive: true, force: true });
+  });
+
+  it('lists every plugin-preset template on an empty project', async () => {
+    const data = await loadPipelinesPageData(root);
+    const ids = data.rows.map((r) => r.id);
+    // The plugin ships five presets — assert their presence
+    // explicitly so a missing preset surfaces as a fixture-level
+    // regression rather than a silent shrink.
+    expect(ids).toContain('editorial');
+    expect(ids).toContain('visual');
+    expect(ids).toContain('feature-doc');
+    expect(ids).toContain('qa-plan');
+    expect(ids).toContain('blog-post');
+    expect(data.errors).toEqual([]);
+    expect(data.totalLanes).toBe(0);
+  });
+
+  it('marks plugin presets as source=plugin-preset and override files as project-override', async () => {
+    writePipelineOverride(root, 'editorial', {
+      id: 'editorial',
+      name: 'Custom Editorial',
+      description: 'overridden',
+      linearStages: ['Idea', 'Draft', 'Done'],
+      offPipelineStages: ['Cancelled'],
+    });
+
+    const data = await loadPipelinesPageData(root);
+    const byId = new Map(data.rows.map((r) => [r.id, r]));
+    // editorial now has an override → source=project-override
+    expect(byId.get('editorial')?.source).toBe('project-override');
+    expect(byId.get('editorial')?.name).toBe('Custom Editorial');
+    // visual has no override → source=plugin-preset
+    expect(byId.get('visual')?.source).toBe('plugin-preset');
+  });
+
+  it('counts referencing lanes (active + archived) per template', async () => {
+    writeLane(root, 'docs', 'editorial');
+    writeLane(root, 'mockups', 'visual');
+    writeLane(root, 'old-docs', 'editorial', '2026-04-01T10:00:00.000Z');
+
+    const data = await loadPipelinesPageData(root);
+    const byId = new Map(data.rows.map((r) => [r.id, r]));
+    expect(byId.get('editorial')?.referencingLanes).toEqual(['docs', 'old-docs']);
+    expect(byId.get('visual')?.referencingLanes).toEqual(['mockups']);
+    expect(byId.get('feature-doc')?.referencingLanes).toEqual([]);
+    expect(data.totalLanes).toBe(3);
+  });
+
+  it('exposes linearStages + lockedStages + offPipelineStages on each row', async () => {
+    const data = await loadPipelinesPageData(root);
+    const editorial = data.rows.find((r) => r.id === 'editorial');
+    expect(editorial).toBeDefined();
+    expect(editorial!.linearStages).toEqual([
+      'Ideas',
+      'Planned',
+      'Outlining',
+      'Drafting',
+      'Final',
+      'Published',
+    ]);
+    expect(editorial!.lockedStages).toEqual(['Final']);
+    expect(editorial!.offPipelineStages).toEqual(['Blocked', 'Cancelled']);
+  });
+
+  it('surfaces parse errors as error rows (does NOT silently filter)', async () => {
+    // Malformed JSON in the operator's override directory
+    writePipelineOverride(root, 'broken', '{ this is not valid json');
+
+    const data = await loadPipelinesPageData(root);
+    const err = data.errors.find((e) => e.id === 'broken');
+    expect(err).toBeDefined();
+    expect(err!.error.kind).toBe('parse');
+    expect(err!.error.path).toBe(
+      join(root, '.deskwork', 'pipelines', 'broken.json'),
+    );
+    expect(err!.error.message).toContain('not valid JSON');
+    // The id must NOT also appear in rows — error vs healthy is mutually
+    // exclusive, but the picker (built off `rows + errors`) sees both.
+    expect(data.rows.find((r) => r.id === 'broken')).toBeUndefined();
+  });
+
+  it('surfaces Zod validation errors as error rows', async () => {
+    // Schema-invalid: linearStages must be non-empty.
+    writePipelineOverride(root, 'empty-stages', {
+      id: 'empty-stages',
+      name: 'Empty',
+      description: 'no stages',
+      linearStages: [],
+      offPipelineStages: [],
+    });
+
+    const data = await loadPipelinesPageData(root);
+    const err = data.errors.find((e) => e.id === 'empty-stages');
+    expect(err).toBeDefined();
+    expect(err!.error.kind).toBe('zod');
+    expect(err!.error.message).toContain('failed Zod validation');
+  });
+
+  it('surfaces id-mismatch errors as error rows', async () => {
+    // JSON's `id` field disagrees with the filename basename.
+    writePipelineOverride(root, 'a-id', {
+      id: 'b-id',
+      name: 'Misnamed',
+      description: 'mismatched',
+      linearStages: ['X'],
+      offPipelineStages: [],
+    });
+
+    const data = await loadPipelinesPageData(root);
+    const err = data.errors.find((e) => e.id === 'a-id');
+    expect(err).toBeDefined();
+    expect(err!.error.kind).toBe('id-mismatch');
+  });
+
+  it('records referencingLanes on error rows so the operator sees who depends on a broken template', async () => {
+    writePipelineOverride(root, 'broken', '{ not json');
+    writeLane(root, 'broken-consumer', 'broken');
+
+    const data = await loadPipelinesPageData(root);
+    const err = data.errors.find((e) => e.id === 'broken');
+    expect(err?.referencingLanes).toEqual(['broken-consumer']);
+  });
+});
diff --git a/packages/studio/test/pipelines/pipelines-page-client-interactions.test.ts b/packages/studio/test/pipelines/pipelines-page-client-interactions.test.ts
new file mode 100644
index 0000000..5bbb18c
--- /dev/null
+++ b/packages/studio/test/pipelines/pipelines-page-client-interactions.test.ts
@@ -0,0 +1,115 @@
+/**
+ * @vitest-environment jsdom
+ *
+ * Client-controller interaction tests for `/dev/pipelines` (Phase 6
+ * Task 6.4).
+ *
+ * Coverage:
+ *   - Edit sub-accordion: opening sub-panel B closes sub-panel A.
+ *   - Row View / Edit toggles: single-open accordion across rows
+ *     and across panel types.
+ *   - Row Delete button (`data-pipeline-copy`) clipboards its
+ *     `data-copy` payload.
+ *
+ * Preview-builder tests live in `pipelines-page-client.test.ts`.
+ */
+
+import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
+import { initPipelinesPage } from '../../../../plugins/deskwork-studio/public/src/pipelines/pipelines-page';
+import {
+  buildContainer,
+  buildEditPanel,
+  buildRow,
+  installClipboardStub,
+} from './test-helpers.ts';
+
+describe('pipelines-page client controller — interactions', () => {
+  beforeEach(() => {
+    document.body.innerHTML = '';
+  });
+
+  afterEach(() => {
+    vi.restoreAllMocks();
+  });
+
+  it('Edit sub-accordion: opening one <details data-pipelines-op> closes the others', () => {
+    const container = buildContainer();
+    const { panel } = buildEditPanel(container, 'editorial', {
+      linearStages: ['Ideas', 'Final'],
+      lockedStages: ['Final'],
+      offPipelineStages: ['Cancelled'],
+    });
+    initPipelinesPage();
+    const detailsList = Array.from(
+      panel.querySelectorAll<HTMLDetailsElement>('[data-pipelines-op]'),
+    );
+    const add = detailsList.find((d) => d.dataset.pipelinesOp === 'add')!;
+    const rename = detailsList.find((d) => d.dataset.pipelinesOp === 'rename')!;
+
+    add.open = true;
+    add.dispatchEvent(new Event('toggle'));
+    expect(add.open).toBe(true);
+    expect(rename.open).toBe(false);
+
+    rename.open = true;
+    rename.dispatchEvent(new Event('toggle'));
+    expect(rename.open).toBe(true);
+    expect(add.open).toBe(false);
+  });
+
+  it('Row View toggle reveals the view row + flips aria-expanded', () => {
+    const container = buildContainer();
+    const { toggleView, viewRow } = buildRow(container, 'editorial');
+    initPipelinesPage();
+    expect(viewRow.hidden).toBe(true);
+    toggleView.click();
+    expect(viewRow.hidden).toBe(false);
+    expect(toggleView.getAttribute('aria-expanded')).toBe('true');
+    toggleView.click();
+    expect(viewRow.hidden).toBe(true);
+    expect(toggleView.getAttribute('aria-expanded')).toBe('false');
+  });
+
+  it('Row single-open accordion: opening Edit on row A closes View on row A', () => {
+    const container = buildContainer();
+    const { toggleView, toggleEdit, viewRow, editRow } = buildRow(
+      container,
+      'editorial',
+    );
+    initPipelinesPage();
+    toggleView.click();
+    expect(viewRow.hidden).toBe(false);
+    toggleEdit.click();
+    expect(editRow.hidden).toBe(false);
+    expect(viewRow.hidden).toBe(true);
+    expect(toggleView.getAttribute('aria-expanded')).toBe('false');
+  });
+
+  it('Row single-open accordion: opening row B closes row A', () => {
+    const container = buildContainer();
+    const a = buildRow(container, 'editorial');
+    const b = buildRow(container, 'visual');
+    initPipelinesPage();
+    a.toggleEdit.click();
+    expect(a.editRow.hidden).toBe(false);
+    b.toggleEdit.click();
+    expect(b.editRow.hidden).toBe(false);
+    expect(a.editRow.hidden).toBe(true);
+    expect(a.toggleEdit.getAttribute('aria-expanded')).toBe('false');
+  });
+
+  it('Row Delete button clipboards its data-copy payload', async () => {
+    const container = buildContainer();
+    const { deleteBtn } = buildRow(container, 'orphan-custom', {
+      withDelete: true,
+    });
+    const { calls } = installClipboardStub();
+    initPipelinesPage();
+    expect(deleteBtn).toBeDefined();
+    deleteBtn!.click();
+    await Promise.resolve();
+    await Promise.resolve();
+    expect(calls.length).toBe(1);
+    expect(calls[0]).toBe('/deskwork:pipeline delete orphan-custom');
+  });
+});
diff --git a/packages/studio/test/pipelines/pipelines-page-client.test.ts b/packages/studio/test/pipelines/pipelines-page-client.test.ts
new file mode 100644
index 0000000..60e3a24
--- /dev/null
+++ b/packages/studio/test/pipelines/pipelines-page-client.test.ts
@@ -0,0 +1,270 @@
+/**
+ * @vitest-environment jsdom
+ *
+ * Client-controller preview-building tests for `/dev/pipelines`
+ * (Phase 6 Task 6.4).
+ *
+ * Coverage:
+ *   - New form: live preview updates as fields change; Copy button
+ *     clipboards the assembled `/deskwork:pipeline create ...` shape.
+ *   - `quoteValue` symmetry: values containing spaces, quotes, and
+ *     backslashes round-trip through JSON.stringify escaping.
+ *   - Add sub-form: preview includes `--position` when set.
+ *   - Rename sub-form: composes `--rename-stage <from> --to-stage <to>`.
+ *   - Remove sub-form: composes `--remove-stage <name>`.
+ *   - Set-locked sub-form: checkboxes feed a comma-separated list,
+ *     including the empty-selection "clear all locks" shape.
+ *   - Set-off-pipeline sub-form: comma-separated input is quoted as
+ *     a single arg.
+ *
+ * Accordion and clipboard-row tests live in
+ * `pipelines-page-client-interactions.test.ts`.
+ */
+
+import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
+import { initPipelinesPage } from '../../../../plugins/deskwork-studio/public/src/pipelines/pipelines-page';
+import {
+  buildContainer,
+  buildNewForm,
+  buildEditPanel,
+  installClipboardStub,
+  inputEvent,
+  changeEvent,
+} from './test-helpers.ts';
+
+describe('pipelines-page client controller — preview builders', () => {
+  beforeEach(() => {
+    document.body.innerHTML = '';
+  });
+
+  afterEach(() => {
+    vi.restoreAllMocks();
+  });
+
+  it('is a no-op when [data-pipelines-container] is absent', () => {
+    document.body.innerHTML = '<div>no container</div>';
+    expect(() => initPipelinesPage()).not.toThrow();
+  });
+
+  it('New form: live preview updates as the operator types', () => {
+    const container = buildContainer();
+    const form = buildNewForm(container);
+    initPipelinesPage();
+    const previewEl = form.querySelector<HTMLElement>(
+      '[data-pipelines-preview="new"]',
+    )!;
+    expect(previewEl.textContent).toBe(
+      '/deskwork:pipeline create <id> --shape <stages>',
+    );
+
+    const idInput = form.querySelector<HTMLInputElement>(
+      '[data-pipelines-field="new-id"]',
+    )!;
+    idInput.value = 'mockup';
+    idInput.dispatchEvent(inputEvent());
+    expect(previewEl.textContent).toContain('/deskwork:pipeline create "mockup"');
+
+    const shapeInput = form.querySelector<HTMLInputElement>(
+      '[data-pipelines-field="new-shape"]',
+    )!;
+    shapeInput.value = 'Idea,Inked,Final';
+    shapeInput.dispatchEvent(inputEvent());
+    expect(previewEl.textContent).toContain('--shape "Idea,Inked,Final"');
+
+    const nameInput = form.querySelector<HTMLInputElement>(
+      '[data-pipelines-field="new-name"]',
+    )!;
+    nameInput.value = 'Mockup Workflow';
+    nameInput.dispatchEvent(inputEvent());
+    expect(previewEl.textContent).toContain('--name "Mockup Workflow"');
+  });
+
+  it('New form: copy button clipboards the assembled command', async () => {
+    const container = buildContainer();
+    const form = buildNewForm(container);
+    const { calls } = installClipboardStub();
+    initPipelinesPage();
+
+    (form.querySelector<HTMLInputElement>('[data-pipelines-field="new-id"]')!).value = 'mockup';
+    (form.querySelector<HTMLInputElement>('[data-pipelines-field="new-shape"]')!).value = 'Idea,Final';
+    const copy = form.querySelector<HTMLButtonElement>(
+      '[data-pipelines-copy-button="new"]',
+    )!;
+    copy.click();
+    await Promise.resolve();
+    await Promise.resolve();
+
+    expect(calls.length).toBe(1);
+    expect(calls[0]).toBe(
+      '/deskwork:pipeline create "mockup" --shape "Idea,Final"',
+    );
+  });
+
+  it('quoteValue symmetry: special characters round-trip through JSON.stringify', async () => {
+    const container = buildContainer();
+    const form = buildNewForm(container);
+    const { calls } = installClipboardStub();
+    initPipelinesPage();
+
+    (form.querySelector<HTMLInputElement>('[data-pipelines-field="new-id"]')!).value = 'q-test';
+    (form.querySelector<HTMLInputElement>('[data-pipelines-field="new-shape"]')!).value = 'A,B';
+    (form.querySelector<HTMLInputElement>('[data-pipelines-field="new-name"]')!).value = 'foo "bar" \\ baz';
+    const copy = form.querySelector<HTMLButtonElement>(
+      '[data-pipelines-copy-button="new"]',
+    )!;
+    copy.click();
+    await Promise.resolve();
+    await Promise.resolve();
+
+    expect(calls.length).toBe(1);
+    const fragment = calls[0].split('--name ')[1];
+    expect(typeof JSON.parse(fragment)).toBe('string');
+    expect(JSON.parse(fragment)).toBe('foo "bar" \\ baz');
+  });
+
+  it('Add sub-form: preview includes --position when set', () => {
+    const container = buildContainer();
+    const { panel } = buildEditPanel(container, 'editorial', {
+      linearStages: ['Ideas', 'Drafting', 'Final'],
+      lockedStages: ['Final'],
+      offPipelineStages: ['Cancelled'],
+    });
+    initPipelinesPage();
+    const previewEl = panel.querySelector<HTMLElement>(
+      '[data-pipelines-preview="add"]',
+    )!;
+    expect(previewEl.textContent).toBe(
+      '/deskwork:pipeline update "editorial" --add-stage <name>',
+    );
+
+    const nameInput = panel.querySelector<HTMLInputElement>(
+      '[data-pipelines-op-form="add"] [data-pipelines-field="add-name"]',
+    )!;
+    nameInput.value = 'Review';
+    nameInput.dispatchEvent(inputEvent());
+    expect(previewEl.textContent).toBe(
+      '/deskwork:pipeline update "editorial" --add-stage "Review"',
+    );
+
+    const posInput = panel.querySelector<HTMLInputElement>(
+      '[data-pipelines-op-form="add"] [data-pipelines-field="add-position"]',
+    )!;
+    posInput.value = '2';
+    posInput.dispatchEvent(inputEvent());
+    expect(previewEl.textContent).toBe(
+      '/deskwork:pipeline update "editorial" --add-stage "Review" --position 2',
+    );
+  });
+
+  it('Rename sub-form: preview composes --rename-stage <from> --to-stage <to>', () => {
+    const container = buildContainer();
+    const { panel } = buildEditPanel(container, 'editorial', {
+      linearStages: ['Ideas', 'Drafting', 'Final'],
+      lockedStages: ['Final'],
+      offPipelineStages: ['Cancelled'],
+    });
+    initPipelinesPage();
+
+    const fromSel = panel.querySelector<HTMLSelectElement>(
+      '[data-pipelines-op-form="rename"] [data-pipelines-field="rename-from"]',
+    )!;
+    fromSel.value = 'Drafting';
+    fromSel.dispatchEvent(changeEvent());
+    const toInput = panel.querySelector<HTMLInputElement>(
+      '[data-pipelines-op-form="rename"] [data-pipelines-field="rename-to"]',
+    )!;
+    toInput.value = 'Editing';
+    toInput.dispatchEvent(inputEvent());
+
+    const previewEl = panel.querySelector<HTMLElement>(
+      '[data-pipelines-preview="rename"]',
+    )!;
+    expect(previewEl.textContent).toBe(
+      '/deskwork:pipeline update "editorial" --rename-stage "Drafting" --to-stage "Editing"',
+    );
+  });
+
+  it('Remove sub-form: preview includes --remove-stage <name>', () => {
+    const container = buildContainer();
+    const { panel } = buildEditPanel(container, 'editorial', {
+      linearStages: ['Ideas', 'Drafting'],
+      lockedStages: [],
+      offPipelineStages: ['Cancelled'],
+    });
+    initPipelinesPage();
+
+    const sel = panel.querySelector<HTMLSelectElement>(
+      '[data-pipelines-op-form="remove"] [data-pipelines-field="remove-name"]',
+    )!;
+    sel.value = 'Drafting';
+    sel.dispatchEvent(changeEvent());
+
+    const previewEl = panel.querySelector<HTMLElement>(
+      '[data-pipelines-preview="remove"]',
+    )!;
+    expect(previewEl.textContent).toBe(
+      '/deskwork:pipeline update "editorial" --remove-stage "Drafting"',
+    );
+  });
+
+  it('Set-locked sub-form: checkbox selections feed a comma-separated list', () => {
+    const container = buildContainer();
+    const { panel } = buildEditPanel(container, 'editorial', {
+      linearStages: ['Ideas', 'Drafting', 'Final'],
+      lockedStages: ['Final'],
+      offPipelineStages: [],
+    });
+    initPipelinesPage();
+    const previewEl = panel.querySelector<HTMLElement>(
+      '[data-pipelines-preview="set-locked"]',
+    )!;
+    expect(previewEl.textContent).toBe(
+      '/deskwork:pipeline update "editorial" --set-locked "Final"',
+    );
+
+    const drafting = panel.querySelector<HTMLInputElement>(
+      '[data-pipelines-op-form="set-locked"] input[value="Drafting"]',
+    )!;
+    drafting.checked = true;
+    drafting.dispatchEvent(changeEvent());
+    expect(previewEl.textContent).toBe(
+      '/deskwork:pipeline update "editorial" --set-locked "Drafting,Final"',
+    );
+
+    const finalCb = panel.querySelector<HTMLInputElement>(
+      '[data-pipelines-op-form="set-locked"] input[value="Final"]',
+    )!;
+    drafting.checked = false;
+    drafting.dispatchEvent(changeEvent());
+    finalCb.checked = false;
+    finalCb.dispatchEvent(changeEvent());
+    expect(previewEl.textContent).toBe(
+      '/deskwork:pipeline update "editorial" --set-locked ""',
+    );
+  });
+
+  it('Set-off-pipeline sub-form: comma-separated input is quoted as a single arg', () => {
+    const container = buildContainer();
+    const { panel } = buildEditPanel(container, 'editorial', {
+      linearStages: ['Ideas', 'Final'],
+      lockedStages: [],
+      offPipelineStages: ['Cancelled'],
+    });
+    initPipelinesPage();
+    const previewEl = panel.querySelector<HTMLElement>(
+      '[data-pipelines-preview="set-off-pipeline"]',
+    )!;
+    expect(previewEl.textContent).toBe(
+      '/deskwork:pipeline update "editorial" --set-off-pipeline "Cancelled"',
+    );
+
+    const inputEl = panel.querySelector<HTMLInputElement>(
+      '[data-pipelines-op-form="set-off-pipeline"] [data-pipelines-field="set-off-pipeline"]',
+    )!;
+    inputEl.value = 'Blocked,Cancelled';
+    inputEl.dispatchEvent(inputEvent());
+    expect(previewEl.textContent).toBe(
+      '/deskwork:pipeline update "editorial" --set-off-pipeline "Blocked,Cancelled"',
+    );
+  });
+});
diff --git a/packages/studio/test/pipelines/pipelines-page.test.ts b/packages/studio/test/pipelines/pipelines-page.test.ts
new file mode 100644
index 0000000..6ad2521
--- /dev/null
+++ b/packages/studio/test/pipelines/pipelines-page.test.ts
@@ -0,0 +1,336 @@
+/**
+ * Integration test for the `/dev/pipelines` studio page (Phase 6 Task
+ * 6.4).
+ *
+ * Boots the studio against a fixture project, hits the route, and
+ * asserts the markup contract:
+ *
+ *   - route returns 200 HTML at both `/dev/pipelines` and trailing-
+ *     slash twin
+ *   - every plugin preset (editorial / visual / feature-doc / qa-plan
+ *     / blog-post) appears as a healthy row
+ *   - a project-override template shows source=override
+ *   - per-row View / Edit / Delete buttons are present
+ *   - Delete is disabled with a customize-first title when the
+ *     template is a plugin preset
+ *   - Delete is disabled with a lane-reassignment title when active
+ *     lanes reference the template
+ *   - 5 update sub-forms render inside the Edit panel
+ *   - New template form is present with Copy command button
+ *   - malformed override JSON surfaces as an error row (NOT silently
+ *     filtered) carrying the file path + verbatim loader message
+ *   - error banner names the failing ids
+ *   - masthead back link points at /dev/editorial-studio
+ *   - pipelines-page.css and editorial-studio-client are loaded
+ *
+ * Pure integration — real lane configs + real pipeline templates +
+ * real loader. Fixture trees on disk per `.claude/rules/testing.md`.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import type { DeskworkConfig } from '@deskwork/core/config';
+import { createApp } from '../../src/server.ts';
+
+function makeConfig(): DeskworkConfig {
+  return {
+    version: 1,
+    sites: {
+      d: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
+    },
+    defaultSite: 'd',
+  };
+}
+
+function writeLane(
+  root: string,
+  id: string,
+  pipelineTemplate: string,
+  archivedAt?: string,
+): void {
+  const json: Record<string, string> = {
+    id,
+    name: id,
+    pipelineTemplate,
+    contentDir: id,
+  };
+  if (archivedAt !== undefined) json.archivedAt = archivedAt;
+  writeFileSync(
+    join(root, '.deskwork', 'lanes', `${id}.json`),
+    JSON.stringify(json, null, 2),
+    'utf8',
+  );
+}
+
+function writePipelineOverride(root: string, id: string, body: unknown): void {
+  writeFileSync(
+    join(root, '.deskwork', 'pipelines', `${id}.json`),
+    typeof body === 'string' ? body : JSON.stringify(body, null, 2),
+    'utf8',
+  );
+}
+
+async function getHtml(
+  app: ReturnType<typeof createApp>,
+  path: string,
+): Promise<{ status: number; html: string }> {
+  const res = await app.fetch(new Request(`http://x${path}`));
+  return { status: res.status, html: await res.text() };
+}
+
+describe('pipelines-page — `/dev/pipelines`', () => {
+  let root: string;
+  let app: ReturnType<typeof createApp>;
+
+  beforeEach(() => {
+    root = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-page-'));
+    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
+    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
+    mkdirSync(join(root, '.deskwork', 'pipelines'), { recursive: true });
+    // One lane uses the editorial preset; one uses visual.
+    writeLane(root, 'docs', 'editorial');
+    writeLane(root, 'mockups', 'visual');
+    app = createApp({ projectRoot: root, config: makeConfig() });
+  });
+
+  afterEach(() => {
+    rmSync(root, { recursive: true, force: true });
+  });
+
+  it('returns 200 HTML at /dev/pipelines', async () => {
+    const r = await getHtml(app, '/dev/pipelines');
+    expect(r.status).toBe(200);
+    expect(r.html).toContain('<!DOCTYPE html>');
+    expect(r.html).toContain('Pipelines');
+  });
+
+  it('returns 200 HTML at /dev/pipelines/ (trailing-slash twin)', async () => {
+    const r = await getHtml(app, '/dev/pipelines/');
+    expect(r.status).toBe(200);
+  });
+
+  it('renders every plugin preset as a healthy row', async () => {
+    const r = await getHtml(app, '/dev/pipelines');
+    for (const id of ['editorial', 'visual', 'feature-doc', 'qa-plan', 'blog-post']) {
+      expect(r.html).toMatch(
+        new RegExp(`data-pipeline-row[^>]*data-pipeline-id="${id}"`),
+      );
+    }
+  });
+
+  it('renders source=plugin-preset chip for plugin presets', async () => {
+    const r = await getHtml(app, '/dev/pipelines');
+    // Find the editorial row; its source cell carries the preset badge
+    expect(r.html).toMatch(
+      /data-pipeline-id="editorial"[^]*?pipelines-source--preset/,
+    );
+  });
+
+  it('marks an override template with source=project-override', async () => {
+    writePipelineOverride(root, 'editorial', {
+      id: 'editorial',
+      name: 'Custom Editorial',
+      description: 'overridden',
+      linearStages: ['Idea', 'Done'],
+      offPipelineStages: ['Cancelled'],
+    });
+    const app2 = createApp({ projectRoot: root, config: makeConfig() });
+    const r = await getHtml(app2, '/dev/pipelines');
+    expect(r.html).toMatch(
+      /data-pipeline-id="editorial"[^]*?data-pipeline-source="project-override"/,
+    );
+    expect(r.html).toMatch(
+      /data-pipeline-id="editorial"[^]*?pipelines-source--override/,
+    );
+  });
+
+  it('per-row View / Edit / Delete toggles are present with aria-controls', async () => {
+    const r = await getHtml(app, '/dev/pipelines');
+    expect(r.html).toMatch(/data-pipeline-view-toggle[^>]*data-pipeline-id="editorial"/);
+    expect(r.html).toMatch(/aria-controls="pipelines-view-panel-editorial"/);
+    expect(r.html).toMatch(/data-pipeline-edit-toggle[^>]*data-pipeline-id="editorial"/);
+    expect(r.html).toMatch(/aria-controls="pipelines-edit-panel-editorial"/);
+  });
+
+  it('Delete on a plugin preset is disabled with a customize-first title', async () => {
+    const r = await getHtml(app, '/dev/pipelines');
+    // Editorial is a plugin preset (no override in this fixture) → Delete disabled
+    expect(r.html).toMatch(
+      /data-pipeline-id="editorial"[^]*?pipelines-btn--delete-disabled[^]*?Customize to a project override/,
+    );
+    // And the disabled button carries no data-copy
+    expect(r.html).not.toContain('data-copy="/deskwork:pipeline delete editorial"');
+  });
+
+  it('Delete on an override referenced by lanes is disabled with a reassignment title', async () => {
+    // Override + a lane that references it
+    writePipelineOverride(root, 'custom', {
+      id: 'custom',
+      name: 'Custom',
+      description: 'project-local',
+      linearStages: ['Idea', 'Done'],
+      offPipelineStages: ['Cancelled'],
+    });
+    writeLane(root, 'custom-consumer', 'custom');
+    const app2 = createApp({ projectRoot: root, config: makeConfig() });
+    const r = await getHtml(app2, '/dev/pipelines');
+    expect(r.html).toMatch(
+      /data-pipeline-id="custom"[^]*?pipelines-btn--delete-disabled[^]*?reassign/i,
+    );
+    expect(r.html).toMatch(
+      /data-pipeline-id="custom"[^]*?custom-consumer/,
+    );
+    // No active data-copy on the disabled state
+    expect(r.html).not.toContain('data-copy="/deskwork:pipeline delete custom"');
+  });
+
+  it('Delete on a project-override with zero referencing lanes IS active', async () => {
+    writePipelineOverride(root, 'orphan-custom', {
+      id: 'orphan-custom',
+      name: 'Orphan',
+      description: 'nobody references this',
+      linearStages: ['Idea', 'Done'],
+      offPipelineStages: ['Cancelled'],
+    });
+    const app2 = createApp({ projectRoot: root, config: makeConfig() });
+    const r = await getHtml(app2, '/dev/pipelines');
+    expect(r.html).toContain('data-copy="/deskwork:pipeline delete orphan-custom"');
+  });
+
+  it('Edit panel renders the five update operations as collapsed details', async () => {
+    const r = await getHtml(app, '/dev/pipelines');
+    // Inspect the editorial Edit panel's contents
+    const start = r.html.indexOf('id="pipelines-edit-panel-editorial"');
+    expect(start).toBeGreaterThan(-1);
+    // Slice generously — five sub-panels (each with grid/preview/copy
+    // chrome) can easily run past 10k characters.
+    const slice = r.html.slice(start, start + 20000);
+    expect(slice).toContain('data-pipelines-op="add"');
+    expect(slice).toContain('data-pipelines-op="rename"');
+    expect(slice).toContain('data-pipelines-op="remove"');
+    expect(slice).toContain('data-pipelines-op="set-locked"');
+    expect(slice).toContain('data-pipelines-op="set-off-pipeline"');
+    // Each panel carries a copy button
+    expect(slice).toMatch(/data-pipelines-copy-button="add"/);
+    expect(slice).toMatch(/data-pipelines-copy-button="rename"/);
+    expect(slice).toMatch(/data-pipelines-copy-button="remove"/);
+    expect(slice).toMatch(/data-pipelines-copy-button="set-locked"/);
+    expect(slice).toMatch(/data-pipelines-copy-button="set-off-pipeline"/);
+  });
+
+  it('Edit panel on a plugin preset surfaces a customize-first notice', async () => {
+    const r = await getHtml(app, '/dev/pipelines');
+    expect(r.html).toMatch(/pipelines-edit-notice[^]*?\/deskwork:customize pipeline editorial/);
+  });
+
+  it('Edit panel on a project-override omits the customize notice', async () => {
+    writePipelineOverride(root, 'orphan-custom', {
+      id: 'orphan-custom',
+      name: 'Orphan',
+      description: 'override only',
+      linearStages: ['Idea', 'Done'],
+      offPipelineStages: ['Cancelled'],
+    });
+    const app2 = createApp({ projectRoot: root, config: makeConfig() });
+    const r = await getHtml(app2, '/dev/pipelines');
+    const start = r.html.indexOf('id="pipelines-edit-panel-orphan-custom"');
+    expect(start).toBeGreaterThan(-1);
+    const slice = r.html.slice(start, start + 5000);
+    expect(slice).not.toContain('Plugin preset — customize first');
+  });
+
+  it('View panel renders the stage flow visualization', async () => {
+    const r = await getHtml(app, '/dev/pipelines');
+    // Editorial's linear stages should appear inside its view panel
+    const start = r.html.indexOf('id="pipelines-view-panel-editorial"');
+    expect(start).toBeGreaterThan(-1);
+    const slice = r.html.slice(start, start + 5000);
+    expect(slice).toContain('data-pipeline-stage="Ideas"');
+    expect(slice).toContain('data-pipeline-stage="Final"');
+    expect(slice).toContain('data-pipeline-stage="Published"');
+    // Locked stage gets the locked modifier class
+    // Locked-stage chrome carries both the class modifier AND the
+    // stage data attribute on the same span (order independent — test
+    // both directions).
+    expect(slice).toMatch(/pipelines-stage--locked[^"]*"\s+data-pipeline-stage="Final"/);
+    // Off-pipeline stages render in a separate section
+    expect(slice).toContain('data-pipeline-stage="Cancelled"');
+    expect(slice).toContain('pipelines-stage--off');
+  });
+
+  it('renders the New template copy-builder form', async () => {
+    const r = await getHtml(app, '/dev/pipelines');
+    expect(r.html).toContain('data-pipelines-new-form');
+    expect(r.html).toContain('data-pipelines-field="new-id"');
+    expect(r.html).toContain('data-pipelines-field="new-shape"');
+    expect(r.html).toContain('data-pipelines-copy-button="new"');
+    expect(r.html).toContain('data-pipelines-preview="new"');
+  });
+
+  it('surfaces malformed override JSON as an error row (NOT silently filtered)', async () => {
+    writePipelineOverride(root, 'broken', '{ this is not valid json');
+    const app2 = createApp({ projectRoot: root, config: makeConfig() });
+    const r = await getHtml(app2, '/dev/pipelines');
+    // The error row carries the id, the path, and a parse-error message
+    expect(r.html).toMatch(
+      /data-pipeline-row[^>]*data-pipeline-id="broken"[^>]*data-pipeline-error/,
+    );
+    expect(r.html).toContain('JSON parse error');
+    expect(r.html).toMatch(/\.deskwork[\/\\]pipelines[\/\\]broken\.json/);
+    // The error banner names the failing id at the top of the page
+    expect(r.html).toContain('data-pipelines-error-banner');
+    expect(r.html).toContain('<code>broken</code>');
+  });
+
+  it('error row dependents list names the lanes referencing the broken template', async () => {
+    writePipelineOverride(root, 'broken', '{ not json');
+    writeLane(root, 'broken-consumer', 'broken');
+    const app2 = createApp({ projectRoot: root, config: makeConfig() });
+    const r = await getHtml(app2, '/dev/pipelines');
+    expect(r.html).toMatch(/data-pipeline-id="broken"[^]*?broken-consumer/);
+  });
+
+  it('masthead back-link points at /dev/editorial-studio', async () => {
+    const r = await getHtml(app, '/dev/pipelines');
+    expect(r.html).toMatch(/class="er-masthead-back"[^>]*href="\/dev\/editorial-studio"/);
+  });
+
+  it('loads the editorial-studio-client script bundle', async () => {
+    const r = await getHtml(app, '/dev/pipelines');
+    expect(r.html).toMatch(/editorial-studio-client/);
+  });
+
+  it('loads the pipelines-page.css stylesheet', async () => {
+    const r = await getHtml(app, '/dev/pipelines');
+    expect(r.html).toMatch(/pipelines-page\.css/);
+  });
+});
+
+describe('pipelines-page — empty project (still has plugin presets)', () => {
+  let root: string;
+  let app: ReturnType<typeof createApp>;
+
+  beforeEach(() => {
+    root = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-empty-'));
+    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
+    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
+    mkdirSync(join(root, '.deskwork', 'pipelines'), { recursive: true });
+    app = createApp({ projectRoot: root, config: makeConfig() });
+  });
+
+  afterEach(() => {
+    rmSync(root, { recursive: true, force: true });
+  });
+
+  it('still surfaces all five plugin presets when no overrides + no lanes exist', async () => {
+    const r = await getHtml(app, '/dev/pipelines');
+    expect(r.status).toBe(200);
+    for (const id of ['editorial', 'visual', 'feature-doc', 'qa-plan', 'blog-post']) {
+      expect(r.html).toMatch(
+        new RegExp(`data-pipeline-id="${id}"`),
+      );
+    }
+  });
+});
diff --git a/packages/studio/test/pipelines/test-helpers.ts b/packages/studio/test/pipelines/test-helpers.ts
new file mode 100644
index 0000000..fc277fc
--- /dev/null
+++ b/packages/studio/test/pipelines/test-helpers.ts
@@ -0,0 +1,291 @@
+/**
+ * Shared DOM builders for `/dev/pipelines` client-controller tests.
+ *
+ * The two client tests (preview builders + accordion/clipboard) both
+ * need to assemble miniature page fixtures: containers, new form,
+ * per-template edit panels with the 5 sub-operations, per-row toggle
+ * buttons. Extracting the builders here keeps each test file under
+ * the project's 500-line guidance and prevents drift between the two
+ * fixtures.
+ *
+ * The helpers ONLY assemble DOM nodes that mirror what the server-
+ * side renderer emits in `packages/studio/src/pages/pipelines/`. No
+ * mocking, no stubbing of the controller under test.
+ */
+
+export function buildContainer(): HTMLElement {
+  document.body.innerHTML = '';
+  const container = document.createElement('main');
+  container.dataset.pipelinesContainer = '';
+  document.body.appendChild(container);
+  return container;
+}
+
+export function buildInput(
+  name: string,
+  opts: { readonly type?: string } = {},
+): HTMLInputElement {
+  const el = document.createElement('input');
+  el.type = opts.type ?? 'text';
+  el.dataset.pipelinesField = name;
+  return el;
+}
+
+export function buildPreview(scope: string, pipelineId?: string): HTMLElement {
+  const el = document.createElement('code');
+  el.dataset.pipelinesPreview = scope;
+  if (pipelineId !== undefined) el.dataset.pipelineId = pipelineId;
+  return el;
+}
+
+export function buildButton(
+  scope: string,
+  pipelineId?: string,
+): HTMLButtonElement {
+  const el = document.createElement('button');
+  el.type = 'button';
+  el.dataset.pipelinesCopyButton = scope;
+  if (pipelineId !== undefined) el.dataset.pipelineId = pipelineId;
+  el.textContent = 'Copy command';
+  return el;
+}
+
+export function buildNewForm(container: HTMLElement): HTMLElement {
+  const form = document.createElement('section');
+  form.dataset.pipelinesNewForm = '';
+  form.appendChild(buildInput('new-id'));
+  form.appendChild(buildInput('new-shape'));
+  form.appendChild(buildInput('new-name'));
+  form.appendChild(buildInput('new-description'));
+  form.appendChild(buildPreview('new'));
+  form.appendChild(buildButton('new'));
+  container.appendChild(form);
+  return form;
+}
+
+interface EditPanelInput {
+  readonly linearStages: readonly string[];
+  readonly lockedStages: readonly string[];
+  readonly offPipelineStages: readonly string[];
+}
+
+export interface EditPanel {
+  readonly panel: HTMLElement;
+}
+
+function buildAddDetails(pipelineId: string): HTMLDetailsElement {
+  const details = document.createElement('details');
+  details.dataset.pipelinesOp = 'add';
+  const body = document.createElement('div');
+  body.dataset.pipelinesOpForm = 'add';
+  body.dataset.pipelineId = pipelineId;
+  body.appendChild(buildInput('add-name'));
+  body.appendChild(buildInput('add-position', { type: 'number' }));
+  body.appendChild(buildPreview('add', pipelineId));
+  body.appendChild(buildButton('add', pipelineId));
+  details.appendChild(body);
+  return details;
+}
+
+function appendStageOptions(
+  select: HTMLSelectElement,
+  stages: readonly string[],
+): void {
+  for (const s of stages) {
+    const opt = document.createElement('option');
+    opt.value = s;
+    opt.textContent = s;
+    select.appendChild(opt);
+  }
+}
+
+function buildRenameDetails(
+  pipelineId: string,
+  current: EditPanelInput,
+): HTMLDetailsElement {
+  const details = document.createElement('details');
+  details.dataset.pipelinesOp = 'rename';
+  const body = document.createElement('div');
+  body.dataset.pipelinesOpForm = 'rename';
+  body.dataset.pipelineId = pipelineId;
+  const fromSelect = document.createElement('select');
+  fromSelect.dataset.pipelinesField = 'rename-from';
+  appendStageOptions(fromSelect, [
+    ...current.linearStages,
+    ...current.offPipelineStages,
+  ]);
+  body.appendChild(fromSelect);
+  body.appendChild(buildInput('rename-to'));
+  body.appendChild(buildPreview('rename', pipelineId));
+  body.appendChild(buildButton('rename', pipelineId));
+  details.appendChild(body);
+  return details;
+}
+
+function buildRemoveDetails(
+  pipelineId: string,
+  current: EditPanelInput,
+): HTMLDetailsElement {
+  const details = document.createElement('details');
+  details.dataset.pipelinesOp = 'remove';
+  const body = document.createElement('div');
+  body.dataset.pipelinesOpForm = 'remove';
+  body.dataset.pipelineId = pipelineId;
+  const select = document.createElement('select');
+  select.dataset.pipelinesField = 'remove-name';
+  appendStageOptions(select, [
+    ...current.linearStages,
+    ...current.offPipelineStages,
+  ]);
+  body.appendChild(select);
+  body.appendChild(buildPreview('remove', pipelineId));
+  body.appendChild(buildButton('remove', pipelineId));
+  details.appendChild(body);
+  return details;
+}
+
+function buildSetLockedDetails(
+  pipelineId: string,
+  current: EditPanelInput,
+): HTMLDetailsElement {
+  const details = document.createElement('details');
+  details.dataset.pipelinesOp = 'set-locked';
+  const body = document.createElement('div');
+  body.dataset.pipelinesOpForm = 'set-locked';
+  body.dataset.pipelineId = pipelineId;
+  const lockedSet = new Set(current.lockedStages);
+  for (const s of current.linearStages) {
+    const cb = document.createElement('input');
+    cb.type = 'checkbox';
+    cb.dataset.pipelinesField = 'set-locked';
+    cb.value = s;
+    cb.checked = lockedSet.has(s);
+    body.appendChild(cb);
+  }
+  body.appendChild(buildPreview('set-locked', pipelineId));
+  body.appendChild(buildButton('set-locked', pipelineId));
+  details.appendChild(body);
+  return details;
+}
+
+function buildSetOffDetails(
+  pipelineId: string,
+  current: EditPanelInput,
+): HTMLDetailsElement {
+  const details = document.createElement('details');
+  details.dataset.pipelinesOp = 'set-off-pipeline';
+  const body = document.createElement('div');
+  body.dataset.pipelinesOpForm = 'set-off-pipeline';
+  body.dataset.pipelineId = pipelineId;
+  const offInput = buildInput('set-off-pipeline');
+  offInput.value = current.offPipelineStages.join(',');
+  body.appendChild(offInput);
+  body.appendChild(buildPreview('set-off-pipeline', pipelineId));
+  body.appendChild(buildButton('set-off-pipeline', pipelineId));
+  details.appendChild(body);
+  return details;
+}
+
+export function buildEditPanel(
+  container: HTMLElement,
+  pipelineId: string,
+  current: EditPanelInput,
+): EditPanel {
+  const panel = document.createElement('section');
+  panel.dataset.pipelinesEditPanel = '';
+  panel.dataset.pipelineId = pipelineId;
+  panel.appendChild(buildAddDetails(pipelineId));
+  panel.appendChild(buildRenameDetails(pipelineId, current));
+  panel.appendChild(buildRemoveDetails(pipelineId, current));
+  panel.appendChild(buildSetLockedDetails(pipelineId, current));
+  panel.appendChild(buildSetOffDetails(pipelineId, current));
+  container.appendChild(panel);
+  return { panel };
+}
+
+export interface RowFixture {
+  readonly toggleView: HTMLButtonElement;
+  readonly toggleEdit: HTMLButtonElement;
+  readonly viewRow: HTMLElement;
+  readonly editRow: HTMLElement;
+  readonly deleteBtn: HTMLButtonElement | undefined;
+}
+
+export function buildRow(
+  container: HTMLElement,
+  pipelineId: string,
+  opts: { readonly withDelete?: boolean } = {},
+): RowFixture {
+  const toggleRow = document.createElement('tr');
+  toggleRow.dataset.pipelineRow = '';
+  toggleRow.dataset.pipelineId = pipelineId;
+  const cell = document.createElement('td');
+
+  const toggleView = document.createElement('button');
+  toggleView.type = 'button';
+  toggleView.dataset.pipelineViewToggle = '';
+  toggleView.dataset.pipelineId = pipelineId;
+  toggleView.setAttribute('aria-expanded', 'false');
+  cell.appendChild(toggleView);
+
+  const toggleEdit = document.createElement('button');
+  toggleEdit.type = 'button';
+  toggleEdit.dataset.pipelineEditToggle = '';
+  toggleEdit.dataset.pipelineId = pipelineId;
+  toggleEdit.setAttribute('aria-expanded', 'false');
+  cell.appendChild(toggleEdit);
+
+  let deleteBtn: HTMLButtonElement | undefined;
+  if (opts.withDelete === true) {
+    deleteBtn = document.createElement('button');
+    deleteBtn.type = 'button';
+    deleteBtn.dataset.pipelineCopy = '';
+    deleteBtn.dataset.copy = `/deskwork:pipeline delete ${pipelineId}`;
+    cell.appendChild(deleteBtn);
+  }
+
+  toggleRow.appendChild(cell);
+  container.appendChild(toggleRow);
+
+  const viewRow = document.createElement('tr');
+  viewRow.dataset.pipelineViewRow = '';
+  viewRow.dataset.pipelineId = pipelineId;
+  viewRow.hidden = true;
+  container.appendChild(viewRow);
+
+  const editRow = document.createElement('tr');
+  editRow.dataset.pipelineEditRow = '';
+  editRow.dataset.pipelineId = pipelineId;
+  editRow.hidden = true;
+  container.appendChild(editRow);
+
+  return { toggleView, toggleEdit, viewRow, editRow, deleteBtn };
+}
+
+export function installClipboardStub(): { calls: string[] } {
+  const calls: string[] = [];
+  const stub = {
+    writeText: async (text: string) => {
+      calls.push(text);
+    },
+  };
+  Object.defineProperty(navigator, 'clipboard', {
+    value: stub,
+    configurable: true,
+    writable: false,
+  });
+  Object.defineProperty(window, 'isSecureContext', {
+    value: true,
+    configurable: true,
+    writable: false,
+  });
+  return { calls };
+}
+
+export function inputEvent(): Event {
+  return new Event('input', { bubbles: true });
+}
+
+export function changeEvent(): Event {
+  return new Event('change', { bubbles: true });
+}
diff --git a/plugins/deskwork-studio/public/css/lanes-page.css b/plugins/deskwork-studio/public/css/lanes-page.css
new file mode 100644
index 0000000..59c9ed9
--- /dev/null
+++ b/plugins/deskwork-studio/public/css/lanes-page.css
@@ -0,0 +1,454 @@
+/*
+ * lanes-page.css — `/dev/lanes` studio surface (Phase 6 Task 6.3).
+ *
+ * Vocabulary mirrors the press-check tokens from editorial-review.css
+ * (paper, ink, red-pencil, proof-blue, kraft) so the page sits in the
+ * same design family as the dashboard.
+ *
+ * Layout shape:
+ *   - .lanes-container         — main column, paper background.
+ *   - .lanes-header            — page heading + count meta + warn.
+ *   - .lanes-form              — copy-builder forms (new + edit).
+ *   - .lanes-table             — server-rendered table.
+ *   - .lanes-archived          — collapse-by-default details section.
+ *   - .lanes-btn               — universal copy-button vocabulary.
+ *
+ * Per .claude/rules/affordance-placement.md, the row-level Edit and
+ * Archive buttons live ON the row (in the rightmost actions cell),
+ * not in a page-level toolbar.
+ */
+
+.lanes-container {
+  display: flex;
+  flex-direction: column;
+  gap: 1.5rem;
+  padding-block: 1.5rem 2rem;
+}
+
+.lanes-header {
+  margin-block-end: 0.5rem;
+}
+
+.lanes-header-warn {
+  display: inline-block;
+  margin-block-start: 0.5rem;
+  padding: 0.4rem 0.75rem;
+  background: var(--er-paper-2, #ECE6D4);
+  border-left: 3px solid var(--er-red-pencil, #B8362A);
+  color: var(--er-ink-soft, #3A332E);
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.85rem;
+}
+
+.lanes-header-warn code {
+  background: var(--er-paper-3, #DFD7BF);
+  padding: 0 0.3rem;
+  border-radius: 2px;
+}
+
+/* ---- Active / archived section heads ---- */
+
+.lanes-active-heading,
+.lanes-archived-heading {
+  font-family: var(--er-font-display, Georgia, serif);
+  font-style: italic;
+  font-size: 1.4rem;
+  color: var(--er-ink, #1A1614);
+  margin-block: 0 0.75rem;
+}
+
+.lanes-active {
+  display: flex;
+  flex-direction: column;
+  gap: 0.75rem;
+}
+
+.lanes-archived {
+  margin-block-start: 1rem;
+}
+
+.lanes-archived-details {
+  border: 1px dashed var(--er-paper-3, #DFD7BF);
+  background: var(--er-paper-2, #ECE6D4);
+}
+
+.lanes-archived-summary {
+  display: flex;
+  align-items: center;
+  gap: 0.5rem;
+  padding: 0.6rem 0.75rem;
+  cursor: pointer;
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.9rem;
+  color: var(--er-ink-soft, #3A332E);
+  list-style: none;
+}
+
+.lanes-archived-summary::-webkit-details-marker {
+  display: none;
+}
+
+.lanes-archived-chevron {
+  display: inline-block;
+  transition: transform 120ms ease-in-out;
+}
+
+.lanes-archived-details[open] .lanes-archived-chevron {
+  transform: rotate(90deg);
+}
+
+.lanes-archived-count {
+  margin-inline-start: auto;
+  padding: 0.1rem 0.5rem;
+  border-radius: 999px;
+  background: var(--er-paper-3, #DFD7BF);
+  font-size: 0.75rem;
+}
+
+.lanes-archived-body {
+  padding: 0 0.75rem 0.75rem;
+}
+
+.lanes-archived-empty {
+  margin: 0;
+  padding: 0.5rem 0.75rem;
+  color: var(--er-faded, #8A7F70);
+  font-size: 0.9rem;
+}
+
+/* ---- Empty state ---- */
+
+.lanes-empty {
+  display: flex;
+  flex-direction: column;
+  align-items: flex-start;
+  gap: 0.75rem;
+  padding: 1.25rem;
+  border: 1px dashed var(--er-paper-3, #DFD7BF);
+  background: var(--er-paper-2, #ECE6D4);
+}
+
+.lanes-empty-message {
+  margin: 0;
+  color: var(--er-ink-soft, #3A332E);
+}
+
+/* ---- Forms (new + edit) ---- */
+
+.lanes-form {
+  display: flex;
+  flex-direction: column;
+  gap: 0.75rem;
+  padding: 1rem;
+  background: var(--er-paper-2, #ECE6D4);
+  border-left: 3px solid var(--er-proof-blue, #2A4B7C);
+}
+
+.lanes-form--edit {
+  background: var(--er-paper, #F5F1E8);
+  border-left-color: var(--er-kraft, #8A7250);
+  padding: 0.75rem 1rem;
+}
+
+.lanes-form-head {
+  display: flex;
+  flex-direction: column;
+  gap: 0.25rem;
+}
+
+.lanes-form-heading {
+  margin: 0;
+  font-family: var(--er-font-display, Georgia, serif);
+  font-style: italic;
+  font-size: 1.15rem;
+  color: var(--er-ink, #1A1614);
+}
+
+.lanes-form-desc {
+  margin: 0;
+  color: var(--er-faded, #8A7F70);
+  font-size: 0.85rem;
+}
+
+.lanes-form-grid {
+  display: grid;
+  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
+  gap: 0.75rem 1rem;
+}
+
+.lanes-field {
+  display: flex;
+  flex-direction: column;
+  gap: 0.25rem;
+}
+
+.lanes-field-label {
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.75rem;
+  text-transform: uppercase;
+  letter-spacing: 0.04em;
+  color: var(--er-ink-soft, #3A332E);
+}
+
+.lanes-field-hint {
+  font-size: 0.75rem;
+  color: var(--er-faded, #8A7F70);
+}
+
+.lanes-input,
+.lanes-select {
+  padding: 0.45rem 0.6rem;
+  border: 1px solid var(--er-paper-3, #DFD7BF);
+  background: var(--er-paper, #F5F1E8);
+  color: var(--er-ink, #1A1614);
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.9rem;
+  border-radius: 2px;
+  min-height: 2.25rem;
+}
+
+.lanes-input:focus,
+.lanes-select:focus {
+  outline: 2px solid var(--er-proof-blue, #2A4B7C);
+  outline-offset: 1px;
+}
+
+.lanes-form-preview {
+  display: flex;
+  flex-direction: column;
+  gap: 0.25rem;
+  padding: 0.5rem 0.75rem;
+  background: var(--er-paper, #F5F1E8);
+  border: 1px solid var(--er-paper-3, #DFD7BF);
+  border-radius: 2px;
+}
+
+.lanes-form-preview-label {
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.7rem;
+  text-transform: uppercase;
+  letter-spacing: 0.04em;
+  color: var(--er-faded, #8A7F70);
+}
+
+.lanes-form-preview-cmd {
+  display: block;
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.95rem;
+  color: var(--er-ink, #1A1614);
+  word-break: break-word;
+  white-space: pre-wrap;
+}
+
+.lanes-form-actions {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 0.5rem;
+}
+
+/* ---- Buttons ---- */
+
+.lanes-btn {
+  display: inline-flex;
+  align-items: center;
+  justify-content: center;
+  gap: 0.25rem;
+  min-height: 2.25rem;
+  min-width: 2.25rem;
+  padding: 0.35rem 0.85rem;
+  border: 1px solid var(--er-paper-3, #DFD7BF);
+  background: var(--er-paper, #F5F1E8);
+  color: var(--er-ink-soft, #3A332E);
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.8rem;
+  text-decoration: none;
+  cursor: pointer;
+  border-radius: 2px;
+  transition: background 80ms ease-in-out, color 80ms ease-in-out;
+}
+
+.lanes-btn:hover {
+  background: var(--er-paper-2, #ECE6D4);
+}
+
+.lanes-btn:focus-visible {
+  outline: 2px solid var(--er-proof-blue, #2A4B7C);
+  outline-offset: 1px;
+}
+
+.lanes-btn--primary {
+  background: var(--er-proof-blue, #2A4B7C);
+  color: var(--er-paper, #F5F1E8);
+  border-color: var(--er-proof-blue, #2A4B7C);
+}
+
+.lanes-btn--primary:hover {
+  background: var(--er-ink, #1A1614);
+  border-color: var(--er-ink, #1A1614);
+}
+
+.lanes-btn--secondary {
+  background: var(--er-paper-2, #ECE6D4);
+}
+
+.lanes-btn--archive {
+  border-color: var(--er-red-pencil, #B8362A);
+  color: var(--er-red-pencil, #B8362A);
+}
+
+.lanes-btn--archive:hover {
+  background: var(--er-red-pencil, #B8362A);
+  color: var(--er-paper, #F5F1E8);
+}
+
+.lanes-btn--restore {
+  border-color: var(--er-stamp-green, #2E5D45);
+  color: var(--er-stamp-green, #2E5D45);
+}
+
+.lanes-btn--restore:hover {
+  background: var(--er-stamp-green, #2E5D45);
+  color: var(--er-paper, #F5F1E8);
+}
+
+.lanes-btn--purge {
+  border-color: var(--er-ink, #1A1614);
+  color: var(--er-ink, #1A1614);
+  background: var(--er-paper-3, #DFD7BF);
+}
+
+.lanes-btn--purge:hover {
+  background: var(--er-ink, #1A1614);
+  color: var(--er-paper, #F5F1E8);
+}
+
+/*
+ * Visibly-disabled Purge button (archived lane with entries still
+ * bound). The disabled state makes the gate discoverable; the title
+ * attribute explains the next step ("move entries first"). Carries no
+ * click handler — the CLI gate matches this visual gate.
+ */
+.lanes-btn--purge-disabled {
+  border-color: var(--er-faded-2, #B5AC9B);
+  color: var(--er-faded, #8A7F70);
+  background: var(--er-paper-2, #ECE6D4);
+  cursor: not-allowed;
+  opacity: 0.7;
+}
+
+.lanes-btn--purge-disabled:hover {
+  background: var(--er-paper-2, #ECE6D4);
+  color: var(--er-faded, #8A7F70);
+}
+
+.lanes-btn.is-copied {
+  background: var(--er-stamp-green, #2E5D45) !important;
+  color: var(--er-paper, #F5F1E8) !important;
+  border-color: var(--er-stamp-green, #2E5D45) !important;
+}
+
+/* ---- Table ---- */
+
+.lanes-table {
+  width: 100%;
+  border-collapse: collapse;
+  background: var(--er-paper, #F5F1E8);
+  font-size: 0.9rem;
+}
+
+.lanes-table-caption {
+  text-align: left;
+  padding: 0.5rem 0;
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.75rem;
+  text-transform: uppercase;
+  letter-spacing: 0.04em;
+  color: var(--er-faded, #8A7F70);
+}
+
+.lanes-th,
+.lanes-cell {
+  padding: 0.6rem 0.75rem;
+  border-bottom: 1px solid var(--er-paper-3, #DFD7BF);
+  text-align: left;
+  vertical-align: middle;
+}
+
+.lanes-th {
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.7rem;
+  text-transform: uppercase;
+  letter-spacing: 0.04em;
+  color: var(--er-ink-soft, #3A332E);
+  background: var(--er-paper-2, #ECE6D4);
+}
+
+.lanes-cell code {
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.85rem;
+  color: var(--er-ink, #1A1614);
+}
+
+.lanes-row[data-archived] .lanes-cell {
+  color: var(--er-faded, #8A7F70);
+}
+
+.lanes-cell--handle,
+.lanes-th--handle {
+  width: 2rem;
+  text-align: center;
+}
+
+.lanes-reorder-handle {
+  display: inline-block;
+  color: var(--er-faded-2, #B5AC9B);
+  cursor: help;
+  user-select: none;
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+}
+
+.lanes-cell--count {
+  font-variant-numeric: tabular-nums;
+}
+
+.lanes-cell--visibility {
+  text-align: center;
+}
+
+.lanes-visibility-icon {
+  display: inline-block;
+  font-size: 1.1rem;
+  color: var(--er-stamp-green, #2E5D45);
+}
+
+.lanes-row[data-archived] .lanes-visibility-icon {
+  color: var(--er-faded, #8A7F70);
+}
+
+.lanes-cell--actions {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 0.35rem;
+  justify-content: flex-end;
+}
+
+.lanes-cell--empty {
+  text-align: center;
+  padding: 1.5rem;
+  color: var(--er-faded, #8A7F70);
+  font-style: italic;
+}
+
+.lanes-row--edit-form .lanes-cell {
+  padding: 0;
+  background: var(--er-paper, #F5F1E8);
+}
+
+@media (max-width: 720px) {
+  .lanes-th--content-dir,
+  .lanes-cell--content-dir,
+  .lanes-th--template,
+  .lanes-cell--template {
+    display: none;
+  }
+}
diff --git a/plugins/deskwork-studio/public/css/pipelines-page.css b/plugins/deskwork-studio/public/css/pipelines-page.css
new file mode 100644
index 0000000..4ba626a
--- /dev/null
+++ b/plugins/deskwork-studio/public/css/pipelines-page.css
@@ -0,0 +1,426 @@
+/*
+ * pipelines-page.css — `/dev/pipelines` studio surface (Phase 6 Task 6.4).
+ *
+ * Vocabulary mirrors the press-check tokens from editorial-review.css
+ * (paper, ink, red-pencil, proof-blue, kraft, stamp-green) so the page
+ * sits in the same design family as the lanes page and the dashboard.
+ *
+ * Layout shape:
+ *   - .pipelines-container       — main column, paper background.
+ *   - .pipelines-header          — page heading + count meta + warn.
+ *   - .pipelines-banner          — top-of-page errors banner.
+ *   - .pipelines-form            — copy-builder forms (new + edit ops).
+ *   - .pipelines-table           — server-rendered template table.
+ *   - .pipelines-view-panel      — stage-flow visualization (read).
+ *   - .pipelines-edit-panel      — 5-operation accordion (mutation).
+ *   - .pipelines-btn             — universal copy-button vocabulary.
+ *
+ * Per .claude/rules/affordance-placement.md, per-row View / Edit /
+ * Delete affordances live ON the row (in the rightmost actions cell).
+ */
+
+.pipelines-container {
+  display: flex;
+  flex-direction: column;
+  gap: 1.5rem;
+  padding-block: 1.5rem 2rem;
+}
+
+.pipelines-header {
+  margin-block-end: 0.5rem;
+}
+
+.pipelines-header-warn {
+  display: inline-block;
+  margin-block-start: 0.5rem;
+  padding: 0.4rem 0.75rem;
+  background: var(--er-paper-2, #ECE6D4);
+  border-left: 3px solid var(--er-red-pencil, #B8362A);
+  color: var(--er-ink-soft, #3A332E);
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.85rem;
+}
+
+.pipelines-section-heading {
+  font-family: var(--er-font-display, Georgia, serif);
+  font-style: italic;
+  font-size: 1.4rem;
+  color: var(--er-ink, #1A1614);
+  margin-block: 0 0.75rem;
+}
+
+/* ---- Top-of-page errors banner ---- */
+
+.pipelines-banner {
+  display: flex;
+  flex-direction: column;
+  gap: 0.25rem;
+  padding: 0.6rem 0.9rem;
+  border-left: 3px solid var(--er-red-pencil, #B8362A);
+  background: var(--er-paper-2, #ECE6D4);
+  color: var(--er-ink, #1A1614);
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.9rem;
+}
+
+.pipelines-banner code {
+  background: var(--er-paper-3, #DFD7BF);
+  padding: 0 0.3rem;
+  border-radius: 2px;
+}
+
+/* ---- Forms (new + edit op bodies) ---- */
+
+.pipelines-form,
+.pipelines-edit-panel {
+  display: flex;
+  flex-direction: column;
+  gap: 0.75rem;
+  padding: 1rem;
+  background: var(--er-paper-2, #ECE6D4);
+  border-left: 3px solid var(--er-proof-blue, #2A4B7C);
+}
+
+.pipelines-edit-panel {
+  background: var(--er-paper, #F5F1E8);
+  border-left-color: var(--er-kraft, #8A7250);
+  padding: 0.75rem 1rem;
+}
+
+.pipelines-form-head,
+.pipelines-edit-head {
+  display: flex;
+  flex-direction: column;
+  gap: 0.25rem;
+}
+
+.pipelines-form-heading,
+.pipelines-edit-heading {
+  margin: 0;
+  font-family: var(--er-font-display, Georgia, serif);
+  font-style: italic;
+  font-size: 1.15rem;
+  color: var(--er-ink, #1A1614);
+}
+
+.pipelines-form-desc,
+.pipelines-edit-desc {
+  margin: 0;
+  color: var(--er-faded, #8A7F70);
+  font-size: 0.85rem;
+}
+
+.pipelines-edit-notice {
+  padding: 0.5rem 0.75rem;
+  background: var(--er-paper-3, #DFD7BF);
+  border-left: 3px solid var(--er-red-pencil, #B8362A);
+  color: var(--er-ink-soft, #3A332E);
+  font-size: 0.85rem;
+}
+
+.pipelines-edit-notice strong {
+  display: block;
+  margin-block-end: 0.25rem;
+}
+
+.pipelines-form-grid {
+  display: grid;
+  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
+  gap: 0.75rem 1rem;
+}
+
+.pipelines-field {
+  display: flex;
+  flex-direction: column;
+  gap: 0.25rem;
+}
+
+.pipelines-field-label {
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.75rem;
+  text-transform: uppercase;
+  letter-spacing: 0.04em;
+  color: var(--er-ink-soft, #3A332E);
+}
+
+.pipelines-field-hint {
+  font-size: 0.75rem;
+  color: var(--er-faded, #8A7F70);
+}
+
+.pipelines-input,
+.pipelines-select {
+  padding: 0.45rem 0.6rem;
+  border: 1px solid var(--er-paper-3, #DFD7BF);
+  background: var(--er-paper, #F5F1E8);
+  color: var(--er-ink, #1A1614);
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.9rem;
+  border-radius: 2px;
+  min-height: 2.25rem;
+}
+
+.pipelines-input:focus,
+.pipelines-select:focus {
+  outline: 2px solid var(--er-proof-blue, #2A4B7C);
+  outline-offset: 1px;
+}
+
+.pipelines-checkbox-grid {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 0.5rem 1rem;
+  padding-block: 0.25rem;
+}
+
+.pipelines-checkbox-field {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.4rem;
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.85rem;
+  color: var(--er-ink, #1A1614);
+}
+
+.pipelines-form-preview {
+  display: flex;
+  flex-direction: column;
+  gap: 0.25rem;
+  padding: 0.5rem 0.75rem;
+  background: var(--er-paper, #F5F1E8);
+  border: 1px solid var(--er-paper-3, #DFD7BF);
+  border-radius: 2px;
+}
+
+.pipelines-form-preview-label {
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.7rem;
+  text-transform: uppercase;
+  letter-spacing: 0.04em;
+  color: var(--er-faded, #8A7F70);
+}
+
+.pipelines-form-preview-cmd {
+  display: block;
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.95rem;
+  color: var(--er-ink, #1A1614);
+  word-break: break-word;
+  white-space: pre-wrap;
+}
+
+.pipelines-form-actions {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 0.5rem;
+}
+
+/* ---- Edit panel: 5-op accordion ---- */
+
+.pipelines-edit-ops {
+  display: flex;
+  flex-direction: column;
+  gap: 0.4rem;
+}
+
+.pipelines-edit-op {
+  border: 1px solid var(--er-paper-3, #DFD7BF);
+  background: var(--er-paper, #F5F1E8);
+  border-radius: 2px;
+}
+
+.pipelines-edit-op-summary {
+  cursor: pointer;
+  padding: 0.5rem 0.75rem;
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.85rem;
+  color: var(--er-ink-soft, #3A332E);
+  list-style: revert;
+}
+
+.pipelines-edit-op[open] > .pipelines-edit-op-summary {
+  border-bottom: 1px dashed var(--er-paper-3, #DFD7BF);
+  background: var(--er-paper-2, #ECE6D4);
+}
+
+.pipelines-edit-op-body {
+  display: flex;
+  flex-direction: column;
+  gap: 0.5rem;
+  padding: 0.75rem;
+}
+
+/* ---- Buttons ---- */
+
+.pipelines-btn {
+  display: inline-flex;
+  align-items: center;
+  justify-content: center;
+  gap: 0.25rem;
+  min-height: 2.25rem;
+  min-width: 2.25rem;
+  padding: 0.35rem 0.85rem;
+  border: 1px solid var(--er-paper-3, #DFD7BF);
+  background: var(--er-paper, #F5F1E8);
+  color: var(--er-ink-soft, #3A332E);
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.8rem;
+  text-decoration: none;
+  cursor: pointer;
+  border-radius: 2px;
+  transition: background 80ms ease-in-out, color 80ms ease-in-out;
+}
+
+.pipelines-btn:hover {
+  background: var(--er-paper-2, #ECE6D4);
+}
+
+.pipelines-btn:focus-visible {
+  outline: 2px solid var(--er-proof-blue, #2A4B7C);
+  outline-offset: 1px;
+}
+
+.pipelines-btn--primary {
+  background: var(--er-proof-blue, #2A4B7C);
+  color: var(--er-paper, #F5F1E8);
+  border-color: var(--er-proof-blue, #2A4B7C);
+}
+
+.pipelines-btn--primary:hover {
+  background: var(--er-ink, #1A1614);
+  border-color: var(--er-ink, #1A1614);
+}
+
+.pipelines-btn--secondary {
+  background: var(--er-paper-2, #ECE6D4);
+}
+
+.pipelines-btn--view,
+.pipelines-btn--edit {
+  border-color: var(--er-kraft, #8A7250);
+  color: var(--er-kraft, #8A7250);
+}
+
+.pipelines-btn--view:hover,
+.pipelines-btn--edit:hover {
+  background: var(--er-kraft, #8A7250);
+  color: var(--er-paper, #F5F1E8);
+}
+
+.pipelines-btn--delete {
+  border-color: var(--er-red-pencil, #B8362A);
+  color: var(--er-red-pencil, #B8362A);
+}
+
+.pipelines-btn--delete:hover {
+  background: var(--er-red-pencil, #B8362A);
+  color: var(--er-paper, #F5F1E8);
+}
+
+.pipelines-btn--delete-disabled {
+  border-color: var(--er-faded-2, #B5AC9B);
+  color: var(--er-faded, #8A7F70);
+  background: var(--er-paper-2, #ECE6D4);
+  cursor: not-allowed;
+  opacity: 0.7;
+}
+
+.pipelines-btn--delete-disabled:hover {
+  background: var(--er-paper-2, #ECE6D4);
+  color: var(--er-faded, #8A7F70);
+}
+
+.pipelines-btn.is-copied {
+  background: var(--er-stamp-green, #2E5D45) !important;
+  color: var(--er-paper, #F5F1E8) !important;
+  border-color: var(--er-stamp-green, #2E5D45) !important;
+}
+
+/* ---- Table ---- */
+
+.pipelines-table {
+  width: 100%;
+  border-collapse: collapse;
+  background: var(--er-paper, #F5F1E8);
+  font-size: 0.9rem;
+}
+
+.pipelines-table-caption {
+  text-align: left;
+  padding: 0.5rem 0;
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.75rem;
+  text-transform: uppercase;
+  letter-spacing: 0.04em;
+  color: var(--er-faded, #8A7F70);
+}
+
+.pipelines-th,
+.pipelines-cell {
+  padding: 0.6rem 0.75rem;
+  border-bottom: 1px solid var(--er-paper-3, #DFD7BF);
+  text-align: left;
+  vertical-align: middle;
+}
+
+.pipelines-th {
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.7rem;
+  text-transform: uppercase;
+  letter-spacing: 0.04em;
+  color: var(--er-ink-soft, #3A332E);
+  background: var(--er-paper-2, #ECE6D4);
+}
+
+.pipelines-cell code {
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.85rem;
+  color: var(--er-ink, #1A1614);
+}
+
+.pipelines-cell--linear-count,
+.pipelines-cell--locked-count,
+.pipelines-cell--off-count,
+.pipelines-cell--lanes-count {
+  font-variant-numeric: tabular-nums;
+  text-align: right;
+}
+
+.pipelines-cell--actions {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 0.35rem;
+  justify-content: flex-end;
+}
+
+.pipelines-cell--empty {
+  text-align: center;
+  padding: 1.5rem;
+  color: var(--er-faded, #8A7F70);
+  font-style: italic;
+}
+
+.pipelines-row--view-panel .pipelines-cell,
+.pipelines-row--edit-panel .pipelines-cell {
+  padding: 0;
+  background: var(--er-paper, #F5F1E8);
+}
+
+/*
+ * Source chips (`.pipelines-source--preset` / `--override` / `--error`)
+ * and error rows live in `pipelines-stage-flow.css` alongside the
+ * stage-flow vocabulary. Both stylesheets are listed by the page
+ * renderer; the split is a code-size hygiene boundary, not a runtime
+ * one.
+ */
+
+@media (max-width: 720px) {
+  .pipelines-th--linear-count,
+  .pipelines-cell--linear-count,
+  .pipelines-th--locked-count,
+  .pipelines-cell--locked-count,
+  .pipelines-th--off-count,
+  .pipelines-cell--off-count {
+    display: none;
+  }
+}
diff --git a/plugins/deskwork-studio/public/css/pipelines-stage-flow.css b/plugins/deskwork-studio/public/css/pipelines-stage-flow.css
new file mode 100644
index 0000000..e1eaade
--- /dev/null
+++ b/plugins/deskwork-studio/public/css/pipelines-stage-flow.css
@@ -0,0 +1,192 @@
+/*
+ * pipelines-stage-flow.css — stage flow visualization for the View
+ * panel inside `/dev/pipelines` (Phase 6 Task 6.4 step 6.4.2).
+ *
+ * Sibling stylesheet to `pipelines-page.css`. Separated because the
+ * stage-flow vocabulary (`.pipelines-stage*`) is a self-contained
+ * visual language — pill chips, lock badges, off-pipeline dashed
+ * borders, arrows — that may be reused elsewhere (a future "what
+ * stages does this entry traverse?" surface on the entry-review page,
+ * etc.). Keeping it in its own file makes that reuse cleaner.
+ *
+ * Press-check tokens (proof-blue, kraft, paper, ink) come from
+ * editorial-review.css. This file adds no new tokens.
+ */
+
+.pipelines-view-panel {
+  display: flex;
+  flex-direction: column;
+  gap: 0.6rem;
+  padding: 1rem;
+  background: var(--er-paper, #F5F1E8);
+  border-left: 3px solid var(--er-kraft, #8A7250);
+}
+
+.pipelines-view-head {
+  display: flex;
+  flex-direction: column;
+  gap: 0.2rem;
+}
+
+.pipelines-view-heading {
+  margin: 0;
+  font-family: var(--er-font-display, Georgia, serif);
+  font-style: italic;
+  font-size: 1.15rem;
+  color: var(--er-ink, #1A1614);
+}
+
+.pipelines-view-desc {
+  margin: 0;
+  color: var(--er-faded, #8A7F70);
+  font-size: 0.85rem;
+}
+
+.pipelines-view-subheading {
+  margin: 0.25rem 0;
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.75rem;
+  text-transform: uppercase;
+  letter-spacing: 0.04em;
+  color: var(--er-ink-soft, #3A332E);
+}
+
+.pipelines-stage-list {
+  display: flex;
+  flex-wrap: wrap;
+  align-items: center;
+  gap: 0.4rem 0.75rem;
+  padding: 0;
+  margin: 0;
+  list-style: none;
+}
+
+.pipelines-stage-item {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.4rem;
+}
+
+.pipelines-stage {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.35rem;
+  padding: 0.3rem 0.7rem;
+  border-radius: 999px;
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.85rem;
+  background: var(--er-paper-2, #ECE6D4);
+  border: 1px solid var(--er-paper-3, #DFD7BF);
+  color: var(--er-ink, #1A1614);
+}
+
+.pipelines-stage--linear {
+  background: var(--er-paper, #F5F1E8);
+  border-color: var(--er-ink-soft, #3A332E);
+}
+
+.pipelines-stage--linear.pipelines-stage--locked {
+  border-color: var(--er-proof-blue, #2A4B7C);
+  color: var(--er-proof-blue, #2A4B7C);
+}
+
+.pipelines-stage--off {
+  background: var(--er-paper-3, #DFD7BF);
+  border-color: var(--er-kraft, #8A7250);
+  color: var(--er-kraft, #8A7250);
+  border-style: dashed;
+}
+
+.pipelines-stage-badge {
+  display: inline-block;
+  padding: 0 0.3rem;
+  border-radius: 2px;
+  background: var(--er-proof-blue, #2A4B7C);
+  color: var(--er-paper, #F5F1E8);
+  font-size: 0.65rem;
+  text-transform: uppercase;
+  letter-spacing: 0.05em;
+}
+
+.pipelines-stage-arrow {
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  color: var(--er-faded, #8A7F70);
+}
+
+/* ---- Source chips ---- */
+
+.pipelines-source {
+  display: inline-block;
+  padding: 0.1rem 0.5rem;
+  border-radius: 999px;
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.7rem;
+  text-transform: uppercase;
+  letter-spacing: 0.04em;
+}
+
+.pipelines-source--preset {
+  border: 1px solid var(--er-kraft, #8A7250);
+  color: var(--er-kraft, #8A7250);
+  background: var(--er-paper, #F5F1E8);
+}
+
+.pipelines-source--override {
+  border: 1px solid var(--er-proof-blue, #2A4B7C);
+  color: var(--er-proof-blue, #2A4B7C);
+  background: var(--er-paper, #F5F1E8);
+}
+
+.pipelines-source--error {
+  border: 1px solid var(--er-red-pencil, #B8362A);
+  color: var(--er-red-pencil, #B8362A);
+  background: var(--er-paper, #F5F1E8);
+}
+
+/* ---- Error rows ---- */
+
+.pipelines-row--error .pipelines-cell {
+  background: var(--er-paper-2, #ECE6D4);
+}
+
+.pipelines-error {
+  display: flex;
+  flex-direction: column;
+  gap: 0.25rem;
+  padding: 0.5rem 0.75rem;
+  border-left: 3px solid var(--er-red-pencil, #B8362A);
+}
+
+.pipelines-error-kind {
+  margin: 0;
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.8rem;
+  text-transform: uppercase;
+  letter-spacing: 0.04em;
+  color: var(--er-red-pencil, #B8362A);
+}
+
+.pipelines-error-path {
+  margin: 0;
+  font-size: 0.85rem;
+  color: var(--er-ink-soft, #3A332E);
+}
+
+.pipelines-error-message {
+  margin: 0;
+  padding: 0.4rem 0.6rem;
+  background: var(--er-paper, #F5F1E8);
+  border: 1px solid var(--er-paper-3, #DFD7BF);
+  border-radius: 2px;
+  white-space: pre-wrap;
+  word-break: break-word;
+  font-family: var(--er-font-mono, ui-monospace, monospace);
+  font-size: 0.8rem;
+  color: var(--er-ink-soft, #3A332E);
+}
+
+.pipelines-error-dependents {
+  margin: 0;
+  font-size: 0.85rem;
+  color: var(--er-ink-soft, #3A332E);
+}
diff --git a/plugins/deskwork-studio/public/src/copy-builder.ts b/plugins/deskwork-studio/public/src/copy-builder.ts
new file mode 100644
index 0000000..524a837
--- /dev/null
+++ b/plugins/deskwork-studio/public/src/copy-builder.ts
@@ -0,0 +1,49 @@
+/**
+ * Shared copy-builder helper for clipboard-action buttons.
+ *
+ * Extracted from `lanes/lanes-page.ts` and `pipelines/pipelines-page.ts`
+ * after Phase 6 Task 6.4 introduced the second consumer. Both
+ * copy-builder controllers (and any future studio surface that ships
+ * a "build a slash command via fields, copy the result" affordance —
+ * Task 6.5's pipeline-migration tray, etc.) need exactly the same
+ * post-copy affirmation: green "Copied ✓" flash for
+ * `COPIED_FLASH_MS` then revert.
+ *
+ * `copyAndFlash` calls `copyOrShowFallback` (the shared clipboard
+ * helper). On success it flips the button into the affirmation state;
+ * on fallback (insecure context, denied permission) the fallback
+ * panel handles operator-side affordance, so the button does NOT
+ * flash — the fallback panel IS the feedback signal.
+ *
+ * Leaf module: imports only from `./clipboard.ts`. No DOM-specific
+ * styling lives here — the `.is-copied` class lives in
+ * `lanes-page.css` and `pipelines-page.css` (and any consumer
+ * stylesheet must define it).
+ */
+
+import { copyOrShowFallback } from './clipboard.ts';
+
+export const COPIED_FLASH_MS = 1500;
+
+const FALLBACK_MESSAGE =
+  'Clipboard unavailable — select and Cmd-C to copy this command, then paste it into Claude Code:';
+
+export async function copyAndFlash(
+  command: string,
+  button: HTMLButtonElement,
+  successMessage: string,
+): Promise<void> {
+  const original = button.textContent;
+  const ok = await copyOrShowFallback(command, {
+    successMessage,
+    fallbackMessage: FALLBACK_MESSAGE,
+  });
+  if (ok) {
+    button.classList.add('is-copied');
+    button.textContent = 'Copied ✓';
+    window.setTimeout(() => {
+      button.classList.remove('is-copied');
+      if (original !== null) button.textContent = original;
+    }, COPIED_FLASH_MS);
+  }
+}
diff --git a/plugins/deskwork-studio/public/src/editorial-studio-client.ts b/plugins/deskwork-studio/public/src/editorial-studio-client.ts
index 147f413..ca8716c 100644
--- a/plugins/deskwork-studio/public/src/editorial-studio-client.ts
+++ b/plugins/deskwork-studio/public/src/editorial-studio-client.ts
@@ -17,6 +17,8 @@ import { initSwimlaneMobileSheet } from './dashboard/swimlane-mobile-sheet.ts';
 import { initSwimlaneDrag } from './dashboard/swimlane-drag.ts';
 import { initSwimlanePresets } from './dashboard/swimlane-presets.ts';
 import { initMastheadPopover } from './mobile-shell/masthead-popover.ts';
+import { initLanesPage } from './lanes/lanes-page.ts';
+import { initPipelinesPage } from './pipelines/pipelines-page.ts';
 
 function siteFromButton(btn: HTMLButtonElement): string {
   const site = btn.dataset.site;
@@ -534,6 +536,12 @@ function init(): void {
   initSwimlanePresets();
   initRowActions();
   initMastheadPopover();
+  // Phase 6 Task 6.3: lanes-page controller (idempotent — no-op
+  // when [data-lanes-container] is absent on the dashboard).
+  initLanesPage();
+  // Phase 6 Task 6.4: pipelines-page controller (idempotent — no-op
+  // when [data-pipelines-container] is absent).
+  initPipelinesPage();
 }
 
 init();
diff --git a/plugins/deskwork-studio/public/src/lanes/lanes-page.ts b/plugins/deskwork-studio/public/src/lanes/lanes-page.ts
new file mode 100644
index 0000000..620feb6
--- /dev/null
+++ b/plugins/deskwork-studio/public/src/lanes/lanes-page.ts
@@ -0,0 +1,378 @@
+/**
+ * Client controller for the `/dev/lanes` studio page (Phase 6 Task
+ * 6.3).
+ *
+ * Responsibilities:
+ *
+ *   1. **Live command preview.** Each form (New + per-row Edit)
+ *      carries a `<code data-lanes-preview>` element. On every
+ *      change event the controller rebuilds the preview to match
+ *      the form's current values.
+ *
+ *   2. **Clipboard copy.** Each copy button (`[data-lanes-copy-button]`
+ *      on forms, `[data-lane-copy]` on table rows) clipboards its
+ *      payload through `copyOrShowFallback` and flashes a "Copied"
+ *      affirmation on the button.
+ *
+ *   3. **Per-row Edit toggle (single-open accordion).** Each row's
+ *      Edit button toggles the sibling `tr[data-lane-edit-row]`
+ *      between visible / hidden + flips `aria-expanded` on the
+ *      toggle button. Opening one row's edit form auto-closes any
+ *      previously-open row — at most one edit form is visible at a
+ *      time.
+ *
+ *   4. **Archived-section open-state persistence.** A `toggle` event
+ *      handler on `[data-lanes-archived-details]` writes the open
+ *      state to `localStorage` (project-scoped); on init the page
+ *      reads it back and restores the previous state.
+ *
+ *   5. **Empty-state CTA focus.** The "Create your first lane" CTA
+ *      overrides its anchor scroll to focus the first field of the
+ *      New Lane form — the operator's intent on click is "let me
+ *      start typing," not "scroll me there." The anchor `href`
+ *      stays as a no-JS fallback.
+ *
+ * Slash-command quoting convention: every operator-supplied value
+ * routed through `quoteValue()` (JSON.stringify). This handles
+ * embedded quotes, backslashes, and whitespace symmetrically across
+ * every flag — name, template, contentDir, id. Cleared fields in
+ * the Edit form are NOT emitted as `--flag ""`; to clear a field's
+ * value, manually edit the slash-command after pasting (the Edit
+ * form is a copy-builder, not a destructive editor).
+ *
+ * THESIS Consequence 2: the controller never mutates state on the
+ * server. There are no fetch / POST paths; every operator action
+ * resolves to a clipboard write + a paste in Claude Code.
+ *
+ * Idempotent: if the page has no `[data-lanes-container]`, init
+ * is a no-op. This lets the same script bundle load on multiple
+ * surfaces without per-surface guard checks at the import site.
+ */
+
+import { copyAndFlash } from '../copy-builder.ts';
+import { resolveProjectKey } from '../dashboard/swimlane-storage.ts';
+
+const ARCHIVED_OPEN_STORAGE_PREFIX = 'deskwork:lanes:';
+const ARCHIVED_OPEN_STORAGE_SUFFIX = ':archived-open';
+
+interface NewFormValues {
+  readonly id: string;
+  readonly name: string;
+  readonly template: string;
+  readonly contentDir: string;
+}
+
+interface EditFormValues {
+  readonly name: string;
+  readonly nameCurrent: string;
+  readonly template: string;
+  readonly templateCurrent: string;
+  readonly contentDir: string;
+  readonly contentDirCurrent: string;
+}
+
+/**
+ * Quote an operator-supplied value for inclusion in a slash command.
+ *
+ * Uses `JSON.stringify` to wrap the value in double quotes and escape
+ * embedded quotes, backslashes, and control characters. Applied
+ * uniformly to every value routed into the slash-command builder so
+ * the output parses identically across shells and Claude Code's slash
+ * parser (and so a value with spaces or quotes can't slip through as
+ * an injection surface if pasted into a shell).
+ */
+function quoteValue(value: string): string {
+  return JSON.stringify(value);
+}
+
+/**
+ * Module-level tracker for the currently-open Edit form row. Used to
+ * implement the single-open accordion: opening a new row's Edit form
+ * automatically closes the previously-open one.
+ */
+let openLaneId: string | null = null;
+
+function readFieldValue(form: HTMLElement, name: string): string {
+  const el = form.querySelector<HTMLInputElement | HTMLSelectElement>(
+    `[data-lanes-field="${name}"]`,
+  );
+  return el?.value.trim() ?? '';
+}
+
+function readFieldCurrent(form: HTMLElement, name: string): string {
+  const el = form.querySelector<HTMLInputElement | HTMLSelectElement>(
+    `[data-lanes-field="${name}"]`,
+  );
+  return el?.dataset.current ?? '';
+}
+
+function buildCreateCommand(values: NewFormValues): string {
+  const id = values.id.length > 0 ? quoteValue(values.id) : '<id>';
+  const template =
+    values.template.length > 0 ? quoteValue(values.template) : '<template>';
+  const contentDir =
+    values.contentDir.length > 0 ? quoteValue(values.contentDir) : '<path>';
+  const nameFragment =
+    values.name.length > 0 ? ` --name ${quoteValue(values.name)}` : '';
+  return `/deskwork:lane create ${id} --template ${template} --content-dir ${contentDir}${nameFragment}`;
+}
+
+/**
+ * Build the `/deskwork:lane update` command from edit-form values.
+ *
+ * Cleared fields are NOT emitted as `--flag ""`. Every diff-emit
+ * branch requires the new value to be non-empty AND different from
+ * the current value — the Edit form is a copy-builder, not a
+ * destructive editor. An operator who wants to clear a value
+ * manually edits the resulting slash-command after pasting.
+ *
+ * Operator-supplied values flow through `quoteValue()` to keep
+ * quoting symmetric across name / template / contentDir.
+ */
+function buildUpdateCommand(
+  laneId: string,
+  values: EditFormValues,
+): string {
+  const flags: string[] = [];
+  if (values.name !== values.nameCurrent && values.name.length > 0) {
+    flags.push(`--name ${quoteValue(values.name)}`);
+  }
+  if (values.template !== values.templateCurrent && values.template.length > 0) {
+    flags.push(`--template ${quoteValue(values.template)}`);
+  }
+  if (
+    values.contentDir !== values.contentDirCurrent &&
+    values.contentDir.length > 0
+  ) {
+    flags.push(`--content-dir ${quoteValue(values.contentDir)}`);
+  }
+  const flagFragment = flags.length === 0 ? '' : ` ${flags.join(' ')}`;
+  return `/deskwork:lane update ${quoteValue(laneId)}${flagFragment}`;
+}
+
+function rebuildNewFormPreview(form: HTMLElement): string {
+  const values: NewFormValues = {
+    id: readFieldValue(form, 'id'),
+    name: readFieldValue(form, 'name'),
+    template: readFieldValue(form, 'template'),
+    contentDir: readFieldValue(form, 'contentDir'),
+  };
+  const command = buildCreateCommand(values);
+  const preview = form.querySelector<HTMLElement>('[data-lanes-preview]');
+  if (preview) preview.textContent = command;
+  return command;
+}
+
+function rebuildEditFormPreview(form: HTMLElement, laneId: string): string {
+  const values: EditFormValues = {
+    name: readFieldValue(form, 'name'),
+    nameCurrent: readFieldCurrent(form, 'name'),
+    template: readFieldValue(form, 'template'),
+    templateCurrent: readFieldCurrent(form, 'template'),
+    contentDir: readFieldValue(form, 'contentDir'),
+    contentDirCurrent: readFieldCurrent(form, 'contentDir'),
+  };
+  const command = buildUpdateCommand(laneId, values);
+  const preview = form.querySelector<HTMLElement>('[data-lanes-preview]');
+  if (preview) preview.textContent = command;
+  return command;
+}
+
+function initNewForm(container: HTMLElement): void {
+  const form = container.querySelector<HTMLElement>('[data-lanes-new-form]');
+  if (!form) return;
+  const inputs = Array.from(
+    form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-lanes-field]'),
+  );
+  const rebuild = (): void => {
+    rebuildNewFormPreview(form);
+  };
+  for (const input of inputs) {
+    input.addEventListener('input', rebuild);
+    input.addEventListener('change', rebuild);
+  }
+  rebuild();
+
+  const copyButton = form.querySelector<HTMLButtonElement>(
+    '[data-lanes-copy-button="new"]',
+  );
+  if (copyButton) {
+    copyButton.addEventListener('click', async () => {
+      const command = rebuildNewFormPreview(form);
+      await copyAndFlash(command, copyButton, 'Copied create command');
+    });
+  }
+}
+
+function initEditForms(container: HTMLElement): void {
+  const editForms = Array.from(
+    container.querySelectorAll<HTMLElement>('[data-lanes-edit-form]'),
+  );
+  for (const form of editForms) {
+    const laneId = form.dataset.laneId;
+    if (!laneId) continue;
+    const inputs = Array.from(
+      form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-lanes-field]'),
+    );
+    const rebuild = (): void => {
+      rebuildEditFormPreview(form, laneId);
+    };
+    for (const input of inputs) {
+      input.addEventListener('input', rebuild);
+      input.addEventListener('change', rebuild);
+    }
+    rebuild();
+
+    const copyButton = form.querySelector<HTMLButtonElement>(
+      '[data-lanes-copy-button="edit"]',
+    );
+    if (copyButton) {
+      copyButton.addEventListener('click', async () => {
+        const command = rebuildEditFormPreview(form, laneId);
+        await copyAndFlash(command, copyButton, 'Copied update command');
+      });
+    }
+  }
+}
+
+/**
+ * Close the edit-form row for `laneId` and reset its toggle button's
+ * `aria-expanded` to `false`. Used by the single-open accordion logic
+ * to close the previously-open row when a different row opens.
+ */
+function closeEditRow(container: HTMLElement, laneId: string): void {
+  const row = container.querySelector<HTMLElement>(
+    `[data-lane-edit-row][data-lane-id="${laneId}"]`,
+  );
+  const toggle = container.querySelector<HTMLButtonElement>(
+    `[data-lane-edit-toggle][data-lane-id="${laneId}"]`,
+  );
+  if (row) row.hidden = true;
+  if (toggle) toggle.setAttribute('aria-expanded', 'false');
+}
+
+function initEditToggles(container: HTMLElement): void {
+  const toggles = Array.from(
+    container.querySelectorAll<HTMLButtonElement>('[data-lane-edit-toggle]'),
+  );
+  for (const toggle of toggles) {
+    const laneId = toggle.dataset.laneId;
+    if (!laneId) continue;
+    toggle.addEventListener('click', () => {
+      const target = container.querySelector<HTMLElement>(
+        `[data-lane-edit-row][data-lane-id="${laneId}"]`,
+      );
+      if (!target) return;
+      const willOpen = target.hidden;
+      // Single-open accordion: when opening, close any other row's
+      // edit form first. When closing, just drop the tracker.
+      if (willOpen && openLaneId !== null && openLaneId !== laneId) {
+        closeEditRow(container, openLaneId);
+      }
+      target.hidden = !willOpen;
+      toggle.setAttribute('aria-expanded', String(willOpen));
+      openLaneId = willOpen ? laneId : null;
+    });
+  }
+
+  const cancels = Array.from(
+    container.querySelectorAll<HTMLButtonElement>('[data-lane-edit-cancel]'),
+  );
+  for (const cancel of cancels) {
+    const laneId = cancel.dataset.laneId;
+    if (!laneId) continue;
+    cancel.addEventListener('click', () => {
+      closeEditRow(container, laneId);
+      if (openLaneId === laneId) openLaneId = null;
+    });
+  }
+}
+
+function initRowCopyButtons(container: HTMLElement): void {
+  const buttons = Array.from(
+    container.querySelectorAll<HTMLButtonElement>('[data-lane-copy]'),
+  );
+  for (const button of buttons) {
+    button.addEventListener('click', async () => {
+      const command = button.dataset.copy;
+      if (!command || command.length === 0) {
+        return;
+      }
+      await copyAndFlash(command, button, `Copied ${command}`);
+    });
+  }
+}
+
+/**
+ * Resolve the localStorage key for the archived-section open state.
+ * Namespaces by project key (same convention as the dashboard's
+ * swimlane storage) so two operators sharing a machine but working on
+ * different projects don't see each other's collapse state.
+ */
+function archivedOpenKey(container: HTMLElement): string {
+  const projectKey = resolveProjectKey(container);
+  return `${ARCHIVED_OPEN_STORAGE_PREFIX}${projectKey}${ARCHIVED_OPEN_STORAGE_SUFFIX}`;
+}
+
+function initArchivedSection(container: HTMLElement): void {
+  const details = container.querySelector<HTMLDetailsElement>(
+    '[data-lanes-archived-details]',
+  );
+  if (!details) return;
+  const key = archivedOpenKey(container);
+
+  // Restore previous open state on init.
+  try {
+    const stored = window.localStorage.getItem(key);
+    if (stored !== null) {
+      details.open = stored === 'true';
+    }
+  } catch {
+    // localStorage unavailable (private mode, quota, etc.) — fall
+    // through to the server-rendered default (closed). Persistence
+    // is best-effort; the page still works without it.
+  }
+
+  details.addEventListener('toggle', () => {
+    try {
+      window.localStorage.setItem(key, String(details.open));
+    } catch {
+      // Same posture as the read path: best-effort. A failed write
+      // doesn't prevent the operator from toggling the section.
+    }
+  });
+}
+
+function initEmptyStateCta(container: HTMLElement): void {
+  const cta = container.querySelector<HTMLAnchorElement>(
+    '[data-lanes-cta-focus]',
+  );
+  if (!cta) return;
+  cta.addEventListener('click', (event) => {
+    const first = container.querySelector<HTMLInputElement | HTMLSelectElement>(
+      '[data-lanes-new-form] [data-lanes-field="id"]',
+    );
+    if (!first) return;
+    event.preventDefault();
+    first.focus();
+  });
+}
+
+/**
+ * Wire every interactive control on the lanes page. Idempotent —
+ * a missing `[data-lanes-container]` short-circuits, so importing
+ * this from a shared bundle on other surfaces is harmless.
+ */
+export function initLanesPage(): void {
+  // Reset module-level state so repeat init calls (e.g. in tests)
+  // don't carry an open-row tracker across mounts.
+  openLaneId = null;
+  const container = document.querySelector<HTMLElement>('[data-lanes-container]');
+  if (!container) return;
+  initNewForm(container);
+  initEditForms(container);
+  initEditToggles(container);
+  initRowCopyButtons(container);
+  initArchivedSection(container);
+  initEmptyStateCta(container);
+}
diff --git a/plugins/deskwork-studio/public/src/pipelines/pipelines-page.ts b/plugins/deskwork-studio/public/src/pipelines/pipelines-page.ts
new file mode 100644
index 0000000..0544d62
--- /dev/null
+++ b/plugins/deskwork-studio/public/src/pipelines/pipelines-page.ts
@@ -0,0 +1,405 @@
+/**
+ * Client controller for the `/dev/pipelines` studio page (Phase 6
+ * Task 6.4).
+ *
+ * Responsibilities:
+ *
+ *   1. **Live command preview.** Every form (the New form + each
+ *      template's Edit panel's five sub-operations) carries one
+ *      `<code data-pipelines-preview="<scope>">` element. The
+ *      controller rebuilds the preview on every change event so the
+ *      operator sees the assembled slash command before clicking
+ *      Copy.
+ *
+ *   2. **Clipboard copy.** Every copy button (`[data-pipelines-copy-
+ *      button="<scope>"]` on forms, `[data-pipeline-copy]` on table
+ *      rows for the Delete affordance) clipboards its payload through
+ *      `copyOrShowFallback` and flashes a "Copied" affirmation.
+ *
+ *   3. **Per-row View / Edit toggles (single-open accordion).** A
+ *      single module-level tracker holds the currently-open panel id
+ *      across View and Edit — opening a new View or Edit auto-closes
+ *      whichever was previously open. View and Edit are mutually
+ *      exclusive per row too: opening Edit on row R closes Row R's
+ *      View if it was open, and vice versa.
+ *
+ *   4. **Edit sub-operation single-open accordion.** Inside one Edit
+ *      panel, the five `<details data-pipelines-op>` panels behave
+ *      as a single-open accordion: opening one closes the others.
+ *      This mirrors the CLI's mutually-exclusive contract — only
+ *      one update operation runs per invocation.
+ *
+ * Slash-command quoting: every operator-supplied value flows through
+ * `quoteValue()` (JSON.stringify). The CLI accepts the resulting
+ * double-quoted, backslash-escaped form for every flag.
+ *
+ * Idempotent: when the page has no `[data-pipelines-container]`,
+ * init is a no-op. The lanes-page controller's bundle shares the same
+ * surface; both inits run on every page and short-circuit when their
+ * markers are absent.
+ *
+ * THESIS Consequence 2: the controller never mutates state on the
+ * server. There are no fetch / POST paths; every operator action
+ * resolves to a clipboard write + paste in Claude Code.
+ */
+
+import { copyAndFlash } from '../copy-builder.ts';
+
+/**
+ * Quote an operator-supplied value for inclusion in a slash command.
+ * `JSON.stringify` wraps in double quotes and escapes embedded quotes,
+ * backslashes, and control characters — applied symmetrically across
+ * id / shape / name / description / stage names so injection-shape
+ * inputs can't slip through if pasted into a shell.
+ */
+function quoteValue(value: string): string {
+  return JSON.stringify(value);
+}
+
+/**
+ * Module-level tracker for the currently-open per-row panel (View or
+ * Edit). Each entry is `{ pipelineId, panel: 'view'|'edit' }`. Used
+ * by the single-open accordion logic so opening any panel auto-closes
+ * the previously-open one (cross-row AND cross-panel).
+ */
+interface OpenPanelState {
+  readonly pipelineId: string;
+  readonly panel: 'view' | 'edit';
+}
+
+let openPanel: OpenPanelState | null = null;
+
+/**
+ * Read a field's trimmed value from a form. Returns empty string when
+ * the field is absent so callers can treat "missing" and "blank" as
+ * equivalent for the preview-rebuild path.
+ */
+function readField(form: HTMLElement, name: string): string {
+  const el = form.querySelector<HTMLInputElement | HTMLSelectElement>(
+    `[data-pipelines-field="${name}"]`,
+  );
+  return el?.value.trim() ?? '';
+}
+
+/**
+ * Read a set of checkbox values (used by the set-locked sub-operation).
+ * Returns the values of every checked input in document order.
+ */
+function readCheckedValues(form: HTMLElement, name: string): string[] {
+  const els = Array.from(
+    form.querySelectorAll<HTMLInputElement>(
+      `input[type="checkbox"][data-pipelines-field="${name}"]`,
+    ),
+  );
+  return els.filter((el) => el.checked).map((el) => el.value);
+}
+
+/** Build the `/deskwork:pipeline create` command from the New form. */
+function buildCreateCommand(form: HTMLElement): string {
+  const id = readField(form, 'new-id');
+  const shape = readField(form, 'new-shape');
+  const name = readField(form, 'new-name');
+  const description = readField(form, 'new-description');
+
+  const idArg = id.length > 0 ? quoteValue(id) : '<id>';
+  const shapeArg = shape.length > 0 ? quoteValue(shape) : '<stages>';
+  const nameFragment = name.length > 0 ? ` --name ${quoteValue(name)}` : '';
+  const descFragment =
+    description.length > 0 ? ` --description ${quoteValue(description)}` : '';
+  return `/deskwork:pipeline create ${idArg} --shape ${shapeArg}${nameFragment}${descFragment}`;
+}
+
+function rebuildNewPreview(form: HTMLElement): string {
+  const command = buildCreateCommand(form);
+  const preview = form.querySelector<HTMLElement>(
+    '[data-pipelines-preview="new"]',
+  );
+  if (preview) preview.textContent = command;
+  return command;
+}
+
+/** Build the `/deskwork:pipeline update <id> --add-stage ...` command. */
+function buildAddCommand(form: HTMLElement, pipelineId: string): string {
+  const name = readField(form, 'add-name');
+  const position = readField(form, 'add-position');
+  const idArg = quoteValue(pipelineId);
+  const nameArg = name.length > 0 ? quoteValue(name) : '<name>';
+  const positionFragment =
+    position.length > 0 ? ` --position ${position}` : '';
+  return `/deskwork:pipeline update ${idArg} --add-stage ${nameArg}${positionFragment}`;
+}
+
+/** Build the `--rename-stage <from> --to-stage <to>` command. */
+function buildRenameCommand(form: HTMLElement, pipelineId: string): string {
+  const from = readField(form, 'rename-from');
+  const to = readField(form, 'rename-to');
+  const idArg = quoteValue(pipelineId);
+  const fromArg = from.length > 0 ? quoteValue(from) : '<from>';
+  const toArg = to.length > 0 ? quoteValue(to) : '<to>';
+  return `/deskwork:pipeline update ${idArg} --rename-stage ${fromArg} --to-stage ${toArg}`;
+}
+
+/** Build the `--remove-stage <name>` command. */
+function buildRemoveCommand(form: HTMLElement, pipelineId: string): string {
+  const name = readField(form, 'remove-name');
+  const idArg = quoteValue(pipelineId);
+  const nameArg = name.length > 0 ? quoteValue(name) : '<name>';
+  return `/deskwork:pipeline update ${idArg} --remove-stage ${nameArg}`;
+}
+
+/** Build the `--set-locked "s1,s2,..."` command. */
+function buildSetLockedCommand(form: HTMLElement, pipelineId: string): string {
+  const checked = readCheckedValues(form, 'set-locked');
+  const idArg = quoteValue(pipelineId);
+  const csv = checked.join(',');
+  // Empty selection means "clear all locks" — emit `--set-locked ""`
+  // so the CLI sees an explicit empty list rather than an absent flag.
+  return `/deskwork:pipeline update ${idArg} --set-locked ${quoteValue(csv)}`;
+}
+
+/** Build the `--set-off-pipeline "s1,s2,..."` command. */
+function buildSetOffCommand(form: HTMLElement, pipelineId: string): string {
+  const csv = readField(form, 'set-off-pipeline');
+  const idArg = quoteValue(pipelineId);
+  return `/deskwork:pipeline update ${idArg} --set-off-pipeline ${quoteValue(csv)}`;
+}
+
+type UpdateOp =
+  | 'add'
+  | 'rename'
+  | 'remove'
+  | 'set-locked'
+  | 'set-off-pipeline';
+
+function rebuildEditPreview(
+  form: HTMLElement,
+  op: UpdateOp,
+  pipelineId: string,
+): string {
+  let command: string;
+  switch (op) {
+    case 'add':
+      command = buildAddCommand(form, pipelineId);
+      break;
+    case 'rename':
+      command = buildRenameCommand(form, pipelineId);
+      break;
+    case 'remove':
+      command = buildRemoveCommand(form, pipelineId);
+      break;
+    case 'set-locked':
+      command = buildSetLockedCommand(form, pipelineId);
+      break;
+    case 'set-off-pipeline':
+      command = buildSetOffCommand(form, pipelineId);
+      break;
+  }
+  const preview = form.querySelector<HTMLElement>(
+    `[data-pipelines-preview="${op}"]`,
+  );
+  if (preview) preview.textContent = command;
+  return command;
+}
+
+function initNewForm(container: HTMLElement): void {
+  const form = container.querySelector<HTMLElement>('[data-pipelines-new-form]');
+  if (!form) return;
+  const inputs = Array.from(
+    form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
+      '[data-pipelines-field]',
+    ),
+  );
+  const rebuild = (): void => {
+    rebuildNewPreview(form);
+  };
+  for (const input of inputs) {
+    input.addEventListener('input', rebuild);
+    input.addEventListener('change', rebuild);
+  }
+  rebuild();
+
+  const copy = form.querySelector<HTMLButtonElement>(
+    '[data-pipelines-copy-button="new"]',
+  );
+  if (copy) {
+    copy.addEventListener('click', async () => {
+      const command = rebuildNewPreview(form);
+      await copyAndFlash(command, copy, 'Copied create command');
+    });
+  }
+}
+
+const UPDATE_OPS: readonly UpdateOp[] = [
+  'add',
+  'rename',
+  'remove',
+  'set-locked',
+  'set-off-pipeline',
+];
+
+function initEditOpForm(
+  panel: HTMLElement,
+  op: UpdateOp,
+  pipelineId: string,
+): void {
+  const form = panel.querySelector<HTMLElement>(
+    `[data-pipelines-op-form="${op}"]`,
+  );
+  if (!form) return;
+  const inputs = Array.from(
+    form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
+      '[data-pipelines-field]',
+    ),
+  );
+  const rebuild = (): void => {
+    rebuildEditPreview(form, op, pipelineId);
+  };
+  for (const input of inputs) {
+    input.addEventListener('input', rebuild);
+    input.addEventListener('change', rebuild);
+  }
+  rebuild();
+
+  const copy = form.querySelector<HTMLButtonElement>(
+    `[data-pipelines-copy-button="${op}"]`,
+  );
+  if (copy) {
+    copy.addEventListener('click', async () => {
+      const command = rebuildEditPreview(form, op, pipelineId);
+      await copyAndFlash(command, copy, `Copied ${op} command`);
+    });
+  }
+}
+
+/**
+ * Wire the single-open accordion across the five `<details
+ * data-pipelines-op>` sub-panels inside one Edit panel. Opening any
+ * one closes the others — matches the CLI's mutually-exclusive
+ * contract.
+ */
+function initEditSubAccordion(panel: HTMLElement): void {
+  const details = Array.from(
+    panel.querySelectorAll<HTMLDetailsElement>('[data-pipelines-op]'),
+  );
+  for (const target of details) {
+    target.addEventListener('toggle', () => {
+      if (!target.open) return;
+      for (const other of details) {
+        if (other !== target && other.open) other.open = false;
+      }
+    });
+  }
+}
+
+function initEditPanels(container: HTMLElement): void {
+  const panels = Array.from(
+    container.querySelectorAll<HTMLElement>('[data-pipelines-edit-panel]'),
+  );
+  for (const panel of panels) {
+    const pipelineId = panel.dataset.pipelineId;
+    if (!pipelineId) continue;
+    for (const op of UPDATE_OPS) {
+      initEditOpForm(panel, op, pipelineId);
+    }
+    initEditSubAccordion(panel);
+  }
+}
+
+/**
+ * Close a hidden panel row (View or Edit) and reset its toggle's
+ * aria-expanded. Used by the single-open accordion when a sibling
+ * panel opens.
+ */
+function closePanelRow(
+  container: HTMLElement,
+  pipelineId: string,
+  panel: 'view' | 'edit',
+): void {
+  const rowSelector =
+    panel === 'view' ? 'data-pipeline-view-row' : 'data-pipeline-edit-row';
+  const toggleSelector =
+    panel === 'view' ? 'data-pipeline-view-toggle' : 'data-pipeline-edit-toggle';
+  const row = container.querySelector<HTMLElement>(
+    `[${rowSelector}][data-pipeline-id="${pipelineId}"]`,
+  );
+  const toggle = container.querySelector<HTMLButtonElement>(
+    `[${toggleSelector}][data-pipeline-id="${pipelineId}"]`,
+  );
+  if (row) row.hidden = true;
+  if (toggle) toggle.setAttribute('aria-expanded', 'false');
+}
+
+function initRowToggles(container: HTMLElement): void {
+  const wire = (panel: 'view' | 'edit', toggleAttr: string, rowAttr: string): void => {
+    const toggles = Array.from(
+      container.querySelectorAll<HTMLButtonElement>(`[${toggleAttr}]`),
+    );
+    for (const toggle of toggles) {
+      const pipelineId = toggle.dataset.pipelineId;
+      if (!pipelineId) continue;
+      toggle.addEventListener('click', () => {
+        const target = container.querySelector<HTMLElement>(
+          `[${rowAttr}][data-pipeline-id="${pipelineId}"]`,
+        );
+        if (!target) return;
+        const willOpen = target.hidden;
+        if (willOpen && openPanel !== null) {
+          // Close whichever panel was previously open (could be the
+          // same row's sibling panel or a different row's panel).
+          closePanelRow(container, openPanel.pipelineId, openPanel.panel);
+        }
+        target.hidden = !willOpen;
+        toggle.setAttribute('aria-expanded', String(willOpen));
+        openPanel = willOpen ? { pipelineId, panel } : null;
+      });
+    }
+  };
+  wire('view', 'data-pipeline-view-toggle', 'data-pipeline-view-row');
+  wire('edit', 'data-pipeline-edit-toggle', 'data-pipeline-edit-row');
+
+  const cancels = Array.from(
+    container.querySelectorAll<HTMLButtonElement>('[data-pipeline-edit-cancel]'),
+  );
+  for (const cancel of cancels) {
+    const pipelineId = cancel.dataset.pipelineId;
+    if (!pipelineId) continue;
+    cancel.addEventListener('click', () => {
+      closePanelRow(container, pipelineId, 'edit');
+      if (openPanel?.pipelineId === pipelineId && openPanel.panel === 'edit') {
+        openPanel = null;
+      }
+    });
+  }
+}
+
+function initRowCopyButtons(container: HTMLElement): void {
+  const buttons = Array.from(
+    container.querySelectorAll<HTMLButtonElement>('[data-pipeline-copy]'),
+  );
+  for (const button of buttons) {
+    button.addEventListener('click', async () => {
+      const command = button.dataset.copy;
+      if (!command || command.length === 0) return;
+      await copyAndFlash(command, button, `Copied ${command}`);
+    });
+  }
+}
+
+/**
+ * Wire every interactive control on the pipelines page. Idempotent —
+ * absent `[data-pipelines-container]` short-circuits, so importing
+ * this from a shared bundle on other surfaces is harmless.
+ */
+export function initPipelinesPage(): void {
+  // Reset module-level state so repeat init calls (e.g. across tests)
+  // don't carry a stale open-panel tracker.
+  openPanel = null;
+  const container = document.querySelector<HTMLElement>(
+    '[data-pipelines-container]',
+  );
+  if (!container) return;
+  initNewForm(container);
+  initEditPanels(container);
+  initRowToggles(container);
+  initRowCopyButtons(container);
+}


## What to look for

- **Correctness bugs** — logic errors, off-by-one, null/undefined paths, race conditions, missing error handling, swallowed exceptions.
- **Design issues** — coupling between layers that should be independent, leaking abstractions, primitives that should compose but don't, configuration that should be data ending up as code.
- **Missed edge cases** — what happens with empty input? Maximum input? Concurrent calls? Partial failure? Network unavailability? Operator interrupt mid-operation? What is the behavior on a fresh install vs. an upgrade?
- **Code-quality concerns** — files growing past a reasonable cap, names that don't reveal intent, dead code, duplicated logic, magic numbers without explanation, tests that don't test the contract they claim to test.
- **Cross-cutting impact** — does this diff touch a surface that other surfaces depend on? Are those other surfaces updated? Are migrations needed? Are doctor rules / schemas / validators updated to match the new shape?
- **Documentation drift** — does the README / SKILL.md / PRD describe the behavior the code actually implements? If the spec changed, did the implementation? If the implementation changed, did the spec?
- **Operator-discipline traps** — placeholder comments, swallowed errors, hardcoded paths/values that should be configurable, fallbacks that hide failure modes, mock data outside test code. These are bug-factories per project guidelines.

## Output format

For each finding you surface, emit ONE markdown block in this exact shape:

```
### <heading: one-line summary of the finding>

Finding-ID: AUDIT-BARRAGE-<your-model-name>-<NN>
Status:     open
Severity:   <blocking | high | medium | low | informational>
Surface:    <repo-relative-path:line-range> OR <description of the surface if not anchored to a single file>

<one-to-three paragraphs of body: what the finding is, why it matters, what evidence you relied on, what a reasonable fix would look like. Be specific. Cite line numbers from the diff. If the finding is structural / cross-file, name every file affected.>
```

Number the findings sequentially (`-01`, `-02`, ...). Use `blocking` only for issues that would break the feature's stated goals in obvious ways; `high` for correctness bugs adopters will hit; `medium` for design issues that compound over time; `low` for hygiene; `informational` for context you think the operator should see but isn't itself a bug.

## If you find nothing — say so explicitly

If you walk the diff carefully and find no findings worth surfacing, emit ONE block in this shape instead:

```
### No findings

Finding-ID: AUDIT-BARRAGE-<your-model-name>-CLEAN
Status:     open
Severity:   informational
Surface:    (the entire diff)

I walked the diff for the feature named above and found no findings worth surfacing. My specific reasoning: <three-to-five sentences explaining what you checked, why those checks came back clean, and what you would have flagged if it had been present.>
```

**Do not pad with weak findings.** A confident "I checked X, Y, Z and they are clean for these reasons" is more useful to the operator than three vague low-severity notes. The cross-model diversity gives the operator independent signal; an empty clean report from your CLI is itself a signal when paired with findings from your siblings.

## Hard constraints

- **No deferral phrases.** Don't write phrases like "fix later", "address in a follow-up", or other commitments to deferred work. The dispatch-wrapper rejects these as bug-factories. If you spot a deferral phrase IN the diff, surface it as a finding.
- **Anchor findings to evidence.** A finding that says "this might be a problem" without naming the specific file + line is not actionable. Name the surface, quote the relevant code, explain what's wrong.
- **One issue per finding block.** Don't bundle multiple concerns into one entry; the operator triages each block as a discrete signal.
- **Provenance is your model name.** Replace `<your-model-name>` in the Finding-ID with the CLI you are (`claude`, `codex`, `gemini`, etc.). This is how the operator joins findings across models.
