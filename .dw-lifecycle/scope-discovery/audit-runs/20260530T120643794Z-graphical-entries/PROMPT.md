# Audit-barrage — multi-model audit prompt template

You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface bugs, design issues, missed edge cases, and code-quality concerns in the work product captured in the diff below.

You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.

## Feature under audit

graphical-entries

## Feature scope (workplan / PRD summary)

Phase 6 Tasks 6.5 + 6.6 of graphical-entries: doctor rule + integration test. Task 6.5 ships the lane-config-missing-template doctor rule (first-site-gated project-wide scan; prompt-plan with per-template rebind choice; delete-with-entry-binding-refusal); LaneConfigRepairEvent schema extension; 4 test scenarios. Task 6.6 ships the custom-pipeline + lane lifecycle integration test — real CLI subprocess driving pipeline create → lane create → 2-sidecar write → archive → restore → purge-refusal → byte-equivalent state-intact end-to-end. Audit focus: doctor rule correctness across all 5 templates; rebind-choice edge cases; entry-binding detection (false positives / false negatives); integration test reliability (subprocess timing; tmp dir cleanup); end-to-end coverage gaps.

## Commit subjects in the audited range

295b803 feat(graphical-entries): Phase 6 Task 6.6 — custom-pipeline + lane lifecycle integration test
f341ecb feat(graphical-entries): Phase 6 Task 6.5 — doctor rule lane-config-missing-template


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
index 5287367..de04a5d 100644
--- a/.dw-lifecycle/scope-discovery/clones.yaml
+++ b/.dw-lifecycle/scope-discovery/clones.yaml
@@ -1,4 +1,4 @@
-generated_at: 2026-05-29T03:11:32.650Z
+generated_at: 2026-05-29T04:20:08.985Z
 clones:
   - id: 014b49040fe1
     lines: 13
@@ -244,6 +244,13 @@ clones:
       - packages/core/src/doctor/rules/orphan-frontmatter-id.ts:96:111
     disposition: pending
     reason: null
+  - id: e1b16a900b51
+    lines: 18
+    members:
+      - packages/core/src/doctor/rules/lane-config-missing-template.ts:232:249
+      - packages/core/src/doctor/rules/orphan-frontmatter-id.ts:158:174
+    disposition: keep-with-reason
+    reason: Doctor rule contract boilerplate (end of plan choices array + apply()'s plan.kind guard + payload coercion); each rule independently implements the DoctorRule interface against the same contract, so shape similarity is interface-driven not duplication; extracting a base class would violate composition-over-inheritance
   - id: 2ccdcd76762f
     lines: 15
     members:
@@ -282,8 +289,8 @@ clones:
   - id: 189be54baaa8
     lines: 9
     members:
-      - packages/core/src/doctor/runner.ts:180:188
-      - packages/core/src/doctor/runner.ts:207:215
+      - packages/core/src/doctor/runner.ts:182:190
+      - packages/core/src/doctor/runner.ts:209:217
     disposition: pending
     reason: null
   - id: 41b3f9fce647
diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
index f7edeb7..381dc42 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
@@ -327,20 +327,20 @@ The picked design **pivots away from the PRD's original "per-lane tab strip" fra
 
 ### Task 6.5: Doctor rule: orphan-pipeline-reference
 
-- [ ] Step 6.5.1: Add `lane-config-missing-template` doctor rule per PRD § Doctor rules: when a lane config references a `pipelineTemplate` id that doesn't resolve, surface error with the lane file path.
-- [ ] Step 6.5.2: Repair flow: operator picks a valid template, or removes the lane.
-- [ ] Step 6.5.3: Unit test against a fixture with a dangling pipeline reference.
+- [x] Step 6.5.1: Add `lane-config-missing-template` doctor rule per PRD § Doctor rules: when a lane config references a `pipelineTemplate` id that doesn't resolve, surface error with the lane file path. (Rule emits one severity=error finding per dangling lane with `{ laneId, laneFilePath, unresolvedTemplateId, availableTemplates }`; project-wide scan gated to first-site to avoid duplicates on multi-site projects.)
+- [x] Step 6.5.2: Repair flow: operator picks a valid template, or removes the lane. (Prompt plan offers one `set-template-<id>` choice per resolvable preset/override + `delete-lane` last; set-template uses tmp+rename atomic write and re-validates the chosen template at apply time; delete is gated on entry bindings via `readAllSidecars` with `+N more` sample-limited refusal mirroring `purge.ts`. Both actions emit a `lane-config-repair` journal event added to `JournalEventSchema`.)
+- [x] Step 6.5.3: Unit test against a fixture with a dangling pipeline reference. (4 scenarios in `test/doctor/lane-config-missing-template.test.ts`: audit-positive, set-template-repair + journal + re-audit-clean, delete-lane + journal, delete-lane-refusal-when-entry-bound naming the bound UUID; 715/715 full suite pass.)
 
 ### Task 6.6: Integration test
 
-- [ ] Step 6.6.1: Tmp-fixture project; create a custom pipeline (`custom-blog` with stages "Idea → Drafting → Reviewed → Live"); create a lane bound to it; add 2 entries; archive the lane; restore; verify entries persist + state intact.
+- [x] Step 6.6.1: Tmp-fixture project; create a custom pipeline (`custom-blog` with stages "Idea → Drafting → Reviewed → Live"); create a lane bound to it; add 2 entries; archive the lane; restore; verify entries persist + state intact. (End-to-end test at `packages/cli/test/custom-pipeline-lane-integration.test.ts`; one `it()` block drives real `deskwork` CLI subprocess through pipeline create → lane create → 2-sidecar write → archive → restore → purge-refusal → state-intact-byte-compare. `pipeline update --set-locked` / `--set-off-pipeline` invoked separately since `pipeline create` doesn't accept those flags. 1/1 pass; full @deskwork/cli suite 320 → 321 pass, 0 regressions.)
 
 **Acceptance Criteria:**
 
-- [ ] Lane + pipeline CRUD CLI + studio surfaces work end-to-end.
-- [ ] Soft-archive is the default; hard delete refused when references exist.
-- [ ] Doctor surfaces orphan pipeline references with actionable repair.
-- [ ] Studio writes nothing to sidecar state — every action clipboard-copies the equivalent CLI invocation per THESIS Consequence 2.
+- [x] Lane + pipeline CRUD CLI + studio surfaces work end-to-end. (CLI exercised end-to-end via Task 6.6's integration test; studio surfaces shipped in Tasks 6.3 + 6.4 with their own test suites.)
+- [x] Soft-archive is the default; hard delete refused when references exist. (Task 6.6 step 6 asserts `lane purge` exits non-zero + lane file persists when entries are bound, naming both bound slugs in the error.)
+- [x] Doctor surfaces orphan pipeline references with actionable repair. (Task 6.5's `lane-config-missing-template` rule + 4-scenario test suite — audit-positive, set-template repair + journal, delete-lane + journal, delete-refusal-when-bound.)
+- [x] Studio writes nothing to sidecar state — every action clipboard-copies the equivalent CLI invocation per THESIS Consequence 2. (Tasks 6.3 + 6.4 — both pages render server-side then clipboard-copy the CLI verb on save/delete; no fetch/POST surfaces.)
 
 ## Phase 7: Groups — members field + CRUD + review surface + multi-lane composition  ·  [#308](https://github.com/audiocontrol-org/deskwork/issues/308)
 
diff --git a/packages/cli/test/custom-pipeline-lane-integration.test.ts b/packages/cli/test/custom-pipeline-lane-integration.test.ts
new file mode 100644
index 0000000..800faae
--- /dev/null
+++ b/packages/cli/test/custom-pipeline-lane-integration.test.ts
@@ -0,0 +1,335 @@
+/**
+ * End-to-end integration test for the custom-pipeline + lane lifecycle.
+ *
+ * Phase 6 Task 6.6 (graphical-entries). Drives the real `deskwork` CLI
+ * binary via `spawnSync` against a tmp-fixture project:
+ *
+ *   1. Create a custom pipeline (`custom-blog`).
+ *   2. Mark "Reviewed" locked + "Blocked,Cancelled" off-pipeline via
+ *      mutually-exclusive `pipeline update` invocations.
+ *   3. Create a lane (`blog-lane`) bound to that pipeline.
+ *   4. Write two entry sidecars bound to the lane.
+ *   5. Archive the lane — sidecars persist untouched.
+ *   6. Restore the lane — sidecars persist untouched.
+ *   7. Hard-delete (`lane purge`) is refused while entries reference the
+ *      lane.
+ *   8. State-intact: post-cycle sidecar JSON is byte-equivalent to the
+ *      pre-cycle written bytes.
+ *
+ * No mocking — every CLI invocation is a real subprocess. The test
+ * exercises the full surface implicated by Phase 6 Task 6.6's acceptance
+ * criteria (CRUD CLI works end-to-end, soft-archive default, hard-delete
+ * refusal when referenced).
+ */
+
+import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
+import { spawnSync } from 'node:child_process';
+import { randomUUID } from 'node:crypto';
+import {
+  existsSync,
+  mkdirSync,
+  mkdtempSync,
+  readFileSync,
+  rmSync,
+  writeFileSync,
+} from 'node:fs';
+import { tmpdir } from 'node:os';
+import { dirname, join, resolve } from 'node:path';
+import { fileURLToPath } from 'node:url';
+
+const testDir = dirname(fileURLToPath(import.meta.url));
+const workspaceRoot = resolve(testDir, '../../..');
+const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');
+
+interface RunResult {
+  readonly code: number;
+  readonly stdout: string;
+  readonly stderr: string;
+}
+
+function assertDeskworkBinPresent(): void {
+  if (!existsSync(deskworkBin)) {
+    throw new Error(
+      `deskwork binary not found at ${deskworkBin} — run npm install at the `
+      + `workspace root before running the custom-pipeline-lane integration `
+      + `test.`,
+    );
+  }
+}
+
+function makeProject(): string {
+  const project = mkdtempSync(join(tmpdir(), 'dw-cpl-int-'));
+  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
+  writeFileSync(
+    join(project, '.deskwork', 'config.json'),
+    JSON.stringify({
+      version: 1,
+      sites: {
+        main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
+      },
+      defaultSite: 'main',
+    }),
+    'utf-8',
+  );
+  writeFileSync(
+    join(project, '.deskwork', 'calendar.md'),
+    '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n',
+    'utf-8',
+  );
+  return project;
+}
+
+function destroyProject(project: string): void {
+  rmSync(project, { recursive: true, force: true });
+}
+
+function pipeline(project: string, ...args: string[]): RunResult {
+  const r = spawnSync(
+    deskworkBin,
+    ['pipeline', project, ...args],
+    { encoding: 'utf-8' },
+  );
+  return {
+    code: r.status ?? -1,
+    stdout: r.stdout ?? '',
+    stderr: r.stderr ?? '',
+  };
+}
+
+function lane(project: string, ...args: string[]): RunResult {
+  const r = spawnSync(
+    deskworkBin,
+    ['lane', project, ...args],
+    { encoding: 'utf-8' },
+  );
+  return {
+    code: r.status ?? -1,
+    stdout: r.stdout ?? '',
+    stderr: r.stderr ?? '',
+  };
+}
+
+function pipelinePath(project: string, id: string): string {
+  return join(project, '.deskwork', 'pipelines', `${id}.json`);
+}
+
+function lanePath(project: string, id: string): string {
+  return join(project, '.deskwork', 'lanes', `${id}.json`);
+}
+
+function sidecarPath(project: string, uuid: string): string {
+  return join(project, '.deskwork', 'entries', `${uuid}.json`);
+}
+
+interface SidecarSeed {
+  readonly uuid: string;
+  readonly slug: string;
+  readonly currentStage: string;
+  readonly lane: string;
+}
+
+function writeSidecarFile(project: string, seed: SidecarSeed): string {
+  const path = sidecarPath(project, seed.uuid);
+  const now = new Date().toISOString();
+  const payload = {
+    uuid: seed.uuid,
+    slug: seed.slug,
+    title: seed.slug,
+    keywords: [],
+    source: 'manual',
+    currentStage: seed.currentStage,
+    iterationByStage: {},
+    lane: seed.lane,
+    createdAt: now,
+    updatedAt: now,
+  };
+  // JSON.stringify with no indentation; the file's exact byte content is
+  // what we round-trip-compare across the archive/restore cycle.
+  writeFileSync(path, JSON.stringify(payload), 'utf-8');
+  return path;
+}
+
+beforeAll(() => { assertDeskworkBinPresent(); });
+
+describe('custom-pipeline + lane integration (Phase 6 Task 6.6)', () => {
+  let project: string;
+  beforeEach(() => { project = makeProject(); });
+  afterEach(() => { destroyProject(project); });
+
+  it('runs the full create → bind entries → archive → restore → refuse-purge cycle', () => {
+    // 1. Create custom pipeline `custom-blog`.
+    const created = pipeline(
+      project,
+      'create', 'custom-blog',
+      '--shape', 'Idea,Drafting,Reviewed,Live',
+      '--name', 'Custom Blog Pipeline',
+      '--description', 'Test pipeline for graphical-entries Task 6.6',
+    );
+    expect(created.stderr).toBe('');
+    expect(created.code).toBe(0);
+    expect(existsSync(pipelinePath(project, 'custom-blog'))).toBe(true);
+
+    const createdParsed = JSON.parse(created.stdout) as {
+      created: boolean;
+      id: string;
+      linearStages: string[];
+      lockedStages: string[];
+      offPipelineStages: string[];
+    };
+    expect(createdParsed.created).toBe(true);
+    expect(createdParsed.id).toBe('custom-blog');
+    expect(createdParsed.linearStages).toEqual(
+      ['Idea', 'Drafting', 'Reviewed', 'Live'],
+    );
+    expect(createdParsed.lockedStages).toEqual([]);
+    expect(createdParsed.offPipelineStages).toEqual([]);
+
+    // 2a. Mark "Reviewed" as a locked stage via `pipeline update --set-locked`.
+    const locked = pipeline(
+      project,
+      'update', 'custom-blog',
+      '--set-locked', 'Reviewed',
+    );
+    expect(locked.stderr).toBe('');
+    expect(locked.code).toBe(0);
+    const lockedParsed = JSON.parse(locked.stdout) as {
+      updated: boolean;
+      lockedStages: string[];
+    };
+    expect(lockedParsed.updated).toBe(true);
+    expect(lockedParsed.lockedStages).toEqual(['Reviewed']);
+
+    // 2b. Add off-pipeline stages via a second mutually-exclusive update.
+    const offPipe = pipeline(
+      project,
+      'update', 'custom-blog',
+      '--set-off-pipeline', 'Blocked,Cancelled',
+    );
+    expect(offPipe.stderr).toBe('');
+    expect(offPipe.code).toBe(0);
+    const offPipeParsed = JSON.parse(offPipe.stdout) as {
+      updated: boolean;
+      offPipelineStages: string[];
+    };
+    expect(offPipeParsed.updated).toBe(true);
+    expect(offPipeParsed.offPipelineStages).toEqual(['Blocked', 'Cancelled']);
+
+    // Verify the on-disk pipeline JSON reflects every mutation.
+    const pipelineOnDisk = JSON.parse(
+      readFileSync(pipelinePath(project, 'custom-blog'), 'utf-8'),
+    ) as Record<string, unknown>;
+    expect(pipelineOnDisk['id']).toBe('custom-blog');
+    expect(pipelineOnDisk['name']).toBe('Custom Blog Pipeline');
+    expect(pipelineOnDisk['description']).toBe(
+      'Test pipeline for graphical-entries Task 6.6',
+    );
+    expect(pipelineOnDisk['linearStages']).toEqual(
+      ['Idea', 'Drafting', 'Reviewed', 'Live'],
+    );
+    expect(pipelineOnDisk['lockedStages']).toEqual(['Reviewed']);
+    expect(pipelineOnDisk['offPipelineStages']).toEqual(['Blocked', 'Cancelled']);
+
+    // 3. Create a lane bound to the new pipeline.
+    const laneRes = lane(
+      project,
+      'create', 'blog-lane',
+      '--template', 'custom-blog',
+      '--content-dir', 'content/blog',
+      '--name', 'Blog',
+    );
+    expect(laneRes.stderr).toBe('');
+    expect(laneRes.code).toBe(0);
+    expect(existsSync(lanePath(project, 'blog-lane'))).toBe(true);
+
+    const laneOnDisk = JSON.parse(
+      readFileSync(lanePath(project, 'blog-lane'), 'utf-8'),
+    ) as Record<string, unknown>;
+    expect(laneOnDisk['id']).toBe('blog-lane');
+    expect(laneOnDisk['name']).toBe('Blog');
+    expect(laneOnDisk['pipelineTemplate']).toBe('custom-blog');
+    expect(laneOnDisk['contentDir']).toBe('content/blog');
+
+    // 4. Write two entry sidecars bound to the lane at a non-locked,
+    //    non-terminal stage of the custom pipeline.
+    const seeds: SidecarSeed[] = [
+      {
+        uuid: randomUUID(),
+        slug: 'first-post',
+        currentStage: 'Drafting',
+        lane: 'blog-lane',
+      },
+      {
+        uuid: randomUUID(),
+        slug: 'second-post',
+        currentStage: 'Drafting',
+        lane: 'blog-lane',
+      },
+    ];
+    const sidecarPreBytes = new Map<string, string>();
+    for (const seed of seeds) {
+      const path = writeSidecarFile(project, seed);
+      expect(existsSync(path)).toBe(true);
+      sidecarPreBytes.set(seed.uuid, readFileSync(path, 'utf-8'));
+    }
+
+    // 5. Archive the lane. Soft-archive: archivedAt populated; the lane
+    //    JSON stays on disk; sidecars are untouched.
+    const archived = lane(project, 'archive', 'blog-lane');
+    expect(archived.stderr).toBe('');
+    expect(archived.code).toBe(0);
+
+    const laneAfterArchive = JSON.parse(
+      readFileSync(lanePath(project, 'blog-lane'), 'utf-8'),
+    ) as Record<string, unknown>;
+    expect(typeof laneAfterArchive['archivedAt']).toBe('string');
+    expect(String(laneAfterArchive['archivedAt'])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
+
+    for (const seed of seeds) {
+      expect(existsSync(sidecarPath(project, seed.uuid))).toBe(true);
+      const post = readFileSync(sidecarPath(project, seed.uuid), 'utf-8');
+      expect(post).toBe(sidecarPreBytes.get(seed.uuid));
+    }
+
+    // 6. Restore the lane. archivedAt cleared; sidecars STILL intact.
+    const restored = lane(project, 'restore', 'blog-lane');
+    expect(restored.stderr).toBe('');
+    expect(restored.code).toBe(0);
+
+    const laneAfterRestore = JSON.parse(
+      readFileSync(lanePath(project, 'blog-lane'), 'utf-8'),
+    ) as Record<string, unknown>;
+    expect(laneAfterRestore['archivedAt']).toBeUndefined();
+    expect(laneAfterRestore['id']).toBe('blog-lane');
+    expect(laneAfterRestore['pipelineTemplate']).toBe('custom-blog');
+
+    for (const seed of seeds) {
+      expect(existsSync(sidecarPath(project, seed.uuid))).toBe(true);
+    }
+
+    // 7. Hard-delete (`lane purge`) is refused while entries reference the
+    //    lane. The error message MUST name the bound entries; the lane
+    //    JSON MUST remain on disk; sidecars MUST remain untouched.
+    const purgeRefused = lane(project, 'purge', 'blog-lane');
+    expect(purgeRefused.code).not.toBe(0);
+    // Dependent-slug ordering reflects `readAllSidecars`' filesystem
+    // walk order — not stable across runs. Assert both slugs appear
+    // without committing to an order.
+    expect(purgeRefused.stderr).toMatch(/2 entries reference it/);
+    expect(purgeRefused.stderr).toContain('first-post');
+    expect(purgeRefused.stderr).toContain('second-post');
+    expect(existsSync(lanePath(project, 'blog-lane'))).toBe(true);
+
+    // 8. State-intact verification: every sidecar's bytes are unchanged
+    //    by the full archive → restore → refused-purge cycle.
+    for (const seed of seeds) {
+      const finalBytes = readFileSync(sidecarPath(project, seed.uuid), 'utf-8');
+      expect(finalBytes).toBe(sidecarPreBytes.get(seed.uuid));
+
+      const finalParsed = JSON.parse(finalBytes) as Record<string, unknown>;
+      expect(finalParsed['uuid']).toBe(seed.uuid);
+      expect(finalParsed['slug']).toBe(seed.slug);
+      expect(finalParsed['currentStage']).toBe('Drafting');
+      expect(finalParsed['lane']).toBe('blog-lane');
+    }
+  });
+});
diff --git a/packages/core/src/doctor/rules/lane-config-missing-template.ts b/packages/core/src/doctor/rules/lane-config-missing-template.ts
new file mode 100644
index 0000000..c08c99f
--- /dev/null
+++ b/packages/core/src/doctor/rules/lane-config-missing-template.ts
@@ -0,0 +1,391 @@
+/**
+ * Rule: lane-config-missing-template.
+ *
+ * Phase 6 Task 6.5 (graphical-entries). Catches lane configs that
+ * reference a `pipelineTemplate` id that does not resolve via
+ * `loadPipelineTemplate`. The condition is exactly the failure mode
+ * `loadLaneConfig` throws for in its cross-validation step; this rule
+ * surfaces those as audit findings rather than relying on each call
+ * site to handle the throw.
+ *
+ * Repair: operator picks a valid template (rebinds the lane) OR
+ * deletes the lane file. Delete is gated by an entry-binding check —
+ * any entry whose sidecar references the lane id blocks the delete
+ * until the operator moves it elsewhere via `deskwork lane move`.
+ *
+ * Audit / multi-site semantics:
+ *
+ *   The runner invokes `audit()` once per configured site. Lane configs
+ *   are project-scoped — they live under `<projectRoot>/.deskwork/lanes/`
+ *   regardless of how many sites the project's config declares — so a
+ *   naive per-site scan would emit duplicate findings on multi-site
+ *   projects. The guard: only run when `ctx.site` is the first site in
+ *   `ctx.config.sites` (Object.keys insertion order). Single-site
+ *   projects (the overwhelming majority) trip the guard on their only
+ *   site; multi-site projects trip it on the first site listed in the
+ *   config and skip the rest. This mirrors how project-wide rules
+ *   behave when invoked from the per-site loop without a dedicated
+ *   project-scope abstraction in the runner.
+ *
+ * Sibling-relative imports per the project convention.
+ */
+
+import { readFileSync, unlinkSync, writeFileSync, renameSync } from 'node:fs';
+import { relative } from 'node:path';
+import { appendJournalEvent } from '../../journal/append.ts';
+import {
+  laneConfigPath,
+  listLaneConfigs,
+  loadLaneConfig,
+} from '../../lanes/loader.ts';
+import {
+  listAvailablePipelineTemplates,
+  loadPipelineTemplate,
+} from '../../pipelines/loader.ts';
+import { LaneConfigSchema, type LaneConfig } from '../../lanes/types.ts';
+import { readAllSidecars } from '../../sidecar/read-all.ts';
+import type {
+  DoctorContext,
+  DoctorRule,
+  Finding,
+  RepairPlan,
+  RepairResult,
+} from '../types.ts';
+
+const RULE_ID = 'lane-config-missing-template';
+
+/**
+ * Cap on the number of dependent slugs included verbatim in the
+ * delete-refusal error before falling back to `+N more`. Mirrors the
+ * `PURGE_DEPENDENTS_SAMPLE_LIMIT` constant in
+ * `lanes/operations/purge.ts` (not exported there); five keeps the
+ * error message scannable while still giving the operator concrete
+ * names to grep for.
+ */
+const DELETE_DEPENDENTS_SAMPLE_LIMIT = 5;
+
+/**
+ * Read the raw lane JSON (skipping `loadLaneConfig` to bypass the
+ * pipeline-template cross-validation that we're explicitly testing
+ * for). Returns the parsed JSON as a `LaneConfig` candidate via
+ * `LaneConfigSchema` — if even the schema rejects, we return `null`
+ * (that case is `schema-rejected`'s rule to handle, not ours).
+ */
+function readLaneJson(projectRoot: string, id: string): LaneConfig | null {
+  const path = laneConfigPath(projectRoot, id);
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
+  const result = LaneConfigSchema.safeParse(parsed);
+  if (!result.success) return null;
+  return result.data;
+}
+
+/**
+ * Try resolving the lane's `pipelineTemplate`. Returns `true` when the
+ * template resolves cleanly, `false` when the loader throws (the
+ * "missing template" case this rule catches).
+ */
+function templateResolves(templateId: string, projectRoot: string): boolean {
+  try {
+    loadPipelineTemplate(templateId, projectRoot);
+    return true;
+  } catch {
+    return false;
+  }
+}
+
+/**
+ * Atomic write helper for lane config JSON. Mirrors the
+ * `commitLaneConfig` shape in `lanes/operations/commit.ts` — tmp file
+ * + rename, with the tmp file cleaned up on rename failure. Inlined
+ * here rather than imported because `commitLaneConfig` carries the
+ * `verb` parameter and the operation-specific error wording; the
+ * doctor-rule repair path is its own caller with its own error
+ * surface.
+ */
+function atomicWriteLaneJson(
+  projectRoot: string,
+  id: string,
+  payload: LaneConfig,
+): string {
+  const path = laneConfigPath(projectRoot, id);
+  const tmpPath = `${path}.${process.pid}.tmp`;
+  const body = JSON.stringify(payload, null, 2) + '\n';
+  try {
+    writeFileSync(tmpPath, body, 'utf8');
+    renameSync(tmpPath, path);
+  } catch (err) {
+    try { unlinkSync(tmpPath); } catch { /* tmp absent — ignore */ }
+    throw err;
+  }
+  return path;
+}
+
+/**
+ * Check whether the current site is the "first" site per the config's
+ * insertion order. Used to gate the project-wide scan so multi-site
+ * projects don't emit duplicate findings (see header).
+ */
+function isFirstSite(ctx: DoctorContext): boolean {
+  const siteIds = Object.keys(ctx.config.sites);
+  if (siteIds.length === 0) return true;
+  return siteIds[0] === ctx.site;
+}
+
+const rule: DoctorRule = {
+  id: RULE_ID,
+  label: 'Lane configs whose pipelineTemplate id does not resolve',
+
+  async audit(ctx: DoctorContext): Promise<Finding[]> {
+    if (!isFirstSite(ctx)) return [];
+
+    const laneIds = listLaneConfigs(ctx.projectRoot, { includeArchived: true });
+    if (laneIds.length === 0) return [];
+
+    const availableTemplates = listAvailablePipelineTemplates(ctx.projectRoot);
+    const findings: Finding[] = [];
+
+    for (const laneId of laneIds) {
+      // Use the loader for the happy path so we catch the
+      // pipeline-resolution failure mode exactly the way every other
+      // lane-aware call site sees it. We swallow the throw and inspect
+      // the lane's raw JSON to confirm the failure is specifically the
+      // missing-template case (vs. schema rejection or a missing file,
+      // both of which are other rules' responsibility).
+      try {
+        loadLaneConfig(laneId, ctx.projectRoot);
+        continue;
+      } catch {
+        // fall through to the targeted check
+      }
+
+      const lane = readLaneJson(ctx.projectRoot, laneId);
+      if (lane === null) {
+        // schema rejection or read error — out of scope for THIS rule.
+        // `schema-rejected` covers the schema case; the read case
+        // shouldn't happen (`listLaneConfigs` just enumerated the file).
+        continue;
+      }
+      if (templateResolves(lane.pipelineTemplate, ctx.projectRoot)) {
+        // The loader threw for some reason other than a missing
+        // template (e.g. id/filename mismatch). Not this rule's
+        // concern.
+        continue;
+      }
+
+      const laneFilePath = laneConfigPath(ctx.projectRoot, laneId);
+      findings.push({
+        ruleId: RULE_ID,
+        site: ctx.site,
+        severity: 'error',
+        message:
+          `Lane "${laneId}" references pipelineTemplate "${lane.pipelineTemplate}" ` +
+          `which does not resolve (file: ${relative(ctx.projectRoot, laneFilePath)})`,
+        details: {
+          laneId,
+          laneFilePath,
+          unresolvedTemplateId: lane.pipelineTemplate,
+          availableTemplates,
+        },
+      });
+    }
+    return findings;
+  },
+
+  async plan(ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
+    const laneId = String(finding.details.laneId ?? '');
+    if (!laneId) {
+      return {
+        kind: 'report-only',
+        finding,
+        reason: 'finding missing laneId — re-run audit',
+      };
+    }
+    // Re-enumerate templates at plan time so newly-customized templates
+    // since the audit pass show up in the picker.
+    const availableTemplates = listAvailablePipelineTemplates(ctx.projectRoot);
+    const setTemplateChoices = availableTemplates.map((templateId) => ({
+      id: `set-template-${templateId}`,
+      label: `Bind lane to "${templateId}" pipeline template`,
+      payload: { action: 'set-template', laneId, templateId },
+    }));
+    return {
+      kind: 'prompt',
+      finding,
+      question:
+        `Lane "${laneId}" references an unresolved pipelineTemplate. Pick a repair:`,
+      choices: [
+        ...setTemplateChoices,
+        {
+          id: 'delete-lane',
+          label: 'Delete the lane file',
+          payload: { action: 'delete', laneId },
+        },
+      ],
+    };
+  },
+
+  async apply(ctx: DoctorContext, plan: RepairPlan): Promise<RepairResult> {
+    if (plan.kind !== 'apply') {
+      return {
+        finding: plan.finding,
+        applied: false,
+        message:
+          'plan is not directly appliable; runner should resolve prompt first',
+        skipReason: 'apply-failed',
+      };
+    }
+    const action = String(plan.payload.action ?? '');
+    const laneId = String(plan.payload.laneId ?? '');
+    if (!laneId) {
+      return {
+        finding: plan.finding,
+        applied: false,
+        message: 'apply payload missing laneId',
+        skipReason: 'apply-failed',
+      };
+    }
+
+    if (action === 'set-template') {
+      const templateId = String(plan.payload.templateId ?? '');
+      if (!templateId) {
+        return {
+          finding: plan.finding,
+          applied: false,
+          message: 'set-template payload missing templateId',
+          skipReason: 'apply-failed',
+        };
+      }
+      const lane = readLaneJson(ctx.projectRoot, laneId);
+      if (lane === null) {
+        return {
+          finding: plan.finding,
+          applied: false,
+          message: `lane "${laneId}" JSON unreadable or schema-invalid; cannot rebind`,
+          skipReason: 'apply-failed',
+        };
+      }
+      // Re-confirm the picked template resolves before writing — the
+      // operator might have picked an id that was customized away
+      // between audit and apply.
+      try {
+        loadPipelineTemplate(templateId, ctx.projectRoot);
+      } catch (err) {
+        const detail = err instanceof Error ? err.message : String(err);
+        return {
+          finding: plan.finding,
+          applied: false,
+          message: `picked template "${templateId}" does not resolve: ${detail}`,
+          skipReason: 'apply-failed',
+        };
+      }
+      const before = lane.pipelineTemplate;
+      const updated: LaneConfig = { ...lane, pipelineTemplate: templateId };
+      try {
+        atomicWriteLaneJson(ctx.projectRoot, laneId, updated);
+      } catch (err) {
+        const detail = err instanceof Error ? err.message : String(err);
+        return {
+          finding: plan.finding,
+          applied: false,
+          message: `failed to write lane JSON: ${detail}`,
+          skipReason: 'apply-failed',
+        };
+      }
+      await appendJournalEvent(ctx.projectRoot, {
+        kind: 'lane-config-repair',
+        at: new Date().toISOString(),
+        laneId,
+        ruleId: RULE_ID,
+        details: { action: 'set-template', before, after: templateId },
+      });
+      return {
+        finding: plan.finding,
+        applied: true,
+        message: `rebound lane "${laneId}" to pipelineTemplate "${templateId}"`,
+        details: { laneId, before, after: templateId },
+      };
+    }
+
+    if (action === 'delete') {
+      // Refuse if any entry references this lane — mirror the guard
+      // in `lanes/operations/purge.ts`. The operator must `lane move`
+      // every dependent first.
+      let sidecars;
+      try {
+        sidecars = await readAllSidecars(ctx.projectRoot);
+      } catch (err) {
+        const detail = err instanceof Error ? err.message : String(err);
+        return {
+          finding: plan.finding,
+          applied: false,
+          message: `failed to read sidecars for dependency check: ${detail}`,
+          skipReason: 'apply-failed',
+        };
+      }
+      const dependents = sidecars
+        .filter((entry) => entry.lane === laneId)
+        .map((entry) => entry.uuid);
+      if (dependents.length > 0) {
+        const sample = dependents.slice(0, DELETE_DEPENDENTS_SAMPLE_LIMIT);
+        const remainder = dependents.length - sample.length;
+        const suffix = remainder > 0 ? `, +${remainder} more` : '';
+        return {
+          finding: plan.finding,
+          applied: false,
+          message:
+            `Cannot delete lane "${laneId}": ${dependents.length} ` +
+            `${dependents.length === 1 ? 'entry references' : 'entries reference'} ` +
+            `it (${sample.join(', ')}${suffix}). Move each entry to another lane ` +
+            `with "deskwork lane move <slug> --to <other>" before deleting.`,
+          skipReason: 'editorial-decision',
+        };
+      }
+
+      const laneFilePath = laneConfigPath(ctx.projectRoot, laneId);
+      try {
+        unlinkSync(laneFilePath);
+      } catch (err) {
+        const detail = err instanceof Error ? err.message : String(err);
+        return {
+          finding: plan.finding,
+          applied: false,
+          message: `failed to delete lane file ${laneFilePath}: ${detail}`,
+          skipReason: 'apply-failed',
+        };
+      }
+      await appendJournalEvent(ctx.projectRoot, {
+        kind: 'lane-config-repair',
+        at: new Date().toISOString(),
+        laneId,
+        ruleId: RULE_ID,
+        details: { action: 'delete', deleted: true, laneFilePath },
+      });
+      return {
+        finding: plan.finding,
+        applied: true,
+        message: `deleted lane file ${relative(ctx.projectRoot, laneFilePath)}`,
+        details: { laneId, laneFilePath },
+      };
+    }
+
+    return {
+      finding: plan.finding,
+      applied: false,
+      message: `unknown apply action: ${action}`,
+      skipReason: 'apply-failed',
+    };
+  },
+};
+
+export default rule;
diff --git a/packages/core/src/doctor/runner.ts b/packages/core/src/doctor/runner.ts
index c04bf3c..de64573 100644
--- a/packages/core/src/doctor/runner.ts
+++ b/packages/core/src/doctor/runner.ts
@@ -23,6 +23,7 @@ import workflowStale from './rules/workflow-stale.ts';
 import calendarUuidMissing from './rules/calendar-uuid-missing.ts';
 import legacyTopLevelIdMigration from './rules/legacy-top-level-id-migration.ts';
 import legacyStageArtifactPath from './rules/legacy-stage-artifact-path.ts';
+import laneConfigMissingTemplate from './rules/lane-config-missing-template.ts';
 import { loadProjectRules, mergeRules } from './project-rules.ts';
 import type {
   DoctorContext,
@@ -50,6 +51,7 @@ export const RULES: ReadonlyArray<DoctorRule> = [
   calendarUuidMissing,
   legacyTopLevelIdMigration,
   legacyStageArtifactPath,
+  laneConfigMissingTemplate,
   missingFrontmatterId,
   orphanFrontmatterId,
   duplicateId,
diff --git a/packages/core/src/schema/journal-events.ts b/packages/core/src/schema/journal-events.ts
index 27a26e1..d6634cd 100644
--- a/packages/core/src/schema/journal-events.ts
+++ b/packages/core/src/schema/journal-events.ts
@@ -202,6 +202,36 @@ const LaneMoveEvent = z.object({
   }),
 });
 
+/**
+ * Phase 6 Task 6.5 (graphical-entries): doctor-repair record for a lane
+ * config whose `pipelineTemplate` reference does not resolve. The
+ * `lane-config-missing-template` rule emits this event after applying
+ * either a `set-template` rebind (with `before` / `after` template ids)
+ * or a `delete` of the lane file (with `deleted: true`).
+ *
+ * The event is project-scoped (no `entryId`); `laneId` identifies the
+ * lane the repair acted on. `ruleId` records the originating doctor
+ * rule so an audit trail can be filtered by which rule wrote the entry.
+ */
+const LaneConfigRepairEvent = z.object({
+  kind: z.literal('lane-config-repair'),
+  at: z.string().datetime(),
+  laneId: z.string().min(1),
+  ruleId: z.string().min(1),
+  details: z.union([
+    z.object({
+      action: z.literal('set-template'),
+      before: z.string().min(1),
+      after: z.string().min(1),
+    }),
+    z.object({
+      action: z.literal('delete'),
+      deleted: z.literal(true),
+      laneFilePath: z.string().min(1),
+    }),
+  ]),
+});
+
 /**
  * Phase 6 Task 6.2 (graphical-entries): pipeline-template-lifecycle
  * events emitted by the `/deskwork:pipeline` verb family. Each event is
@@ -310,6 +340,7 @@ export const JournalEventSchema = z.discriminatedUnion('kind', [
   LaneRestoreEvent,
   LanePurgeEvent,
   LaneMoveEvent,
+  LaneConfigRepairEvent,
   PipelineCreateEvent,
   PipelineUpdateEvent,
   PipelineDeleteEvent,
diff --git a/packages/core/test/doctor/lane-config-missing-template.test.ts b/packages/core/test/doctor/lane-config-missing-template.test.ts
new file mode 100644
index 0000000..61007be
--- /dev/null
+++ b/packages/core/test/doctor/lane-config-missing-template.test.ts
@@ -0,0 +1,284 @@
+/**
+ * Tests for the `lane-config-missing-template` doctor rule.
+ *
+ * Phase 6 Task 6.5 (graphical-entries). Four scenarios:
+ *
+ *   1. Audit: a lane config referencing a non-existent template id
+ *      produces exactly one finding with the expected details shape.
+ *   2. Repair via `set-template`: the rebind lands on disk, a journal
+ *      event is emitted, and a re-audit returns zero findings.
+ *   3. Repair via `delete-lane` (no entries bound): the lane file is
+ *      removed and a journal event is emitted.
+ *   4. Repair via `delete-lane` when entries are bound: the apply
+ *      refuses with `success: false` and names the bound entry's UUID.
+ *
+ * Fixtures live on disk under tmp directories — no filesystem mocking,
+ * per the project's testing rules.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { runAudit, yesInteraction } from '@/doctor/runner';
+import laneConfigMissingTemplate from '@/doctor/rules/lane-config-missing-template';
+import { buildContentIndex } from '@/content-index';
+import { readCalendar } from '@/calendar';
+import { resolveCalendarPath } from '@/paths';
+import type { DeskworkConfig } from '@/config';
+import type { DoctorContext } from '@/doctor/types';
+
+const RULE_ID = 'lane-config-missing-template';
+
+interface Fixture {
+  root: string;
+  config: DeskworkConfig;
+}
+
+function setupFixture(): Fixture {
+  const root = mkdtempSync(join(tmpdir(), 'dw-lane-cfg-mt-'));
+  mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
+  mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
+  mkdirSync(join(root, 'docs'), { recursive: true });
+  // Empty calendar — every test runs against a calendar that has no
+  // rows. The rule under test doesn't consult the calendar.
+  writeFileSync(
+    join(root, '.deskwork', 'calendar.md'),
+    `# Editorial Calendar\n\n## Drafting\n\n| UUID | Slug | Title | Description | Keywords | Source | Updated |\n|------|------|------|------|------|------|------|\n`,
+    'utf8',
+  );
+  const config: DeskworkConfig = {
+    version: 1,
+    sites: {
+      main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
+    },
+    defaultSite: 'main',
+  };
+  return { root, config };
+}
+
+function writeLaneJson(root: string, id: string, payload: unknown): void {
+  writeFileSync(
+    join(root, '.deskwork', 'lanes', `${id}.json`),
+    JSON.stringify(payload, null, 2) + '\n',
+    'utf8',
+  );
+}
+
+function writeSidecarJson(root: string, payload: unknown): void {
+  // sidecars are stored at .deskwork/entries/<uuid>.json
+  const obj = payload as { uuid: string };
+  writeFileSync(
+    join(root, '.deskwork', 'entries', `${obj.uuid}.json`),
+    JSON.stringify(payload, null, 2),
+    'utf8',
+  );
+}
+
+function buildCtx(fixture: Fixture): DoctorContext {
+  const calendarPath = resolveCalendarPath(fixture.root, fixture.config, 'main');
+  return {
+    projectRoot: fixture.root,
+    config: fixture.config,
+    site: 'main',
+    calendar: readCalendar(calendarPath),
+    index: buildContentIndex(fixture.root, fixture.config, 'main'),
+    workflows: [],
+    interaction: yesInteraction,
+  };
+}
+
+function listJournalEvents(root: string): unknown[] {
+  const dir = join(root, '.deskwork', 'review-journal', 'history');
+  if (!existsSync(dir)) return [];
+  return readdirSync(dir)
+    .filter((n) => n.endsWith('.json'))
+    .map((n) => JSON.parse(readFileSync(join(dir, n), 'utf8')) as unknown);
+}
+
+const EXPECTED_PRESET_TEMPLATES = [
+  'blog-post',
+  'editorial',
+  'feature-doc',
+  'qa-plan',
+  'visual',
+];
+
+describe('doctor: lane-config-missing-template', () => {
+  let fixture: Fixture;
+
+  beforeEach(() => {
+    fixture = setupFixture();
+  });
+
+  afterEach(() => {
+    rmSync(fixture.root, { recursive: true, force: true });
+  });
+
+  it('emits one finding when a lane config references a non-existent template', async () => {
+    writeLaneJson(fixture.root, 'dangling', {
+      id: 'dangling',
+      name: 'Dangling Lane',
+      pipelineTemplate: 'nonsense',
+      contentDir: 'docs',
+    });
+
+    const report = await runAudit(
+      { projectRoot: fixture.root, config: fixture.config },
+      yesInteraction,
+    );
+    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
+    expect(findings).toHaveLength(1);
+    const f = findings[0];
+    expect(f.severity).toBe('error');
+    expect(f.details.laneId).toBe('dangling');
+    expect(f.details.unresolvedTemplateId).toBe('nonsense');
+    expect(f.details.laneFilePath).toBe(
+      join(fixture.root, '.deskwork', 'lanes', 'dangling.json'),
+    );
+    expect(f.details.availableTemplates).toEqual(EXPECTED_PRESET_TEMPLATES);
+  });
+
+  it('repairs via set-template: rebinds the lane and emits a journal event', async () => {
+    writeLaneJson(fixture.root, 'dangling', {
+      id: 'dangling',
+      name: 'Dangling Lane',
+      pipelineTemplate: 'nonsense',
+      contentDir: 'docs',
+    });
+
+    const ctx = buildCtx(fixture);
+    const findings = await laneConfigMissingTemplate.audit(ctx);
+    expect(findings).toHaveLength(1);
+
+    const plan = await laneConfigMissingTemplate.plan(ctx, findings[0]);
+    expect(plan.kind).toBe('prompt');
+    if (plan.kind !== 'prompt') throw new Error('plan must be prompt');
+
+    const choice = plan.choices.find((c) => c.id === 'set-template-editorial');
+    expect(choice).toBeDefined();
+    if (!choice) throw new Error('set-template-editorial choice missing');
+
+    const result = await laneConfigMissingTemplate.apply(ctx, {
+      kind: 'apply',
+      finding: findings[0],
+      summary: choice.label,
+      payload: choice.payload,
+    });
+    expect(result.applied).toBe(true);
+
+    // Lane JSON updated on disk.
+    const onDisk = JSON.parse(
+      readFileSync(join(fixture.root, '.deskwork', 'lanes', 'dangling.json'), 'utf8'),
+    ) as { pipelineTemplate: string };
+    expect(onDisk.pipelineTemplate).toBe('editorial');
+
+    // Journal event emitted.
+    const events = listJournalEvents(fixture.root);
+    const repairEvents = events.filter(
+      (e): e is { kind: string; laneId: string; details: { action: string; before: string; after: string } } =>
+        typeof e === 'object'
+        && e !== null
+        && (e as { kind?: unknown }).kind === 'lane-config-repair',
+    );
+    expect(repairEvents).toHaveLength(1);
+    expect(repairEvents[0].laneId).toBe('dangling');
+    expect(repairEvents[0].details.action).toBe('set-template');
+    expect(repairEvents[0].details.before).toBe('nonsense');
+    expect(repairEvents[0].details.after).toBe('editorial');
+
+    // Re-audit returns zero findings.
+    const reauditCtx = buildCtx(fixture);
+    const after = await laneConfigMissingTemplate.audit(reauditCtx);
+    expect(after).toHaveLength(0);
+  });
+
+  it('repairs via delete-lane (no entries bound): removes the file and emits a journal event', async () => {
+    writeLaneJson(fixture.root, 'dangling', {
+      id: 'dangling',
+      name: 'Dangling Lane',
+      pipelineTemplate: 'nonsense',
+      contentDir: 'docs',
+    });
+
+    const ctx = buildCtx(fixture);
+    const findings = await laneConfigMissingTemplate.audit(ctx);
+    expect(findings).toHaveLength(1);
+
+    const plan = await laneConfigMissingTemplate.plan(ctx, findings[0]);
+    if (plan.kind !== 'prompt') throw new Error('plan must be prompt');
+    const choice = plan.choices.find((c) => c.id === 'delete-lane');
+    if (!choice) throw new Error('delete-lane choice missing');
+
+    const laneFile = join(fixture.root, '.deskwork', 'lanes', 'dangling.json');
+    expect(existsSync(laneFile)).toBe(true);
+
+    const result = await laneConfigMissingTemplate.apply(ctx, {
+      kind: 'apply',
+      finding: findings[0],
+      summary: choice.label,
+      payload: choice.payload,
+    });
+    expect(result.applied).toBe(true);
+    expect(existsSync(laneFile)).toBe(false);
+
+    const events = listJournalEvents(fixture.root);
+    const repairEvents = events.filter(
+      (e): e is { kind: string; laneId: string; details: { action: string; deleted: true; laneFilePath: string } } =>
+        typeof e === 'object'
+        && e !== null
+        && (e as { kind?: unknown }).kind === 'lane-config-repair',
+    );
+    expect(repairEvents).toHaveLength(1);
+    expect(repairEvents[0].details.action).toBe('delete');
+    expect(repairEvents[0].details.deleted).toBe(true);
+    expect(repairEvents[0].details.laneFilePath).toBe(laneFile);
+  });
+
+  it('refuses delete-lane when an entry references the lane', async () => {
+    writeLaneJson(fixture.root, 'dangling', {
+      id: 'dangling',
+      name: 'Dangling Lane',
+      pipelineTemplate: 'nonsense',
+      contentDir: 'docs',
+    });
+    const boundUuid = '11111111-1111-4111-8111-111111111111';
+    const nowIso = new Date().toISOString();
+    writeSidecarJson(fixture.root, {
+      uuid: boundUuid,
+      slug: 'bound-entry',
+      title: 'Bound Entry',
+      keywords: [],
+      source: 'manual',
+      currentStage: 'Drafting',
+      iterationByStage: {},
+      lane: 'dangling',
+      createdAt: nowIso,
+      updatedAt: nowIso,
+    });
+
+    const ctx = buildCtx(fixture);
+    const findings = await laneConfigMissingTemplate.audit(ctx);
+    expect(findings).toHaveLength(1);
+
+    const plan = await laneConfigMissingTemplate.plan(ctx, findings[0]);
+    if (plan.kind !== 'prompt') throw new Error('plan must be prompt');
+    const choice = plan.choices.find((c) => c.id === 'delete-lane');
+    if (!choice) throw new Error('delete-lane choice missing');
+
+    const result = await laneConfigMissingTemplate.apply(ctx, {
+      kind: 'apply',
+      finding: findings[0],
+      summary: choice.label,
+      payload: choice.payload,
+    });
+    expect(result.applied).toBe(false);
+    expect(result.message).toContain(boundUuid);
+    expect(result.message).toMatch(/Cannot delete lane/);
+
+    // Lane file still on disk — refusal was effective.
+    expect(
+      existsSync(join(fixture.root, '.deskwork', 'lanes', 'dangling.json')),
+    ).toBe(true);
+  });
+});


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
