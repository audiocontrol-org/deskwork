# Audit-barrage — multi-model audit prompt template

You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface bugs, design issues, missed edge cases, and code-quality concerns in the work product captured in the diff below.

You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.

## Feature under audit

graphical-entries

## Feature scope (workplan / PRD summary)

Phase 5 Tasks 5.2 + 5.3 of graphical-entries: template-aware stage rendering + responsive focus chrome. Task 5.2 makes per-lane swim heads + stage columns read from the lane's bound pipeline template (not hardcoded editorial stages); empty-lane CTA (a per-lane '+ new' shortcut when the lane has zero entries); template-stage-aware iteration order; renders all five preset templates correctly. Task 5.3 adds focus-chip overflow handling (when more lanes than fit in the chip row, an overflow menu hosts the rest); mobile lane-sheet (vertical bottom-sheet replacement for the desktop focus-chip strip; per-lane visibility toggles); hidden-lane rail activation (re-show a lane that was filtered out via focus). Audit focus: template-driven render correctness across all 5 presets; viewport-conditional rendering correctness; focus-state persistence + recovery (localStorage corruption); overflow-menu interaction patterns; mobile-sheet a11y (focus trap, scrim, dismiss); WCAG SC 2.5.8 + 1.4.3 AA; no silent fallbacks on unknown lane id / unknown template id; race conditions in focus state vs. visibility state.

## Commit subjects in the audited range

ca2e8b8 feat(graphical-entries): Phase 5 Task 5.3 — focus-chip overflow + mobile lane-sheet + hidden-lane rail activation
afa388b fix(graphical-entries): Phase 5 Task 5.2 review followups (AUDIT-15..20)
3ccf586 feat(graphical-entries): Phase 5 Task 5.2 — template-aware stage rendering + empty-lane CTA


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

diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
index fbb4f0c..e117a87 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
@@ -532,3 +532,135 @@ e.g. `dashboard-swimlane-chips.css`, `dashboard-swimlane-list.css` (CSS)
 and `dashboard-swimlane-{shell,collapse,view-toggle,compose}.test.ts`
 (tests). The split keeps each file under the 500-line cap going
 forward.
+
+## 2026-05-28 audit: Phase 5 Task 5.2 (template-aware stage rendering + empty-lane CTA)
+
+Audit scope: commits `1d6383a` + in-task followup (this commit).
+Predecessor: `877e778`. Tests 672 → 732 (+60). Build exit 0 across core + studio.
+
+Two-stage review (spec-compliance + code-quality) routed through the
+dw-lifecycle trussing. Spec ✅ SPEC-COMPLIANT; quality ⚠️ APPROVED WITH
+FOLLOWUPS — zero blocking, four non-blocking findings + four observations.
+The followups land in this same in-task commit (no deferral).
+
+### AUDIT-20260528-15
+
+Finding-ID: AUDIT-20260528-15
+Status:     fixed-followup-commit
+Severity:   medium
+Surface:    packages/studio/src/pages/dashboard/{swimlane-entry-card.ts, section.ts}
+
+Two orphaned exports surfaced after Task 5.2 lifted the swimlane-card
+dispatch to a universal `renderRow`: `renderEntryCard` in
+`swimlane-entry-card.ts` (implementer-flagged) AND `renderStageSection`
+in `section.ts` (caught by the code-quality reviewer, NOT flagged by
+the implementer). The reviewer's note: per `Just for now is bullshit`,
+orphaned code is a defer.
+
+Resolution: deleted `swimlane-entry-card.ts` entirely (no live callers);
+removed `renderStageSection`, `renderStageTile`, `STAGE_ORNAMENTS`, and
+`STAGE_EMPTY_MESSAGES` from `section.ts` (all dead code post-5.2). The
+remaining `section.ts` exports are `renderRow` (consumed by
+`swimlane-card.ts`) and `renderDistributionPlaceholder` (consumed by
+`dashboard.ts`).
+
+Stale doc-comments updated in lockstep: `dashboard.ts:24` (the data flow
+no longer mentions `renderStageSection`); `legacy-stage.ts:1-30` (the
+"until Task 5.2 lands" framing replaced with "after Task 5.2; the guard
+remains for `data.ts:bucketize` only").
+
+### AUDIT-20260528-16
+
+Finding-ID: AUDIT-20260528-16
+Status:     fixed-followup-commit
+Severity:   medium
+Surface:    packages/studio/test/dashboard-affordances-template.test.ts
+
+Commandment III was not test-pinned for the new template-aware row
+chrome path. The reviewer's recommendation: add an `er-stamp-*` /
+`reviewState` / `IN REVIEW` / `ITERATING` / `in-review` absence
+assertion across every template's rendered chrome so a future regression
+that re-introduces a review-state badge fails fast.
+
+Resolution: added `describe('Commandment III — no review-state labels
+in template-aware row chrome')` to `dashboard-affordances-template.test.ts`.
+Three test bodies cover the editorial active-linear + locked + terminal
+chrome plus a matrix run across visual + qa-plan + feature-doc +
+blog-post (10 stage-template pairs).
+
+### AUDIT-20260528-17
+
+Finding-ID: AUDIT-20260528-17
+Status:     fixed-followup-commit
+Severity:   low
+Surface:    packages/studio/test/dashboard-affordances-template.test.ts
+
+`verbsForStage` activeLinear matrix had small gaps — `feature-doc` and
+`blog-post` templates were covered for locked + terminal but not for
+their active-linear stages. Drawer-view invariants (the mobile-swipe
+top-N set) were not asserted at all.
+
+Resolution: added `feature-doc Drafting` + `blog-post Drafting`
+activeLinear cases; added a 4-test `drawer-view invariants` describe
+block covering active linear + locked + off-pipeline + terminal drawer
+sets.
+
+### AUDIT-20260528-18
+
+Finding-ID: AUDIT-20260528-18
+Status:     fixed-followup-commit
+Severity:   low
+Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts
+
+Held-Space auto-repeat on the affordance button would fire N clipboard
+writes (each `keydown` repeat re-invokes `activateAffordance`). The
+visible state stays stable (`scheduleRevert` resets the timer) but the
+no-single-activation contract is violated and the clipboard sees N
+identical writes.
+
+Resolution: added `if (ev.repeat) return;` to the Space-key handler.
+Click and Enter (native button keyboard contract) are single-activation
+already; only Space needed the explicit guard.
+
+### AUDIT-20260528-19
+
+Finding-ID: AUDIT-20260528-19
+Status:     open
+Severity:   low
+Surface:    packages/studio/src/pages/dashboard/affordances.ts
+
+`classifyStage` dispatches a stage that is BOTH terminal (last linear
+stage) AND a member of `lockedStages` as `terminal` (view + scrapbook
+only) rather than as `locked` (Approve → next). Adopter templates that
+want "this is the terminal stage AND it must be approved before
+freezing" semantics will silently get the frozen-artifact UX. This is
+defensible — there's no `linearIdx + 1` to label "Approve → next" — but
+was previously undocumented.
+
+Resolution: added an inline doc-comment at the terminal-first branch
+(`affordances.ts:118-126`) naming the precedence rule and pointing
+adopters at off-pipeline-stages as the alternative express form.
+
+Tracked as `open` rather than `fixed` because the doc-comment is the
+disposition; no behavior change. A schema-level invariant forbidding
+terminal-AND-locked stages could be added in a future task (would
+require migrating any adopter that relies on the current dispatch) —
+worth re-evaluating when a real adopter hits the case.
+
+### AUDIT-20260528-20
+
+Finding-ID: AUDIT-20260528-20
+Status:     open
+Severity:   informational
+Surface:    packages/studio/src/pages/dashboard/swimlane-card.ts
+
+`swimlane-card.ts` post-5.2 is 482 lines — within the 300–500 cap but
+near the limit. The file has accumulated four sibling task contracts
+(5.1 swim-shell, 5.1A collapse, 5.1B view-toggle, 5.1C compose chip,
+5.2 empty-CTA + template-aware dispatch). The next addition (Task 5.6
+integration test or a new affordance) will likely push it over.
+
+Fix guidance: if a Task 5.6 / 5.3 addition would push past 500, split
+into `swimlane-card-{shell,renderers,empty-cta}.ts` (or similar). Track
+alongside AUDIT-20260528-14 (CSS + test file split) as a Phase 5
+cleanup task.
diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
index d25e5f9..afd59cb 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
@@ -248,15 +248,15 @@ The picked design **pivots away from the PRD's original "per-lane tab strip" fra
 
 ### Task 5.2: Template-aware stage columns (no hardcoded stages in render)
 
-- [ ] Step 5.2.1: Grep the studio's render code for hardcoded stage names (`Drafting`, `Final`, `Published`, etc.); refactor every site to read from the lane's template instead.
-- [ ] Step 5.2.2: Empty-lane state: shows the lane's pipeline shape as empty stage columns + a "Create your first entry" CTA that clipboard-copies `/deskwork:add --lane <id>`.
-- [ ] Step 5.2.3: Per Commandment III, no surface renders "review state" labels — only stage labels appear.
+- [x] Step 5.2.1: Grep the studio's render code for hardcoded stage names (`Drafting`, `Final`, `Published`, etc.); refactor every site to read from the lane's template instead.
+- [x] Step 5.2.2: Empty-lane state: shows the lane's pipeline shape as empty stage columns + a "Create your first entry" CTA that clipboard-copies `/deskwork:add --lane <id>`.
+- [x] Step 5.2.3: Per Commandment III, no surface renders "review state" labels — only stage labels appear.
 
 ### Task 5.3: Many-lane overflow — horizontal scroll of focus-chip strip + visibility-rail jump
 
-- [ ] Step 5.3.1: When N visibility-on lanes exceeds the viewport-fitting threshold, the focus-chip strip overflows into a horizontally-scrollable row (per the D3 mockup's mobile focus-strip behavior).
-- [ ] Step 5.3.2: The lane-visibility rail acts as the master list of every lane (including persistently-hidden ones); clicking a hidden lane in the rail flips its visibility on AND adds it to focus. No separate "lanes ▾" dropdown is needed — the rail already serves that role.
-- [ ] Step 5.3.3: Mobile / phone: focus-chip strip becomes a horizontally-scrollable row inside the masthead; lane-visibility rail becomes a slide-up sheet triggered by the masthead's "Lanes ▾" button.
+- [x] Step 5.3.1: When N visibility-on lanes exceeds the viewport-fitting threshold, the focus-chip strip overflows into a horizontally-scrollable row (per the D3 mockup's mobile focus-strip behavior).
+- [x] Step 5.3.2: The lane-visibility rail acts as the master list of every lane (including persistently-hidden ones); clicking a hidden lane in the rail flips its visibility on AND adds it to focus. No separate "lanes ▾" dropdown is needed — the rail already serves that role.
+- [x] Step 5.3.3: Mobile / phone: focus-chip strip becomes a horizontally-scrollable row inside the masthead; lane-visibility rail becomes a slide-up sheet triggered by the masthead's "Lanes ▾" button. **Trigger lives on the bay-head per `.claude/rules/affordance-placement.md`** (the rail is a bay concern, not a page-level masthead concern).
 
 ### Task 5.4: Lane-visibility panel + drag-to-reorder
 
diff --git a/packages/studio/src/pages/dashboard.ts b/packages/studio/src/pages/dashboard.ts
index 1052f9b..22396b6 100644
--- a/packages/studio/src/pages/dashboard.ts
+++ b/packages/studio/src/pages/dashboard.ts
@@ -20,9 +20,12 @@
  * removed in v0.19.
  *
  * The renderer's data flow:
- *   1. loadDashboardData reads every sidecar and groups by stage.
- *   2. Each stage renders via `renderStageSection`.
- *   3. The Distribution placeholder renders below the stage sections.
+ *   1. loadDashboardData reads every sidecar and groups by lane and by
+ *      stage.
+ *   2. The multi-lane swimlane shell (Phase 5 Task 5.1+) renders one
+ *      swimlane per focused lane; per-stage columns and rows come from
+ *      the lane's resolved pipeline template.
+ *   3. The Distribution placeholder renders below the swimlane shell.
  *   4. The mobile-only Compose chrome (FAB + slide-up sheet) renders
  *      at the page tail; CSS hides it on desktop.
  *
diff --git a/packages/studio/src/pages/dashboard/affordances.ts b/packages/studio/src/pages/dashboard/affordances.ts
index add81b6..75ba5a5 100644
--- a/packages/studio/src/pages/dashboard/affordances.ts
+++ b/packages/studio/src/pages/dashboard/affordances.ts
@@ -13,11 +13,28 @@
  *   `⋮` button + menu hold the secondary verbs (block / cancel / scrapbook).
  *
  * Stage-aware verb vocabulary per DESKWORK-STATE-MACHINE.md (Commandment II
- * — verbs are stage-gated). The block + induct verbs are surfaced uniformly
- * on every linear-pipeline stage (block pauses an in-pipeline entry; induct
- * teleports to an operator-chosen stage in either direction). Both clipboard-
- * copy their `/deskwork:<verb> <slug>` slash command; the receiving agent
- * runs the atomic CLI helper (`deskwork block / cancel / induct`).
+ * — verbs are universal and stage-gated). The block + induct verbs are
+ * surfaced uniformly on every linear-pipeline stage (block pauses an
+ * in-pipeline entry; induct teleports to an operator-chosen stage in either
+ * direction). Both clipboard-copy their `/deskwork:<verb> <slug>` slash
+ * command; the receiving agent runs the atomic CLI helper
+ * (`deskwork block / cancel / induct`).
+ *
+ * Phase 5 Task 5.2 — `verbsForStage` is now template-aware. The dispatch
+ * categorizes a stage as:
+ *   - off-pipeline (in `template.offPipelineStages`) → inductForward + scrap
+ *   - frozen terminal (last entry in `template.linearStages`) → view + scrap
+ *   - locked (in `template.lockedStages`) → approve (→ next linear stage)
+ *     + scrap, with the menu/drawer surfacing block + induct + cancel
+ *   - active linear (any other `linearStages` member) → iterate + approve
+ *     + scrap, plus block + induct + cancel in the menu
+ * The "Approve → {next}" label dynamically picks the linear stage
+ * immediately after a locked stage, so editorial Final → "Approve →
+ * Published", visual Approved → "Approve → Shipped", feature-doc Approved
+ * → "Approve → Implemented" AND Implemented → "Approve → Complete",
+ * qa-plan Reviewed → "Approve → Tested", blog-post Edited → "Approve →
+ * Published". Any stage outside both `linearStages` and
+ * `offPipelineStages` is a programming error and throws.
  *
  * The row's outer wrapper is `.er-row-shell` (was `.er-calendar-row-wrap`).
  * Inside: a `.er-row-drawer` for the swipe-action chips (positioned right of
@@ -30,8 +47,8 @@
 
 import { html, unsafe, type RawHtml } from '../html.ts';
 import { scrapbookViewerUrl } from '../../components/scrapbook-item.ts';
-import { isLegacyEditorialStage } from './legacy-stage.ts';
-import type { Entry, Stage } from '@deskwork/core/schema/entry';
+import type { Entry } from '@deskwork/core/schema/entry';
+import type { StrictPipelineTemplate } from '@deskwork/core/pipelines';
 
 /** A single verb the operator can invoke from a row. */
 interface Verb {
@@ -60,16 +77,90 @@ interface Verb {
   readonly drawerLabel?: string;
 }
 
+/**
+ * Categorize a stage against its pipeline template. The four
+ * categories drive the verb-set dispatch in `verbsForStage`.
+ * `offPipeline` covers Blocked / Cancelled / Archived (cul-de-sacs).
+ * `terminal` covers the LAST linear stage (published / shipped / etc.
+ * — read-only artifact). `locked` covers any lockedStages member
+ * (review-frozen, awaiting the next approve). `activeLinear` is the
+ * default linear-pipeline stage (iterate + approve both available).
+ */
+type StageCategory =
+  | { readonly kind: 'offPipeline' }
+  | { readonly kind: 'terminal' }
+  | { readonly kind: 'locked'; readonly nextLinearStage: string }
+  | { readonly kind: 'activeLinear' };
+
+/**
+ * Classify a stage against the template's linear + off-pipeline +
+ * locked vocabularies. Throws when the stage doesn't belong to
+ * either linearStages or offPipelineStages — that condition is a
+ * programming error upstream (entries should never carry a stage
+ * name absent from their lane's template), surfaced loudly per the
+ * no-fallback rule.
+ */
+function classifyStage(
+  stage: string,
+  template: StrictPipelineTemplate,
+): StageCategory {
+  if (template.offPipelineStages.includes(stage)) {
+    return { kind: 'offPipeline' };
+  }
+  const linearIdx = template.linearStages.indexOf(stage);
+  if (linearIdx === -1) {
+    throw new Error(
+      `verbsForStage: stage "${stage}" is not in template "${template.id}" `
+        + `(linearStages=[${template.linearStages.join(', ')}], `
+        + `offPipelineStages=[${template.offPipelineStages.join(', ')}])`,
+    );
+  }
+  if (linearIdx === template.linearStages.length - 1) {
+    // Terminal-first dispatch: a stage that is BOTH the last linear
+    // stage AND a member of lockedStages is dispatched as terminal
+    // (view + scrapbook only). There's no `linearIdx + 1` for the
+    // "Approve → next" label to point at — the artifact has nowhere
+    // to advance to. Adopter templates that want a "terminal but
+    // also locked" semantics should express it via the off-pipeline
+    // set instead.
+    return { kind: 'terminal' };
+  }
+  const locked = template.lockedStages ?? [];
+  if (locked.includes(stage)) {
+    // The lockedStages-subset-of-linearStages invariant + the
+    // linear-terminal guard above means linearIdx + 1 is always a
+    // valid index. Read it directly; per the no-fallback rule, an
+    // index-out-of-range read here would surface as `undefined` and
+    // we throw rather than fabricate a label.
+    const nextLinearStage = template.linearStages[linearIdx + 1];
+    if (nextLinearStage === undefined) {
+      throw new Error(
+        `verbsForStage: locked stage "${stage}" in template "${template.id}" `
+          + 'has no successor in linearStages — schema invariant violation',
+      );
+    }
+    return { kind: 'locked', nextLinearStage };
+  }
+  return { kind: 'activeLinear' };
+}
+
 /**
  * Build the stage-aware verb set for an entry. Returns three views — the
  * inline-chip set (desktop high-frequency verbs), the drawer set (mobile
  * swipe top-N), and the menu set (full stage-aware vocabulary).
  *
+ * Per DESKWORK-STATE-MACHINE.md Commandment II — verbs are universal and
+ * stage-gated only. Phase 5 Task 5.2: the dispatch now reads the lane's
+ * pipeline template (linearStages / lockedStages / offPipelineStages) to
+ * decide which verbs are available + how the approve label is worded;
+ * no template-specific stage names are hardcoded here.
+ *
  * Visibility-by-surface is intentional and documented in
  * `docs/studio-design/ACCEPTED/2026-05-11-row-affordance-overflow-plus-swipe/brief.md`.
  */
 function verbsForStage(
-  stage: Stage,
+  stage: string,
+  template: StrictPipelineTemplate,
   entry: Entry,
   defaultSite: string,
 ): {
@@ -87,6 +178,8 @@ function verbsForStage(
     entryId: entry.uuid,
   });
 
+  const category = classifyStage(stage, template);
+
   const iterate: Verb = {
     kind: 'iterate',
     label: 'Iterate',
@@ -94,20 +187,22 @@ function verbsForStage(
     copy: `/deskwork:iterate ${slug}`,
     title: 'append a new revision to this entry',
   };
+  const approveLabel = category.kind === 'locked'
+    ? `Approve → ${category.nextLinearStage}`
+    : 'Approve';
+  const approveTitle = category.kind === 'locked'
+    ? `advance this entry to ${category.nextLinearStage}`
+    : 'advance this entry to the next stage';
   const approve: Verb = {
     kind: 'approve',
-    label: stage === 'Final' ? 'Approve → Published' : 'Approve',
+    label: approveLabel,
     glyph: '✓',
     // Per DESKWORK-STATE-MACHINE.md Commandment II, approve is universal
-    // across every linear-pipeline transition including Final → Published.
-    // The `/deskwork:approve` skill handles all stage transitions; the
-    // separate `/deskwork:publish` skill is an alias for the Final →
-    // Published case, not a separate verb. Use approve uniformly.
+    // across every linear-pipeline transition including the locked →
+    // terminal hop. The `/deskwork:approve` skill handles all stage
+    // transitions; use approve uniformly.
     copy: `/deskwork:approve ${slug}`,
-    title:
-      stage === 'Final'
-        ? 'advance this entry to Published (assigns a public version)'
-        : 'advance this entry to the next stage',
+    title: approveTitle,
   };
   const block: Verb = {
     kind: 'block',
@@ -145,7 +240,7 @@ function verbsForStage(
     title: "open the entry's scrapbook (research notes, drafts, etc.)",
     drawerLabel: 'Scrpbk',
   };
-  // Used only on Blocked/Cancelled rows where induct's primary use is
+  // Used only on off-pipeline rows where induct's primary use is
   // bringing the entry back into the pipeline.
   const inductForward: Verb = {
     ...induct,
@@ -153,7 +248,7 @@ function verbsForStage(
     title: 'bring this entry back into the pipeline',
   };
 
-  if (stage === 'Ideas' || stage === 'Planned' || stage === 'Outlining' || stage === 'Drafting') {
+  if (category.kind === 'activeLinear') {
     return {
       // Scrapbook stays inline on every stage — it's the entry's research
       // surface, used at the same cadence as the active-stage verb.
@@ -162,33 +257,30 @@ function verbsForStage(
       menu: [iterate, approve, block, induct, cancel, scrapbook],
     };
   }
-  if (stage === 'Final') {
+  if (category.kind === 'locked') {
+    // Locked stages: iterate is refused; approve advances to the
+    // declared next linear stage. Block / induct / cancel still
+    // surface in the menu so the operator can pause / reroute /
+    // abandon a locked artifact.
     return {
       inline: [approve, scrapbook],
       drawer: [approve, cancel, scrapbook],
       menu: [approve, block, induct, cancel, scrapbook],
     };
   }
-  if (stage === 'Blocked' || stage === 'Cancelled') {
+  if (category.kind === 'offPipeline') {
     return {
       inline: [inductForward, scrapbook],
       drawer: [inductForward, scrapbook],
       menu: [inductForward, scrapbook],
     };
   }
-  if (stage === 'Published') {
-    // Frozen artifact; view + scrapbook only.
-    return {
-      inline: [view, scrapbook],
-      drawer: [view, scrapbook],
-      menu: [view, scrapbook],
-    };
-  }
-  // Exhaustiveness check — if the Stage union gains a new variant, the
-  // assertion will fail at typecheck time and at runtime so we don't
-  // silently fall through to an empty verb set.
-  const _exhaustive: never = stage;
-  throw new Error(`verbsForStage: unhandled stage "${String(_exhaustive)}"`);
+  // terminal — frozen artifact; view + scrapbook only.
+  return {
+    inline: [view, scrapbook],
+    drawer: [view, scrapbook],
+    menu: [view, scrapbook],
+  };
 }
 
 function renderDrawerChip(verb: Verb): string {
@@ -272,14 +364,20 @@ function renderMenuItem(verb: Verb): string {
  * Group menu items per the mockup's visual rhythm:
  *   primary verbs · divider · secondary (block / induct) · divider · off-pipeline
  *
- * For Blocked/Cancelled/Published the menu is short enough to skip dividers.
+ * Short menus (off-pipeline OR terminal-frozen) skip dividers — the menu
+ * holds at most two items there.
  */
-function renderMenu(stage: Stage, menu: readonly Verb[]): string {
-  const isShort = stage === 'Blocked' || stage === 'Cancelled' || stage === 'Published';
+function renderMenu(
+  stage: string,
+  template: StrictPipelineTemplate,
+  menu: readonly Verb[],
+): string {
+  const category = classifyStage(stage, template);
+  const isShort = category.kind === 'offPipeline' || category.kind === 'terminal';
   if (isShort) {
     return menu.map(renderMenuItem).join('');
   }
-  // Active + Final use grouped layout.
+  // Active linear + locked use grouped layout.
   const primary: Verb[] = [];
   const secondary: Verb[] = [];
   const tail: Verb[] = [];
@@ -318,17 +416,16 @@ function renderMenu(stage: Stage, menu: readonly Verb[]): string {
  * correct outer layout (drawer is sibling of `.er-row-fg`; menu is sibling
  * of `.er-row-fg`).
  */
-export function renderRowActions(entry: Entry, defaultSite: string): RawHtml {
-  // Per AUDIT-20260528-01: gate the editorial-vocabulary verb chips
-  // on the legacy `Stage` union. Non-editorial entries render no
-  // verb chips here; the swimlane shell's dispatch (swimlane-shell.
-  // ts:247) routes them to `renderEntryCard` so they still appear
-  // on the page. Phase 5 Task 5.2 generalises this via a template-
-  // aware verb resolver — at which point this guard retires.
-  if (!isLegacyEditorialStage(entry.currentStage)) {
-    return unsafe('');
-  }
-  const { inline } = verbsForStage(entry.currentStage, entry, defaultSite);
+export function renderRowActions(
+  entry: Entry,
+  template: StrictPipelineTemplate,
+  defaultSite: string,
+): RawHtml {
+  // Per Phase 5 Task 5.2: the template-aware verb dispatch covers
+  // every pipeline template's stage vocabulary. Every entry's row
+  // now receives the verb-chip chrome — Commandment II ensures verbs
+  // are universal across templates, gated only on stage position.
+  const { inline } = verbsForStage(entry.currentStage, template, entry, defaultSite);
   const chips = inline.map(renderInlineChip).join('');
   const overflow = html`<button type="button"
     class="er-row-overflow"
@@ -350,12 +447,12 @@ export function renderRowActions(entry: Entry, defaultSite: string): RawHtml {
  * row's trailing edge; hidden behind the foreground at-rest. Revealed by
  * the foreground translating left on swipe.
  */
-export function renderRowDrawer(entry: Entry, defaultSite: string): RawHtml {
-  // See `renderRowActions` for the AUDIT-20260528-01 rationale.
-  if (!isLegacyEditorialStage(entry.currentStage)) {
-    return unsafe('');
-  }
-  const { drawer } = verbsForStage(entry.currentStage, entry, defaultSite);
+export function renderRowDrawer(
+  entry: Entry,
+  template: StrictPipelineTemplate,
+  defaultSite: string,
+): RawHtml {
+  const { drawer } = verbsForStage(entry.currentStage, template, entry, defaultSite);
   return unsafe(html`<div class="er-row-drawer" aria-hidden="true">${unsafe(drawer.map(renderDrawerChip).join(''))}</div>`);
 }
 
@@ -363,11 +460,16 @@ export function renderRowDrawer(entry: Entry, defaultSite: string): RawHtml {
  * Menu popover rendered as a sibling of `.er-row-fg`. Hidden by default
  * (the controller flips `hidden` + `aria-expanded` on the overflow button).
  */
-export function renderRowMenu(entry: Entry, defaultSite: string): RawHtml {
-  // See `renderRowActions` for the AUDIT-20260528-01 rationale.
-  if (!isLegacyEditorialStage(entry.currentStage)) {
-    return unsafe('');
-  }
-  const { menu } = verbsForStage(entry.currentStage, entry, defaultSite);
-  return unsafe(html`<div class="er-row-menu" role="menu" hidden>${unsafe(renderMenu(entry.currentStage, menu))}</div>`);
+export function renderRowMenu(
+  entry: Entry,
+  template: StrictPipelineTemplate,
+  defaultSite: string,
+): RawHtml {
+  const { menu } = verbsForStage(entry.currentStage, template, entry, defaultSite);
+  return unsafe(html`<div class="er-row-menu" role="menu" hidden>${unsafe(renderMenu(entry.currentStage, template, menu))}</div>`);
 }
+
+// Exported for tests + downstream renderers that need to compose verb
+// vocabularies directly (Phase 5 Task 5.2 test suite covers each
+// template's locked / terminal / off-pipeline / active-linear shape).
+export { verbsForStage, classifyStage };
diff --git a/packages/studio/src/pages/dashboard/legacy-stage.ts b/packages/studio/src/pages/dashboard/legacy-stage.ts
index 843c8c6..9bd97a2 100644
--- a/packages/studio/src/pages/dashboard/legacy-stage.ts
+++ b/packages/studio/src/pages/dashboard/legacy-stage.ts
@@ -1,32 +1,18 @@
 /**
- * Legacy editorial-stage type guard for the dashboard render path.
+ * Legacy editorial-stage type guard.
  *
  * Phase 3 widened `Entry.currentStage` from the eight-stage `Stage`
  * union to an arbitrary non-empty string (lane-template-driven —
- * `packages/core/src/schema/entry.ts:164`). The dashboard's verb-chip
- * rendering helpers (`affordances.ts:verbsForStage` /
- * `affordances.ts:renderMenu`) still operate on the legacy `Stage`
- * union because the verb vocabulary they emit is the editorial
- * vocabulary specifically — iterate / approve / block / induct /
- * cancel / view / scrapbook. Non-editorial templates' verb
- * vocabularies become available through the template-aware verb
- * resolver landing in Phase 5 Task 5.2 (per
- * `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md`).
+ * `packages/core/src/schema/entry.ts:164`). Phase 5 Task 5.2 lifted
+ * the dashboard's verb-chip render paths to be template-aware, so
+ * the swimlane renderer no longer consults this guard.
  *
- * Until that task lands, the safe behaviour at the verb-chip call
- * sites is: emit chips for entries whose `currentStage` is one of
- * the eight legacy editorial stages, and emit no chips for entries
- * outside that vocabulary (so non-editorial entries surface as
- * compact cards via `swimlane-entry-card.ts:renderEntryCard` —
- * already the existing dispatch in `swimlane-shell.ts:247`). The
- * guard below is the boundary check that narrows
- * `entry.currentStage: string` to the `Stage` union the dashboard's
- * editorial-vocabulary helpers expect.
- *
- * Per project rule "No fallbacks or mock data": this is not a
- * fallback — non-editorial-vocabulary entries already have a
- * separate, correct render path (the compact card). The guard
- * routes correctly; it doesn't substitute a degraded experience.
+ * The guard remains used by `dashboard/data.ts:bucketize` to populate
+ * the legacy `byStage` map (the eight-stage union read view kept for
+ * back-compat with v7 ordering tests + the eight-stage section
+ * renderer for Shortform / Adjacent siblings). Non-editorial entries
+ * are skipped in that map; their per-lane bucketing in
+ * `loadLaneBuckets` is the authoritative routing.
  */
 
 import type { Stage } from '@deskwork/core/schema/entry';
diff --git a/packages/studio/src/pages/dashboard/section.ts b/packages/studio/src/pages/dashboard/section.ts
index d04c99b..0c74788 100644
--- a/packages/studio/src/pages/dashboard/section.ts
+++ b/packages/studio/src/pages/dashboard/section.ts
@@ -1,45 +1,16 @@
 /**
- * Single-stage section renderer.
+ * Row + Distribution-placeholder renderers for the dashboard.
  *
- * Each of the eight stage sections (plus the Distribution placeholder)
- * renders with a section heading (stage name + entry count) and either
- * a list of rows or an empty-state placeholder. Each row carries the
- * entry's slug, title, updated-at timestamp, and stage-gated verb
- * buttons. Per DESKWORK-STATE-MACHINE.md Commandment III, rows do NOT
- * surface iteration counts or reviewState — those were retired in
- * v0.19 along with the legacy reviewState concept.
- *
- * On mobile, each section is fronted by a collapsible tile (see
- * `renderStageTile`); on desktop the tiles are display:none and the
- * `<h2 class="er-section-head">` heading carries the stage name.
+ * Per DESKWORK-STATE-MACHINE.md Commandment III, rows do NOT surface
+ * iteration counts or reviewState — those were retired in v0.19 along
+ * with the legacy reviewState concept.
  */
 
 import { html, unsafe, type RawHtml } from '../html.ts';
-import type { Entry, Stage } from '@deskwork/core/schema/entry';
+import type { Entry } from '@deskwork/core/schema/entry';
+import type { StrictPipelineTemplate } from '@deskwork/core/pipelines';
 import { renderRowActions, renderRowDrawer, renderRowMenu } from './affordances.ts';
 
-const STAGE_ORNAMENTS: Record<Stage, string> = {
-  Ideas: '◇',
-  Planned: '§',
-  Outlining: '⊹',
-  Drafting: '✎',
-  Final: '※',
-  Published: '✓',
-  Blocked: '⊘',
-  Cancelled: '✗',
-};
-
-const STAGE_EMPTY_MESSAGES: Record<Stage, string> = {
-  Ideas: 'No open ideas. Run /deskwork:add to capture one.',
-  Planned: 'Nothing planned. /deskwork:approve <slug> to graduate an idea.',
-  Outlining: 'Nothing in outlining.',
-  Drafting: 'No posts in drafting.',
-  Final: 'Nothing in final review.',
-  Published: 'No published posts yet.',
-  Blocked: 'Nothing blocked.',
-  Cancelled: 'No cancelled entries.',
-};
-
 /**
  * Render one entry as a single dashboard row. Carries inline:
  *   - slug (linked to the review surface)
@@ -53,7 +24,12 @@ const STAGE_EMPTY_MESSAGES: Record<Stage, string> = {
  * revisions only via the View History surface and revert flows.
  * reviewState badges are likewise retired (Commandment III).
  */
-export function renderRow(entry: Entry, index: number, defaultSite: string): RawHtml {
+export function renderRow(
+  entry: Entry,
+  index: number,
+  template: StrictPipelineTemplate,
+  defaultSite: string,
+): RawHtml {
   const reviewLink = `/dev/editorial-review/entry/${entry.uuid}`;
   const search = [entry.slug, entry.title, entry.keywords.join(' ')].join(' ').toLowerCase();
   // Hierarchical entries (slugs containing `/`) get a visual indent
@@ -86,7 +62,7 @@ export function renderRow(entry: Entry, index: number, defaultSite: string): Raw
     <div class="er-row-shell" data-row-shell data-search="${search}"${depthAttrs}
       data-stage="${entry.currentStage}"
       data-uuid="${entry.uuid}" data-slug="${entry.slug}">
-      ${renderRowDrawer(entry, defaultSite)}
+      ${renderRowDrawer(entry, template, defaultSite)}
       <div class="er-row-fg er-calendar-row">
         <span class="er-row-num">№ ${String(index + 1).padStart(2, '0')}</span>
         <div class="er-calendar-body">
@@ -97,106 +73,9 @@ export function renderRow(entry: Entry, index: number, defaultSite: string): Raw
             datetime="${entry.updatedAt}" title="${entry.updatedAt}">${formatDate(entry.updatedAt)}</time>
         </div>
         <span class="er-calendar-status" aria-hidden="true"></span>
-        ${renderRowActions(entry, defaultSite)}
+        ${renderRowActions(entry, template, defaultSite)}
       </div>
-      ${renderRowMenu(entry, defaultSite)}
-    </div>`);
-}
-
-/**
- * Render the stage tile (mobile-only collapsible head). Hidden on desktop
- * via dashboard-mobile.css; the existing `<h2 class="er-section-head">`
- * carries the head on desktop and is hidden at <=600px so the tile takes
- * over.
- *
- * Empty stages render the same tile shape but with `is-empty` styling and
- * `disabled` so taps are no-ops (operator can still SEE the empty stage
- * in the pipeline shape — they just can't drill in to nothing).
- *
- * Review-state sub-counts (e.g. "5 · 3 in review") were removed in v0.19
- * per operator: review state isn't user-facing data and is slated for
- * backend removal; the tile shows total entry count only.
- */
-function renderStageTile(stage: Stage, count: number): RawHtml {
-  const isEmpty = count === 0;
-  const classes = isEmpty ? 'er-stage-tile is-empty' : 'er-stage-tile';
-  const disabledAttr = isEmpty ? ' disabled' : '';
-  // v7 architecture (Step 2.2.9): `data-stage-section-group="longform"`
-  // partitions single-expand state so the longform pipeline and the
-  // shortform-by-platform section operate independently. The client
-  // controller in `dashboard/stage-tiles.ts` reads this attribute to
-  // collapse only siblings in the same group when a tile is opened.
-  return unsafe(html`
-    <button class="${classes}" type="button"
-      data-stage-tile="${stage}"
-      data-stage-section-group="longform"
-      aria-expanded="false"
-      aria-controls="stage-${stage.toLowerCase()}"${unsafe(disabledAttr)}>
-      <span class="er-stage-tile-glyph" aria-hidden="true">${STAGE_ORNAMENTS[stage]}</span>
-      <span class="er-stage-tile-name">${stage}</span>
-      <span class="er-stage-tile-count"><span class="num">${count}</span></span>
-      <span class="er-stage-tile-chev" aria-hidden="true">›</span>
-    </button>`);
-}
-
-/**
- * Render one full stage section: heading + ornaments + count + rows.
- *
- * The output is wrapped in a `.er-stage-block` div that pairs a mobile-
- * only stage tile (the collapsible head) with the existing section. On
- * desktop, the tile is `display: none` and the section's `<h2>` head
- * carries the heading as before. On mobile, the section's head is hidden
- * and the tile is shown; tapping the tile toggles a `data-collapsed`
- * attribute on the section that hides/shows its rows. Single-expand
- * (tapping one tile collapses the others) is handled by
- * `dashboard/stage-tiles.ts`.
- *
- * Empty stages still render their tile (so the pipeline shape is visible
- * at-rest on phone) but the empty section body itself is hidden on mobile.
- *
- * Empty stages on desktop render compact (just the heading, no placeholder
- * body) — keeps the operator's sense of pipeline shape without padding
- * the dashboard with multi-line empty placeholders for low-volume
- * calendars (#112). The hover title still surfaces the stage's
- * "what to run next" hint when the operator points at the heading.
- */
-export function renderStageSection(
-  stage: Stage,
-  entries: readonly Entry[],
-  defaultSite: string,
-): RawHtml {
-  const tile = renderStageTile(stage, entries.length);
-
-  if (entries.length === 0) {
-    return unsafe(html`
-      <div class="er-stage-block" data-stage-block="${stage}">
-        ${tile}
-        <section class="er-section er-section--empty"
-          id="stage-${stage.toLowerCase()}" data-stage-section="${stage}"
-          data-empty-stage="${stage}">
-          <h2 class="er-section-head er-section-head--empty"
-            title="${STAGE_EMPTY_MESSAGES[stage]}">
-            <span>${stage}</span>
-            <span class="ornament">${STAGE_ORNAMENTS[stage]}</span>
-            <span class="count">№ 00</span>
-          </h2>
-        </section>
-      </div>`);
-  }
-
-  const body = unsafe(entries.map((e, i) => renderRow(e, i, defaultSite).__raw).join(''));
-
-  return unsafe(html`
-    <div class="er-stage-block" data-stage-block="${stage}">
-      ${tile}
-      <section class="er-section" id="stage-${stage.toLowerCase()}" data-stage-section="${stage}">
-        <h2 class="er-section-head">
-          <span>${stage}</span>
-          <span class="ornament">${STAGE_ORNAMENTS[stage]}</span>
-          <span class="count">№ ${entries.length}</span>
-        </h2>
-        ${body}
-      </section>
+      ${renderRowMenu(entry, template, defaultSite)}
     </div>`);
 }
 
diff --git a/packages/studio/src/pages/dashboard/swimlane-card.ts b/packages/studio/src/pages/dashboard/swimlane-card.ts
index 895c914..24e565f 100644
--- a/packages/studio/src/pages/dashboard/swimlane-card.ts
+++ b/packages/studio/src/pages/dashboard/swimlane-card.ts
@@ -1,7 +1,8 @@
 /**
  * Per-lane swimlane card renderer for the multi-lane dashboard
  * (Phase 5 Task 5.1 + Task 5.1A — per-lane collapse + Task 5.1B —
- * per-lane kanban ↔ list view toggle).
+ * per-lane kanban ↔ list view toggle + Task 5.2 — template-aware
+ * stage rendering + empty-lane CTA).
  *
  * Renders:
  *   - `renderSwimlane`: the full `<article class="swim">` for a
@@ -24,16 +25,25 @@
  *     `.swim.view-list`. The server default is kanban; the client
  *     controller post-DOMContentLoaded applies viewport-default
  *     (mobile→list) + per-lane localStorage override.
+ *     Task 5.2 adds an empty-lane CTA — `.swim-empty-cta` renders
+ *     in the swim body when `bucket.entryCount === 0`, between the
+ *     swim-head and the compact strip. The CTA clipboard-copies
+ *     `/deskwork:add --lane <laneId>` (no slug placeholder, no
+ *     stage flag) — a wider invocation than the per-lane Compose
+ *     chip's `+ new` shortcut, intended as the first-entry on-ramp
+ *     for an empty lane.
  *   - `renderSwimStub`: the compact `<button class="swim-stub">`
  *     emitted alongside the swim for visibility-on lanes. CSS picks
  *     which one shows via `.is-focus-hidden`.
  *   - `renderStageCol`: per-stage kanban column with lane-scoped
  *     DOM ID, back-compat anchors for the default editorial lane,
- *     locked-stage / off-pipeline modifiers, and the dispatch
- *     between the editorial verb-chip row and the lighter
- *     `renderEntryCard` for non-editorial stages. The stage-head now
- *     carries a per-stage `<button class="collapse-chev">` mirroring
- *     the lane-level chevron's contract (same a11y primitives,
+ *     locked-stage / off-pipeline modifiers. Task 5.2 lifts the
+ *     prior `isLegacyEditorialStage` dispatch — every entry now
+ *     renders via the template-aware `renderRow` (Commandment II:
+ *     verbs are universal across templates, gated only on stage
+ *     position within the lane's pipeline). The stage-head carries
+ *     a per-stage `<button class="collapse-chev">` mirroring the
+ *     lane-level chevron's contract (same a11y primitives,
  *     `data-collapse-target="stage"` for the client dispatcher).
  *   - `renderSwimCompact`: the compact per-stage strip rendered
  *     inside every swim; CSS reveals it when the lane is
@@ -48,25 +58,36 @@
  *     trip. Per THESIS Consequence 2 / DESKWORK-STATE-MACHINE.md
  *     Commandment II — the chip is a clipboard convenience, not a
  *     verb; it never mutates sidecar state.
+ *   - `renderEmptyLaneCta`: per-lane "Create your first entry" CTA
+ *     (Task 5.2). Sibling affordance to the Compose chip — wider
+ *     copy + larger hit target, surfaced only on empty lanes. Per
+ *     `affordance-placement.md` — lives ON the empty lane's swim
+ *     body, not in any toolbar. Per THESIS Consequence 2 — clipboard
+ *     only; no sidecar mutation.
  */
 
 import { html, unsafe, type RawHtml } from '../html.ts';
 import { renderRow } from './section.ts';
 import { stageGlyph, GLYPH_OFF } from './swimlane-stage-glyph.ts';
 import { laneGlyph } from './lane-glyph.ts';
-import { renderEntryCard } from './swimlane-entry-card.ts';
 import { renderListBody } from './swimlane-list-body.ts';
-import { isLegacyEditorialStage } from './legacy-stage.ts';
 import type { LaneBucket } from './lane-data.ts';
 import type { LaneRailRow } from './swimlane-rail.ts';
 import type { Entry } from '@deskwork/core/schema/entry';
+import type { StrictPipelineTemplate } from '@deskwork/core/pipelines';
 
 /**
- * Empty-state placeholder copy. The editorial stages get the
- * pre-Task-5.1 strings verbatim (the dashboard.test.ts assertions
- * pin specific phrasings); other stages get a neutral message.
+ * Editorial-template empty-state strings. The pre-Task-5.1 dashboard
+ * tests pin these verbatim phrasings ("Run /deskwork:add to capture
+ * one.", "/deskwork:approve <slug> to graduate an idea.", etc.) and
+ * the strings name the editorial verb vocabulary explicitly.
+ *
+ * Per Task 5.2: this map is scoped to the editorial template only.
+ * Non-editorial lanes fall through to the neutral `Nothing in
+ * ${stage.toLowerCase()}.` so the editorial verb vocabulary does
+ * not leak into other templates' empty-state copy.
  */
-const STAGE_EMPTY_HINTS: Record<string, string> = {
+const EDITORIAL_STAGE_EMPTY_HINTS: Record<string, string> = {
   Ideas: 'No open ideas. Run /deskwork:add to capture one.',
   Planned: 'Nothing planned. /deskwork:approve <slug> to graduate an idea.',
   Outlining: 'Nothing in outlining.',
@@ -77,8 +98,18 @@ const STAGE_EMPTY_HINTS: Record<string, string> = {
   Cancelled: 'No cancelled entries.',
 };
 
-function stageEmptyHint(stage: string): string {
-  return STAGE_EMPTY_HINTS[stage] ?? `Nothing in ${stage.toLowerCase()}.`;
+/**
+ * Editorial-specific copy for the editorial template; generic
+ * "Nothing in ${stage}." for any other template. The dispatch is
+ * template-id-gated so each pipeline's empty-state vocabulary
+ * tracks its own pipeline copy.
+ */
+function stageEmptyHint(stage: string, templateId: string): string {
+  if (templateId === 'editorial') {
+    const editorial = EDITORIAL_STAGE_EMPTY_HINTS[stage];
+    if (editorial !== undefined) return editorial;
+  }
+  return `Nothing in ${stage.toLowerCase()}.`;
 }
 
 /**
@@ -111,6 +142,7 @@ function stageEmptyHint(stage: string): string {
  */
 function renderStageCol(
   laneId: string,
+  template: StrictPipelineTemplate,
   stage: string,
   entries: readonly Entry[],
   defaultSite: string,
@@ -142,28 +174,23 @@ function renderStageCol(
   const legacyAnchor = laneId === 'default'
     ? unsafe(`<span id="stage-${stageIdSlug}" aria-hidden="true"></span>`)
     : '';
-  const emptyHint = stageEmptyHint(stage);
+  const emptyHint = stageEmptyHint(stage, template.id);
   const emptyAttrs = entries.length === 0
     ? unsafe(html` data-empty-stage="${stage}"`)
     : '';
 
-  // Stage-vocabulary-driven dispatch: editorial-pipeline stages get
-  // the full dashboard row chrome (renderRow → verbsForStage chain).
-  // Non-editorial stages render as compact cards so the operator
-  // still sees the entry on the page. Task 5.2 generalises
-  // verbsForStage by template and removes this dispatch. The guard
-  // here uses the single project-wide editorial-stage guard
-  // `isLegacyEditorialStage` (`./legacy-stage.ts`) — no local copy.
+  // Per Phase 5 Task 5.2: the prior `isLegacyEditorialStage`
+  // dispatch is lifted. The template-aware `verbsForStage` (via
+  // `renderRow → renderRowActions / renderRowDrawer / renderRow
+  // Menu`) handles every pipeline template's stage vocabulary
+  // uniformly — Commandment II's "verbs are universal" contract.
+  // Every entry now gets the verb-chip row regardless of its lane's
+  // template.
   const body = entries.length === 0
     ? unsafe(html`<div class="empty-state" data-empty-stage-msg>${emptyHint}</div>`)
     : unsafe(
       entries
-        .map((e, i) => {
-          if (isLegacyEditorialStage(e.currentStage)) {
-            return renderRow(e, i, defaultSite).__raw;
-          }
-          return renderEntryCard(e, defaultSite).__raw;
-        })
+        .map((e, i) => renderRow(e, i, template, defaultSite).__raw)
         .join(''),
     );
 
@@ -270,6 +297,50 @@ export function renderComposeChip(
     </button>`);
 }
 
+/**
+ * Per-lane empty-lane CTA (Task 5.2 Step 5.2.2). Rendered only
+ * when `bucket.entryCount === 0` — the prominent "create your
+ * first entry" affordance an operator sees the first time they
+ * open a freshly-configured lane.
+ *
+ * Sibling to the per-lane `.swim-compose` chip (Task 5.1C) but
+ * with a DIFFERENT clipboard payload:
+ *
+ *   - `.swim-compose` chip → `/deskwork:add <SLUG> --lane <id>
+ *     --stage <first-stage>` (the operator already knows what
+ *     they're composing; the chip carries an explicit destination
+ *     stage to skip).
+ *   - `.swim-empty-cta` button → `/deskwork:add --lane <id>` (no
+ *     `<SLUG>` placeholder, no `--stage` flag — the operator's
+ *     first invocation in this lane; the add skill prompts for
+ *     slug + content as part of its normal flow).
+ *
+ * Per THESIS Consequence 2 and DESKWORK-STATE-MACHINE.md Commandment
+ * II — clipboard only; no sidecar mutation, no network round trip.
+ *
+ * Per `affordance-placement.md` — the CTA lives ON the empty lane's
+ * swim body (between `.swim-head` and `.swim-compact`), not in any
+ * toolbar. Mirrors the `.er-outline-tab` precedent of attaching
+ * affordances ON the component they affect.
+ */
+export function renderEmptyLaneCta(
+  laneId: string,
+  laneName: string,
+): RawHtml {
+  return unsafe(html`
+    <div class="swim-empty-cta" data-swim-empty-cta>
+      <p class="sec-msg">Create your first entry in this lane.</p>
+      <button class="sec-cta" type="button"
+        aria-label="Compose first entry in ${laneName}"
+        data-swim-empty-copy
+        data-lane-id="${laneId}">
+        <span class="sec-icon" aria-hidden="true">+</span>
+        <span class="sec-label">Create your first entry</span>
+      </button>
+      <p class="sec-hint">copies <code>/deskwork:add --lane ${laneId}</code> to your clipboard</p>
+    </div>`);
+}
+
 function renderSwimCompact(bucket: LaneBucket): RawHtml {
   const stages: string[] = [
     ...bucket.template.linearStages,
@@ -307,6 +378,7 @@ export function renderSwimlane(
     ...template.linearStages.map((stage) =>
       renderStageCol(
         lane.id,
+        template,
         stage,
         bucket.byStage.get(stage) ?? [],
         defaultSite,
@@ -318,6 +390,7 @@ export function renderSwimlane(
     ...template.offPipelineStages.map((stage) =>
       renderStageCol(
         lane.id,
+        template,
         stage,
         bucket.byStage.get(stage) ?? [],
         defaultSite,
@@ -384,6 +457,7 @@ export function renderSwimlane(
           data-lane-id="${lane.id}"
           data-lane-name="${lane.name}">▾</button>
       </div>
+      ${bucket.entryCount === 0 ? renderEmptyLaneCta(lane.id, lane.name) : unsafe('')}
       ${renderSwimCompact(bucket)}
       <div class="stage-grid" data-stage-grid>${unsafe(stagesRaw)}</div>
       ${renderListBody(bucket, defaultSite)}
diff --git a/packages/studio/src/pages/dashboard/swimlane-entry-card.ts b/packages/studio/src/pages/dashboard/swimlane-entry-card.ts
deleted file mode 100644
index a454350..0000000
--- a/packages/studio/src/pages/dashboard/swimlane-entry-card.ts
+++ /dev/null
@@ -1,47 +0,0 @@
-/**
- * Lighter entry-card markup for the multi-lane swimlane dashboard's
- * per-stage columns.
- *
- * The editorial verb-chip helpers (`renderRow`, `verbsForStage`)
- * predate the multi-template work and only handle the eight
- * editorial stages. An entry in a visual or qa-plan lane whose
- * `currentStage` is a non-editorial name (Sketched, Iterating,
- * Drafted, Reviewed, Tested, etc.) has no inline-chip semantics
- * under the current verb-chip helpers, so the column renders it
- * as a lighter `.card` form that preserves the data attributes
- * existing tests + future affordance work depend on.
- *
- * Task 5.2 generalises verbsForStage by template; the card form is
- * additive markup so 5.2 can add verb chrome to it without rewriting
- * the column renderer.
- *
- * Stage-vocabulary dispatch (editorial vs other) is delegated to the
- * single project-wide type guard `isLegacyEditorialStage` in
- * `./legacy-stage.ts`. This module intentionally does NOT export its
- * own duplicate vocabulary list.
- */
-
-import { html, unsafe, type RawHtml } from '../html.ts';
-import { entryRowLinkMeta } from './entry-link-meta.ts';
-import type { Entry } from '@deskwork/core/schema/entry';
-
-/**
- * Render a lighter card for an entry whose stage vocabulary isn't
- * the editorial set. Preserves the data-* attributes existing
- * tests + future affordance work depend on. The card lives inside
- * its stage column; clicking it opens the entry's review surface
- * (the same target as the dashboard row's slug link).
- */
-export function renderEntryCard(entry: Entry, defaultSite: string): RawHtml {
-  void defaultSite;
-  const { reviewLink, search } = entryRowLinkMeta(entry);
-  return unsafe(html`
-    <a class="card" href="${reviewLink}"
-      data-row-shell data-search="${search}"
-      data-stage="${entry.currentStage}"
-      data-uuid="${entry.uuid}" data-slug="${entry.slug}"
-      title="open the review surface">
-      <span class="card-title">${entry.title}</span>
-      <span class="e-meta">${entry.slug}</span>
-    </a>`);
-}
diff --git a/packages/studio/src/pages/dashboard/swimlane-shell.ts b/packages/studio/src/pages/dashboard/swimlane-shell.ts
index 4bd8896..51335d3 100644
--- a/packages/studio/src/pages/dashboard/swimlane-shell.ts
+++ b/packages/studio/src/pages/dashboard/swimlane-shell.ts
@@ -178,6 +178,21 @@ export function renderSwimlanesShell(input: SwimlaneShellInput): RawHtml {
   const railRaw = renderRail(laneRows, laneIds.length).__raw;
   const focusStripRaw = renderFocusStrip(laneRows, allActive).__raw;
 
+  // Task 5.3.3 mobile sheet container: wraps the rail so CSS can
+  // reposition the whole assembly as a slide-up sheet at narrow
+  // widths. The container also houses a backdrop sibling the client
+  // controller binds for tap-to-dismiss. Desktop CSS leaves the rail
+  // in its original left-column position; mobile CSS hides the rail
+  // until the `.lane-sheet-trigger` toggles `.is-open` on the
+  // container.
+  const sheetContainerOpen
+    = '<div class="lane-sheet-container" id="lane-sheet" data-lane-sheet>';
+  const sheetBackdrop
+    = '<div class="lane-sheet-backdrop" data-lane-sheet-backdrop aria-hidden="true"></div>';
+  const sheetContainerClose = '</div>';
+  const wrappedRailRaw
+    = sheetContainerOpen + sheetBackdrop + railRaw + sheetContainerClose;
+
   // Per AUDIT-20260528-02: render BOTH the swimlane and the stub for
   // every visibility-on lane so the client's focus toggle has both
   // DOM nodes to swap between. The CSS rule
@@ -212,16 +227,29 @@ export function renderSwimlanesShell(input: SwimlaneShellInput): RawHtml {
       : `${input.lanes.unroutedEntries.length} unrouted · `;
   const metaRaw = `${filteredBadge}${focused.size} of ${laneIds.length} lanes shown · ${unroutedPart}${countTotal(lanes)} entries`;
 
+  // Task 5.3.3: the mobile "Lanes ▾" trigger lives in the bay-head's
+  // top row (per `.claude/rules/affordance-placement.md` — the rail
+  // is a bay-level concern, so its discoverability affordance lives
+  // on the bay-head, not on the page-level masthead). Renders
+  // unconditionally; desktop CSS hides it via `display: none` inside
+  // the > 720px scope.
+  const sheetTriggerRaw
+    = '<button class="lane-sheet-trigger" type="button"'
+    + ' data-lane-sheet-trigger aria-expanded="false"'
+    + ' aria-controls="lane-sheet"'
+    + ' aria-label="Show lane visibility sheet">Lanes &#x25BE;</button>';
+
   return unsafe(html`
     <section class="bay-shell" data-bay-shell
       data-project-key="${projectKey}"
       data-focus-url-driven="${urlDriven ? 'true' : 'false'}">
-      ${unsafe(railRaw)}
+      ${unsafe(wrappedRailRaw)}
       <main class="bay" data-bay>
         <div class="bay-head">
           <div class="bh-row-1">
             <span>The Press Bay</span>
             <span class="bh-meta">${unsafe(metaRaw)}</span>
+            ${unsafe(sheetTriggerRaw)}
           </div>
           ${unsafe(focusStripRaw)}
         </div>
diff --git a/packages/studio/test/dashboard-affordances-template.test.ts b/packages/studio/test/dashboard-affordances-template.test.ts
new file mode 100644
index 0000000..0bfaa4c
--- /dev/null
+++ b/packages/studio/test/dashboard-affordances-template.test.ts
@@ -0,0 +1,437 @@
+/**
+ * Template-aware verb dispatch tests — Phase 5 Task 5.2 Step 5.2.1.
+ *
+ * The `verbsForStage` resolver in `packages/studio/src/pages/
+ * dashboard/affordances.ts` now categorizes a stage against its
+ * pipeline template (linearStages / lockedStages / offPipelineStages
+ * / terminal position) and emits the verb set for that category. The
+ * tests below pin one example per category per template:
+ *
+ *   - Off-pipeline (Blocked / Cancelled / Archived) — inductForward
+ *     + scrapbook only.
+ *   - Terminal (last linearStages member) — view + scrapbook only.
+ *   - Locked — approve (labeled `Approve → <nextLinearStage>`) +
+ *     scrapbook; menu carries block + induct + cancel.
+ *   - Active linear — iterate + approve + scrapbook; menu carries
+ *     block + induct + cancel.
+ *
+ * Per DESKWORK-STATE-MACHINE.md Commandment II, verbs are universal
+ * and stage-gated — the categorization is what differs across
+ * templates, not the verb set itself. The renderer emits the same
+ * `/deskwork:<verb> <slug>` slash commands regardless of template.
+ */
+
+import { describe, it, expect } from 'vitest';
+import { mkdtempSync, rmSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import {
+  verbsForStage,
+  classifyStage,
+  renderRowActions,
+  renderRowDrawer,
+  renderRowMenu,
+} from '../src/pages/dashboard/affordances.ts';
+import { loadPipelineTemplate } from '@deskwork/core/pipelines';
+import type { StrictPipelineTemplate } from '@deskwork/core/pipelines';
+import type { Entry } from '@deskwork/core/schema/entry';
+
+// Resolve every template via the public loader against an empty
+// projectRoot — the loader falls through to the plugin-built-in
+// presets in `packages/core/src/pipelines/*.json`. No fixture-disk
+// JSON authoring required.
+const tmpRoot = mkdtempSync(join(tmpdir(), 'dw-affordances-tests-'));
+const editorial: StrictPipelineTemplate = loadPipelineTemplate('editorial', tmpRoot);
+const visual: StrictPipelineTemplate = loadPipelineTemplate('visual', tmpRoot);
+const featureDoc: StrictPipelineTemplate = loadPipelineTemplate(
+  'feature-doc',
+  tmpRoot,
+);
+const qaPlan: StrictPipelineTemplate = loadPipelineTemplate('qa-plan', tmpRoot);
+const blogPost: StrictPipelineTemplate = loadPipelineTemplate('blog-post', tmpRoot);
+
+// Vitest's per-file lifecycle — tear the tmp root down after every
+// test in this file has resolved its templates above. Templates are
+// loaded eagerly at module-load, so the cleanup at process-exit time
+// is the operator-side hygiene step rather than a test-side one.
+process.on('exit', () => {
+  try {
+    rmSync(tmpRoot, { recursive: true, force: true });
+  } catch {
+    // Process is exiting; suppressing cleanup failure is acceptable
+    // here per the existing in-repo `mkdtempSync` test pattern.
+  }
+});
+
+function makeEntry(stage: string, slug: string = 'x'): Entry {
+  return {
+    uuid: '550e8400-e29b-41d4-a716-446655440000',
+    slug,
+    title: 'X',
+    keywords: [],
+    source: 'manual',
+    currentStage: stage,
+    iterationByStage: {},
+    createdAt: '2026-05-28T10:00:00.000Z',
+    updatedAt: '2026-05-28T10:00:00.000Z',
+  };
+}
+
+const DEFAULT_SITE = 'd';
+
+describe('classifyStage — Task 5.2 template-aware dispatch', () => {
+  it('editorial Drafting → activeLinear', () => {
+    expect(classifyStage('Drafting', editorial)).toEqual({ kind: 'activeLinear' });
+  });
+
+  it('editorial Final → locked, next = Published', () => {
+    expect(classifyStage('Final', editorial)).toEqual({
+      kind: 'locked',
+      nextLinearStage: 'Published',
+    });
+  });
+
+  it('editorial Published → terminal', () => {
+    expect(classifyStage('Published', editorial)).toEqual({ kind: 'terminal' });
+  });
+
+  it('editorial Blocked → offPipeline', () => {
+    expect(classifyStage('Blocked', editorial)).toEqual({ kind: 'offPipeline' });
+  });
+
+  it('editorial Cancelled → offPipeline', () => {
+    expect(classifyStage('Cancelled', editorial)).toEqual({ kind: 'offPipeline' });
+  });
+
+  it('visual Sketched → activeLinear', () => {
+    expect(classifyStage('Sketched', visual)).toEqual({ kind: 'activeLinear' });
+  });
+
+  it('visual Approved → locked, next = Shipped', () => {
+    expect(classifyStage('Approved', visual)).toEqual({
+      kind: 'locked',
+      nextLinearStage: 'Shipped',
+    });
+  });
+
+  it('visual Shipped → terminal', () => {
+    expect(classifyStage('Shipped', visual)).toEqual({ kind: 'terminal' });
+  });
+
+  it('visual Blocked → offPipeline', () => {
+    expect(classifyStage('Blocked', visual)).toEqual({ kind: 'offPipeline' });
+  });
+
+  it('feature-doc Approved → locked, next = Implemented', () => {
+    expect(classifyStage('Approved', featureDoc)).toEqual({
+      kind: 'locked',
+      nextLinearStage: 'Implemented',
+    });
+  });
+
+  it('feature-doc Implemented → locked, next = Complete', () => {
+    expect(classifyStage('Implemented', featureDoc)).toEqual({
+      kind: 'locked',
+      nextLinearStage: 'Complete',
+    });
+  });
+
+  it('feature-doc Complete → terminal', () => {
+    expect(classifyStage('Complete', featureDoc)).toEqual({ kind: 'terminal' });
+  });
+
+  it('qa-plan Reviewed → locked, next = Tested', () => {
+    expect(classifyStage('Reviewed', qaPlan)).toEqual({
+      kind: 'locked',
+      nextLinearStage: 'Tested',
+    });
+  });
+
+  it('qa-plan Approved → terminal', () => {
+    expect(classifyStage('Approved', qaPlan)).toEqual({ kind: 'terminal' });
+  });
+
+  it('blog-post Edited → locked, next = Published', () => {
+    expect(classifyStage('Edited', blogPost)).toEqual({
+      kind: 'locked',
+      nextLinearStage: 'Published',
+    });
+  });
+
+  it('blog-post Published → terminal', () => {
+    expect(classifyStage('Published', blogPost)).toEqual({ kind: 'terminal' });
+  });
+
+  it('throws when stage is not in either linearStages or offPipelineStages', () => {
+    expect(() => classifyStage('NotAStage', editorial)).toThrow(
+      /not in template "editorial"/,
+    );
+  });
+});
+
+describe('verbsForStage — Task 5.2 active linear (iterate + approve + scrapbook)', () => {
+  it('editorial Drafting emits iterate + approve + scrapbook inline', () => {
+    const v = verbsForStage('Drafting', editorial, makeEntry('Drafting'), DEFAULT_SITE);
+    expect(v.inline.map((x) => x.kind)).toEqual(['iterate', 'approve', 'scrapbook']);
+    expect(v.menu.map((x) => x.kind)).toEqual([
+      'iterate',
+      'approve',
+      'block',
+      'induct',
+      'cancel',
+      'scrapbook',
+    ]);
+    expect(v.inline[1]?.label).toBe('Approve');
+  });
+
+  it('visual Sketched emits iterate + approve + scrapbook inline', () => {
+    const v = verbsForStage('Sketched', visual, makeEntry('Sketched'), DEFAULT_SITE);
+    expect(v.inline.map((x) => x.kind)).toEqual(['iterate', 'approve', 'scrapbook']);
+    expect(v.inline[1]?.label).toBe('Approve');
+  });
+
+  it('qa-plan Drafted emits iterate + approve + scrapbook inline', () => {
+    const v = verbsForStage('Drafted', qaPlan, makeEntry('Drafted'), DEFAULT_SITE);
+    expect(v.inline.map((x) => x.kind)).toEqual(['iterate', 'approve', 'scrapbook']);
+  });
+
+  it('feature-doc Drafting emits iterate + approve + scrapbook inline', () => {
+    const v = verbsForStage('Drafting', featureDoc, makeEntry('Drafting'), DEFAULT_SITE);
+    expect(v.inline.map((x) => x.kind)).toEqual(['iterate', 'approve', 'scrapbook']);
+    expect(v.inline[1]?.label).toBe('Approve');
+  });
+
+  it('blog-post Drafting emits iterate + approve + scrapbook inline', () => {
+    const v = verbsForStage('Drafting', blogPost, makeEntry('Drafting'), DEFAULT_SITE);
+    expect(v.inline.map((x) => x.kind)).toEqual(['iterate', 'approve', 'scrapbook']);
+    expect(v.inline[1]?.label).toBe('Approve');
+  });
+});
+
+describe('verbsForStage — Task 5.2 drawer-view invariants', () => {
+  // The mobile-swipe drawer set per category. Active linear surfaces
+  // iterate+approve+scrapbook (the top-N power-user verbs); locked
+  // surfaces approve+cancel+scrapbook (no iterate; explicit cancel
+  // escape); off-pipeline mirrors the inline set; terminal mirrors the
+  // inline view+scrapbook pair.
+
+  it('active linear drawer = iterate + approve + cancel + scrapbook', () => {
+    const v = verbsForStage('Drafting', editorial, makeEntry('Drafting'), DEFAULT_SITE);
+    expect(v.drawer.map((x) => x.kind)).toEqual([
+      'iterate',
+      'approve',
+      'cancel',
+      'scrapbook',
+    ]);
+  });
+
+  it('locked drawer = approve + cancel + scrapbook (no iterate)', () => {
+    const v = verbsForStage('Final', editorial, makeEntry('Final'), DEFAULT_SITE);
+    expect(v.drawer.map((x) => x.kind)).toEqual(['approve', 'cancel', 'scrapbook']);
+  });
+
+  it('off-pipeline drawer mirrors inline (induct + scrapbook)', () => {
+    const v = verbsForStage('Blocked', editorial, makeEntry('Blocked'), DEFAULT_SITE);
+    expect(v.drawer.map((x) => x.kind)).toEqual(v.inline.map((x) => x.kind));
+    expect(v.drawer.map((x) => x.kind)).toEqual(['induct', 'scrapbook']);
+  });
+
+  it('terminal drawer mirrors inline (view + scrapbook)', () => {
+    const v = verbsForStage('Published', editorial, makeEntry('Published'), DEFAULT_SITE);
+    expect(v.drawer.map((x) => x.kind)).toEqual(v.inline.map((x) => x.kind));
+    expect(v.drawer.map((x) => x.kind)).toEqual(['view', 'scrapbook']);
+  });
+});
+
+describe('verbsForStage — Task 5.2 locked stages (Approve → next)', () => {
+  it('editorial Final → "Approve → Published"', () => {
+    const v = verbsForStage('Final', editorial, makeEntry('Final'), DEFAULT_SITE);
+    expect(v.inline.map((x) => x.kind)).toEqual(['approve', 'scrapbook']);
+    expect(v.inline[0]?.label).toBe('Approve → Published');
+    expect(v.inline[0]?.copy).toContain('/deskwork:approve');
+    // iterate is refused — not in inline OR menu.
+    expect(v.menu.find((x) => x.kind === 'iterate')).toBeUndefined();
+  });
+
+  it('visual Approved → "Approve → Shipped"', () => {
+    const v = verbsForStage('Approved', visual, makeEntry('Approved'), DEFAULT_SITE);
+    expect(v.inline[0]?.label).toBe('Approve → Shipped');
+    expect(v.menu.find((x) => x.kind === 'iterate')).toBeUndefined();
+  });
+
+  it('feature-doc Approved → "Approve → Implemented"', () => {
+    const v = verbsForStage('Approved', featureDoc, makeEntry('Approved'), DEFAULT_SITE);
+    expect(v.inline[0]?.label).toBe('Approve → Implemented');
+  });
+
+  it('feature-doc Implemented → "Approve → Complete"', () => {
+    const v = verbsForStage(
+      'Implemented',
+      featureDoc,
+      makeEntry('Implemented'),
+      DEFAULT_SITE,
+    );
+    expect(v.inline[0]?.label).toBe('Approve → Complete');
+  });
+
+  it('qa-plan Reviewed → "Approve → Tested"', () => {
+    const v = verbsForStage('Reviewed', qaPlan, makeEntry('Reviewed'), DEFAULT_SITE);
+    expect(v.inline[0]?.label).toBe('Approve → Tested');
+  });
+
+  it('blog-post Edited → "Approve → Published"', () => {
+    const v = verbsForStage('Edited', blogPost, makeEntry('Edited'), DEFAULT_SITE);
+    expect(v.inline[0]?.label).toBe('Approve → Published');
+  });
+});
+
+describe('verbsForStage — Task 5.2 terminal (frozen artifact)', () => {
+  it('editorial Published — view + scrapbook only', () => {
+    const v = verbsForStage(
+      'Published',
+      editorial,
+      makeEntry('Published'),
+      DEFAULT_SITE,
+    );
+    expect(v.inline.map((x) => x.kind)).toEqual(['view', 'scrapbook']);
+    expect(v.menu.map((x) => x.kind)).toEqual(['view', 'scrapbook']);
+  });
+
+  it('visual Shipped — view + scrapbook only', () => {
+    const v = verbsForStage('Shipped', visual, makeEntry('Shipped'), DEFAULT_SITE);
+    expect(v.inline.map((x) => x.kind)).toEqual(['view', 'scrapbook']);
+  });
+
+  it('feature-doc Complete — view + scrapbook only', () => {
+    const v = verbsForStage('Complete', featureDoc, makeEntry('Complete'), DEFAULT_SITE);
+    expect(v.inline.map((x) => x.kind)).toEqual(['view', 'scrapbook']);
+  });
+
+  it('qa-plan Approved (terminal) — view + scrapbook only', () => {
+    const v = verbsForStage('Approved', qaPlan, makeEntry('Approved'), DEFAULT_SITE);
+    expect(v.inline.map((x) => x.kind)).toEqual(['view', 'scrapbook']);
+  });
+
+  it('blog-post Published — view + scrapbook only', () => {
+    const v = verbsForStage('Published', blogPost, makeEntry('Published'), DEFAULT_SITE);
+    expect(v.inline.map((x) => x.kind)).toEqual(['view', 'scrapbook']);
+  });
+});
+
+describe('verbsForStage — Task 5.2 off-pipeline (Blocked / Cancelled / Archived)', () => {
+  it('editorial Blocked — induct + scrapbook only', () => {
+    const v = verbsForStage('Blocked', editorial, makeEntry('Blocked'), DEFAULT_SITE);
+    expect(v.inline.map((x) => x.kind)).toEqual(['induct', 'scrapbook']);
+    expect(v.inline[0]?.label).toBe('Induct… (pick stage)');
+    expect(v.inline[0]?.title).toBe('bring this entry back into the pipeline');
+  });
+
+  it('editorial Cancelled — induct + scrapbook only', () => {
+    const v = verbsForStage('Cancelled', editorial, makeEntry('Cancelled'), DEFAULT_SITE);
+    expect(v.inline.map((x) => x.kind)).toEqual(['induct', 'scrapbook']);
+  });
+
+  it('visual Archived — induct + scrapbook only', () => {
+    const v = verbsForStage('Archived', visual, makeEntry('Archived'), DEFAULT_SITE);
+    expect(v.inline.map((x) => x.kind)).toEqual(['induct', 'scrapbook']);
+  });
+
+  it('qa-plan Archived — induct + scrapbook only', () => {
+    const v = verbsForStage('Archived', qaPlan, makeEntry('Archived'), DEFAULT_SITE);
+    expect(v.inline.map((x) => x.kind)).toEqual(['induct', 'scrapbook']);
+  });
+});
+
+describe('Commandment III — no review-state labels in template-aware row chrome', () => {
+  // Pinning Commandment III for the new template-aware verb-chip
+  // render path: an absence assertion on every rendered chrome
+  // ensures the next time someone tries to add a state badge (e.g.
+  // `er-stamp-iterating`, `IN REVIEW`, `ITERATING`) the test catches
+  // the regression before review.
+  const REVIEW_STATE_TOKENS = [
+    'er-stamp',
+    'IN REVIEW',
+    'ITERATING',
+    'reviewState',
+    'in-review',
+  ];
+
+  function assertNoReviewState(html: string, label: string): void {
+    for (const token of REVIEW_STATE_TOKENS) {
+      expect(html, `${label} must not contain review-state token "${token}"`)
+        .not.toContain(token);
+    }
+  }
+
+  it('editorial active-linear row chrome carries no review-state tokens', () => {
+    const e = makeEntry('Drafting');
+    assertNoReviewState(
+      renderRowActions(e, editorial, DEFAULT_SITE).__raw,
+      'editorial Drafting actions',
+    );
+    assertNoReviewState(
+      renderRowDrawer(e, editorial, DEFAULT_SITE).__raw,
+      'editorial Drafting drawer',
+    );
+    assertNoReviewState(
+      renderRowMenu(e, editorial, DEFAULT_SITE).__raw,
+      'editorial Drafting menu',
+    );
+  });
+
+  it('editorial locked + terminal row chrome carries no review-state tokens', () => {
+    for (const stage of ['Final', 'Published']) {
+      const e = makeEntry(stage);
+      assertNoReviewState(
+        renderRowActions(e, editorial, DEFAULT_SITE).__raw,
+        `editorial ${stage} actions`,
+      );
+      assertNoReviewState(
+        renderRowDrawer(e, editorial, DEFAULT_SITE).__raw,
+        `editorial ${stage} drawer`,
+      );
+      assertNoReviewState(
+        renderRowMenu(e, editorial, DEFAULT_SITE).__raw,
+        `editorial ${stage} menu`,
+      );
+    }
+  });
+
+  it('visual + qa-plan + feature-doc + blog-post row chrome carries no review-state tokens', () => {
+    const cases: Array<[StrictPipelineTemplate, string]> = [
+      [visual, 'Sketched'],
+      [visual, 'Approved'],
+      [visual, 'Shipped'],
+      [qaPlan, 'Reviewed'],
+      [qaPlan, 'Approved'],
+      [featureDoc, 'Approved'],
+      [featureDoc, 'Implemented'],
+      [featureDoc, 'Complete'],
+      [blogPost, 'Edited'],
+      [blogPost, 'Published'],
+    ];
+    for (const [template, stage] of cases) {
+      const e = makeEntry(stage);
+      assertNoReviewState(
+        renderRowActions(e, template, DEFAULT_SITE).__raw,
+        `${template.id} ${stage} actions`,
+      );
+      assertNoReviewState(
+        renderRowDrawer(e, template, DEFAULT_SITE).__raw,
+        `${template.id} ${stage} drawer`,
+      );
+      assertNoReviewState(
+        renderRowMenu(e, template, DEFAULT_SITE).__raw,
+        `${template.id} ${stage} menu`,
+      );
+    }
+  });
+});
+
+describe('verbsForStage — Task 5.2 unknown stage throws', () => {
+  it('editorial NotAStage throws with template id in the message', () => {
+    expect(() =>
+      verbsForStage('NotAStage', editorial, makeEntry('NotAStage'), DEFAULT_SITE),
+    ).toThrow(/not in template "editorial"/);
+  });
+});
diff --git a/packages/studio/test/dashboard-swimlane-client.test.ts b/packages/studio/test/dashboard-swimlane-client.test.ts
index 4856440..e4974d3 100644
--- a/packages/studio/test/dashboard-swimlane-client.test.ts
+++ b/packages/studio/test/dashboard-swimlane-client.test.ts
@@ -227,6 +227,85 @@ describe('swimlane client controller — AUDIT-02 / AUDIT-04 acceptance', () =>
     expect(qaRow?.getAttribute('aria-pressed')).toBe(before ?? null);
   });
 
+  // ============================================================
+  //  Task 5.3.2 — hidden-lane row activation.
+  // ============================================================
+
+  it('Task 5.3.2: clicking a HIDDEN lane row flips visibility ON and adds the lane to focus', () => {
+    buildShell(['default', 'mockups', 'qa']);
+    initSwimlane();
+    const qaRow = document.querySelector<HTMLElement>(
+      '[data-rail-lane="qa"]',
+    );
+    const qaEye = qaRow?.querySelector<HTMLElement>('.r-eye-btn') ?? null;
+    const qaChip = document.querySelector<HTMLButtonElement>(
+      '[data-focus-chip="qa"]',
+    );
+    expect(qaRow).not.toBeNull();
+    expect(qaEye).not.toBeNull();
+    expect(qaChip).not.toBeNull();
+    // Step 1: hide the qa lane via the eye-button. After this the
+    // chip is `.is-visibility-hidden`, the row is `data-lane-visible
+    // ="false"`, and focus is dropped.
+    qaEye?.click();
+    expect(qaRow?.dataset.laneVisible).toBe('false');
+    expect(qaChip?.classList.contains('is-visibility-hidden')).toBe(true);
+    expect(qaRow?.getAttribute('aria-pressed')).toBe('false');
+    // Step 2: clicking the ROW (not the eye) on the hidden lane
+    // restores visibility AND adds the lane to focus. After this
+    // both lane-visible and aria-pressed reflect the focused state,
+    // and the chip is no longer visibility-hidden.
+    qaRow?.click();
+    expect(qaRow?.dataset.laneVisible).toBe('true');
+    expect(qaRow?.getAttribute('aria-pressed')).toBe('true');
+    expect(qaChip?.classList.contains('is-visibility-hidden')).toBe(false);
+    expect(qaChip?.classList.contains('active')).toBe(true);
+  });
+
+  it('Task 5.3.2: pressing Enter on a HIDDEN rail row flips visibility ON and focuses (mirrors click)', () => {
+    buildShell(['default', 'mockups', 'qa']);
+    initSwimlane();
+    const mockupsRow = document.querySelector<HTMLElement>(
+      '[data-rail-lane="mockups"]',
+    );
+    const mockupsEye
+      = mockupsRow?.querySelector<HTMLElement>('.r-eye-btn') ?? null;
+    const mockupsChip = document.querySelector<HTMLButtonElement>(
+      '[data-focus-chip="mockups"]',
+    );
+    // Hide the mockups lane.
+    mockupsEye?.click();
+    expect(mockupsRow?.dataset.laneVisible).toBe('false');
+    expect(mockupsChip?.classList.contains('is-visibility-hidden')).toBe(true);
+    // Press Enter on the row — same dual-action contract as the
+    // click path (Task 5.3.2 spec).
+    mockupsRow?.dispatchEvent(
+      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
+    );
+    expect(mockupsRow?.dataset.laneVisible).toBe('true');
+    expect(mockupsRow?.getAttribute('aria-pressed')).toBe('true');
+    expect(mockupsChip?.classList.contains('is-visibility-hidden')).toBe(false);
+  });
+
+  it('Task 5.3.2: clicking a VISIBLE row preserves the 5.1 toggle behavior (no unhide path fires)', () => {
+    buildShell(['default', 'mockups', 'qa']);
+    initSwimlane();
+    const defaultRow = document.querySelector<HTMLElement>(
+      '[data-rail-lane="default"]',
+    );
+    // Initially focused (visible). One click toggles focus off.
+    expect(defaultRow?.getAttribute('aria-pressed')).toBe('true');
+    expect(defaultRow?.dataset.laneVisible).toBe('true');
+    defaultRow?.click();
+    // Visibility unchanged; focus flipped off.
+    expect(defaultRow?.dataset.laneVisible).toBe('true');
+    expect(defaultRow?.getAttribute('aria-pressed')).toBe('false');
+    // Click again to flip focus back on.
+    defaultRow?.click();
+    expect(defaultRow?.getAttribute('aria-pressed')).toBe('true');
+    expect(defaultRow?.dataset.laneVisible).toBe('true');
+  });
+
   it('F6: the eye-toggle button carries aria-label + dual decorative glyphs', () => {
     buildShell(['default', 'mockups', 'qa']);
     initSwimlane();
diff --git a/packages/studio/test/dashboard-swimlane-compose-client.test.ts b/packages/studio/test/dashboard-swimlane-compose-client.test.ts
index 0057e13..aa20647 100644
--- a/packages/studio/test/dashboard-swimlane-compose-client.test.ts
+++ b/packages/studio/test/dashboard-swimlane-compose-client.test.ts
@@ -378,3 +378,226 @@ describe('swimlane compose-chip client — Task 5.1C', () => {
     expect(chip?.getAttribute('aria-label')).toBe('Copied — paste in chat');
   });
 });
+
+// ============================================================
+//  Task 5.2 — empty-lane CTA (.swim-empty-cta .sec-cta).
+// ============================================================
+
+interface EmptyShellOptions {
+  readonly laneId: string;
+  readonly laneName: string;
+  readonly collapsed?: boolean;
+}
+
+function buildEmptyShellSwim(opts: EmptyShellOptions): HTMLElement {
+  const swim = document.createElement('article');
+  swim.classList.add('swim', `swim--${opts.laneId}`, 'view-kanban');
+  if (opts.collapsed === true) swim.classList.add('collapsed');
+  swim.dataset.laneId = opts.laneId;
+
+  const head = document.createElement('div');
+  head.classList.add('swim-head');
+  swim.appendChild(head);
+
+  const cta = document.createElement('div');
+  cta.classList.add('swim-empty-cta');
+  cta.dataset.swimEmptyCta = '';
+
+  const msg = document.createElement('p');
+  msg.classList.add('sec-msg');
+  msg.textContent = 'Create your first entry in this lane.';
+  cta.appendChild(msg);
+
+  const button = document.createElement('button');
+  button.type = 'button';
+  button.classList.add('sec-cta');
+  button.setAttribute('aria-label', `Compose first entry in ${opts.laneName}`);
+  button.dataset.swimEmptyCopy = '';
+  button.dataset.laneId = opts.laneId;
+
+  const icon = document.createElement('span');
+  icon.classList.add('sec-icon');
+  icon.setAttribute('aria-hidden', 'true');
+  icon.textContent = '+';
+  const label = document.createElement('span');
+  label.classList.add('sec-label');
+  label.textContent = 'Create your first entry';
+  button.appendChild(icon);
+  button.appendChild(label);
+  cta.appendChild(button);
+
+  const hint = document.createElement('p');
+  hint.classList.add('sec-hint');
+  hint.textContent = `copies /deskwork:add --lane ${opts.laneId}`;
+  cta.appendChild(hint);
+
+  swim.appendChild(cta);
+  return swim;
+}
+
+function buildEmptyShell(
+  swims: readonly EmptyShellOptions[],
+  projectKey: string = 'task-5-2-test-key',
+): void {
+  document.body.innerHTML = '';
+  const shell = document.createElement('section');
+  shell.classList.add('bay-shell');
+  shell.dataset.bayShell = '';
+  shell.dataset.projectKey = projectKey;
+  for (const opts of swims) {
+    shell.appendChild(buildEmptyShellSwim(opts));
+  }
+  document.body.appendChild(shell);
+}
+
+describe('swimlane empty-lane CTA client — Task 5.2', () => {
+  beforeEach(() => {
+    document.body.innerHTML = '';
+    vi.useFakeTimers();
+  });
+
+  afterEach(() => {
+    vi.useRealTimers();
+    Object.defineProperty(navigator, 'clipboard', {
+      configurable: true,
+      writable: true,
+      value: undefined,
+    });
+  });
+
+  it('click writes "/deskwork:add --lane <id>" to the clipboard (no slug placeholder, no stage flag)', async () => {
+    const { calls } = installClipboard(() => Promise.resolve());
+    buildEmptyShell([{ laneId: 'mockups', laneName: 'Mockups' }]);
+    initSwimlaneCompose();
+    const cta = document.querySelector<HTMLButtonElement>('.sec-cta');
+    expect(cta).not.toBeNull();
+    cta?.click();
+    await vi.advanceTimersByTimeAsync(0);
+    expect(calls).toEqual(['/deskwork:add --lane mockups']);
+  });
+
+  it('after click the CTA enters .copied flash state with swapped icon + label', async () => {
+    installClipboard(() => Promise.resolve());
+    buildEmptyShell([{ laneId: 'qa', laneName: 'QA' }]);
+    initSwimlaneCompose();
+    const cta = document.querySelector<HTMLButtonElement>('.sec-cta');
+    cta?.click();
+    await vi.advanceTimersByTimeAsync(0);
+    expect(cta?.classList.contains('copied')).toBe(true);
+    expect(cta?.querySelector<HTMLElement>('.sec-icon')?.textContent).toBe('✓');
+    expect(cta?.querySelector<HTMLElement>('.sec-label')?.textContent).toBe(
+      'Copied — paste in chat',
+    );
+  });
+
+  it('swaps aria-label to the success message during .copied', async () => {
+    installClipboard(() => Promise.resolve());
+    buildEmptyShell([{ laneId: 'mockups', laneName: 'Mockups' }]);
+    initSwimlaneCompose();
+    const cta = document.querySelector<HTMLButtonElement>('.sec-cta');
+    expect(cta?.getAttribute('aria-label')).toBe(
+      'Compose first entry in Mockups',
+    );
+    cta?.click();
+    await vi.advanceTimersByTimeAsync(0);
+    expect(cta?.getAttribute('aria-label')).toBe('Copied — paste in chat');
+    await vi.advanceTimersByTimeAsync(2000);
+    expect(cta?.getAttribute('aria-label')).toBe(
+      'Compose first entry in Mockups',
+    );
+  });
+
+  it('after ~2000ms the .copied flash reverts to "Create your first entry"', async () => {
+    installClipboard(() => Promise.resolve());
+    buildEmptyShell([{ laneId: 'qa', laneName: 'QA' }]);
+    initSwimlaneCompose();
+    const cta = document.querySelector<HTMLButtonElement>('.sec-cta');
+    cta?.click();
+    await vi.advanceTimersByTimeAsync(0);
+    expect(cta?.classList.contains('copied')).toBe(true);
+    await vi.advanceTimersByTimeAsync(2000);
+    expect(cta?.classList.contains('copied')).toBe(false);
+    expect(cta?.querySelector<HTMLElement>('.sec-icon')?.textContent).toBe('+');
+    expect(cta?.querySelector<HTMLElement>('.sec-label')?.textContent).toBe(
+      'Create your first entry',
+    );
+  });
+
+  it('Space on the CTA activates + preventDefaults page scroll', async () => {
+    const { calls } = installClipboard(() => Promise.resolve());
+    buildEmptyShell([{ laneId: 'mockups', laneName: 'Mockups' }]);
+    initSwimlaneCompose();
+    const cta = document.querySelector<HTMLButtonElement>('.sec-cta');
+    const ev = new KeyboardEvent('keydown', {
+      key: ' ',
+      bubbles: true,
+      cancelable: true,
+    });
+    cta?.dispatchEvent(ev);
+    expect(ev.defaultPrevented).toBe(true);
+    await vi.advanceTimersByTimeAsync(0);
+    expect(calls).toEqual(['/deskwork:add --lane mockups']);
+  });
+
+  it('collapse precedence — click when swim is .collapsed is a no-op', async () => {
+    const { calls } = installClipboard(() => Promise.resolve());
+    buildEmptyShell([
+      { laneId: 'mockups', laneName: 'Mockups', collapsed: true },
+    ]);
+    initSwimlaneCompose();
+    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="mockups"]');
+    expect(swim?.classList.contains('collapsed')).toBe(true);
+    const cta = swim?.querySelector<HTMLButtonElement>('.sec-cta');
+    cta?.click();
+    await vi.advanceTimersByTimeAsync(0);
+    expect(calls).toEqual([]);
+    expect(cta?.classList.contains('copied')).toBe(false);
+  });
+
+  it('click does NOT bubble to the swim body (stopPropagation contract)', async () => {
+    installClipboard(() => Promise.resolve());
+    buildEmptyShell([{ laneId: 'mockups', laneName: 'Mockups' }]);
+    initSwimlaneCompose();
+    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="mockups"]');
+    let bubbledClicks = 0;
+    swim?.addEventListener('click', () => {
+      bubbledClicks += 1;
+    });
+    const cta = swim?.querySelector<HTMLButtonElement>('.sec-cta');
+    cta?.click();
+    await vi.advanceTimersByTimeAsync(0);
+    expect(bubbledClicks).toBe(0);
+  });
+
+  it('clipboard rejection — CTA does not enter .copied AND error surfaces uncaught', async () => {
+    const denied = new Error('clipboard write denied');
+    const priorListeners = process.listeners('uncaughtException');
+    process.removeAllListeners('uncaughtException');
+    const surfaced: unknown[] = [];
+    const capture = (err: unknown): void => {
+      surfaced.push(err);
+    };
+    process.on('uncaughtException', capture);
+
+    const { calls } = installClipboard(() => Promise.reject(denied));
+    buildEmptyShell([{ laneId: 'mockups', laneName: 'Mockups' }]);
+    initSwimlaneCompose();
+    const cta = document.querySelector<HTMLButtonElement>('.sec-cta');
+
+    try {
+      cta?.click();
+      for (let i = 0; i < 10; i += 1) {
+        await Promise.resolve();
+      }
+      expect(calls).toEqual(['/deskwork:add --lane mockups']);
+      expect(cta?.classList.contains('copied')).toBe(false);
+      expect(cta?.querySelector<HTMLElement>('.sec-icon')?.textContent).toBe('+');
+      expect(surfaced).toContain(denied);
+    } finally {
+      process.removeListener('uncaughtException', capture);
+      for (const l of priorListeners) {
+        process.on('uncaughtException', l);
+      }
+    }
+  });
+});
diff --git a/packages/studio/test/dashboard-swimlane-mobile-sheet-client.test.ts b/packages/studio/test/dashboard-swimlane-mobile-sheet-client.test.ts
new file mode 100644
index 0000000..cc74c21
--- /dev/null
+++ b/packages/studio/test/dashboard-swimlane-mobile-sheet-client.test.ts
@@ -0,0 +1,261 @@
+/**
+ * @vitest-environment jsdom
+ *
+ * Client-side controller tests for the mobile lane-visibility sheet —
+ * Phase 5 Task 5.3.3.
+ *
+ * Exercises `initSwimlaneMobileSheet` against a synthesised DOM that
+ * mirrors the server-rendered bay-shell markup (trigger in the bay-
+ * head + `[data-lane-sheet]` container wrapping `.lane-rail` +
+ * `[data-lane-sheet-backdrop]` sibling).
+ *
+ * Coverage:
+ *   - Click on `[data-lane-sheet-trigger]` toggles `.is-open` on the
+ *     container and flips the trigger's aria-expanded.
+ *   - Escape key closes the sheet.
+ *   - Backdrop click closes the sheet.
+ *   - Clicking a `[data-rail-lane]` row inside the sheet closes the
+ *     sheet (so the operator sees the bay update after their
+ *     activation).
+ *   - Clicking the `.r-eye-btn` inside the sheet does NOT close the
+ *     sheet (the operator is still curating visibility from inside).
+ *   - On close, focus returns to the trigger.
+ *
+ * The shared `createSlideUpSheet` controller writes its own
+ * `data-lane-sheet-open` attribute on `document.body`; assertions
+ * verify the body attribute mirrors the open/closed state.
+ */
+
+import { describe, it, expect, beforeEach } from 'vitest';
+import { initSwimlaneMobileSheet } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-mobile-sheet';
+
+function buildShellWithSheet(lanes: readonly string[]): void {
+  document.body.innerHTML = '';
+  document.body.removeAttribute('data-lane-sheet-open');
+
+  const shell = document.createElement('section');
+  shell.classList.add('bay-shell');
+  shell.dataset.bayShell = '';
+  document.body.appendChild(shell);
+
+  // Lane sheet container (wraps the rail).
+  const container = document.createElement('div');
+  container.classList.add('lane-sheet-container');
+  container.id = 'lane-sheet';
+  container.dataset.laneSheet = '';
+
+  // Backdrop sibling — the controller uses it as the scrim.
+  const backdrop = document.createElement('div');
+  backdrop.classList.add('lane-sheet-backdrop');
+  backdrop.dataset.laneSheetBackdrop = '';
+  backdrop.setAttribute('aria-hidden', 'true');
+  container.appendChild(backdrop);
+
+  // The rail itself, containing one row per lane with an eye button.
+  const rail = document.createElement('aside');
+  rail.classList.add('lane-rail');
+  for (const id of lanes) {
+    const row = document.createElement('div');
+    row.classList.add('rail-lane');
+    row.setAttribute('role', 'button');
+    row.setAttribute('tabindex', '0');
+    row.dataset.railLane = id;
+    row.dataset.laneVisible = 'true';
+    row.setAttribute('aria-pressed', 'true');
+
+    const eye = document.createElement('button');
+    eye.type = 'button';
+    eye.classList.add('r-eye-btn');
+    eye.setAttribute('aria-label', `Toggle visibility for ${id} lane`);
+    row.appendChild(eye);
+
+    const name = document.createElement('span');
+    name.classList.add('r-name');
+    name.textContent = id;
+    row.appendChild(name);
+
+    rail.appendChild(row);
+  }
+  container.appendChild(rail);
+  shell.appendChild(container);
+
+  // Bay-head with the trigger.
+  const bay = document.createElement('main');
+  bay.classList.add('bay');
+  const bayHead = document.createElement('div');
+  bayHead.classList.add('bay-head');
+  const row1 = document.createElement('div');
+  row1.classList.add('bh-row-1');
+  const trigger = document.createElement('button');
+  trigger.type = 'button';
+  trigger.classList.add('lane-sheet-trigger');
+  trigger.dataset.laneSheetTrigger = '';
+  trigger.setAttribute('aria-expanded', 'false');
+  trigger.setAttribute('aria-controls', 'lane-sheet');
+  trigger.setAttribute('aria-label', 'Show lane visibility sheet');
+  trigger.textContent = 'Lanes ▾';
+  row1.appendChild(trigger);
+  bayHead.appendChild(row1);
+  bay.appendChild(bayHead);
+  shell.appendChild(bay);
+}
+
+interface CSSShim {
+  escape: (id: string) => string;
+}
+if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') {
+  (globalThis as { CSS: CSSShim }).CSS = { escape: (s: string) => s };
+}
+
+describe('swimlane mobile sheet controller — Task 5.3.3', () => {
+  beforeEach(() => {
+    document.body.innerHTML = '';
+    document.body.removeAttribute('data-lane-sheet-open');
+  });
+
+  it('clicking the trigger opens the sheet (.is-open class + body attribute + aria-expanded mirrors)', () => {
+    buildShellWithSheet(['default', 'mockups', 'qa']);
+    initSwimlaneMobileSheet();
+    const trigger = document.querySelector<HTMLButtonElement>(
+      '[data-lane-sheet-trigger]',
+    );
+    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
+    expect(trigger).not.toBeNull();
+    expect(container).not.toBeNull();
+    expect(container?.classList.contains('is-open')).toBe(false);
+    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
+    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(false);
+
+    trigger?.click();
+
+    expect(container?.classList.contains('is-open')).toBe(true);
+    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
+    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(true);
+  });
+
+  it('clicking the trigger again closes the sheet', () => {
+    buildShellWithSheet(['default', 'mockups', 'qa']);
+    initSwimlaneMobileSheet();
+    const trigger = document.querySelector<HTMLButtonElement>(
+      '[data-lane-sheet-trigger]',
+    );
+    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
+    trigger?.click();
+    expect(container?.classList.contains('is-open')).toBe(true);
+    trigger?.click();
+    expect(container?.classList.contains('is-open')).toBe(false);
+    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
+    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(false);
+  });
+
+  it('Escape key closes an open sheet', () => {
+    buildShellWithSheet(['default', 'mockups', 'qa']);
+    initSwimlaneMobileSheet();
+    const trigger = document.querySelector<HTMLButtonElement>(
+      '[data-lane-sheet-trigger]',
+    );
+    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
+    trigger?.click();
+    expect(container?.classList.contains('is-open')).toBe(true);
+    document.dispatchEvent(
+      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
+    );
+    expect(container?.classList.contains('is-open')).toBe(false);
+    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
+  });
+
+  it('clicking the backdrop closes the sheet', () => {
+    buildShellWithSheet(['default', 'mockups', 'qa']);
+    initSwimlaneMobileSheet();
+    const trigger = document.querySelector<HTMLButtonElement>(
+      '[data-lane-sheet-trigger]',
+    );
+    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
+    const backdrop = document.querySelector<HTMLElement>(
+      '[data-lane-sheet-backdrop]',
+    );
+    trigger?.click();
+    expect(container?.classList.contains('is-open')).toBe(true);
+    backdrop?.click();
+    expect(container?.classList.contains('is-open')).toBe(false);
+  });
+
+  it('clicking a rail-lane row inside the open sheet closes the sheet', () => {
+    buildShellWithSheet(['default', 'mockups', 'qa']);
+    initSwimlaneMobileSheet();
+    const trigger = document.querySelector<HTMLButtonElement>(
+      '[data-lane-sheet-trigger]',
+    );
+    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
+    const qaRow = document.querySelector<HTMLElement>(
+      '[data-rail-lane="qa"]',
+    );
+    trigger?.click();
+    expect(container?.classList.contains('is-open')).toBe(true);
+    qaRow?.click();
+    expect(container?.classList.contains('is-open')).toBe(false);
+  });
+
+  it('clicking the .r-eye-btn inside the open sheet does NOT close (operator is curating visibility)', () => {
+    buildShellWithSheet(['default', 'mockups', 'qa']);
+    initSwimlaneMobileSheet();
+    const trigger = document.querySelector<HTMLButtonElement>(
+      '[data-lane-sheet-trigger]',
+    );
+    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
+    const eye = document.querySelector<HTMLElement>(
+      '[data-rail-lane="qa"] .r-eye-btn',
+    );
+    trigger?.click();
+    expect(container?.classList.contains('is-open')).toBe(true);
+    eye?.click();
+    // Sheet remains open — the eye-button is a hide/show gesture the
+    // operator may want to repeat without dismissing.
+    expect(container?.classList.contains('is-open')).toBe(true);
+  });
+
+  it('pressing Enter on a rail-lane row inside the sheet closes the sheet (mirrors click)', () => {
+    buildShellWithSheet(['default', 'mockups', 'qa']);
+    initSwimlaneMobileSheet();
+    const trigger = document.querySelector<HTMLButtonElement>(
+      '[data-lane-sheet-trigger]',
+    );
+    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
+    const mockupsRow = document.querySelector<HTMLElement>(
+      '[data-rail-lane="mockups"]',
+    );
+    trigger?.click();
+    expect(container?.classList.contains('is-open')).toBe(true);
+    mockupsRow?.dispatchEvent(
+      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
+    );
+    expect(container?.classList.contains('is-open')).toBe(false);
+  });
+
+  it('on close, focus returns to the trigger', () => {
+    buildShellWithSheet(['default', 'mockups', 'qa']);
+    initSwimlaneMobileSheet();
+    const trigger = document.querySelector<HTMLButtonElement>(
+      '[data-lane-sheet-trigger]',
+    );
+    trigger?.click();
+    // Focus has moved into the sheet (first eye button).
+    const firstEye = document.querySelector<HTMLElement>(
+      '[data-rail-lane] .r-eye-btn',
+    );
+    expect(document.activeElement).toBe(firstEye);
+    // Close via Escape.
+    document.dispatchEvent(
+      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
+    );
+    expect(document.activeElement).toBe(trigger);
+  });
+
+  it('initSwimlaneMobileSheet is a no-op when the trigger is absent', () => {
+    document.body.innerHTML = '';
+    document.body.removeAttribute('data-lane-sheet-open');
+    // No throw, no body-attribute side-effect.
+    expect(() => initSwimlaneMobileSheet()).not.toThrow();
+    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(false);
+  });
+});
diff --git a/packages/studio/test/dashboard-swimlane.test.ts b/packages/studio/test/dashboard-swimlane.test.ts
index 03227fe..bd7471e 100644
--- a/packages/studio/test/dashboard-swimlane.test.ts
+++ b/packages/studio/test/dashboard-swimlane.test.ts
@@ -950,6 +950,311 @@ describe('dashboard swimlane shell — Phase 5 Task 5.1', () => {
       /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.view-toggle\s+\.vt-cell\s*\{[\s\S]*?font-size:\s*0\.62rem/,
     );
   });
+
+  // ============================================================
+  //  Task 5.2 — template-aware stage rendering + empty-lane CTA.
+  // ============================================================
+
+  it('Task 5.2: editorial-specific empty-state copy fires ONLY for the editorial lane', async () => {
+    // The default editorial lane has an entry in Drafting but Ideas /
+    // Planned / Outlining / Final / Published are empty — those
+    // columns must surface the editorial-specific verbose hints
+    // ("Run /deskwork:add to capture one.", etc.).
+    const r = await getHtml(app, '/dev/editorial-studio');
+    expect(r.status).toBe(200);
+    const editorial = extractLaneSection(r.html, 'default');
+    expect(editorial).toContain('No open ideas. Run /deskwork:add to capture one.');
+    // The literal `<slug>` placeholder is HTML-escaped by the html
+    // tagged-template helper to `&lt;slug&gt;` on render — assert
+    // against the escaped form since the test reads the response
+    // body verbatim.
+    expect(editorial).toContain(
+      'Nothing planned. /deskwork:approve &lt;slug&gt; to graduate an idea.',
+    );
+    expect(editorial).toContain('Nothing in outlining.');
+    expect(editorial).toContain('Nothing in final review.');
+    expect(editorial).toContain('No published posts yet.');
+    // The visual (mockups) lane's empty Iterating / Shipped columns
+    // must NOT inherit editorial vocabulary — they get the neutral
+    // fallback `Nothing in ${stage.toLowerCase()}.` instead.
+    const visual = extractLaneSection(r.html, 'mockups');
+    expect(visual).not.toContain('Run /deskwork:add');
+    expect(visual).not.toContain('/deskwork:approve <slug> to graduate');
+    expect(visual).toContain('Nothing in iterating.');
+    expect(visual).toContain('Nothing in shipped.');
+    // QA-plan lane's empty Reviewed / Tested / Approved columns —
+    // generic vocabulary only.
+    const qa = extractLaneSection(r.html, 'qa');
+    expect(qa).not.toContain('Run /deskwork:add');
+    expect(qa).toContain('Nothing in reviewed.');
+    expect(qa).toContain('Nothing in tested.');
+    expect(qa).toContain('Nothing in approved.');
+  });
+
+  it('Task 5.2: every entry in a non-editorial lane renders verb-chip chrome (no compact-card dispatch)', async () => {
+    // The visual Sketched + Approved entries and the qa Drafted
+    // entry previously routed through the lighter `renderEntryCard`
+    // (a <a class="card">) because `isLegacyEditorialStage` was false
+    // for non-editorial stage names. Task 5.2 lifts that dispatch:
+    // every entry now renders via `renderRow` (`.er-row-shell`).
+    const r = await getHtml(app, '/dev/editorial-studio');
+    expect(r.status).toBe(200);
+    const visual = extractStageGridSection(extractLaneSection(r.html, 'mockups'));
+    // The visual Sketched entry now renders as a .er-row-shell.
+    expect(visual).toMatch(
+      /<div class="er-row-shell"[^>]*data-uuid="22222222-2222-4222-8222-222222222222"/,
+    );
+    // The visual Approved entry (locked stage) does too.
+    expect(visual).toMatch(
+      /<div class="er-row-shell"[^>]*data-uuid="33333333-3333-4333-8333-333333333333"/,
+    );
+    // The `<a class="card">` from the prior lighter dispatch must
+    // not appear inside the visual lane's stage grid anymore.
+    expect(visual).not.toMatch(/<a class="card"/);
+    // QA-plan Drafted entry renders as .er-row-shell too.
+    const qa = extractStageGridSection(extractLaneSection(r.html, 'qa'));
+    expect(qa).toMatch(
+      /<div class="er-row-shell"[^>]*data-uuid="44444444-4444-4444-8444-444444444444"/,
+    );
+    expect(qa).not.toMatch(/<a class="card"/);
+  });
+
+  it('Task 5.2: visual Approved (locked) row carries "Approve → Shipped" verb', async () => {
+    // Per the locked-stage dispatch: lockedStages render with the
+    // approve verb labeled `Approve → {nextLinearStage}`. For visual
+    // template, Approved → Shipped.
+    const r = await getHtml(app, '/dev/editorial-studio');
+    expect(r.status).toBe(200);
+    const visual = extractStageGridSection(extractLaneSection(r.html, 'mockups'));
+    // The Approved row is in this section.
+    expect(visual).toContain('data-uuid="33333333-3333-4333-8333-333333333333"');
+    // The "Approve → Shipped" label appears somewhere in the row's
+    // affordance chrome (inline chip uses lowercase; menu/drawer
+    // use sentence case).
+    expect(visual).toMatch(/approve\s+→\s+shipped/i);
+    // The "Approve → Published" editorial-only label must NOT appear
+    // in the visual lane.
+    expect(visual).not.toMatch(/approve\s+→\s+published/i);
+  });
+
+  it('Task 5.2: empty-lane CTA renders for empty lanes only', async () => {
+    // Build a fresh app with one EMPTY lane (no entries on disk for
+    // it) so the empty-lane CTA invariant is testable. The other
+    // two lanes still have entries.
+    const emptyRoot = mkdtempSync(join(tmpdir(), 'deskwork-dash-empty-'));
+    try {
+      mkdirSync(join(emptyRoot, '.deskwork', 'entries'), { recursive: true });
+      mkdirSync(join(emptyRoot, '.deskwork', 'lanes'), { recursive: true });
+      writeLane(emptyRoot, 'default', 'Editorial', 'editorial', 'docs');
+      writeLane(emptyRoot, 'mockups', 'Mockups', 'visual', 'mockups');
+      writeLane(emptyRoot, 'qa', 'QA', 'qa-plan', 'qa');
+      const emptyApp = createApp({ projectRoot: emptyRoot, config: makeConfig() });
+      // Entries only in the default lane.
+      await writeSidecar(
+        emptyRoot,
+        makeEntry({
+          uuid: UUID_EDITORIAL_DRAFTING,
+          slug: 'a-draft',
+          title: 'A Draft',
+          currentStage: 'Drafting',
+          iterationByStage: { Drafting: 1 },
+          lane: 'default',
+        }),
+      );
+      const r = await getHtml(emptyApp, '/dev/editorial-studio');
+      expect(r.status).toBe(200);
+      // Empty mockups + qa lanes must each emit a `.swim-empty-cta`
+      // block with the lane-id-bound copy button. The button's
+      // attributes can render in any order, so assert each fragment
+      // independently against the per-lane section.
+      const mockups = extractLaneSection(r.html, 'mockups');
+      expect(mockups).toContain('class="swim-empty-cta"');
+      expect(mockups).toMatch(/<button class="sec-cta"/);
+      expect(mockups).toContain('data-lane-id="mockups"');
+      expect(mockups).toContain('aria-label="Compose first entry in Mockups"');
+      expect(mockups).toContain('data-swim-empty-copy');
+      expect(mockups).toContain('Create your first entry in this lane.');
+      // The visible code hint shows the lane-id-bound slash command.
+      expect(mockups).toMatch(/<code>\/deskwork:add --lane mockups<\/code>/);
+      const qa = extractLaneSection(r.html, 'qa');
+      expect(qa).toContain('class="swim-empty-cta"');
+      expect(qa).toMatch(/<button class="sec-cta"/);
+      expect(qa).toContain('data-lane-id="qa"');
+      expect(qa).toContain('aria-label="Compose first entry in QA"');
+      expect(qa).toMatch(/<code>\/deskwork:add --lane qa<\/code>/);
+      // The non-empty default lane must NOT emit a `.swim-empty-cta`.
+      const editorial = extractLaneSection(r.html, 'default');
+      expect(editorial).not.toContain('class="swim-empty-cta"');
+    } finally {
+      rmSync(emptyRoot, { recursive: true, force: true });
+    }
+  });
+
+  it('Task 5.2: empty-lane CTA does NOT replace the compose chip — both affordances coexist on empty lanes', async () => {
+    // The Compose chip in the swim-head (Task 5.1C) and the empty-
+    // lane CTA in the swim body (Task 5.2) are siblings — the empty
+    // lane shows BOTH. The chip is always present; the CTA is
+    // conditional on entryCount === 0.
+    const emptyRoot = mkdtempSync(join(tmpdir(), 'deskwork-dash-coexist-'));
+    try {
+      mkdirSync(join(emptyRoot, '.deskwork', 'entries'), { recursive: true });
+      mkdirSync(join(emptyRoot, '.deskwork', 'lanes'), { recursive: true });
+      writeLane(emptyRoot, 'default', 'Editorial', 'editorial', 'docs');
+      const emptyApp = createApp({ projectRoot: emptyRoot, config: makeConfig() });
+      const r = await getHtml(emptyApp, '/dev/editorial-studio');
+      expect(r.status).toBe(200);
+      const editorial = extractLaneSection(r.html, 'default');
+      // Compose chip (Task 5.1C — data-first-stage carries the next
+      // entry's destination).
+      expect(editorial).toContain('class="swim-compose"');
+      expect(editorial).toContain('data-first-stage="Ideas"');
+      // Empty CTA (Task 5.2 — no <SLUG>, no --stage in payload).
+      expect(editorial).toContain('class="swim-empty-cta"');
+      expect(editorial).toMatch(/<code>\/deskwork:add --lane default<\/code>/);
+    } finally {
+      rmSync(emptyRoot, { recursive: true, force: true });
+    }
+  });
+
+  it('Task 5.2: empty-lane CTA still emits stage columns AND the data-first-stage chip', async () => {
+    // Per the Step 5.2.2 contract, the kanban stage-grid + the
+    // Compose chip remain visible on empty lanes — the CTA renders
+    // in addition to (not instead of) the lane's pipeline shape.
+    const emptyRoot = mkdtempSync(join(tmpdir(), 'deskwork-dash-empty-shape-'));
+    try {
+      mkdirSync(join(emptyRoot, '.deskwork', 'entries'), { recursive: true });
+      mkdirSync(join(emptyRoot, '.deskwork', 'lanes'), { recursive: true });
+      writeLane(emptyRoot, 'mockups', 'Mockups', 'visual', 'mockups');
+      const emptyApp = createApp({ projectRoot: emptyRoot, config: makeConfig() });
+      const r = await getHtml(emptyApp, '/dev/editorial-studio');
+      expect(r.status).toBe(200);
+      const mockups = extractLaneSection(r.html, 'mockups');
+      // Empty CTA present.
+      expect(mockups).toContain('class="swim-empty-cta"');
+      // 5.1C chip is still emitted on empty lanes with data-first-stage.
+      expect(mockups).toContain('data-first-stage="Sketched"');
+      // Stage-grid is still emitted with the visual template's 4 + 3 = 7
+      // stage columns even though all are empty.
+      const cols = extractStageCols(extractStageGridSection(mockups));
+      expect(cols.length).toBe(7);
+    } finally {
+      rmSync(emptyRoot, { recursive: true, force: true });
+    }
+  });
+
+  // ============================================================
+  //  Task 5.3 — Many-lane overflow + mobile lane sheet.
+  // ============================================================
+
+  it('Task 5.3.3: bay-head row 1 emits the `<button class="lane-sheet-trigger">` after `.bh-meta`', async () => {
+    const r = await getHtml(app, '/dev/editorial-studio');
+    expect(r.status).toBe(200);
+    // The trigger appears AFTER `.bh-meta` in the same `.bh-row-1`.
+    // Tolerate whitespace between the meta close and the trigger
+    // open. The trigger carries data-lane-sheet-trigger, aria-
+    // expanded="false", aria-controls="lane-sheet", and a non-empty
+    // aria-label.
+    expect(r.html).toMatch(
+      /<span class="bh-meta">[\s\S]*?<\/span>\s*<button class="lane-sheet-trigger"[^>]*type="button"[^>]*data-lane-sheet-trigger[^>]*aria-expanded="false"[^>]*aria-controls="lane-sheet"[^>]*aria-label="[^"]+">/,
+    );
+  });
+
+  it('Task 5.3.3: `.lane-rail` is wrapped inside `[data-lane-sheet]` container with backdrop sibling', async () => {
+    const r = await getHtml(app, '/dev/editorial-studio');
+    expect(r.status).toBe(200);
+    // The container opens with class + id + data attr; the backdrop
+    // sibling is the FIRST child of the container; the rail follows.
+    expect(r.html).toMatch(
+      /<div class="lane-sheet-container" id="lane-sheet" data-lane-sheet>\s*<div class="lane-sheet-backdrop" data-lane-sheet-backdrop aria-hidden="true"><\/div>\s*<aside class="lane-rail"/,
+    );
+  });
+
+  it('Task 5.3.1: dashboard-swimlane.css uses `flex-wrap: nowrap` + `overflow-x: auto` on `.focus-strip`', async () => {
+    const cssRes = await app.fetch(
+      new Request('http://x/static/css/dashboard-swimlane.css'),
+    );
+    expect(cssRes.status).toBe(200);
+    const css = await cssRes.text();
+    // The Task 5.3 override block re-declares `.focus-strip` with
+    // `flex-wrap: nowrap` + `overflow-x: auto` (the original 5.1
+    // block at line 254 still ships `flex-wrap: wrap` — the
+    // override later in the cascade wins). Assert the override
+    // rule exists.
+    expect(css).toMatch(
+      /\.focus-strip\s*\{[\s\S]*?flex-wrap:\s*nowrap[\s\S]*?overflow-x:\s*auto/,
+    );
+    // Right-edge fade gradient via ::after.
+    expect(css).toMatch(
+      /\.focus-strip::after\s*\{[\s\S]*?background:\s*linear-gradient\(to right,\s*transparent,\s*var\(--er-paper\) 100%\)/,
+    );
+    // Smooth scroll behavior.
+    expect(css).toMatch(/\.focus-strip\s*\{[\s\S]*?scroll-behavior:\s*smooth/);
+  });
+
+  it('Task 5.3.3: dashboard-swimlane.css ships the mobile lane-sheet rules (trigger, panel, backdrop)', async () => {
+    const cssRes = await app.fetch(
+      new Request('http://x/static/css/dashboard-swimlane.css'),
+    );
+    expect(cssRes.status).toBe(200);
+    const css = await cssRes.text();
+    // Desktop default: trigger hidden.
+    expect(css).toMatch(/\.lane-sheet-trigger\s*\{[\s\S]*?display:\s*none/);
+    // Mobile breakpoint: trigger visible.
+    expect(css).toMatch(
+      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.lane-sheet-trigger\s*\{[\s\S]*?display:\s*inline-flex/,
+    );
+    // Sheet panel — slide-up + fixed-bottom.
+    expect(css).toMatch(
+      /\.lane-sheet-container\s+\.lane-rail\s*\{[\s\S]*?position:\s*fixed[\s\S]*?bottom:\s*0[\s\S]*?transform:\s*translateY\(100%\)/,
+    );
+    // Open state translates to 0.
+    expect(css).toMatch(
+      /\.lane-sheet-container\.is-open\s+\.lane-rail\s*\{[\s\S]*?transform:\s*translateY\(0\)/,
+    );
+    // Backdrop reveal via body[data-lane-sheet-open] (shared
+    // controller's attribute name).
+    expect(css).toMatch(
+      /body\[data-lane-sheet-open\]\s+\.lane-sheet-backdrop\s*\{[\s\S]*?background:\s*rgba\(/,
+    );
+    // Focus-visible ring on the trigger (WCAG 2.1 SC 2.4.7 AA).
+    expect(css).toMatch(
+      /\.lane-sheet-trigger:focus-visible\s*\{[\s\S]*?outline:\s*2px\s+solid\s+var\(--er-proof-blue\)/,
+    );
+  });
+
+  it('Task 5.3.2: hidden lanes in the rail receive a paler treatment via opacity', async () => {
+    const cssRes = await app.fetch(
+      new Request('http://x/static/css/dashboard-swimlane.css'),
+    );
+    expect(cssRes.status).toBe(200);
+    const css = await cssRes.text();
+    // The Task 5.3 block adds an opacity rule for hidden lanes so
+    // the operator sees at a glance which lanes are off.
+    expect(css).toMatch(
+      /\.rail-lane\[data-lane-visible="false"\]\s*\{[\s\S]*?opacity:\s*0\.6/,
+    );
+  });
+
+  it('Task 5.2: CSS ships `.swim-empty-cta` rules (block, button, hint, collapse precedence)', async () => {
+    const cssRes = await app.fetch(
+      new Request('http://x/static/css/dashboard-swimlane.css'),
+    );
+    expect(cssRes.status).toBe(200);
+    const css = await cssRes.text();
+    expect(css).toMatch(/\.swim-empty-cta\s*\{/);
+    expect(css).toMatch(/\.swim-empty-cta\s+\.sec-cta\s*\{[\s\S]*?min-height:\s*36px/);
+    expect(css).toMatch(
+      /\.swim-empty-cta\s+\.sec-cta:focus-visible\s*\{[\s\S]*?outline:\s*2px\s+solid\s+var\(--er-proof-blue\)/,
+    );
+    expect(css).toMatch(
+      /\.swim-empty-cta\s+\.sec-cta\.copied\s*\{[\s\S]*?background:\s*var\(--er-stamp-green\)/,
+    );
+    // Collapse precedence — non-interactive when the parent swim is
+    // .collapsed.
+    expect(css).toMatch(
+      /\.swim\.collapsed\s+\.swim-empty-cta\s+\.sec-cta\s*\{[\s\S]*?pointer-events:\s*none/,
+    );
+  });
 });
 
 /**
diff --git a/plugins/deskwork-studio/public/css/dashboard-swimlane.css b/plugins/deskwork-studio/public/css/dashboard-swimlane.css
index 73b0e8e..8edb08d 100644
--- a/plugins/deskwork-studio/public/css/dashboard-swimlane.css
+++ b/plugins/deskwork-studio/public/css/dashboard-swimlane.css
@@ -1283,3 +1283,303 @@
     font-size: 0.88rem;
   }
 }
+
+/* ============================================================
+ *  Task 5.2 — Empty-lane CTA (.swim-empty-cta).
+ *
+ *  Surfaced only on lanes whose `bucket.entryCount === 0` — the
+ *  prominent "create your first entry" affordance an operator sees
+ *  the first time they open a freshly-configured lane. Sibling to
+ *  the per-lane Compose chip (Task 5.1C) but larger and with a
+ *  different clipboard payload (no <SLUG>, no --stage).
+ *
+ *  Per `affordance-placement.md`, the CTA lives ON the empty lane's
+ *  swim body (not in any toolbar). Mirrors the .er-outline-tab
+ *  precedent of attaching affordances ON the component they affect.
+ * ============================================================ */
+
+.swim-empty-cta {
+  display: flex;
+  flex-direction: column;
+  align-items: center;
+  gap: 0.5rem;
+  padding: 2rem 1rem;
+  border-top: 1px dashed var(--er-paper-3);
+  border-bottom: 1px dashed var(--er-paper-3);
+  font-family: var(--er-font-mono);
+  background: var(--er-paper);
+  text-align: center;
+}
+
+.swim-empty-cta .sec-msg {
+  margin: 0;
+  font-size: 0.78rem;
+  color: var(--er-ink-soft);
+  letter-spacing: 0.02em;
+}
+
+.swim-empty-cta .sec-cta {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.4rem;
+  min-height: 36px;
+  padding: 0.5rem 1rem;
+  background: var(--er-paper);
+  border: 1px solid var(--er-paper-3);
+  border-radius: 2px;
+  font-family: var(--er-font-mono);
+  font-size: 0.8rem;
+  color: var(--er-ink);
+  cursor: pointer;
+}
+
+.swim-empty-cta .sec-cta:hover {
+  background: var(--er-paper-2);
+}
+
+.swim-empty-cta .sec-cta:focus-visible {
+  outline: 2px solid var(--er-proof-blue);
+  outline-offset: -2px;
+}
+
+.swim-empty-cta .sec-cta .sec-icon {
+  font-size: 1rem;
+  line-height: 1;
+}
+
+/* Flash state — fired on successful clipboard write; reverts after
+ * ~2000ms via the controller. Uses the project's approved-green
+ * token (mirroring `.swim-compose.copied` at line 982). */
+.swim-empty-cta .sec-cta.copied {
+  background: var(--er-stamp-green);
+  color: var(--er-paper);
+  border-color: var(--er-stamp-green);
+}
+
+.swim-empty-cta .sec-hint {
+  margin: 0;
+  font-size: 0.7rem;
+  color: var(--er-ink-soft);
+  letter-spacing: 0.01em;
+}
+
+.swim-empty-cta .sec-hint code {
+  background: var(--er-paper-2);
+  padding: 0.1rem 0.3rem;
+  border-radius: 2px;
+  font-family: var(--er-font-mono);
+  font-size: 0.7rem;
+  color: var(--er-ink);
+}
+
+/* Collapse precedence — when the parent lane is collapsed, the
+ * empty-lane CTA greys out + becomes non-interactive (mirrors
+ * `.swim.collapsed .swim-compose` at line 991). */
+.swim.collapsed .swim-empty-cta .sec-cta {
+  opacity: 0.4;
+  pointer-events: none;
+}
+
+/* ============================================================
+ *  Task 5.3 — Many-lane overflow + mobile lane-sheet.
+ *
+ *  Step 5.3.1: focus-chip strip overflows horizontally when N lanes
+ *  exceed viewport width. The desktop `.focus-strip` rule above used
+ *  `flex-wrap: wrap`; here we override to `nowrap` + horizontal
+ *  scroll. A right-edge fade gradient (`::after`) signals the
+ *  overflow visually; scrollbar visuals stay thin so the bay-head's
+ *  vertical rhythm isn't disrupted. Per WCAG 2.1 SC 1.4.10 (Reflow),
+ *  horizontal scroll is permitted for content with natural left-to-
+ *  right linear order (the focus-chip strip is exactly that).
+ *
+ *  Step 5.3.3: at phone widths, the lane-rail relocates into a
+ *  slide-up bottom sheet triggered by the bay-head's "Lanes ▾"
+ *  button. Mirrors the `dashboard-mobile.css .er-compose-sheet`
+ *  precedent (scrim + panel + slide-up transform) — the new sheet
+ *  goes through the shared `createSlideUpSheet` controller, so the
+ *  drag/escape/scrim gestures match every other sheet on the
+ *  surface.
+ * ============================================================ */
+
+/* Step 5.3.1 — override the wrap rule from `.focus-strip` above so
+ * many-lane configurations scroll horizontally instead of pushing
+ * chips onto a second row. `position: relative` anchors the right-
+ * edge fade overlay. */
+.focus-strip {
+  flex-wrap: nowrap;
+  overflow-x: auto;
+  overflow-y: hidden;
+  position: relative;
+  scroll-behavior: smooth;
+  /* Thin scrollbar so the bay-head's vertical rhythm holds. Firefox:
+   * `scrollbar-width: thin`. WebKit/Blink: the dedicated ::webkit-
+   * scrollbar rule below. The bay's vertical scrollbar gets the same
+   * treatment from the existing `overflow: auto` on `.bay`. */
+  scrollbar-width: thin;
+}
+
+.focus-strip::-webkit-scrollbar {
+  height: 4px;
+}
+
+.focus-strip::-webkit-scrollbar-thumb {
+  background: var(--er-paper-3);
+  border-radius: 99px;
+}
+
+/* Right-edge fade gradient — only paints when there's overflow.
+ * Position: sticky on a right-anchored pseudo would be cleaner but
+ * isn't reliable across the strip's flex-item layout; the fixed-
+ * width gradient at the strip's right edge is the project's existing
+ * idiom (mirrors how `.editorial-review.css` handles overflow fades
+ * on its content surfaces). Pointer-events: none so the gradient
+ * doesn't intercept chip clicks under it. */
+.focus-strip::after {
+  content: '';
+  position: sticky;
+  right: 0;
+  top: 0;
+  width: 28px;
+  height: 100%;
+  background: linear-gradient(to right, transparent, var(--er-paper) 100%);
+  pointer-events: none;
+  flex: 0 0 auto;
+  margin-left: -28px;
+}
+
+/* Step 5.3.2 — hidden lanes in the rail get a paler treatment so the
+ * operator can see at a glance which lanes are off. Mirrors the
+ * existing `.rail-lane[data-lane-visible="false"]` color rule
+ * (line 145 above) but uses opacity for symmetry with the
+ * `.swim.collapsed` chrome on other surfaces. */
+.rail-lane[data-lane-visible="false"] {
+  opacity: 0.6;
+}
+
+/* ============================================================
+ *  Step 5.3.3 — Mobile lane sheet trigger + container.
+ *
+ *  The bay-head trigger `.lane-sheet-trigger` lives in `.bh-row-1`
+ *  after `.bh-meta`. Per `.claude/rules/affordance-placement.md`,
+ *  the trigger sits ON the bay-head (the local chrome of the
+ *  component the rail belongs to), NOT on the page-level masthead.
+ *
+ *  Desktop (> 720px): trigger hidden; `.lane-sheet-container` is
+ *  the regular left-column wrapper around the rail (the bay-shell
+ *  grid puts it in column 1). The container is structurally
+ *  transparent at desktop — it has no styles other than
+ *  `display: contents` so the rail's grid placement is unchanged.
+ *
+ *  Mobile (<= 720px): trigger visible; container becomes a fixed-
+ *  position slide-up sheet covering the bottom of the viewport.
+ * ============================================================ */
+
+.lane-sheet-trigger {
+  display: none;
+}
+
+/* Default container behavior on desktop — `display: contents`
+ * collapses the wrapper element so the underlying `<aside class=
+ * "lane-rail">` lands in the bay-shell grid's left column exactly
+ * as it did before the wrapper was introduced. */
+.lane-sheet-container {
+  display: contents;
+}
+
+/* The backdrop element is unconditionally present in the DOM but
+ * only visible when the sheet is open at mobile widths. */
+.lane-sheet-backdrop {
+  display: none;
+}
+
+@media (max-width: 720px) {
+  /* Mobile trigger styling — small chip in the bay-head's row 1.
+   * Sized to match the existing `.swim-compose` aesthetic so it
+   * reads as a bay-head affordance rather than a generic toolbar
+   * button. Min hit target 30×30 per WCAG 2.2 SC 2.5.8 AA. */
+  .lane-sheet-trigger {
+    display: inline-flex;
+    align-items: center;
+    gap: 0.3rem;
+    min-height: 30px;
+    min-width: 30px;
+    padding: 0.25rem 0.55rem;
+    margin-left: 0.5rem;
+    background: var(--er-paper);
+    border: 1px solid var(--er-paper-3);
+    border-radius: 99px;
+    font-family: var(--er-font-mono);
+    font-size: 0.68rem;
+    letter-spacing: 0.1em;
+    text-transform: uppercase;
+    color: var(--er-ink);
+    cursor: pointer;
+  }
+
+  .lane-sheet-trigger:hover {
+    background: var(--er-paper-2);
+    border-color: var(--er-ink-soft);
+  }
+
+  .lane-sheet-trigger:focus-visible {
+    outline: 2px solid var(--er-proof-blue);
+    outline-offset: 2px;
+  }
+
+  /* Container morphs from `display: contents` (transparent) into a
+   * proper block element so the slide-up panel can position itself
+   * inside it. The container itself stays at z-index 0 / no
+   * background; the rail and backdrop are the visible surfaces. */
+  .lane-sheet-container {
+    display: block;
+  }
+
+  /* Backdrop — full-bleed dim layer, tappable to dismiss. Only
+   * visible when the sheet is open (body attr set by the shared
+   * controller). */
+  .lane-sheet-backdrop {
+    display: block;
+    position: fixed;
+    inset: 0;
+    background: rgba(0, 0, 0, 0);
+    z-index: 999;
+    pointer-events: none;
+    transition: background 0.18s ease;
+  }
+
+  body[data-lane-sheet-open] .lane-sheet-backdrop {
+    background: rgba(26, 22, 20, 0.32);
+    pointer-events: auto;
+  }
+
+  /* Rail repositions into the slide-up panel. The desktop rail rule
+   * inside the existing `@media (max-width: 720px)` block sets
+   * `display: none` on `.lane-rail`. We override that within the
+   * sheet container so the rail is always present in the DOM at
+   * mobile widths (the slide-up reveal animates via transform on
+   * the open class — keeping `display: block` always lets the
+   * close-direction transition fire). */
+  .lane-sheet-container .lane-rail {
+    display: block;
+    position: fixed;
+    left: 0;
+    right: 0;
+    bottom: 0;
+    max-height: 70vh;
+    overflow-y: auto;
+    background: var(--er-paper);
+    border-top: 2px solid var(--er-ink);
+    border-radius: 8px 8px 0 0;
+    padding: 1rem;
+    transform: translateY(100%);
+    transition: transform 0.18s ease;
+    z-index: 1000;
+  }
+
+  /* Open-state — slide the panel in. The `.is-open` class is added
+   * to the container by the client controller; the transition
+   * above animates both directions. */
+  .lane-sheet-container.is-open .lane-rail {
+    transform: translateY(0);
+  }
+}
diff --git a/plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts b/plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts
index f868518..31eab99 100644
--- a/plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts
+++ b/plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts
@@ -1,33 +1,38 @@
 /**
- * Per-lane Compose chip controller (Phase 5 Task 5.1C).
+ * Per-lane Compose chip + empty-lane CTA controller (Phase 5
+ * Task 5.1C + Task 5.2).
  *
- * Wires the `.swim-compose` chip in every `<article class="swim">`:
+ * Wires TWO clipboard-only affordances inside every swim:
  *
- *   - Click composes the partial slash command `/deskwork:add
- *     <SLUG> --lane <laneId> --stage <firstLinearStage>` (the four-
- *     character `<SLUG>` placeholder is literal — the operator
- *     replaces it in the chat editor after paste).
- *   - `navigator.clipboard.writeText` is the entire side effect.
- *     On success the chip flashes `.copied` (✓ + "Copied — paste in
- *     chat") for ~2000ms, then reverts.
+ *   - `.swim-compose` chip in the swim-head (Task 5.1C). Composes
+ *     `/deskwork:add <SLUG> --lane <laneId> --stage <firstStage>`
+ *     — the literal four-character `<SLUG>` placeholder is part of
+ *     the copied text, the operator replaces it in the chat editor
+ *     after paste.
+ *   - `.swim-empty-cta .sec-cta` button in the empty-lane body
+ *     (Task 5.2). Composes `/deskwork:add --lane <laneId>` — NO
+ *     slug placeholder, NO `--stage` flag (the operator's first
+ *     invocation in a lane runs the add skill's full prompt flow).
  *
- * Per THESIS Consequence 2 + DESKWORK-STATE-MACHINE.md Commandment
- * II: the studio does NOT mutate sidecar state from this affordance.
- * No verb is dispatched, no network request is made, no entry is
- * created. The operator's pasted slash command IS the action — this
- * controller's contract is clipboard + flash, period.
+ * Both affordances:
  *
- * Collapse precedence (mirrors Task 5.1B's `.view-toggle`): when the
- * parent swim is `.collapsed`, the chip is non-interactive — the CSS
- * rule `.swim.collapsed .swim-compose { opacity: 0.4; pointer-
- * events: none }` handles the visual + pointer-event side; this
- * controller also early-returns on click so the gesture is a no-op
- * even if the CSS hasn't loaded yet.
+ *   - Use `navigator.clipboard.writeText` as the entire side effect.
+ *     On success they flash `.copied` (visual + aria-label swap)
+ *     for ~2000ms, then revert.
+ *   - Stop click propagation so the parent `.swim-head` / swim body
+ *     handlers don't also fire (the lane-collapse toggler would
+ *     otherwise pick the click up).
+ *   - Honor collapse precedence: when the parent swim is `.collapsed`,
+ *     click is a no-op.
+ *   - Activate on Space (with `preventDefault` to suppress page
+ *     scroll) per WCAG 2.1 SC 2.1.1. Enter is free via the native
+ *     `<button>` keyboard contract.
  *
- * Keyboard activation: Enter activates via the native `<button>`
- * primitive; Space is wired explicitly with `preventDefault` to
- * suppress page scroll (per WCAG 2.1 SC 2.1.1). Mirrors the pattern
- * in `swimlane-view-toggle.ts`.
+ * Per THESIS Consequence 2 + DESKWORK-STATE-MACHINE.md Commandment
+ * II: the studio does NOT mutate sidecar state from either
+ * affordance. No verb is dispatched, no network request is made, no
+ * entry is created. The operator's pasted slash command IS the
+ * action — this controller's contract is clipboard + flash, period.
  *
  * Per the no-fallback rule: when `navigator.clipboard` is missing
  * or `writeText` rejects, the controller surfaces a runtime error
@@ -35,85 +40,142 @@
  * The error is the correct signal that the surface is broken.
  */
 
-/** Duration the chip stays in the `.copied` flash state (ms). */
+/** Duration the affordance stays in the `.copied` flash state (ms). */
 const COPIED_FLASH_MS = 2000;
 
+/** Literal slug placeholder — operator replaces it in the chat editor. */
+const SLUG_PLACEHOLDER = '<SLUG>';
+
+/** Accessible name for an affordance during the `.copied` flash. */
+const COPIED_ARIA_LABEL = 'Copied — paste in chat';
+
 /** WeakMap of button → pending revert-timer handle. */
 const pendingTimers = new WeakMap<HTMLButtonElement, number>();
 
 /**
- * Snapshot of the chip's render-time `aria-label` so the `.copied`
- * flash can swap it to the success message and restore it on revert.
- * Captured at `bindChip` time so subsequent renders / DOM rewrites
- * don't drift the snapshot.
+ * Snapshot of an affordance's render-time `aria-label` so the
+ * `.copied` flash can swap it to the success message and restore it
+ * on revert. Captured at bind time so subsequent renders / DOM
+ * rewrites don't drift the snapshot.
  *
- * Mobile motivation: on phone the `.sc-label` is `display: none`, so
- * the visible label swap (`new` → `Copied — paste in chat`) is invisible
- * to screen-reader users — `aria-label` is the only accessible name.
+ * Mobile motivation: on phone the compose chip's `.sc-label` is
+ * `display: none`, so the visible label swap is invisible to
+ * screen-reader users — `aria-label` is the only accessible name.
  * Without this swap the AT user gets zero feedback that the copy
- * succeeded.
+ * succeeded. The empty-CTA's `.sec-label` is visible at every
+ * breakpoint, but mirroring the swap keeps the contract uniform.
  */
 const originalAriaLabel = new WeakMap<HTMLButtonElement, string>();
 
-/** Literal slug placeholder — operator replaces it in the chat editor. */
-const SLUG_PLACEHOLDER = '<SLUG>';
-
-/** Accessible name for the chip during the `.copied` flash state. */
-const COPIED_ARIA_LABEL = 'Copied — paste in chat';
+/**
+ * Per-affordance behavior contract. Each affordance kind (compose
+ * chip vs empty CTA) provides its own slash-command builder + flash
+ * visual swap (the chip is "+ new" → "✓ Copied — paste in chat";
+ * the CTA is "Create your first entry" → "Copied — paste in chat").
+ */
+interface AffordanceSpec {
+  /** CSS selector the controller targets to bind this affordance. */
+  readonly selector: string;
+  /**
+   * Compose the slash command to copy. Receives the affordance's
+   * dataset; returns the literal text written to the clipboard.
+   */
+  readonly compose: (dataset: DOMStringMap) => string;
+  /** Apply the `.copied` visual swap (icon + label). */
+  readonly enterCopied: (button: HTMLButtonElement) => void;
+  /** Restore the at-rest visual state (icon + label). */
+  readonly leaveCopied: (button: HTMLButtonElement) => void;
+}
 
-function composeSlashCommand(laneId: string, firstStage: string): string {
+function composeChipSlash(dataset: DOMStringMap): string {
+  const { laneId, firstStage } = dataset;
+  if (laneId === undefined || firstStage === undefined) {
+    throw new Error(
+      '.swim-compose chip missing data-lane-id or data-first-stage',
+    );
+  }
   return `/deskwork:add ${SLUG_PLACEHOLDER} --lane ${laneId} --stage ${firstStage}`;
 }
 
-function enterCopiedState(button: HTMLButtonElement): void {
-  button.classList.add('copied');
-  button.setAttribute('aria-label', COPIED_ARIA_LABEL);
+function composeEmptyCtaSlash(dataset: DOMStringMap): string {
+  const { laneId } = dataset;
+  if (laneId === undefined) {
+    throw new Error('.swim-empty-cta .sec-cta missing data-lane-id');
+  }
+  return `/deskwork:add --lane ${laneId}`;
+}
+
+function chipEnterCopied(button: HTMLButtonElement): void {
   const icon = button.querySelector<HTMLElement>('.sc-icon');
   const label = button.querySelector<HTMLElement>('.sc-label');
   if (icon !== null) icon.textContent = '✓';
   if (label !== null) label.textContent = 'Copied — paste in chat';
 }
 
-function leaveCopiedState(button: HTMLButtonElement): void {
-  button.classList.remove('copied');
-  const original = originalAriaLabel.get(button);
-  if (original !== undefined) button.setAttribute('aria-label', original);
+function chipLeaveCopied(button: HTMLButtonElement): void {
   const icon = button.querySelector<HTMLElement>('.sc-icon');
   const label = button.querySelector<HTMLElement>('.sc-label');
   if (icon !== null) icon.textContent = '+';
   if (label !== null) label.textContent = 'new';
 }
 
+function ctaEnterCopied(button: HTMLButtonElement): void {
+  const icon = button.querySelector<HTMLElement>('.sec-icon');
+  const label = button.querySelector<HTMLElement>('.sec-label');
+  if (icon !== null) icon.textContent = '✓';
+  if (label !== null) label.textContent = 'Copied — paste in chat';
+}
+
+function ctaLeaveCopied(button: HTMLButtonElement): void {
+  const icon = button.querySelector<HTMLElement>('.sec-icon');
+  const label = button.querySelector<HTMLElement>('.sec-label');
+  if (icon !== null) icon.textContent = '+';
+  if (label !== null) label.textContent = 'Create your first entry';
+}
+
+const COMPOSE_CHIP_SPEC: AffordanceSpec = {
+  selector: '.swim-compose[data-swim-compose]',
+  compose: composeChipSlash,
+  enterCopied: chipEnterCopied,
+  leaveCopied: chipLeaveCopied,
+};
+
+const EMPTY_CTA_SPEC: AffordanceSpec = {
+  selector: '.swim-empty-cta .sec-cta[data-swim-empty-copy]',
+  compose: composeEmptyCtaSlash,
+  enterCopied: ctaEnterCopied,
+  leaveCopied: ctaLeaveCopied,
+};
+
+function enterCopiedState(button: HTMLButtonElement, spec: AffordanceSpec): void {
+  button.classList.add('copied');
+  button.setAttribute('aria-label', COPIED_ARIA_LABEL);
+  spec.enterCopied(button);
+}
+
+function leaveCopiedState(button: HTMLButtonElement, spec: AffordanceSpec): void {
+  button.classList.remove('copied');
+  const original = originalAriaLabel.get(button);
+  if (original !== undefined) button.setAttribute('aria-label', original);
+  spec.leaveCopied(button);
+}
+
 /**
  * Schedule the revert. Any prior revert-timer on this button is
  * cleared first so rapid double-clicks restart the flash window —
- * the chip stays in `.copied` for ~2000ms after the LAST click, not
- * after the first.
+ * the affordance stays in `.copied` for ~2000ms after the LAST
+ * click, not after the first.
  */
-function scheduleRevert(button: HTMLButtonElement): void {
+function scheduleRevert(button: HTMLButtonElement, spec: AffordanceSpec): void {
   const prior = pendingTimers.get(button);
   if (prior !== undefined) window.clearTimeout(prior);
   const handle = window.setTimeout(() => {
     pendingTimers.delete(button);
-    leaveCopiedState(button);
+    leaveCopiedState(button, spec);
   }, COPIED_FLASH_MS);
   pendingTimers.set(button, handle);
 }
 
-/**
- * Read the (laneId, firstStage) tuple off the chip's data attrs and
- * compose the slash command. Returns null when either attribute is
- * missing — caller treats that as an invalid gesture.
- */
-function readChipData(
-  button: HTMLButtonElement,
-): { laneId: string; firstStage: string } | null {
-  const laneId = button.dataset.laneId;
-  const firstStage = button.dataset.firstStage;
-  if (laneId === undefined || firstStage === undefined) return null;
-  return { laneId, firstStage };
-}
-
 /**
  * Perform the clipboard write + transition into the flash state.
  *
@@ -123,13 +185,10 @@ function readChipData(
  * degraded path — the operator seeing the surface as broken is the
  * correct signal.
  */
-async function copyAndFlash(button: HTMLButtonElement): Promise<void> {
-  const data = readChipData(button);
-  if (data === null) {
-    throw new Error(
-      '.swim-compose chip missing data-lane-id or data-first-stage',
-    );
-  }
+async function copyAndFlash(
+  button: HTMLButtonElement,
+  spec: AffordanceSpec,
+): Promise<void> {
   // `navigator.clipboard` is missing on http (non-secure) contexts
   // and in jsdom without an explicit shim. Surface the missing API
   // as a runtime error per the no-fallback rule.
@@ -139,22 +198,25 @@ async function copyAndFlash(button: HTMLButtonElement): Promise<void> {
       + 'compose chip requires a secure (https) context',
     );
   }
-  const text = composeSlashCommand(data.laneId, data.firstStage);
+  const text = spec.compose(button.dataset);
   await navigator.clipboard.writeText(text);
-  enterCopiedState(button);
-  scheduleRevert(button);
+  enterCopiedState(button, spec);
+  scheduleRevert(button, spec);
 }
 
 /**
- * Resolve a chip-activation gesture (click OR Space keydown).
+ * Resolve an affordance-activation gesture (click OR Space keydown).
  * Returns false when collapse precedence blocks the gesture; throws
  * the underlying clipboard error otherwise so the caller (and any
  * test that spies on rejection) sees the failure.
  */
-async function activateChip(button: HTMLButtonElement): Promise<boolean> {
+async function activateAffordance(
+  button: HTMLButtonElement,
+  spec: AffordanceSpec,
+): Promise<boolean> {
   const swim = button.closest<HTMLElement>('.swim[data-lane-id]');
   if (swim !== null && swim.classList.contains('collapsed')) return false;
-  await copyAndFlash(button);
+  await copyAndFlash(button, spec);
   return true;
 }
 
@@ -173,39 +235,49 @@ function surfaceActivationError(err: unknown): void {
   });
 }
 
-function bindChip(button: HTMLButtonElement): void {
+function bindAffordance(button: HTMLButtonElement, spec: AffordanceSpec): void {
   const renderedAriaLabel = button.getAttribute('aria-label');
   if (renderedAriaLabel !== null) {
     originalAriaLabel.set(button, renderedAriaLabel);
   }
   button.addEventListener('click', (ev) => {
-    // Stop the click from bubbling into `swimlane-collapse.ts`'s
-    // swim-head handler (which would otherwise also toggle the lane
-    // collapse on every chip click). Mirrors the pattern in
-    // `swimlane-view-toggle.ts:202–204`.
+    // Stop the click from bubbling into the swim-head /
+    // swim-body's collapse handler (which would otherwise also
+    // toggle the lane collapse on every affordance click).
     ev.stopPropagation();
-    activateChip(button).catch(surfaceActivationError);
+    activateAffordance(button, spec).catch(surfaceActivationError);
   });
   button.addEventListener('keydown', (ev) => {
     if (ev.key !== ' ') return;
-    // Space activates the chip. Per WCAG 2.1 SC 2.1.1, preventDefault
-    // to suppress page scroll. Enter is free with the native
-    // `<button>` keyboard contract — no extra handler needed.
+    // Suppress held-Space auto-repeat so a long press doesn't fire N
+    // clipboard writes (each keydown auto-repeat would otherwise re-
+    // invoke `activateAffordance`). The single-activation contract
+    // matches the click handler's one-shot semantics.
+    if (ev.repeat) return;
+    // Space activates the affordance. Per WCAG 2.1 SC 2.1.1,
+    // preventDefault to suppress page scroll. Enter is free with
+    // the native `<button>` keyboard contract — no extra handler
+    // needed.
     ev.preventDefault();
-    activateChip(button).catch(surfaceActivationError);
+    activateAffordance(button, spec).catch(surfaceActivationError);
   });
 }
 
 /**
- * Entry point — wire compose-chip handlers for every swim on the
- * page. No-op when the bay-shell is absent.
+ * Entry point — wire compose-chip + empty-lane CTA handlers for
+ * every swim on the page. No-op when the bay-shell is absent.
  */
 export function initSwimlaneCompose(): void {
   const shell = document.querySelector<HTMLElement>('[data-bay-shell]');
   if (shell === null) return;
   for (const button of document.querySelectorAll<HTMLButtonElement>(
-    '.swim-compose[data-swim-compose]',
+    COMPOSE_CHIP_SPEC.selector,
+  )) {
+    bindAffordance(button, COMPOSE_CHIP_SPEC);
+  }
+  for (const button of document.querySelectorAll<HTMLButtonElement>(
+    EMPTY_CTA_SPEC.selector,
   )) {
-    bindChip(button);
+    bindAffordance(button, EMPTY_CTA_SPEC);
   }
 }
diff --git a/plugins/deskwork-studio/public/src/dashboard/swimlane-mobile-sheet.ts b/plugins/deskwork-studio/public/src/dashboard/swimlane-mobile-sheet.ts
new file mode 100644
index 0000000..373469e
--- /dev/null
+++ b/plugins/deskwork-studio/public/src/dashboard/swimlane-mobile-sheet.ts
@@ -0,0 +1,132 @@
+/**
+ * Mobile lane-visibility sheet controller — Phase 5 Task 5.3.3.
+ *
+ * At phone widths the lane-visibility rail is repositioned by CSS into
+ * a slide-up bottom sheet. This controller wires the bay-head's
+ * `[data-lane-sheet-trigger]` button ("Lanes ▾") to open/close the
+ * `[data-lane-sheet]` container. Dismiss paths:
+ *
+ *   - Trigger click (toggles open <-> closed).
+ *   - Backdrop tap (`[data-lane-sheet-backdrop]`).
+ *   - Escape key.
+ *   - Activating a rail row (clicking or keyboard-activating a
+ *     `[data-rail-lane]` inside the sheet) — the focus/visibility
+ *     change is the operator's intent; the sheet closes so they see
+ *     the bay update without manual dismissal.
+ *
+ * Per `.claude/rules/affordance-placement.md`, the trigger lives ON
+ * the bay-head (the bay's local chrome) — lanes are a bay concern,
+ * not a page-level concern.
+ *
+ * Per THESIS Consequence 2, no sidecar mutation: this is pure
+ * client-side state on top of the rail the existing
+ * `bindRailEyeToggles` controller already manages.
+ *
+ * Mirrors the existing slide-up sheet patterns at
+ * `entry-review/mobile-sheet-bar.ts` and `dashboard/compose-chip.ts`
+ * via the shared `createSlideUpSheet` controller. New idioms are
+ * limited to (a) the trigger's `aria-expanded` mirroring and (b) the
+ * focus-return-to-trigger contract on close.
+ */
+
+import { createSlideUpSheet } from '../mobile-shell/sheet-controller.ts';
+
+/**
+ * Bind the mobile lane-visibility sheet. No-op when the trigger or
+ * sheet container is absent (e.g., on routes that don't render the
+ * bay shell). Returns early without throwing.
+ */
+export function initSwimlaneMobileSheet(): void {
+  const trigger = document.querySelector<HTMLButtonElement>(
+    '[data-lane-sheet-trigger]',
+  );
+  const sheet = document.querySelector<HTMLElement>('[data-lane-sheet]');
+  if (trigger === null || sheet === null) return;
+
+  const backdrop = sheet.querySelector<HTMLElement>(
+    '[data-lane-sheet-backdrop]',
+  );
+
+  // The shared controller flips `data-lane-sheet-open` on document.
+  // body; the CSS rules in dashboard-swimlane.css translate that into
+  // a slide-up reveal on the `[data-lane-sheet]` container. Local
+  // state mirrors `aria-expanded` on the trigger.
+  const sheetController = createSlideUpSheet({
+    sheetEl: sheet,
+    bodyOpenAttr: 'data-lane-sheet-open',
+    scrimEl: backdrop ?? undefined,
+    onClose: () => {
+      sheet.classList.remove('is-open');
+      trigger.setAttribute('aria-expanded', 'false');
+      // Return focus to the trigger so a sighted operator's pointer
+      // and an AT user's reading focus both land on the affordance
+      // that opened the sheet (per the standard disclosure-widget
+      // contract).
+      trigger.focus();
+    },
+  });
+
+  function openSheet(): void {
+    sheet!.classList.add('is-open');
+    trigger!.setAttribute('aria-expanded', 'true');
+    sheetController.open();
+    focusFirstSheetTarget();
+  }
+
+  function closeSheet(): void {
+    sheetController.close();
+  }
+
+  function focusFirstSheetTarget(): void {
+    // Prefer the first rail row's eye-button (the row's primary
+    // affordance); fall back to the first rail row (a real
+    // role="button" focusable). Either focus lands the operator
+    // inside the sheet content.
+    const firstEye = sheet!.querySelector<HTMLElement>(
+      '[data-rail-lane] .r-eye-btn',
+    );
+    if (firstEye !== null) {
+      firstEye.focus();
+      return;
+    }
+    const firstRow = sheet!.querySelector<HTMLElement>('[data-rail-lane]');
+    if (firstRow !== null) firstRow.focus();
+  }
+
+  trigger.addEventListener('click', () => {
+    if (sheetController.isOpen()) {
+      closeSheet();
+    } else {
+      openSheet();
+    }
+  });
+
+  // Closing on rail-row activation: the swimlane controller's row
+  // handler runs first (mutating focus/visibility state); this
+  // sibling handler closes the sheet so the operator sees the bay
+  // update. Listening at the sheet root (capture=false) honors the
+  // gesture's natural bubbling order — both handlers fire from the
+  // same click without coordination.
+  //
+  // Eye-button activations are explicitly a "hide/show without
+  // dismissing the sheet" gesture — operators flipping visibility
+  // through the rail expect to see the result inside the sheet
+  // before closing it. Both click and keyboard paths defer to the
+  // same predicate so the close contract is identical across input
+  // modalities.
+  function shouldCloseOnTarget(target: EventTarget | null): boolean {
+    if (!(target instanceof Element)) return false;
+    if (target.closest('.r-eye-btn') !== null) return false;
+    if (target.closest('[data-rail-lane]') === null) return false;
+    return sheetController.isOpen();
+  }
+
+  sheet.addEventListener('click', (ev) => {
+    if (shouldCloseOnTarget(ev.target)) closeSheet();
+  });
+
+  sheet.addEventListener('keydown', (ev) => {
+    if (ev.key !== 'Enter' && ev.key !== ' ') return;
+    if (shouldCloseOnTarget(ev.target)) closeSheet();
+  });
+}
diff --git a/plugins/deskwork-studio/public/src/dashboard/swimlane.ts b/plugins/deskwork-studio/public/src/dashboard/swimlane.ts
index 0e0a117..362f217 100644
--- a/plugins/deskwork-studio/public/src/dashboard/swimlane.ts
+++ b/plugins/deskwork-studio/public/src/dashboard/swimlane.ts
@@ -46,7 +46,7 @@ import {
 const FOCUS_KEY_SUFFIX = ':focus';
 const VISIBILITY_KEY_SUFFIX = ':visibility';
 
-interface SwimlaneState {
+export interface SwimlaneState {
   /** Set of lane ids currently focused. */
   readonly focused: Set<string>;
   /**
@@ -205,10 +205,12 @@ function persist(state: SwimlaneState, projectKey: string): void {
 }
 
 /**
- * Single shared focus toggle. Used by both the per-lane focus chips
- * and the rail row clicks — same semantics, two affordances.
+ * Single shared focus toggle. Used by the per-lane focus chips —
+ * those callers never want to surface a hidden lane (the chip's CSS
+ * `is-visibility-hidden` rule hides it from the strip entirely).
  * Returns true when the toggle actually fired (visible lanes); false
- * when ignored (hidden lanes don't participate in focus).
+ * when ignored (hidden lanes don't participate in focus from the
+ * chip path).
  */
 function toggleFocus(
   state: SwimlaneState,
@@ -226,6 +228,43 @@ function toggleFocus(
   return true;
 }
 
+/**
+ * Task 5.3.2 — rail-row activation contract: the rail acts as the
+ * master list of every lane (visible AND hidden). Clicking (or
+ * keyboard-activating) a rail row has a dual semantics:
+ *
+ *   - On a HIDDEN lane: flip visibility ON AND add the lane to focus
+ *     in a single gesture. This is the "bring it back" semantic the
+ *     rail exists to serve.
+ *   - On a VISIBLE lane: toggle focus on/off (the existing 5.1
+ *     behavior).
+ *
+ * The dedicated `.r-eye-btn` (handled separately) still exclusively
+ * toggles persistent visibility — its click path stays unchanged so
+ * the operator retains the "hide without focusing" gesture.
+ *
+ * Returns the activation kind so callers (e.g. the mobile-sheet
+ * controller) can chain additional behavior — closing the sheet on
+ * focus activation, for instance.
+ */
+export type RailRowActivation = 'unhid-and-focused' | 'focus-toggled';
+
+export function handleRailRowActivation(
+  state: SwimlaneState,
+  projectKey: string,
+  id: string,
+): RailRowActivation {
+  if (state.hidden.has(id)) {
+    state.hidden.delete(id);
+    state.focused.add(id);
+    applyState(state);
+    persist(state, projectKey);
+    return 'unhid-and-focused';
+  }
+  toggleFocus(state, projectKey, id);
+  return 'focus-toggled';
+}
+
 function bindFocusChips(state: SwimlaneState, projectKey: string): void {
   // Per-lane chips.
   for (const chip of document.querySelectorAll<HTMLButtonElement>(
@@ -292,16 +331,19 @@ function bindRailEyeToggles(
     }
 
     row.addEventListener('click', () => {
-      toggleFocus(state, projectKey, id);
+      handleRailRowActivation(state, projectKey, id);
     });
 
     // F5 a11y fix: keyboard activation for the row's role="button".
     // Enter and Space both activate; preventDefault on Space stops
-    // the default page-scroll.
+    // the default page-scroll. Per Task 5.3.2 the keyboard path
+    // mirrors the click path — both gestures dispatch through
+    // `handleRailRowActivation` so hidden-lane Enter unhides + focuses
+    // identically to click.
     row.addEventListener('keydown', (ev) => {
       if (ev.key !== 'Enter' && ev.key !== ' ') return;
       ev.preventDefault();
-      toggleFocus(state, projectKey, id);
+      handleRailRowActivation(state, projectKey, id);
     });
   }
 }
diff --git a/plugins/deskwork-studio/public/src/editorial-studio-client.ts b/plugins/deskwork-studio/public/src/editorial-studio-client.ts
index e954f27..357604b 100644
--- a/plugins/deskwork-studio/public/src/editorial-studio-client.ts
+++ b/plugins/deskwork-studio/public/src/editorial-studio-client.ts
@@ -13,6 +13,7 @@ import { initSwimlane } from './dashboard/swimlane.ts';
 import { initSwimlaneCollapse } from './dashboard/swimlane-collapse.ts';
 import { initSwimlaneViewToggle } from './dashboard/swimlane-view-toggle.ts';
 import { initSwimlaneCompose } from './dashboard/swimlane-compose.ts';
+import { initSwimlaneMobileSheet } from './dashboard/swimlane-mobile-sheet.ts';
 import { initMastheadPopover } from './mobile-shell/masthead-popover.ts';
 
 function siteFromButton(btn: HTMLButtonElement): string {
@@ -521,6 +522,7 @@ function init(): void {
   initSwimlaneCollapse();
   initSwimlaneViewToggle();
   initSwimlaneCompose();
+  initSwimlaneMobileSheet();
   initRowActions();
   initMastheadPopover();
 }


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
