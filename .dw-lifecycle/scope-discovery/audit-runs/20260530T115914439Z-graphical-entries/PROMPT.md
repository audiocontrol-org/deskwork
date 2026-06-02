# Audit-barrage — multi-model audit prompt template

You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface bugs, design issues, missed edge cases, and code-quality concerns in the work product captured in the diff below.

You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.

## Feature under audit

graphical-entries

## Feature scope (workplan / PRD summary)

Phase 6 Tasks 6.1 + 6.2 of graphical-entries: /deskwork:lane + /deskwork:pipeline CLI skill families. Task 6.1 ships /deskwork:lane (SKILL.md + CLI dispatcher + per-verb core modules under packages/core/src/lanes/ — create/show/list/update/archive/restore/purge/move). Path-traversal hardening on lane id (LANE_ID_REGEX); atomic write via tmp-file + rename; move-rollback on partial-failure; 45 CLI tests. Task 6.2 ships /deskwork:pipeline skill family with similar shape — list/show/create/update/archive/restore/purge/rename; rename triggers sidecar migration (any entry bound to the old id gets its lane.pipelineTemplate field updated atomically); customize wrapper for editing presets. 64 CLI tests. 3 BLOCKING bugs caught at quality-review and fixed pre-merge. Audit focus: CLI argument parsing edge cases; refusal semantics across verbs; atomic-write correctness under crash; rename-migration round-trip; XSS / injection via CLI flag values; CLI exit-code conventions; subprocess test reliability.

## Commit subjects in the audited range

f0ae002 feat(graphical-entries): Phase 6 Task 6.2 — /deskwork:pipeline skill family
4c2fbe4 docs(graphical-entries): Phase 6 Task 6.1 — workplan boxes + audit-log
5890161 fix(graphical-entries): Phase 6 Task 6.1 review followups (lane id validation + atomic writes + move rollback + readability polish)
a2f8c18 feat(graphical-entries): Phase 6 Task 6.1 — /deskwork:lane skill family


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
index c975e6b..e18ce68 100644
--- a/.dw-lifecycle/scope-discovery/clones.yaml
+++ b/.dw-lifecycle/scope-discovery/clones.yaml
@@ -1,4 +1,4 @@
-generated_at: 2026-05-28T23:33:10.111Z
+generated_at: 2026-05-29T00:02:23.242Z
 clones:
   - id: 014b49040fe1
     lines: 13
@@ -121,6 +121,77 @@ clones:
       - packages/cli/src/commands/publish.ts:53:65
     disposition: pending
     reason: null
+  - id: 1d7745b2f157
+    lines: 13
+    members:
+      - packages/cli/src/commands/lane.ts:142:154
+      - packages/cli/src/commands/pipeline.ts:148:160
+    disposition: keep-with-reason
+    reason: "Phase 6 Task 6.2: intentional pipeline-vs-lane CLI handler symmetry (usage banners, error catch shape, JSON emit shape). The verb families share a dispatch contract by design; collapsing would mean a generic 'CRUD dispatcher' that obscures per-verb argument validation."
+  - id: 35dd3acfbdb6
+    lines: 11
+    members:
+      - packages/cli/src/commands/lane.ts:185:195
+      - packages/cli/src/commands/pipeline.ts:186:196
+    disposition: keep-with-reason
+    reason: "Phase 6 Task 6.2: intentional pipeline-vs-lane CLI handler symmetry (usage banners, error catch shape, JSON emit shape). The verb families share a dispatch contract by design; collapsing would mean a generic 'CRUD dispatcher' that obscures per-verb argument validation."
+  - id: 51bf553937e3
+    lines: 11
+    members:
+      - packages/cli/src/commands/lane.ts:220:230
+      - packages/cli/src/commands/pipeline.ts:296:305
+    disposition: keep-with-reason
+    reason: "Phase 6 Task 6.2: intentional pipeline-vs-lane CLI handler symmetry (usage banners, error catch shape, JSON emit shape). The verb families share a dispatch contract by design; collapsing would mean a generic 'CRUD dispatcher' that obscures per-verb argument validation."
+  - id: 99d2afe73b96
+    lines: 28
+    members:
+      - packages/cli/src/commands/lane.ts:68:95
+      - packages/cli/src/commands/pipeline.ts:84:111
+    disposition: keep-with-reason
+    reason: "Phase 6 Task 6.2: intentional pipeline-vs-lane CLI handler symmetry (usage banners, error catch shape, JSON emit shape). The verb families share a dispatch contract by design; collapsing would mean a generic 'CRUD dispatcher' that obscures per-verb argument validation."
+  - id: f8fd4881f0dc
+    lines: 12
+    members:
+      - packages/cli/src/commands/pipeline.ts:213:228
+      - packages/cli/src/commands/pipeline.ts:312:323
+    disposition: keep-with-reason
+    reason: "Phase 6 Task 6.2: in-file similarity between handleCreate (parse --shape, emit created result) and handleDelete (parse --reassign-lanes-to, emit deleted result). Both follow the verb-handler shape (parse → invoke core → emit) but operate on different argument structures and different result envelopes; collapsing into a generic verb handler would obscure per-verb argument validation."
+  - id: d93c17540f3a
+    lines: 29
+    members:
+      - packages/cli/test/lane/helpers.ts:11:39
+      - packages/cli/test/pipeline/helpers.ts:11:33
+    disposition: keep-with-reason
+    reason: "Phase 6 Task 6.2: intentional pipeline-vs-lane symmetry. Pipeline CRUD mirrors Task 6.1 lane CRUD by design (atomic commit helpers, tmp-fixture test helpers, sidecar writers); premature DRY would couple two evolving lifecycles."
+  - id: 2e09e327a82a
+    lines: 19
+    members:
+      - packages/cli/test/lane/helpers.ts:141:159
+      - packages/cli/test/pipeline/helpers.ts:178:196
+    disposition: keep-with-reason
+    reason: "Phase 6 Task 6.2: intentional pipeline-vs-lane symmetry. Pipeline CRUD mirrors Task 6.1 lane CRUD by design (atomic commit helpers, tmp-fixture test helpers, sidecar writers); premature DRY would couple two evolving lifecycles."
+  - id: 6f13bea8f16e
+    lines: 26
+    members:
+      - packages/cli/test/lane/helpers.ts:56:81
+      - packages/cli/test/pipeline/helpers.ts:50:75
+    disposition: keep-with-reason
+    reason: "Phase 6 Task 6.2: intentional pipeline-vs-lane symmetry. Pipeline CRUD mirrors Task 6.1 lane CRUD by design (atomic commit helpers, tmp-fixture test helpers, sidecar writers); premature DRY would couple two evolving lifecycles."
+  - id: b99074143b08
+    lines: 11
+    members:
+      - packages/cli/test/lane/helpers.ts:84:94
+      - packages/cli/test/pipeline/helpers.ts:78:88
+      - packages/cli/test/pipeline/helpers.ts:91:101
+    disposition: keep-with-reason
+    reason: "Phase 6 Task 6.2: intentional pipeline-vs-lane symmetry. Pipeline CRUD mirrors Task 6.1 lane CRUD by design (atomic commit helpers, tmp-fixture test helpers, sidecar writers); premature DRY would couple two evolving lifecycles."
+  - id: b182ab3fd6d1
+    lines: 27
+    members:
+      - packages/cli/test/lane/helpers.ts:91:117
+      - packages/cli/test/pipeline/helpers.ts:150:176
+    disposition: keep-with-reason
+    reason: "Phase 6 Task 6.2: intentional pipeline-vs-lane symmetry. Pipeline CRUD mirrors Task 6.1 lane CRUD by design (atomic commit helpers, tmp-fixture test helpers, sidecar writers); premature DRY would couple two evolving lifecycles."
   - id: 44c103564dce
     lines: 9
     members:
@@ -253,17 +324,31 @@ clones:
   - id: c20b4e4f0469
     lines: 9
     members:
-      - packages/core/src/lanes/loader.ts:59:67
-      - packages/core/src/pipelines/loader.ts:72:80
+      - packages/core/src/lanes/loader.ts:120:128
+      - packages/core/src/pipelines/loader.ts:163:171
     disposition: keep-with-reason
     reason: "lanes/loader mirrors pipelines/loader by workplan design: JSON-read+Zod-validate+id-match-filename idiom across two parallel module-shaped readers; extracting a shared helper would couple lane evolution to pipeline evolution"
   - id: b223f2def90d
     lines: 7
     members:
-      - packages/core/src/lanes/loader.ts:69:75
-      - packages/core/src/pipelines/loader.ts:82:88
+      - packages/core/src/lanes/loader.ts:130:136
+      - packages/core/src/pipelines/loader.ts:173:179
     disposition: keep-with-reason
     reason: second half of the lanes/loader vs pipelines/loader mirroring (Zod-validate + id-mismatch refusal); same rationale as c20b4e4f0469
+  - id: 93e1ae2c9a27
+    lines: 15
+    members:
+      - packages/core/src/lanes/operations/commit.ts:45:59
+      - packages/core/src/pipelines/operations/commit.ts:45:59
+    disposition: keep-with-reason
+    reason: "Phase 6 Task 6.2: intentional pipeline-vs-lane symmetry. Pipeline CRUD mirrors Task 6.1 lane CRUD by design (atomic commit helpers, tmp-fixture test helpers, sidecar writers); premature DRY would couple two evolving lifecycles."
+  - id: b1fd648407e9
+    lines: 10
+    members:
+      - packages/core/src/pipelines/operations/update.ts:284:293
+      - packages/core/src/pipelines/operations/update.ts:307:316
+    disposition: keep-with-reason
+    reason: "Phase 6 Task 6.2: in-file similarity between applySetLocked and applySetOffPipeline — both validate each comma-separated stage against linearStages with mirror invariants. Collapsing into a shared helper would obscure the asymmetry (set-locked enforces subset, set-off-pipeline enforces disjoint) that matters at the error-message level."
   - id: 68e3966349bd
     lines: 11
     members:
diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
index be21ce5..3b2a316 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
@@ -1258,3 +1258,175 @@ Tooling-feedback during the cycle:
 Phase 5 audit log: AUDIT-01 through AUDIT-39, 39 findings total. All
 blocking findings closed; non-blocking observations either applied
 inline or tracked as `open` with explicit fix guidance.
+
+## Phase 6 Task 6.1 — `/deskwork:lane` skill family — review cycle (2026-05-28)
+
+Task 6.1 shipped at `5941c00` (feat) + `c2be222` (review followups). The
+SDD discipline ran one spec-compliance review pass + one code-quality
+review pass; the orchestrator triaged 11 findings into 6 applied, 2
+declined-with-reasoning, 3 audit-trail observations.
+
+### AUDIT-20260528-40 — Lane id charset + path-traversal validation
+
+Finding-ID: AUDIT-20260528-40
+Status:     fixed-c2be222
+Severity:   blocking (security)
+Surface:    `packages/core/src/lanes/types.ts:57`, `packages/core/src/lanes/loader.ts:101-115`
+
+`LaneConfigSchema.id` was `z.string().min(1)` only, with no charset
+restriction and no filesystem-boundary check. `lane create
+"../../etc/foo" --template editorial --content-dir docs` would have
+resolved to a file outside `.deskwork/lanes/`. Same exposure on every
+verb taking `<id>`; same exposure on `--content-dir` (operator passing
+`../../tmp/foo` writes outside the project tree).
+
+Fix: tightened schema to `.regex(/^[a-z0-9][a-z0-9-]*$/)` matching the
+documented kebab-case convention; added `assertSafeLaneId` (regex +
+path-containment) and `assertSafeContentDir` (project-root-containment)
+helpers at `loader.ts:54, 86`; wired both into `loadLaneConfig`,
+`createLane`, and `updateLane` (update covered as in-scope hardening —
+the operator-controlled `--content-dir` flag exposes the same surface).
+Tests cover invalid id chars, traversal-resolving id, and
+traversal-resolving contentDir at `packages/core/test/lanes/loader.test.ts:127`
+and `packages/cli/test/lane/list-show-create.test.ts:222`.
+
+### AUDIT-20260528-41 — Atomic write in lane-config commit helper
+
+Finding-ID: AUDIT-20260528-41
+Status:     fixed-c2be222
+Severity:   non-blocking (data safety)
+Surface:    `packages/core/src/lanes/operations/commit.ts:38`
+
+`writeFileSync(path, ...)` was a direct write; a crash mid-write would
+have left a truncated `.deskwork/lanes/<id>.json` that `loadLaneConfig`
+then rejects on every subsequent read until hand-repair.
+
+Fix: switched to tmp + rename pattern mirroring `packages/core/src/sidecar/write.ts`;
+wrapped in try/catch with tmp-file cleanup on failure; documented the
+helper's purpose in the file header so the name's git-connotation
+doesn't mislead future readers.
+
+### AUDIT-20260528-42 — Move rollback when writeSidecar fails
+
+Finding-ID: AUDIT-20260528-42
+Status:     fixed-c2be222
+Severity:   non-blocking (data safety)
+Surface:    `packages/core/src/lanes/operations/move.ts:228-260`
+
+Lines 228 (artifact move), 248 (scrapbook move), 260 (sidecar write)
+were not atomic. A `writeSidecar` failure after the fs moves succeed
+would have left the entry half-moved — artifact + scrapbook in target
+lane's contentDir but sidecar still recording old lane. Subsequent
+`lane move` re-runs would fail with "source artifact does not exist."
+
+Fix: wrapped 228–260 in try block; tracks `artifactMoved` /
+`scrapbookMoved` booleans; on catch, reverses successful fs moves in
+LIFO order before re-throwing with context (slug + "rolled back" +
+cause). Same pattern as the pre-existing collision rollback at line 240,
+extended to the success-then-write-fails path. Regression test marks
+the entries dir read-only post-move and confirms rollback restores
+artifact + scrapbook to source.
+
+### AUDIT-20260528-43 — handleMove pattern consistency
+
+Finding-ID: AUDIT-20260528-43
+Status:     fixed-c2be222
+Severity:   non-blocking (readability)
+Surface:    `packages/cli/src/commands/lane.ts:298-343`
+
+`handleMove` used an early try/catch around `resolveEntryUuid` plus a
+second try/catch around the rest; every other handler uses one trailing
+try/catch.
+
+Fix: merged the two try blocks; resolveEntryUuid lives inside the main
+try; one outer catch routes through `fail(err.message)` — matches the
+shape of all 7 other handlers.
+
+### AUDIT-20260528-44 — Magic constant 5 in purge sample limit
+
+Finding-ID: AUDIT-20260528-44
+Status:     fixed-c2be222
+Severity:   non-blocking (maintainability)
+Surface:    `packages/core/src/lanes/operations/purge.ts:43`
+
+`5` appeared in the slice, the file comment, and the SKILL.md — three
+sites that would drift if the limit changed.
+
+Fix: extracted `PURGE_DEPENDENTS_SAMPLE_LIMIT = 5` at module top;
+referenced from the slice and the file comment. SKILL.md left numeric
+per orchestrator instruction (reader-facing doc).
+
+### AUDIT-20260528-45 — Defensive binary-presence check in test helpers
+
+Finding-ID: AUDIT-20260528-45
+Status:     fixed-c2be222
+Severity:   non-blocking (DX)
+Surface:    `packages/cli/test/lane/helpers.ts:25`
+
+Tests `spawnSync(deskworkBin, ...)` would have reported `code: -1` with
+empty stdout/stderr if the test runner ran without an `npm install`
+pre-step — confusing failure mode for new contributors.
+
+Fix: added `assertDeskworkBinPresent` helper at `helpers.ts:34`; each
+test file invokes it once in `beforeAll`. Surfaces an actionable error
+naming the missing path and the remediation step.
+
+### AUDIT-20260528-46 — Per-handler arg-parsing dance duplicated 8 times
+
+Finding-ID: AUDIT-20260528-46
+Status:     declined-not-net-debt
+Severity:   non-blocking (DRY)
+Surface:    `packages/cli/src/commands/lane.ts:150-343`
+
+The 8 verb handlers share roughly 3 lines of boilerplate each for
+required-positional + required-flag checks.
+
+Declined: extracting a `requireArg`/`requireFlag` helper would replace
+3 readable lines per handler with one indirection step plus a helper
+file. Current shape is the natural CLI shape and matches `cancel.ts` /
+`induct.ts` precedent; the cost of helper indirection exceeds the
+DRY-saving. Not net-new debt; recorded as a deliberate orchestrator
+choice for the audit trail.
+
+### AUDIT-20260528-47 — commit.ts filename overloaded with git connotations
+
+Finding-ID: AUDIT-20260528-47
+Status:     declined-no-confusion-observed
+Severity:   observation
+Surface:    `packages/core/src/lanes/operations/commit.ts:1-40`
+
+The filename `commit.ts` shares vocabulary with `git commit`. The file
+actually does atomic-write-lane-config-to-disk (per AUDIT-41 fix).
+
+Declined: file header comment names the purpose ("Atomic write helper
+for lane config JSON files. Mirrors packages/core/src/sidecar/write.ts.")
+explicitly. No actual reader confusion has surfaced. Rename costs
+the import-graph an update without surfacing user value. Recorded as
+deliberate orchestrator choice for the audit trail.
+
+### AUDIT-20260528-48 — LaneMigrationEvent shape variation from new Lane*Event variants
+
+Finding-ID: AUDIT-20260528-48
+Status:     open (pre-existing; out of scope for Task 6.1)
+Severity:   observation
+Surface:    `packages/core/src/schema/journal-events.ts:104-117` (pre-existing) vs `journal-events.ts:148-203` (new)
+
+The pre-existing `LaneMigrationEvent` uses `migration / source / target`
+keys; the 6 new Lane*Event variants use `laneId`. `LaneMoveEvent` is the
+only new variant that uses `entryId` instead (well-justified by the
+schema docstring at lines 143-146).
+
+Pre-existing schema-shape inconsistency. Not introduced by Task 6.1.
+Worth a harmonization pass that either renames `LaneMigrationEvent`
+fields or documents the split; that pass should be a separate refactor
+with its own clones.yaml disposition. Filed as open for future
+consideration.
+
+### Task 6.1 closing summary
+
+- Spec-compliance review: SPEC-COMPLIANT WITH NON-BLOCKING OBSERVATIONS (3 audit-trail items recorded above).
+- Code-quality review: QUALITY-APPROVED WITH NON-BLOCKING OBSERVATIONS (11 findings; 6 applied at c2be222, 2 declined-with-reasoning, 3 audit-trail observations).
+- Test deltas: core 706 → 708 (+2); CLI lane suite 39 → 45 (+6).
+- Builds: `@deskwork/core` exit 0; `@deskwork/cli` exit 0.
+- Pre-existing CLI test failures verified unrelated to 5941c00/c2be222 by checkout-parent-and-rerun: `test/publish-entry-centric.test.ts:139`, `test/approve-entry-centric.test.ts:129`.
+- AUDIT-40 (security) was the highest-value finding — closed a real attack surface the operator-facing CLI exposed unintentionally.
diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
index dae2fd5..0e8616e 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
@@ -295,11 +295,11 @@ The picked design **pivots away from the PRD's original "per-lane tab strip" fra
 
 ### Task 6.1: `/deskwork:lane` skill family
 
-- [ ] Step 6.1.1: Author SKILL.md at `plugins/deskwork/skills/lane/SKILL.md` documenting subcommands: `list`, `show <id>`, `create <id> --template <preset-or-custom> --content-dir <path>`, `update <id> [--template <id>] [--name <label>] [--content-dir <path>]`, `archive <id>`, `restore <id>`, `purge <id>` (gated; refused if any entries exist), `move <slug> --to <lane-id>` (cross-lane entry move with stage remap prompt).
-- [ ] Step 6.1.2: CLI implementation at `packages/cli/src/commands/lane.ts` covering each subcommand; reads / writes `.deskwork/lanes/<id>.json` via Phase 3's loader.
-- [ ] Step 6.1.3: Stage remap on cross-lane move: prompt operator for target stage; default to target lane's first linearStage; preserve `iterationByStage` counters per PRD's open-question default.
-- [ ] Step 6.1.4: Content-tree relocation on lane move: move the artifact file (and scrapbook) to the new lane's `contentDir`.
-- [ ] Step 6.1.5: Unit tests covering each subcommand against a tmp-fixture.
+- [x] Step 6.1.1: Author SKILL.md at `plugins/deskwork/skills/lane/SKILL.md` documenting subcommands: `list`, `show <id>`, `create <id> --template <preset-or-custom> --content-dir <path>`, `update <id> [--template <id>] [--name <label>] [--content-dir <path>]`, `archive <id>`, `restore <id>`, `purge <id>` (gated; refused if any entries exist), `move <slug> --to <lane-id>` (cross-lane entry move with stage remap prompt).
+- [x] Step 6.1.2: CLI implementation at `packages/cli/src/commands/lane.ts` covering each subcommand; reads / writes `.deskwork/lanes/<id>.json` via Phase 3's loader.
+- [x] Step 6.1.3: Stage remap on cross-lane move: prompt operator for target stage; default to target lane's first linearStage; preserve `iterationByStage` counters per PRD's open-question default. (Implemented non-interactively as `--target-stage <name>` with default = first linearStage; documented in SKILL.md.)
+- [x] Step 6.1.4: Content-tree relocation on lane move: move the artifact file (and scrapbook) to the new lane's `contentDir`. (Includes EXDEV fallback + transactional rollback if `writeSidecar` fails after fs moves succeed.)
+- [x] Step 6.1.5: Unit tests covering each subcommand against a tmp-fixture. (45 lane tests; subprocess-driven via `node_modules/.bin/deskwork`; covers happy path + refusal paths + path-traversal validation.)
 
 ### Task 6.2: `/deskwork:pipeline` skill family
 
diff --git a/packages/cli/src/cli.ts b/packages/cli/src/cli.ts
index a3c31f3..d8fb709 100755
--- a/packages/cli/src/cli.ts
+++ b/packages/cli/src/cli.ts
@@ -30,6 +30,8 @@ const SUBCOMMANDS: Record<string, () => Promise<{ run: (argv: string[]) => Promi
   ingest: () => import('./commands/ingest.ts'),
   install: () => import('./commands/install.ts'),
   iterate: () => import('./commands/iterate.ts'),
+  lane: () => import('./commands/lane.ts'),
+  pipeline: () => import('./commands/pipeline.ts'),
   publish: () => import('./commands/publish.ts'),
   'repair-install': () => import('./commands/repair-install.ts'),
   'shortform-start': () => import('./commands/shortform-start.ts'),
@@ -98,6 +100,10 @@ function printUsage(): void {
   out.write('Maintenance:\n');
   out.write('  doctor          audit / repair calendar + sidecar + frontmatter\n');
   out.write('  customize       copy a plugin default into .deskwork/<category>/<name>.ts\n');
+  out.write('  lane            CRUD on lane configs (list, show, create, update,\n');
+  out.write('                  archive, restore, purge, move)\n');
+  out.write('  pipeline        CRUD on pipeline templates (list, show, create,\n');
+  out.write('                  update, delete)\n');
   out.write('  repair-install  prune stale entries from Claude Code\'s plugin registry\n\n');
   out.write('Skill-only verbs (use via /deskwork:<verb>):\n');
   out.write('  status          per-entry state summary\n\n');
diff --git a/packages/cli/src/commands/customize.ts b/packages/cli/src/commands/customize.ts
index 6a1ba77..8f81ce2 100644
--- a/packages/cli/src/commands/customize.ts
+++ b/packages/cli/src/commands/customize.ts
@@ -1,10 +1,13 @@
 /**
  * deskwork customize — copy a plugin-default file into the project's
- * `.deskwork/<category>/<name>.ts` so the operator can edit it.
+ * `.deskwork/<category>/<name>.<ext>` so the operator can edit it.
  *
  * Categories:
  *   - templates  → copies `<@deskwork/studio>/dist/pages/<name>.ts`
  *   - doctor     → copies `<@deskwork/core>/dist/doctor/rules/<name>.ts`
+ *   - pipeline   → copies `<@deskwork/core>/dist/pipelines/<name>.json`
+ *                  (Phase 6 Task 6.2 — start-from-preset for
+ *                  `deskwork pipeline` mutations)
  *   - prompts    → reserved (no default-source mapping yet)
  *
  * Usage (after the dispatcher injects projectRoot):
@@ -15,7 +18,7 @@
  *      against the published package paths so it works in both
  *      workspace dev and npm-installed plugins.
  *   2. Copies the source verbatim into
- *      `<projectRoot>/.deskwork/<category>/<name>.ts`, creating the
+ *      `<projectRoot>/.deskwork/<category>/<name>.<ext>`, creating the
  *      directory tree as needed.
  *   3. Refuses if the destination file already exists — clobbering an
  *      operator's edits would be a bug-factory.
@@ -39,13 +42,27 @@ import { dirname, isAbsolute, join, resolve } from 'node:path';
 import { fileURLToPath } from 'node:url';
 import { fail } from '@deskwork/core/cli-args';
 
-const VALID_CATEGORIES = ['templates', 'prompts', 'doctor'] as const;
+const VALID_CATEGORIES = ['templates', 'prompts', 'doctor', 'pipeline'] as const;
 type Category = (typeof VALID_CATEGORIES)[number];
 
 function isCategory(value: string): value is Category {
   return (VALID_CATEGORIES as readonly string[]).includes(value);
 }
 
+/**
+ * Per-category file-extension mapping. All TypeScript-extension
+ * categories (templates, doctor) ship `.ts` source verbatim under
+ * `dist/<category>/`; the `pipeline` category copies JSON.
+ */
+const CATEGORY_EXT: Readonly<Record<Category, string>> = {
+  templates: '.ts',
+  doctor: '.ts',
+  pipeline: '.json',
+  // `prompts` is reserved; resolveDefaultSource throws before any
+  // extension lookup runs.
+  prompts: '.ts',
+};
+
 /**
  * Resolve a node module path via `import.meta.resolve`. Returns the
  * absolute file path the package's exports map points at, regardless
@@ -111,6 +128,23 @@ function resolveDefaultSource(category: Category, name: string): string {
       throw new Error(
         `no built-in template named "${name}". Available templates: ${listAvailable(
           dirname(candidate),
+          '.ts',
+        )}`,
+      );
+    }
+    return candidate;
+  }
+  if (category === 'pipeline') {
+    // Pipeline presets ship as JSON under `dist/pipelines/`. The build
+    // script copies them from `src/pipelines/*.json` so the customize
+    // anchor lives inside the `files: ["dist", ...]` whitelist.
+    const coreRoot = resolvePackageRoot('@deskwork/core');
+    const candidate = resolve(coreRoot, 'dist', 'pipelines', `${name}.json`);
+    if (!existsSync(candidate)) {
+      throw new Error(
+        `no built-in pipeline preset named "${name}". Available presets: ${listAvailable(
+          dirname(candidate),
+          '.json',
         )}`,
       );
     }
@@ -123,6 +157,7 @@ function resolveDefaultSource(category: Category, name: string): string {
     throw new Error(
       `no built-in doctor rule named "${name}". Available rules: ${listAvailable(
         dirname(candidate),
+        '.ts',
       )}`,
     );
   }
@@ -132,17 +167,17 @@ function resolveDefaultSource(category: Category, name: string): string {
 /**
  * Best-effort listing of the available basenames in a directory. Used
  * to enrich error messages when the operator passes a name that
- * doesn't match a built-in default.
+ * doesn't match a built-in default. `ext` is the extension to filter
+ * by, including the leading dot (e.g. `.ts`, `.json`).
+ *
+ * For `.ts`, declaration files (`.d.ts`) are excluded so they don't
+ * pollute the picker. JSON has no equivalent suffix.
  */
-function listAvailable(dir: string): string {
+function listAvailable(dir: string, ext: string): string {
   if (!existsSync(dir)) return '(none — broken install)';
-  // Filter to .ts files, excluding TypeScript declaration files (.d.ts)
-  // and source maps. The customize anchor is the verbatim source-copy
-  // shipped under dist/<category>/<name>.ts; declaration files alongside
-  // it would surface as bogus "available templates" entries.
   const entries = readdirSync(dir)
-    .filter((n) => n.endsWith('.ts') && !n.endsWith('.d.ts'))
-    .map((n) => n.slice(0, -'.ts'.length))
+    .filter((n) => n.endsWith(ext) && !(ext === '.ts' && n.endsWith('.d.ts')))
+    .map((n) => n.slice(0, -ext.length))
     .sort();
   return entries.join(', ');
 }
@@ -186,8 +221,14 @@ export async function run(argv: string[]): Promise<void> {
     fail(err instanceof Error ? err.message : String(err), 1);
   }
 
-  const destDir = join(projectRoot, '.deskwork', categoryArg);
-  const destFile = join(destDir, `${name}.ts`);
+  const ext = CATEGORY_EXT[categoryArg];
+  // The on-disk destination directory mirrors the category name. The
+  // pipeline category lands under `.deskwork/pipelines/` (plural) to
+  // match the pipeline loader's `pipelineOverridesDir`; every other
+  // category uses the singular form historically established.
+  const destSubdir = categoryArg === 'pipeline' ? 'pipelines' : categoryArg;
+  const destDir = join(projectRoot, '.deskwork', destSubdir);
+  const destFile = join(destDir, `${name}${ext}`);
   if (existsSync(destFile)) {
     fail(
       `destination already exists: ${destFile}\n` +
@@ -203,10 +244,25 @@ export async function run(argv: string[]): Promise<void> {
   process.stdout.write(`Customized ${categoryArg}/${name}\n`);
   process.stdout.write(`  source: ${source}\n`);
   process.stdout.write(`  dest:   ${destFile}\n`);
-  process.stdout.write(
-    '  Edit the destination file to customize behavior. The studio\n',
-  );
-  process.stdout.write(
-    '  loads the override automatically on the next request.\n',
-  );
+  if (categoryArg === 'pipeline') {
+    process.stdout.write(
+      '  Edit the JSON directly, or mutate via "deskwork pipeline update\n',
+    );
+    process.stdout.write(
+      `  ${name} --add-stage <name>" / "--rename-stage <from> --to-stage <to>" /\n`,
+    );
+    process.stdout.write(
+      '  "--remove-stage <name>" / "--set-locked <s,...>" / "--set-off-pipeline <s,...>".\n',
+    );
+    process.stdout.write(
+      '  Lanes bound to this id resolve the project override automatically.\n',
+    );
+  } else {
+    process.stdout.write(
+      '  Edit the destination file to customize behavior. The studio\n',
+    );
+    process.stdout.write(
+      '  loads the override automatically on the next request.\n',
+    );
+  }
 }
diff --git a/packages/cli/src/commands/lane.ts b/packages/cli/src/commands/lane.ts
new file mode 100644
index 0000000..3c3fd13
--- /dev/null
+++ b/packages/cli/src/commands/lane.ts
@@ -0,0 +1,337 @@
+/**
+ * deskwork-lane — CRUD operations on lane configs.
+ *
+ * Phase 6 Task 6.1 (graphical-entries). Thin dispatcher over
+ * `@deskwork/core/lanes` operations:
+ *
+ *   deskwork lane list                              — enumerate active lanes
+ *   deskwork lane list --include-archived           — include archived lanes
+ *   deskwork lane show <id>                         — show a single lane
+ *   deskwork lane create <id> --template <id> --content-dir <path> [--name <label>]
+ *   deskwork lane update <id> [--name <label>] [--template <id>] [--content-dir <path>]
+ *   deskwork lane archive <id>                      — set archivedAt
+ *   deskwork lane restore <id>                      — clear archivedAt
+ *   deskwork lane purge <id>                        — delete the JSON (refused when entries reference it)
+ *   deskwork lane move <slug-or-uuid> --to <lane-id> [--target-stage <name>]
+ *
+ * Each handler maps the parsed argv onto the matching core operation
+ * and emits a structured JSON result on stdout. Errors are routed
+ * through `fail` (stderr + non-zero exit).
+ */
+
+import {
+  absolutize,
+  emit,
+  fail,
+  parseArgs,
+  type ParsedArgs,
+} from '@deskwork/core/cli-args';
+import {
+  archiveLane,
+  createLane,
+  listLanes,
+  moveEntryToLane,
+  purgeLane,
+  restoreLane,
+  showLane,
+  updateLane,
+} from '@deskwork/core/lanes';
+import { resolveEntryUuid } from '@deskwork/core/sidecar';
+
+const KNOWN_FLAGS = [
+  'template',
+  'name',
+  'content-dir',
+  'to',
+  'target-stage',
+] as const;
+const BOOLEAN_FLAGS = ['include-archived'] as const;
+
+const VERB_USAGE: Readonly<Record<string, string>> = {
+  list: 'deskwork lane <project-root> list [--include-archived]',
+  show: 'deskwork lane <project-root> show <id>',
+  create:
+    'deskwork lane <project-root> create <id> --template <id> --content-dir <path> [--name <label>]',
+  update:
+    'deskwork lane <project-root> update <id> [--name <label>] [--template <id>] [--content-dir <path>]',
+  archive: 'deskwork lane <project-root> archive <id>',
+  restore: 'deskwork lane <project-root> restore <id>',
+  purge: 'deskwork lane <project-root> purge <id>',
+  move:
+    'deskwork lane <project-root> move <slug-or-uuid> --to <lane-id> [--target-stage <name>]',
+};
+
+function genericUsage(): never {
+  fail(
+    'Usage: deskwork lane <project-root> <verb> [args...]\n'
+      + '  verbs: list | show | create | update | archive | restore | purge | move\n'
+      + '  see `deskwork lane <project-root> <verb>` for per-verb help',
+    2,
+  );
+}
+
+function verbUsage(verb: string): never {
+  const u = VERB_USAGE[verb];
+  if (u === undefined) genericUsage();
+  fail(`Usage: ${u}`, 2);
+}
+
+export async function run(argv: string[]): Promise<void> {
+  let parsed: ParsedArgs;
+  try {
+    parsed = parseArgs(argv, KNOWN_FLAGS, BOOLEAN_FLAGS);
+  } catch (err) {
+    fail(err instanceof Error ? err.message : String(err), 2);
+  }
+
+  const { positional, flags, booleans } = parsed;
+  if (positional.length < 2) genericUsage();
+
+  const [rootArg, verb, ...rest] = positional;
+  const projectRoot = absolutize(rootArg);
+
+  switch (verb) {
+    case 'list':
+      await handleList(projectRoot, booleans.has('include-archived'));
+      return;
+    case 'show':
+      await handleShow(projectRoot, rest);
+      return;
+    case 'create':
+      await handleCreate(projectRoot, rest, flags);
+      return;
+    case 'update':
+      await handleUpdate(projectRoot, rest, flags);
+      return;
+    case 'archive':
+      await handleArchive(projectRoot, rest);
+      return;
+    case 'restore':
+      await handleRestore(projectRoot, rest);
+      return;
+    case 'purge':
+      await handlePurge(projectRoot, rest);
+      return;
+    case 'move':
+      await handleMove(projectRoot, rest, flags);
+      return;
+    default:
+      fail(
+        `Unknown lane verb: ${verb}\n`
+          + '  verbs: list | show | create | update | archive | restore | purge | move',
+        2,
+      );
+  }
+}
+
+async function handleList(
+  projectRoot: string,
+  includeArchived: boolean,
+): Promise<void> {
+  try {
+    const lanes = listLanes(projectRoot, { includeArchived });
+    emit({
+      lanes: lanes.map((entry) => ({
+        id: entry.id,
+        name: entry.config.name,
+        pipelineTemplate: entry.config.pipelineTemplate,
+        contentDir: entry.config.contentDir,
+        archived: entry.archived,
+        ...(entry.config.archivedAt !== undefined && {
+          archivedAt: entry.config.archivedAt,
+        }),
+      })),
+    });
+  } catch (err) {
+    fail(err instanceof Error ? err.message : String(err));
+  }
+}
+
+async function handleShow(projectRoot: string, rest: string[]): Promise<void> {
+  if (rest.length < 1) verbUsage('show');
+  const [id] = rest;
+  try {
+    const lane = showLane(projectRoot, id);
+    emit({
+      id: lane.id,
+      name: lane.name,
+      pipelineTemplate: lane.pipelineTemplate,
+      contentDir: lane.contentDir,
+      archived:
+        typeof lane.archivedAt === 'string' && lane.archivedAt.length > 0,
+      ...(lane.archivedAt !== undefined && { archivedAt: lane.archivedAt }),
+    });
+  } catch (err) {
+    fail(err instanceof Error ? err.message : String(err));
+  }
+}
+
+/**
+ * Shared envelope for create / update / show emit payloads. Keeps the
+ * key set named once so adding e.g. a `description` field to a lane
+ * shows up in every read/write surface together.
+ */
+function laneFields(lane: {
+  id: string;
+  name: string;
+  pipelineTemplate: string;
+  contentDir: string;
+}): Record<string, string> {
+  return {
+    id: lane.id,
+    name: lane.name,
+    pipelineTemplate: lane.pipelineTemplate,
+    contentDir: lane.contentDir,
+  };
+}
+
+async function handleCreate(
+  projectRoot: string,
+  rest: string[],
+  flags: Record<string, string>,
+): Promise<void> {
+  if (rest.length < 1) verbUsage('create');
+  const [id] = rest;
+  if (flags['template'] === undefined) {
+    fail('Missing required flag --template <pipeline-id>', 2);
+  }
+  if (flags['content-dir'] === undefined) {
+    fail('Missing required flag --content-dir <path>', 2);
+  }
+  const template = flags['template'];
+  const contentDir = flags['content-dir'];
+  const name = flags['name'] ?? id;
+
+  try {
+    const result = await createLane(projectRoot, {
+      id,
+      name,
+      pipelineTemplate: template,
+      contentDir,
+    });
+    emit({
+      created: true,
+      ...laneFields(result.lane),
+      path: result.path,
+    });
+  } catch (err) {
+    fail(err instanceof Error ? err.message : String(err));
+  }
+}
+
+async function handleUpdate(
+  projectRoot: string,
+  rest: string[],
+  flags: Record<string, string>,
+): Promise<void> {
+  if (rest.length < 1) verbUsage('update');
+  const [id] = rest;
+
+  try {
+    const result = await updateLane(projectRoot, {
+      id,
+      ...(flags['name'] !== undefined && { name: flags['name'] }),
+      ...(flags['template'] !== undefined && {
+        pipelineTemplate: flags['template'],
+      }),
+      ...(flags['content-dir'] !== undefined && {
+        contentDir: flags['content-dir'],
+      }),
+    });
+    emit({
+      updated: true,
+      ...laneFields(result.lane),
+      changedFields: result.changedFields,
+      path: result.path,
+    });
+  } catch (err) {
+    fail(err instanceof Error ? err.message : String(err));
+  }
+}
+
+async function handleArchive(projectRoot: string, rest: string[]): Promise<void> {
+  if (rest.length < 1) verbUsage('archive');
+  const [id] = rest;
+  try {
+    const result = await archiveLane(projectRoot, id);
+    emit({
+      archived: true,
+      id: result.lane.id,
+      archivedAt: result.lane.archivedAt,
+      path: result.path,
+    });
+  } catch (err) {
+    fail(err instanceof Error ? err.message : String(err));
+  }
+}
+
+async function handleRestore(projectRoot: string, rest: string[]): Promise<void> {
+  if (rest.length < 1) verbUsage('restore');
+  const [id] = rest;
+  try {
+    const result = await restoreLane(projectRoot, id);
+    emit({
+      restored: true,
+      id: result.lane.id,
+      path: result.path,
+    });
+  } catch (err) {
+    fail(err instanceof Error ? err.message : String(err));
+  }
+}
+
+async function handlePurge(projectRoot: string, rest: string[]): Promise<void> {
+  if (rest.length < 1) verbUsage('purge');
+  const [id] = rest;
+  try {
+    const result = await purgeLane(projectRoot, id);
+    emit({
+      purged: true,
+      id,
+      path: result.purgedPath,
+    });
+  } catch (err) {
+    fail(err instanceof Error ? err.message : String(err));
+  }
+}
+
+async function handleMove(
+  projectRoot: string,
+  rest: string[],
+  flags: Record<string, string>,
+): Promise<void> {
+  if (rest.length < 1) verbUsage('move');
+  const [slug] = rest;
+  if (flags['to'] === undefined) {
+    fail('Missing required flag --to <lane-id>', 2);
+  }
+  const toLane = flags['to'];
+
+  try {
+    const uuid = await resolveEntryUuid(projectRoot, slug);
+    const result = await moveEntryToLane(projectRoot, {
+      uuid,
+      toLane,
+      ...(flags['target-stage'] !== undefined && {
+        targetStage: flags['target-stage'],
+      }),
+    });
+    emit({
+      moved: true,
+      entryId: result.entryId,
+      slug,
+      fromLane: result.fromLane,
+      toLane: result.toLane,
+      fromStage: result.fromStage,
+      toStage: result.toStage,
+      ...(result.fromArtifactPath !== undefined && {
+        fromArtifactPath: result.fromArtifactPath,
+      }),
+      ...(result.toArtifactPath !== undefined && {
+        toArtifactPath: result.toArtifactPath,
+      }),
+    });
+  } catch (err) {
+    fail(err instanceof Error ? err.message : String(err));
+  }
+}
diff --git a/packages/cli/src/commands/pipeline.ts b/packages/cli/src/commands/pipeline.ts
new file mode 100644
index 0000000..184c5f5
--- /dev/null
+++ b/packages/cli/src/commands/pipeline.ts
@@ -0,0 +1,346 @@
+/**
+ * deskwork-pipeline — CRUD operations on pipeline templates.
+ *
+ * Phase 6 Task 6.2 (graphical-entries). Thin dispatcher over
+ * `@deskwork/core/pipelines` operations:
+ *
+ *   deskwork pipeline list [--full]                       — enumerate templates
+ *   deskwork pipeline show <id>                           — show a single template (resolved JSON)
+ *   deskwork pipeline create <id> --shape "<s1>,<s2>,..." [--name <label>] [--description <text>]
+ *   deskwork pipeline update <id> --add-stage <name> [--position N]
+ *   deskwork pipeline update <id> --rename-stage <from> --to-stage <to>
+ *   deskwork pipeline update <id> --remove-stage <name>
+ *   deskwork pipeline update <id> --set-locked "<s1>,<s2>,..."
+ *   deskwork pipeline update <id> --set-off-pipeline "<s1>,<s2>,..."
+ *   deskwork pipeline delete <id> [--reassign-lanes-to <other-id>]
+ *
+ * Each handler maps the parsed argv onto the matching core operation
+ * and emits a structured JSON result on stdout. Errors are routed
+ * through `fail` (stderr + non-zero exit).
+ *
+ * `update`'s five operation flags are mutually exclusive — the
+ * handler refuses (exit 2) when more than one is passed in a single
+ * invocation. The CLI uses `--to-stage <to>` rather than the workplan
+ * shape `--rename-stage <from> <to>` because the underlying argv
+ * parser is single-value-per-flag; reading the second positional after
+ * `--rename-stage` as `<to>` would require a special-cased parser.
+ * `--to-stage` keeps the parser shape uniform and is documented in the
+ * SKILL.md.
+ */
+
+import {
+  absolutize,
+  emit,
+  fail,
+  parseArgs,
+  type ParsedArgs,
+} from '@deskwork/core/cli-args';
+import {
+  createPipeline,
+  deletePipeline,
+  listPipelines,
+  showPipeline,
+  updatePipeline,
+  type UpdatePipelineOperation,
+} from '@deskwork/core/pipelines';
+
+const KNOWN_FLAGS = [
+  'shape',
+  'name',
+  'description',
+  'add-stage',
+  'position',
+  'rename-stage',
+  'to-stage',
+  'remove-stage',
+  'set-locked',
+  'set-off-pipeline',
+  'reassign-lanes-to',
+] as const;
+const BOOLEAN_FLAGS = ['full'] as const;
+
+const VERB_USAGE: Readonly<Record<string, string>> = {
+  list: 'deskwork pipeline <project-root> list [--full]',
+  show: 'deskwork pipeline <project-root> show <id>',
+  create:
+    'deskwork pipeline <project-root> create <id> --shape "<s1>,<s2>,..." '
+    + '[--name <label>] [--description <text>]',
+  update:
+    'deskwork pipeline <project-root> update <id> <one-of: '
+    + '--add-stage <name> [--position N] | '
+    + '--rename-stage <from> --to-stage <to> | '
+    + '--remove-stage <name> | '
+    + '--set-locked "<s1>,<s2>,..." | '
+    + '--set-off-pipeline "<s1>,<s2>,...">',
+  delete:
+    'deskwork pipeline <project-root> delete <id> '
+    + '[--reassign-lanes-to <other-id>]',
+};
+
+function genericUsage(): never {
+  fail(
+    'Usage: deskwork pipeline <project-root> <verb> [args...]\n'
+      + '  verbs: list | show | create | update | delete\n'
+      + '  see `deskwork pipeline <project-root> <verb>` for per-verb help',
+    2,
+  );
+}
+
+function verbUsage(verb: string): never {
+  const u = VERB_USAGE[verb];
+  if (u === undefined) genericUsage();
+  fail(`Usage: ${u}`, 2);
+}
+
+export async function run(argv: string[]): Promise<void> {
+  let parsed: ParsedArgs;
+  try {
+    parsed = parseArgs(argv, KNOWN_FLAGS, BOOLEAN_FLAGS);
+  } catch (err) {
+    fail(err instanceof Error ? err.message : String(err), 2);
+  }
+
+  const { positional, flags, booleans } = parsed;
+  if (positional.length < 2) genericUsage();
+
+  const [rootArg, verb, ...rest] = positional;
+  const projectRoot = absolutize(rootArg);
+
+  switch (verb) {
+    case 'list':
+      await handleList(projectRoot, booleans.has('full'));
+      return;
+    case 'show':
+      await handleShow(projectRoot, rest);
+      return;
+    case 'create':
+      await handleCreate(projectRoot, rest, flags);
+      return;
+    case 'update':
+      await handleUpdate(projectRoot, rest, flags);
+      return;
+    case 'delete':
+      await handleDelete(projectRoot, rest, flags);
+      return;
+    default:
+      fail(
+        `Unknown pipeline verb: ${verb}\n`
+          + '  verbs: list | show | create | update | delete',
+        2,
+      );
+  }
+}
+
+async function handleList(projectRoot: string, full: boolean): Promise<void> {
+  try {
+    const pipelines = listPipelines(projectRoot);
+    if (!full) {
+      emit({ pipelines: pipelines.map((p) => ({ id: p.id })) });
+      return;
+    }
+    emit({
+      pipelines: pipelines.map((p) => ({
+        id: p.id,
+        name: p.template.name,
+        source: p.source,
+        linearStageCount: p.linearStageCount,
+        lockedStageCount: p.lockedStageCount,
+        offPipelineStageCount: p.offPipelineStageCount,
+      })),
+    });
+  } catch (err) {
+    fail(err instanceof Error ? err.message : String(err));
+  }
+}
+
+async function handleShow(projectRoot: string, rest: string[]): Promise<void> {
+  if (rest.length < 1) verbUsage('show');
+  const [id] = rest;
+  try {
+    const result = showPipeline(projectRoot, id);
+    emit({
+      id: result.template.id,
+      name: result.template.name,
+      description: result.template.description,
+      linearStages: result.template.linearStages,
+      ...(result.template.lockedStages !== undefined && {
+        lockedStages: result.template.lockedStages,
+      }),
+      offPipelineStages: result.template.offPipelineStages,
+      source: result.source,
+    });
+  } catch (err) {
+    fail(err instanceof Error ? err.message : String(err));
+  }
+}
+
+/**
+ * Split a comma-separated stage list. Trims whitespace around each
+ * entry; refuses empty results.
+ */
+function splitStageList(raw: string, flagName: string): string[] {
+  const parts = raw.split(',').map((s) => s.trim());
+  if (parts.length === 0 || (parts.length === 1 && parts[0].length === 0)) {
+    fail(`Flag --${flagName} requires a non-empty comma-separated stage list`, 2);
+  }
+  return parts;
+}
+
+async function handleCreate(
+  projectRoot: string,
+  rest: string[],
+  flags: Record<string, string>,
+): Promise<void> {
+  if (rest.length < 1) verbUsage('create');
+  const [id] = rest;
+  if (flags['shape'] === undefined) {
+    fail('Missing required flag --shape "<s1>,<s2>,..."', 2);
+  }
+  const linearStages = splitStageList(flags['shape'], 'shape');
+
+  try {
+    const result = await createPipeline(projectRoot, {
+      id,
+      linearStages,
+      ...(flags['name'] !== undefined && { name: flags['name'] }),
+      ...(flags['description'] !== undefined && {
+        description: flags['description'],
+      }),
+    });
+    emit({
+      created: true,
+      id: result.template.id,
+      name: result.template.name,
+      linearStages: result.template.linearStages,
+      lockedStages: result.template.lockedStages ?? [],
+      offPipelineStages: result.template.offPipelineStages,
+      path: result.path,
+    });
+  } catch (err) {
+    fail(err instanceof Error ? err.message : String(err));
+  }
+}
+
+/**
+ * Build the discriminated `UpdatePipelineOperation` from the parsed
+ * flags. Refuses (exit 2) if zero or more-than-one operation flag is
+ * present.
+ */
+function resolveUpdateOperation(
+  id: string,
+  flags: Record<string, string>,
+): UpdatePipelineOperation {
+  const present: string[] = [];
+  if (flags['add-stage'] !== undefined) present.push('add-stage');
+  if (flags['rename-stage'] !== undefined) present.push('rename-stage');
+  if (flags['remove-stage'] !== undefined) present.push('remove-stage');
+  if (flags['set-locked'] !== undefined) present.push('set-locked');
+  if (flags['set-off-pipeline'] !== undefined) present.push('set-off-pipeline');
+
+  if (present.length === 0) {
+    fail(
+      `Cannot update pipeline "${id}": no operation flag supplied. Pass `
+      + 'exactly one of --add-stage, --rename-stage, --remove-stage, '
+      + '--set-locked, --set-off-pipeline.',
+      2,
+    );
+  }
+  if (present.length > 1) {
+    fail(
+      `Cannot update pipeline "${id}": operation flags are mutually `
+      + `exclusive; received ${present.join(', ')}. Pass exactly one per `
+      + `invocation.`,
+      2,
+    );
+  }
+
+  if (flags['add-stage'] !== undefined) {
+    const positionStr = flags['position'];
+    let position: number | undefined;
+    if (positionStr !== undefined) {
+      const parsed = Number(positionStr);
+      if (!Number.isInteger(parsed) || parsed < 0) {
+        fail(`--position must be a non-negative integer; received "${positionStr}"`, 2);
+      }
+      position = parsed;
+    }
+    return position === undefined
+      ? { op: 'add-stage', stage: flags['add-stage'] }
+      : { op: 'add-stage', stage: flags['add-stage'], position };
+  }
+  if (flags['rename-stage'] !== undefined) {
+    if (flags['to-stage'] === undefined) {
+      fail('--rename-stage requires --to-stage <new-name>', 2);
+    }
+    return {
+      op: 'rename-stage',
+      from: flags['rename-stage'],
+      to: flags['to-stage'],
+    };
+  }
+  if (flags['remove-stage'] !== undefined) {
+    return { op: 'remove-stage', stage: flags['remove-stage'] };
+  }
+  if (flags['set-locked'] !== undefined) {
+    return {
+      op: 'set-locked',
+      stages: splitStageList(flags['set-locked'], 'set-locked'),
+    };
+  }
+  // set-off-pipeline is the only remaining branch (present.length === 1
+  // and the earlier branches didn't match).
+  return {
+    op: 'set-off-pipeline',
+    stages: splitStageList(flags['set-off-pipeline'], 'set-off-pipeline'),
+  };
+}
+
+async function handleUpdate(
+  projectRoot: string,
+  rest: string[],
+  flags: Record<string, string>,
+): Promise<void> {
+  if (rest.length < 1) verbUsage('update');
+  const [id] = rest;
+  const operation = resolveUpdateOperation(id, flags);
+
+  try {
+    const result = await updatePipeline(projectRoot, { id, operation });
+    emit({
+      updated: true,
+      id: result.template.id,
+      operation: operation.op,
+      linearStages: result.template.linearStages,
+      lockedStages: result.template.lockedStages ?? [],
+      offPipelineStages: result.template.offPipelineStages,
+      path: result.path,
+    });
+  } catch (err) {
+    fail(err instanceof Error ? err.message : String(err));
+  }
+}
+
+async function handleDelete(
+  projectRoot: string,
+  rest: string[],
+  flags: Record<string, string>,
+): Promise<void> {
+  if (rest.length < 1) verbUsage('delete');
+  const [id] = rest;
+  try {
+    const result = await deletePipeline(projectRoot, {
+      id,
+      ...(flags['reassign-lanes-to'] !== undefined && {
+        reassignLanesTo: flags['reassign-lanes-to'],
+      }),
+    });
+    emit({
+      deleted: true,
+      id,
+      purgedPath: result.purgedPath,
+      reassignedLanes: result.reassignedLanes,
+    });
+  } catch (err) {
+    fail(err instanceof Error ? err.message : String(err));
+  }
+}
diff --git a/packages/cli/test/lane/helpers.ts b/packages/cli/test/lane/helpers.ts
new file mode 100644
index 0000000..cc42f2a
--- /dev/null
+++ b/packages/cli/test/lane/helpers.ts
@@ -0,0 +1,176 @@
+/**
+ * Shared test helpers for the `deskwork lane` CLI tests.
+ *
+ * Phase 6 Task 6.1 (graphical-entries). Co-located with the
+ * per-verb test files under `test/lane/`. The wider helper surface
+ * (tmp-fixture project, lane JSON writer, sidecar writer, subprocess
+ * runner) lives here so each per-verb test file stays focused on one
+ * verb's behavior.
+ */
+
+import { spawnSync } from 'node:child_process';
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
+const workspaceRoot = resolve(testDir, '../../../..');
+export const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');
+
+/**
+ * Defensive precondition for the lane test suite: if the workspace
+ * has never been `npm install`-ed (or `node_modules/.bin/deskwork`
+ * was wiped), `spawnSync` invokes a non-existent binary and the test
+ * reports `code: -1` with empty stdout/stderr — a deeply confusing
+ * failure mode. Surfacing the missing binary up front gives the
+ * operator the actionable error directly.
+ *
+ * Call once per test file (the import barrel re-evaluates per file
+ * because vitest isolates module graphs); the check is a single
+ * `existsSync` and is effectively free.
+ */
+export function assertDeskworkBinPresent(): void {
+  if (!existsSync(deskworkBin)) {
+    throw new Error(
+      `deskwork binary not found at ${deskworkBin} — run npm install at the `
+      + `workspace root before running lane tests.`,
+    );
+  }
+}
+
+export interface RunResult {
+  readonly code: number;
+  readonly stdout: string;
+  readonly stderr: string;
+}
+
+export function makeProject(): string {
+  const project = mkdtempSync(join(tmpdir(), 'dw-lane-'));
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
+export function destroyProject(project: string): void {
+  rmSync(project, { recursive: true, force: true });
+}
+
+export function lane(project: string, ...args: string[]): RunResult {
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
+export function writeLaneJson(
+  project: string,
+  id: string,
+  payload: Record<string, unknown>,
+): void {
+  const dir = join(project, '.deskwork', 'lanes');
+  mkdirSync(dir, { recursive: true });
+  writeFileSync(
+    join(dir, `${id}.json`),
+    JSON.stringify(payload, null, 2),
+    'utf-8',
+  );
+}
+
+export function readLaneJson(
+  project: string,
+  id: string,
+): Record<string, unknown> {
+  return JSON.parse(
+    readFileSync(join(project, '.deskwork', 'lanes', `${id}.json`), 'utf-8'),
+  );
+}
+
+export function writeVisualPipeline(project: string): void {
+  const dir = join(project, '.deskwork', 'pipelines');
+  mkdirSync(dir, { recursive: true });
+  writeFileSync(
+    join(dir, 'visual.json'),
+    JSON.stringify(
+      {
+        id: 'visual',
+        name: 'Visual',
+        description: 'Visual lane pipeline',
+        linearStages: ['Sketch', 'Refine', 'Final', 'Published'],
+        offPipelineStages: ['Blocked', 'Cancelled'],
+      },
+      null,
+      2,
+    ),
+    'utf-8',
+  );
+}
+
+export interface SidecarOverrides {
+  readonly lane?: string;
+  readonly currentStage?: string;
+  readonly artifactPath?: string;
+  readonly iterationByStage?: Record<string, number>;
+}
+
+export function writeSidecar(
+  project: string,
+  uuid: string,
+  slug: string,
+  opts: SidecarOverrides = {},
+): void {
+  writeFileSync(
+    join(project, '.deskwork', 'entries', `${uuid}.json`),
+    JSON.stringify({
+      uuid,
+      slug,
+      title: slug,
+      keywords: [],
+      source: 'manual',
+      currentStage: opts.currentStage ?? 'Drafting',
+      iterationByStage: opts.iterationByStage ?? {},
+      ...(opts.lane !== undefined && { lane: opts.lane }),
+      ...(opts.artifactPath !== undefined && { artifactPath: opts.artifactPath }),
+      createdAt: new Date().toISOString(),
+      updatedAt: new Date().toISOString(),
+    }),
+    'utf-8',
+  );
+}
+
+export function readSidecarJson(
+  project: string,
+  uuid: string,
+): Record<string, unknown> {
+  return JSON.parse(
+    readFileSync(join(project, '.deskwork', 'entries', `${uuid}.json`), 'utf-8'),
+  );
+}
diff --git a/packages/cli/test/lane/list-show-create.test.ts b/packages/cli/test/lane/list-show-create.test.ts
new file mode 100644
index 0000000..af46fcf
--- /dev/null
+++ b/packages/cli/test/lane/list-show-create.test.ts
@@ -0,0 +1,280 @@
+/**
+ * deskwork CLI `lane` — list / show / create verbs.
+ *
+ * Phase 6 Task 6.1 (graphical-entries). Read-side and creation
+ * verbs. Mutation verbs (update / archive / restore / purge) live
+ * in `update-archive-purge.test.ts`; the move verb lives in
+ * `move.test.ts`.
+ */
+
+import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
+import {
+  assertDeskworkBinPresent,
+  destroyProject,
+  lane,
+  makeProject,
+  readLaneJson,
+  writeLaneJson,
+} from './helpers.ts';
+
+beforeAll(() => { assertDeskworkBinPresent(); });
+
+let project: string;
+beforeEach(() => { project = makeProject(); });
+afterEach(() => { destroyProject(project); });
+
+describe('deskwork lane list', () => {
+  it('emits an empty array when no lane configs exist', () => {
+    const res = lane(project, 'list');
+    expect(res.stderr).toBe('');
+    expect(res.code).toBe(0);
+    const parsed = JSON.parse(res.stdout) as { lanes: unknown[] };
+    expect(parsed.lanes).toEqual([]);
+  });
+
+  it('emits active lanes with id / name / pipelineTemplate / contentDir', () => {
+    writeLaneJson(project, 'default', {
+      id: 'default',
+      name: 'Default',
+      pipelineTemplate: 'editorial',
+      contentDir: 'docs',
+    });
+    const res = lane(project, 'list');
+    expect(res.code).toBe(0);
+    const parsed = JSON.parse(res.stdout) as {
+      lanes: Array<{
+        id: string;
+        name: string;
+        pipelineTemplate: string;
+        archived: boolean;
+      }>;
+    };
+    expect(parsed.lanes).toHaveLength(1);
+    expect(parsed.lanes[0]).toMatchObject({
+      id: 'default',
+      name: 'Default',
+      pipelineTemplate: 'editorial',
+      archived: false,
+    });
+  });
+
+  it('excludes archived lanes by default', () => {
+    writeLaneJson(project, 'default', {
+      id: 'default',
+      name: 'Default',
+      pipelineTemplate: 'editorial',
+      contentDir: 'docs',
+    });
+    writeLaneJson(project, 'stale', {
+      id: 'stale',
+      name: 'Stale',
+      pipelineTemplate: 'editorial',
+      contentDir: 'docs',
+      archivedAt: '2026-05-28T10:00:00.000Z',
+    });
+    const res = lane(project, 'list');
+    const parsed = JSON.parse(res.stdout) as { lanes: Array<{ id: string }> };
+    expect(parsed.lanes.map((l) => l.id)).toEqual(['default']);
+  });
+
+  it('includes archived lanes when --include-archived is passed', () => {
+    writeLaneJson(project, 'default', {
+      id: 'default',
+      name: 'Default',
+      pipelineTemplate: 'editorial',
+      contentDir: 'docs',
+    });
+    writeLaneJson(project, 'stale', {
+      id: 'stale',
+      name: 'Stale',
+      pipelineTemplate: 'editorial',
+      contentDir: 'docs',
+      archivedAt: '2026-05-28T10:00:00.000Z',
+    });
+    const res = lane(project, 'list', '--include-archived');
+    expect(res.code).toBe(0);
+    const parsed = JSON.parse(res.stdout) as {
+      lanes: Array<{ id: string; archived: boolean }>;
+    };
+    expect(parsed.lanes.map((l) => l.id)).toEqual(['default', 'stale']);
+    expect(parsed.lanes[1].archived).toBe(true);
+  });
+});
+
+describe('deskwork lane show', () => {
+  it('emits a single lane config when found', () => {
+    writeLaneJson(project, 'default', {
+      id: 'default',
+      name: 'Default',
+      pipelineTemplate: 'editorial',
+      contentDir: 'docs',
+    });
+    const res = lane(project, 'show', 'default');
+    expect(res.code).toBe(0);
+    const parsed = JSON.parse(res.stdout) as { id: string; archived: boolean };
+    expect(parsed.id).toBe('default');
+    expect(parsed.archived).toBe(false);
+  });
+
+  it('emits archivedAt when the lane is archived', () => {
+    writeLaneJson(project, 'stale', {
+      id: 'stale',
+      name: 'Stale',
+      pipelineTemplate: 'editorial',
+      contentDir: 'docs',
+      archivedAt: '2026-05-28T10:00:00.000Z',
+    });
+    const res = lane(project, 'show', 'stale');
+    expect(res.code).toBe(0);
+    const parsed = JSON.parse(res.stdout) as {
+      archived: boolean;
+      archivedAt?: string;
+    };
+    expect(parsed.archived).toBe(true);
+    expect(parsed.archivedAt).toBe('2026-05-28T10:00:00.000Z');
+  });
+
+  it('refuses with a clear error when the lane does not exist', () => {
+    const res = lane(project, 'show', 'nope');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/Lane config "nope" not found/);
+  });
+
+  it('refuses when the id positional is missing', () => {
+    const res = lane(project, 'show');
+    expect(res.code).toBe(2);
+    expect(res.stderr).toMatch(/Usage: deskwork lane/);
+  });
+});
+
+describe('deskwork lane create', () => {
+  it('writes a new lane config bound to the editorial preset', () => {
+    const res = lane(
+      project,
+      'create', 'mockups',
+      '--template', 'editorial',
+      '--content-dir', 'src/mockups',
+      '--name', 'Mockups',
+    );
+    expect(res.stderr).toBe('');
+    expect(res.code).toBe(0);
+    const parsed = JSON.parse(res.stdout) as { created: boolean; id: string };
+    expect(parsed.created).toBe(true);
+    expect(parsed.id).toBe('mockups');
+
+    const onDisk = readLaneJson(project, 'mockups');
+    expect(onDisk['id']).toBe('mockups');
+    expect(onDisk['name']).toBe('Mockups');
+    expect(onDisk['contentDir']).toBe('src/mockups');
+  });
+
+  it('defaults --name to the id when omitted', () => {
+    const res = lane(
+      project,
+      'create', 'mockups',
+      '--template', 'editorial',
+      '--content-dir', 'src/mockups',
+    );
+    expect(res.code).toBe(0);
+    const onDisk = readLaneJson(project, 'mockups');
+    expect(onDisk['name']).toBe('mockups');
+  });
+
+  it('refuses when the file already exists', () => {
+    writeLaneJson(project, 'default', {
+      id: 'default',
+      name: 'Default',
+      pipelineTemplate: 'editorial',
+      contentDir: 'docs',
+    });
+    const res = lane(
+      project,
+      'create', 'default',
+      '--template', 'editorial',
+      '--content-dir', 'docs',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/file already exists/);
+  });
+
+  it('refuses when the pipeline template does not resolve', () => {
+    const res = lane(
+      project,
+      'create', 'mockups',
+      '--template', 'no-such-template',
+      '--content-dir', 'src/mockups',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/does not resolve|not found/);
+  });
+
+  it('refuses when --template is missing', () => {
+    const res = lane(project, 'create', 'mockups', '--content-dir', 'src/mockups');
+    expect(res.code).toBe(2);
+    expect(res.stderr).toMatch(/Missing required flag --template/);
+  });
+
+  it('refuses when --content-dir is missing', () => {
+    const res = lane(project, 'create', 'mockups', '--template', 'editorial');
+    expect(res.code).toBe(2);
+    expect(res.stderr).toMatch(/Missing required flag --content-dir/);
+  });
+
+  it('refuses lane ids that fail the kebab-case charset', () => {
+    const res = lane(
+      project,
+      'create', 'UPPER',
+      '--template', 'editorial',
+      '--content-dir', 'docs',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/Invalid lane id/);
+  });
+
+  it('refuses lane ids with whitespace', () => {
+    const res = lane(
+      project,
+      'create', 'with space',
+      '--template', 'editorial',
+      '--content-dir', 'docs',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/Invalid lane id/);
+  });
+
+  it('refuses lane ids that look like path-traversal', () => {
+    const res = lane(
+      project,
+      'create', '../../etc/foo',
+      '--template', 'editorial',
+      '--content-dir', 'docs',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/Invalid lane id/);
+  });
+
+  it('refuses --content-dir that resolves outside the project root', () => {
+    const res = lane(
+      project,
+      'create', 'mockups',
+      '--template', 'editorial',
+      '--content-dir', '../../tmp/foo',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/Invalid contentDir/);
+  });
+});
+
+describe('deskwork lane (generic)', () => {
+  it('prints usage when no verb is supplied', () => {
+    const res = lane(project);
+    expect(res.code).toBe(2);
+    expect(res.stderr).toMatch(/Usage: deskwork lane/);
+  });
+
+  it('prints an unknown-verb error', () => {
+    const res = lane(project, 'nope');
+    expect(res.code).toBe(2);
+    expect(res.stderr).toMatch(/Unknown lane verb: nope/);
+  });
+});
diff --git a/packages/cli/test/lane/move.test.ts b/packages/cli/test/lane/move.test.ts
new file mode 100644
index 0000000..64ea592
--- /dev/null
+++ b/packages/cli/test/lane/move.test.ts
@@ -0,0 +1,296 @@
+/**
+ * deskwork CLI `lane move` — cross-lane entry relocation.
+ *
+ * Phase 6 Task 6.1 (graphical-entries). Move is the most complex
+ * verb: it touches both lane configs (target lane resolution) AND
+ * entries (sidecar mutation + artifact relocation + scrapbook
+ * relocation). Tests cover the happy paths, the stage-defaulting
+ * rule, and the refusal shapes.
+ */
+
+import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
+import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
+import { dirname, join } from 'node:path';
+import {
+  assertDeskworkBinPresent,
+  destroyProject,
+  lane,
+  makeProject,
+  readSidecarJson,
+  writeLaneJson,
+  writeSidecar,
+  writeVisualPipeline,
+} from './helpers.ts';
+
+beforeAll(() => { assertDeskworkBinPresent(); });
+
+let project: string;
+beforeEach(() => {
+  project = makeProject();
+  writeVisualPipeline(project);
+  writeLaneJson(project, 'default', {
+    id: 'default',
+    name: 'Default',
+    pipelineTemplate: 'editorial',
+    contentDir: 'docs',
+  });
+  writeLaneJson(project, 'mockups', {
+    id: 'mockups',
+    name: 'Mockups',
+    pipelineTemplate: 'visual',
+    contentDir: 'src/mockups',
+  });
+});
+afterEach(() => { destroyProject(project); });
+
+interface SeedOptions {
+  readonly uuid: string;
+  readonly slug: string;
+  readonly artifactPath: string;
+  readonly artifactBody?: string;
+  readonly scrapbookContents?: Record<string, string>;
+  readonly iterationByStage?: Record<string, number>;
+}
+
+function seedEntryWithArtifact(opts: SeedOptions): void {
+  writeSidecar(project, opts.uuid, opts.slug, {
+    lane: 'default',
+    currentStage: 'Drafting',
+    artifactPath: opts.artifactPath,
+    ...(opts.iterationByStage !== undefined && {
+      iterationByStage: opts.iterationByStage,
+    }),
+  });
+  const artifactAbs = join(project, 'docs', opts.artifactPath);
+  mkdirSync(dirname(artifactAbs), { recursive: true });
+  writeFileSync(artifactAbs, opts.artifactBody ?? '# body\n', 'utf-8');
+
+  if (opts.scrapbookContents !== undefined) {
+    const scrapbookDir = join(project, 'docs', opts.slug, 'scrapbook');
+    mkdirSync(scrapbookDir, { recursive: true });
+    for (const [name, content] of Object.entries(opts.scrapbookContents)) {
+      writeFileSync(join(scrapbookDir, name), content, 'utf-8');
+    }
+  }
+}
+
+describe('deskwork lane move', () => {
+  it('relocates the artifact file to the target lane contentDir', () => {
+    const uuid = '550e8400-e29b-41d4-a716-446655440010';
+    seedEntryWithArtifact({
+      uuid,
+      slug: 'a-mockup',
+      artifactPath: 'a-mockup.md',
+      artifactBody: '# my mockup\n',
+    });
+
+    const res = lane(project, 'move', 'a-mockup', '--to', 'mockups');
+    expect(res.stderr).toBe('');
+    expect(res.code).toBe(0);
+
+    expect(existsSync(join(project, 'docs', 'a-mockup.md'))).toBe(false);
+    expect(
+      readFileSync(join(project, 'src', 'mockups', 'a-mockup.md'), 'utf-8'),
+    ).toBe('# my mockup\n');
+
+    const sidecar = readSidecarJson(project, uuid);
+    expect(sidecar['lane']).toBe('mockups');
+    expect(sidecar['currentStage']).toBe('Sketch');
+  });
+
+  it('relocates the per-entry scrapbook directory when present', () => {
+    const uuid = '550e8400-e29b-41d4-a716-446655440011';
+    seedEntryWithArtifact({
+      uuid,
+      slug: 'with-scrapbook',
+      artifactPath: 'with-scrapbook.md',
+      scrapbookContents: { 'note.md': 'a note\n' },
+    });
+
+    const res = lane(project, 'move', 'with-scrapbook', '--to', 'mockups');
+    expect(res.code).toBe(0);
+
+    expect(
+      existsSync(join(project, 'docs', 'with-scrapbook', 'scrapbook')),
+    ).toBe(false);
+    expect(
+      readFileSync(
+        join(
+          project,
+          'src',
+          'mockups',
+          'with-scrapbook',
+          'scrapbook',
+          'note.md',
+        ),
+        'utf-8',
+      ),
+    ).toBe('a note\n');
+  });
+
+  it('preserves iterationByStage verbatim', () => {
+    const uuid = '550e8400-e29b-41d4-a716-446655440012';
+    seedEntryWithArtifact({
+      uuid,
+      slug: 'iter-preserve',
+      artifactPath: 'iter-preserve.md',
+      iterationByStage: { Drafting: 3, Outlining: 1 },
+    });
+    const res = lane(project, 'move', 'iter-preserve', '--to', 'mockups');
+    expect(res.code).toBe(0);
+
+    const sidecar = readSidecarJson(project, uuid) as {
+      iterationByStage: Record<string, number>;
+    };
+    expect(sidecar.iterationByStage).toEqual({ Drafting: 3, Outlining: 1 });
+  });
+
+  it("defaults --target-stage to the target lane's first linearStage", () => {
+    const uuid = '550e8400-e29b-41d4-a716-446655440013';
+    seedEntryWithArtifact({
+      uuid,
+      slug: 'default-stage',
+      artifactPath: 'default-stage.md',
+    });
+    const res = lane(project, 'move', 'default-stage', '--to', 'mockups');
+    expect(res.code).toBe(0);
+    expect(readSidecarJson(project, uuid)['currentStage']).toBe('Sketch');
+  });
+
+  it('honors an explicit --target-stage when in the target template', () => {
+    const uuid = '550e8400-e29b-41d4-a716-446655440014';
+    seedEntryWithArtifact({
+      uuid,
+      slug: 'explicit-stage',
+      artifactPath: 'explicit-stage.md',
+    });
+    const res = lane(
+      project,
+      'move', 'explicit-stage',
+      '--to', 'mockups',
+      '--target-stage', 'Refine',
+    );
+    expect(res.code).toBe(0);
+    expect(readSidecarJson(project, uuid)['currentStage']).toBe('Refine');
+  });
+
+  it('refuses when --target-stage is not in the target template', () => {
+    const uuid = '550e8400-e29b-41d4-a716-446655440015';
+    seedEntryWithArtifact({
+      uuid,
+      slug: 'bad-stage',
+      artifactPath: 'bad-stage.md',
+    });
+    const res = lane(
+      project,
+      'move', 'bad-stage',
+      '--to', 'mockups',
+      '--target-stage', 'Drafting',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/not in target lane "mockups"/);
+    expect(readSidecarJson(project, uuid)['lane']).toBe('default');
+    expect(existsSync(join(project, 'docs', 'bad-stage.md'))).toBe(true);
+  });
+
+  it('refuses when source lane and target lane are the same', () => {
+    const uuid = '550e8400-e29b-41d4-a716-446655440016';
+    seedEntryWithArtifact({
+      uuid,
+      slug: 'same-lane',
+      artifactPath: 'same-lane.md',
+    });
+    const res = lane(project, 'move', 'same-lane', '--to', 'default');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/already in lane "default"/);
+  });
+
+  it('refuses when the source artifact does not exist on disk', () => {
+    const uuid = '550e8400-e29b-41d4-a716-446655440017';
+    writeSidecar(project, uuid, 'missing-art', {
+      lane: 'default',
+      currentStage: 'Drafting',
+      artifactPath: 'missing-art.md',
+    });
+    const res = lane(project, 'move', 'missing-art', '--to', 'mockups');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/source artifact does not exist/);
+  });
+
+  it('refuses when --to is missing', () => {
+    const uuid = '550e8400-e29b-41d4-a716-446655440018';
+    seedEntryWithArtifact({
+      uuid,
+      slug: 'no-target',
+      artifactPath: 'no-target.md',
+    });
+    const res = lane(project, 'move', 'no-target');
+    expect(res.code).toBe(2);
+    expect(res.stderr).toMatch(/Missing required flag --to/);
+  });
+
+  it('refuses to move into an archived lane', () => {
+    const uuid = '550e8400-e29b-41d4-a716-446655440019';
+    seedEntryWithArtifact({
+      uuid,
+      slug: 'to-archived',
+      artifactPath: 'to-archived.md',
+    });
+    lane(project, 'archive', 'mockups');
+    const res = lane(project, 'move', 'to-archived', '--to', 'mockups');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/archived lane "mockups"/);
+  });
+});
+
+describe('deskwork lane move — sidecar-write failure rollback', () => {
+  it('rolls back artifact + scrapbook when writeSidecar fails', async () => {
+    // Skip on platforms / users where chmod 0o555 doesn't prevent
+    // writes (e.g. running as root — happens in some CI sandboxes).
+    // The test pre-flights a write into the read-only dir before
+    // asserting; if the pre-flight succeeds, the test framework
+    // can't simulate the failure mode and skips.
+    const { chmodSync } = await import('node:fs');
+
+    const uuid = '550e8400-e29b-41d4-a716-446655440100';
+    seedEntryWithArtifact({
+      uuid,
+      slug: 'rollback-me',
+      artifactPath: 'rollback-me.md',
+      artifactBody: '# pre-move\n',
+      scrapbookContents: { 'note.md': 'pre-move scrapbook\n' },
+    });
+
+    const entriesDir = join(project, '.deskwork', 'entries');
+    chmodSync(entriesDir, 0o555);
+    try {
+      // Pre-flight: try writing into the locked dir. If it succeeds,
+      // we can't simulate the failure (running as root); bail.
+      try {
+        writeFileSync(join(entriesDir, '.preflight'), 'x', 'utf-8');
+        chmodSync(entriesDir, 0o755);
+        return; // skip
+      } catch { /* good — writes are blocked */ }
+
+      const res = lane(project, 'move', 'rollback-me', '--to', 'mockups');
+      expect(res.code).not.toBe(0);
+      expect(res.stderr).toMatch(/sidecar write failed/);
+
+      // Artifact restored at source path; target empty.
+      expect(existsSync(join(project, 'docs', 'rollback-me.md'))).toBe(true);
+      expect(existsSync(join(project, 'src', 'mockups', 'rollback-me.md'))).toBe(false);
+
+      // Scrapbook restored at source path; target empty.
+      expect(
+        existsSync(join(project, 'docs', 'rollback-me', 'scrapbook', 'note.md')),
+      ).toBe(true);
+      expect(
+        existsSync(
+          join(project, 'src', 'mockups', 'rollback-me', 'scrapbook', 'note.md'),
+        ),
+      ).toBe(false);
+    } finally {
+      chmodSync(entriesDir, 0o755);
+    }
+  });
+});
diff --git a/packages/cli/test/lane/update-archive-purge.test.ts b/packages/cli/test/lane/update-archive-purge.test.ts
new file mode 100644
index 0000000..7efab51
--- /dev/null
+++ b/packages/cli/test/lane/update-archive-purge.test.ts
@@ -0,0 +1,178 @@
+/**
+ * deskwork CLI `lane` — update / archive / restore / purge verbs.
+ *
+ * Phase 6 Task 6.1 (graphical-entries). Mutation verbs that don't
+ * relocate entries; the move verb (which DOES touch entries) lives
+ * in `move.test.ts`.
+ */
+
+import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
+import { existsSync } from 'node:fs';
+import { join } from 'node:path';
+import {
+  assertDeskworkBinPresent,
+  destroyProject,
+  lane,
+  makeProject,
+  readLaneJson,
+  writeLaneJson,
+  writeSidecar,
+} from './helpers.ts';
+
+beforeAll(() => { assertDeskworkBinPresent(); });
+
+let project: string;
+beforeEach(() => { project = makeProject(); });
+afterEach(() => { destroyProject(project); });
+
+describe('deskwork lane update', () => {
+  beforeEach(() => {
+    writeLaneJson(project, 'default', {
+      id: 'default',
+      name: 'Default',
+      pipelineTemplate: 'editorial',
+      contentDir: 'docs',
+    });
+  });
+
+  it('mutates --name in place', () => {
+    const res = lane(project, 'update', 'default', '--name', 'Primary');
+    expect(res.code).toBe(0);
+    expect(readLaneJson(project, 'default')['name']).toBe('Primary');
+  });
+
+  it('mutates --content-dir in place', () => {
+    const res = lane(project, 'update', 'default', '--content-dir', 'content');
+    expect(res.code).toBe(0);
+    expect(readLaneJson(project, 'default')['contentDir']).toBe('content');
+  });
+
+  it('cross-validates --template before committing', () => {
+    const res = lane(project, 'update', 'default', '--template', 'does-not-exist');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/does not resolve|not found/);
+    expect(readLaneJson(project, 'default')['pipelineTemplate']).toBe('editorial');
+  });
+
+  it('refuses when no patch flags are passed', () => {
+    const res = lane(project, 'update', 'default');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/no patch fields supplied/);
+  });
+
+  it('reports changedFields on success', () => {
+    const res = lane(
+      project,
+      'update', 'default',
+      '--name', 'Primary',
+      '--content-dir', 'content',
+    );
+    expect(res.code).toBe(0);
+    const parsed = JSON.parse(res.stdout) as { changedFields: string[] };
+    expect(parsed.changedFields.sort()).toEqual(['contentDir', 'name']);
+  });
+
+  it('refuses --content-dir that resolves outside the project root', () => {
+    const res = lane(
+      project,
+      'update', 'default',
+      '--content-dir', '../../tmp/foo',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/Invalid contentDir/);
+    // Lane config unchanged
+    expect(readLaneJson(project, 'default')['contentDir']).toBe('docs');
+  });
+});
+
+describe('deskwork lane archive / restore', () => {
+  beforeEach(() => {
+    writeLaneJson(project, 'default', {
+      id: 'default',
+      name: 'Default',
+      pipelineTemplate: 'editorial',
+      contentDir: 'docs',
+    });
+  });
+
+  it('sets archivedAt on archive', () => {
+    const res = lane(project, 'archive', 'default');
+    expect(res.code).toBe(0);
+    const archivedAt = readLaneJson(project, 'default')['archivedAt'];
+    expect(typeof archivedAt).toBe('string');
+    expect(archivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
+  });
+
+  it('refuses to archive a lane that is already archived', () => {
+    lane(project, 'archive', 'default');
+    const res = lane(project, 'archive', 'default');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/already archived/);
+  });
+
+  it('clears archivedAt on restore', () => {
+    lane(project, 'archive', 'default');
+    const res = lane(project, 'restore', 'default');
+    expect(res.code).toBe(0);
+    expect(readLaneJson(project, 'default')['archivedAt']).toBeUndefined();
+  });
+
+  it('refuses to restore a lane that is not archived', () => {
+    const res = lane(project, 'restore', 'default');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/not archived/);
+  });
+});
+
+describe('deskwork lane purge', () => {
+  beforeEach(() => {
+    writeLaneJson(project, 'mockups', {
+      id: 'mockups',
+      name: 'Mockups',
+      pipelineTemplate: 'editorial',
+      contentDir: 'src/mockups',
+    });
+  });
+
+  it('deletes the JSON when no entries reference the lane', () => {
+    const res = lane(project, 'purge', 'mockups');
+    expect(res.code).toBe(0);
+    expect(
+      existsSync(join(project, '.deskwork', 'lanes', 'mockups.json')),
+    ).toBe(false);
+  });
+
+  it('refuses when entries reference the lane', () => {
+    const uuid = '550e8400-e29b-41d4-a716-446655440000';
+    writeSidecar(project, uuid, 'a-post', {
+      lane: 'mockups',
+      currentStage: 'Drafting',
+    });
+
+    const res = lane(project, 'purge', 'mockups');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/1 entry references it.*a-post/);
+    expect(
+      existsSync(join(project, '.deskwork', 'lanes', 'mockups.json')),
+    ).toBe(true);
+  });
+
+  it('lists the first 5 dependent slugs with a +N more suffix', () => {
+    for (let i = 0; i < 7; i++) {
+      const uuid = `550e8400-e29b-41d4-a716-44665544000${i}`;
+      writeSidecar(project, uuid, `slug-${i}`, {
+        lane: 'mockups',
+        currentStage: 'Drafting',
+      });
+    }
+    const res = lane(project, 'purge', 'mockups');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/\+2 more/);
+  });
+
+  it('refuses when the lane does not exist', () => {
+    const res = lane(project, 'purge', 'nope');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/Lane config "nope" not found/);
+  });
+});
diff --git a/packages/cli/test/pipeline/customize-pipeline.test.ts b/packages/cli/test/pipeline/customize-pipeline.test.ts
new file mode 100644
index 0000000..6e1ec60
--- /dev/null
+++ b/packages/cli/test/pipeline/customize-pipeline.test.ts
@@ -0,0 +1,101 @@
+/**
+ * deskwork CLI `customize pipeline <preset-id>` — start-from-preset
+ * wrapper for `pipeline create`.
+ *
+ * Phase 6 Task 6.2 (graphical-entries). Covers the documented flow:
+ * `customize pipeline editorial` copies the bundled preset JSON to
+ * `.deskwork/pipelines/editorial.json`; subsequent `pipeline show`
+ * resolves the override (not the preset); subsequent `pipeline update`
+ * mutates the override; the refuse-to-overwrite path protects
+ * operator edits.
+ */
+
+import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
+import { existsSync, readFileSync, writeFileSync } from 'node:fs';
+import { join } from 'node:path';
+import {
+  assertDeskworkBinPresent,
+  customize,
+  destroyProject,
+  makeProject,
+  pipeline,
+  readPipelineOverride,
+} from './helpers.ts';
+
+beforeAll(() => { assertDeskworkBinPresent(); });
+
+let project: string;
+beforeEach(() => { project = makeProject(); });
+afterEach(() => { destroyProject(project); });
+
+describe('deskwork customize pipeline <preset-id>', () => {
+  it('copies the bundled editorial preset into .deskwork/pipelines/', () => {
+    const res = customize(project, 'pipeline', 'editorial');
+    expect(res.code).toBe(0);
+    expect(res.stdout).toMatch(/Customized pipeline\/editorial/);
+
+    const dest = join(project, '.deskwork', 'pipelines', 'editorial.json');
+    expect(existsSync(dest)).toBe(true);
+
+    const onDisk = JSON.parse(readFileSync(dest, 'utf-8')) as {
+      id: string;
+      linearStages: string[];
+    };
+    expect(onDisk.id).toBe('editorial');
+    expect(onDisk.linearStages).toEqual([
+      'Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published',
+    ]);
+  });
+
+  it('the override takes precedence on subsequent pipeline show', () => {
+    customize(project, 'pipeline', 'editorial');
+
+    // Mutate the override directly to prove precedence (instead of via
+    // `pipeline update` which would also exercise the override path).
+    const dest = join(project, '.deskwork', 'pipelines', 'editorial.json');
+    const onDisk = JSON.parse(readFileSync(dest, 'utf-8')) as {
+      linearStages: string[];
+      lockedStages?: string[];
+    };
+    onDisk.linearStages = ['A', 'B', 'C'];
+    // The preset's `lockedStages: ['Final']` must move too — keeping it
+    // unchanged would fail the loader's "lockedStages must be a subset
+    // of linearStages" cross-validation.
+    onDisk.lockedStages = [];
+    writeFileSync(dest, JSON.stringify(onDisk, null, 2));
+
+    const res = pipeline(project, 'show', 'editorial');
+    expect(res.code).toBe(0);
+    const parsed = JSON.parse(res.stdout) as {
+      linearStages: string[];
+      source: string;
+    };
+    expect(parsed.source).toBe('project-override');
+    expect(parsed.linearStages).toEqual(['A', 'B', 'C']);
+  });
+
+  it('refuses to clobber an existing override', () => {
+    customize(project, 'pipeline', 'editorial');
+    const res = customize(project, 'pipeline', 'editorial');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr + res.stdout).toMatch(/already exists|Refusing to overwrite/);
+  });
+
+  it('errors when the preset name does not exist', () => {
+    const res = customize(project, 'pipeline', 'no-such-preset');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr + res.stdout).toMatch(/no built-in pipeline preset/);
+  });
+
+  it('the customized override is mutable via pipeline update', () => {
+    customize(project, 'pipeline', 'editorial');
+    const res = pipeline(
+      project, 'update', 'editorial', '--add-stage', 'Promoted',
+    );
+    expect(res.code).toBe(0);
+    const onDisk = readPipelineOverride(project, 'editorial');
+    const linearStages = onDisk['linearStages'];
+    expect(Array.isArray(linearStages)).toBe(true);
+    expect(linearStages).toContain('Promoted');
+  });
+});
diff --git a/packages/cli/test/pipeline/delete.test.ts b/packages/cli/test/pipeline/delete.test.ts
new file mode 100644
index 0000000..273ac50
--- /dev/null
+++ b/packages/cli/test/pipeline/delete.test.ts
@@ -0,0 +1,150 @@
+/**
+ * deskwork CLI `pipeline delete` — refusal modes + reassign-lanes-to.
+ *
+ * Phase 6 Task 6.2 (graphical-entries). Covers the four refusal paths
+ * (plugin-preset, missing override, dependent lanes, malformed
+ * reassignment target) plus the happy paths (orphan template, batch
+ * rebind).
+ */
+
+import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
+import {
+  assertDeskworkBinPresent,
+  destroyProject,
+  makeProject,
+  pipeline,
+  pipelineOverrideExists,
+  readLaneJson,
+  writeLaneJson,
+  writePipelineOverride,
+} from './helpers.ts';
+
+beforeAll(() => { assertDeskworkBinPresent(); });
+
+let project: string;
+beforeEach(() => {
+  project = makeProject();
+  writePipelineOverride(project, 'my-blog', {
+    id: 'my-blog',
+    name: 'My Blog',
+    description: 'x',
+    linearStages: ['Idea', 'Drafting', 'Live'],
+    offPipelineStages: [],
+  });
+});
+afterEach(() => { destroyProject(project); });
+
+describe('deskwork pipeline delete', () => {
+  it('removes a project-override JSON when no lane references it', () => {
+    const res = pipeline(project, 'delete', 'my-blog');
+    expect(res.stderr).toBe('');
+    expect(res.code).toBe(0);
+    expect(pipelineOverrideExists(project, 'my-blog')).toBe(false);
+
+    const parsed = JSON.parse(res.stdout) as {
+      deleted: boolean;
+      reassignedLanes: unknown[];
+    };
+    expect(parsed.deleted).toBe(true);
+    expect(parsed.reassignedLanes).toEqual([]);
+  });
+
+  it('refuses against a plugin preset', () => {
+    const res = pipeline(project, 'delete', 'editorial');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/plugin preset.*cannot be deleted|customize pipeline editorial/i);
+  });
+
+  it('refuses when no project override exists', () => {
+    const res = pipeline(project, 'delete', 'no-such-template');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/no project override exists/);
+  });
+
+  it('refuses when a lane references the template', () => {
+    writeLaneJson(project, 'default', {
+      id: 'default',
+      name: 'Default',
+      pipelineTemplate: 'my-blog',
+      contentDir: 'docs',
+    });
+    const res = pipeline(project, 'delete', 'my-blog');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/1 lane references it.*default/);
+    expect(pipelineOverrideExists(project, 'my-blog')).toBe(true);
+  });
+
+  it('reassigns lanes when --reassign-lanes-to is supplied', () => {
+    writeLaneJson(project, 'default', {
+      id: 'default',
+      name: 'Default',
+      pipelineTemplate: 'my-blog',
+      contentDir: 'docs',
+    });
+    writeLaneJson(project, 'second', {
+      id: 'second',
+      name: 'Second',
+      pipelineTemplate: 'my-blog',
+      contentDir: 'src/mockups',
+    });
+
+    const res = pipeline(
+      project, 'delete', 'my-blog',
+      '--reassign-lanes-to', 'editorial',
+    );
+    expect(res.stderr).toBe('');
+    expect(res.code).toBe(0);
+
+    expect(pipelineOverrideExists(project, 'my-blog')).toBe(false);
+    expect(readLaneJson(project, 'default')['pipelineTemplate']).toBe('editorial');
+    expect(readLaneJson(project, 'second')['pipelineTemplate']).toBe('editorial');
+
+    const parsed = JSON.parse(res.stdout) as {
+      reassignedLanes: Array<{ laneId: string; from: string; to: string }>;
+    };
+    const laneIds = parsed.reassignedLanes.map((r) => r.laneId).sort();
+    expect(laneIds).toEqual(['default', 'second']);
+    expect(parsed.reassignedLanes[0].from).toBe('my-blog');
+    expect(parsed.reassignedLanes[0].to).toBe('editorial');
+  });
+
+  it('refuses --reassign-lanes-to when the replacement template does not resolve', () => {
+    writeLaneJson(project, 'default', {
+      id: 'default',
+      name: 'Default',
+      pipelineTemplate: 'my-blog',
+      contentDir: 'docs',
+    });
+    const res = pipeline(
+      project, 'delete', 'my-blog',
+      '--reassign-lanes-to', 'no-such-target',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/does not resolve|not found/);
+    expect(pipelineOverrideExists(project, 'my-blog')).toBe(true);
+    // Source lane untouched
+    expect(readLaneJson(project, 'default')['pipelineTemplate']).toBe('my-blog');
+  });
+
+  it('refuses --reassign-lanes-to <same-id>', () => {
+    writeLaneJson(project, 'default', {
+      id: 'default',
+      name: 'Default',
+      pipelineTemplate: 'my-blog',
+      contentDir: 'docs',
+    });
+    const res = pipeline(
+      project, 'delete', 'my-blog',
+      '--reassign-lanes-to', 'my-blog',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/same id being deleted/);
+    expect(pipelineOverrideExists(project, 'my-blog')).toBe(true);
+  });
+
+  it('refuses when the id positional is missing', () => {
+    const res = pipeline(project, 'delete');
+    expect(res.code).toBe(2);
+    expect(res.stderr).toMatch(/Usage: deskwork pipeline/);
+  });
+});
diff --git a/packages/cli/test/pipeline/helpers.ts b/packages/cli/test/pipeline/helpers.ts
new file mode 100644
index 0000000..7baee55
--- /dev/null
+++ b/packages/cli/test/pipeline/helpers.ts
@@ -0,0 +1,203 @@
+/**
+ * Shared test helpers for the `deskwork pipeline` CLI tests.
+ *
+ * Phase 6 Task 6.2 (graphical-entries). Co-located with the per-verb
+ * test files under `test/pipeline/`. Mirrors `test/lane/helpers.ts` —
+ * tmp-fixture project, JSON writers for lanes / pipelines, sidecar
+ * writer, subprocess runner. Each per-verb test file stays focused on
+ * one verb's behavior.
+ */
+
+import { spawnSync } from 'node:child_process';
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
+const workspaceRoot = resolve(testDir, '../../../..');
+export const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');
+
+/**
+ * Defensive precondition for the pipeline test suite: surface a clear
+ * "run npm install" error rather than the confusing `code: -1` empty
+ * stdout/stderr `spawnSync` returns when invoking a non-existent
+ * binary. Mirrors `assertDeskworkBinPresent` in the lane suite.
+ */
+export function assertDeskworkBinPresent(): void {
+  if (!existsSync(deskworkBin)) {
+    throw new Error(
+      `deskwork binary not found at ${deskworkBin} — run npm install at the `
+      + `workspace root before running pipeline tests.`,
+    );
+  }
+}
+
+export interface RunResult {
+  readonly code: number;
+  readonly stdout: string;
+  readonly stderr: string;
+}
+
+export function makeProject(): string {
+  const project = mkdtempSync(join(tmpdir(), 'dw-pipeline-'));
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
+export function destroyProject(project: string): void {
+  rmSync(project, { recursive: true, force: true });
+}
+
+export function pipeline(project: string, ...args: string[]): RunResult {
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
+export function customize(project: string, ...args: string[]): RunResult {
+  const r = spawnSync(
+    deskworkBin,
+    ['customize', project, ...args],
+    { encoding: 'utf-8' },
+  );
+  return {
+    code: r.status ?? -1,
+    stdout: r.stdout ?? '',
+    stderr: r.stderr ?? '',
+  };
+}
+
+export function writePipelineOverride(
+  project: string,
+  id: string,
+  payload: Record<string, unknown>,
+): void {
+  const dir = join(project, '.deskwork', 'pipelines');
+  mkdirSync(dir, { recursive: true });
+  writeFileSync(
+    join(dir, `${id}.json`),
+    JSON.stringify(payload, null, 2),
+    'utf-8',
+  );
+}
+
+export function readPipelineOverride(
+  project: string,
+  id: string,
+): Record<string, unknown> {
+  return JSON.parse(
+    readFileSync(
+      join(project, '.deskwork', 'pipelines', `${id}.json`),
+      'utf-8',
+    ),
+  );
+}
+
+export function pipelineOverrideExists(project: string, id: string): boolean {
+  return existsSync(
+    join(project, '.deskwork', 'pipelines', `${id}.json`),
+  );
+}
+
+export function readPipelineRenames(
+  project: string,
+  id: string,
+): { pipelineId: string; renames: Array<{ from: string; to: string; at: string }> } {
+  const raw = readFileSync(
+    join(project, '.deskwork', 'pipelines', `${id}-renames.json`),
+    'utf-8',
+  );
+  return JSON.parse(raw) as {
+    pipelineId: string;
+    renames: Array<{ from: string; to: string; at: string }>;
+  };
+}
+
+export function pipelineRenamesExists(project: string, id: string): boolean {
+  return existsSync(
+    join(project, '.deskwork', 'pipelines', `${id}-renames.json`),
+  );
+}
+
+export function writeLaneJson(
+  project: string,
+  id: string,
+  payload: Record<string, unknown>,
+): void {
+  const dir = join(project, '.deskwork', 'lanes');
+  mkdirSync(dir, { recursive: true });
+  writeFileSync(
+    join(dir, `${id}.json`),
+    JSON.stringify(payload, null, 2),
+    'utf-8',
+  );
+}
+
+export function readLaneJson(
+  project: string,
+  id: string,
+): Record<string, unknown> {
+  return JSON.parse(
+    readFileSync(join(project, '.deskwork', 'lanes', `${id}.json`), 'utf-8'),
+  );
+}
+
+export interface SidecarOverrides {
+  readonly lane?: string;
+  readonly currentStage?: string;
+}
+
+export function writeSidecar(
+  project: string,
+  uuid: string,
+  slug: string,
+  opts: SidecarOverrides = {},
+): void {
+  writeFileSync(
+    join(project, '.deskwork', 'entries', `${uuid}.json`),
+    JSON.stringify({
+      uuid,
+      slug,
+      title: slug,
+      keywords: [],
+      source: 'manual',
+      currentStage: opts.currentStage ?? 'Drafting',
+      iterationByStage: {},
+      ...(opts.lane !== undefined && { lane: opts.lane }),
+      createdAt: new Date().toISOString(),
+      updatedAt: new Date().toISOString(),
+    }),
+    'utf-8',
+  );
+}
diff --git a/packages/cli/test/pipeline/list-show-create.test.ts b/packages/cli/test/pipeline/list-show-create.test.ts
new file mode 100644
index 0000000..a1067ea
--- /dev/null
+++ b/packages/cli/test/pipeline/list-show-create.test.ts
@@ -0,0 +1,259 @@
+/**
+ * deskwork CLI `pipeline` — list / show / create verbs.
+ *
+ * Phase 6 Task 6.2 (graphical-entries). Read-side and creation
+ * verbs. Mutation verbs (update / delete) live in their own test
+ * files.
+ */
+
+import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
+import {
+  assertDeskworkBinPresent,
+  destroyProject,
+  makeProject,
+  pipeline,
+  pipelineOverrideExists,
+  readPipelineOverride,
+  writePipelineOverride,
+} from './helpers.ts';
+
+beforeAll(() => { assertDeskworkBinPresent(); });
+
+let project: string;
+beforeEach(() => { project = makeProject(); });
+afterEach(() => { destroyProject(project); });
+
+describe('deskwork pipeline list', () => {
+  it('emits the built-in plugin presets when no override exists', () => {
+    const res = pipeline(project, 'list');
+    expect(res.stderr).toBe('');
+    expect(res.code).toBe(0);
+    const parsed = JSON.parse(res.stdout) as { pipelines: Array<{ id: string }> };
+    const ids = parsed.pipelines.map((p) => p.id).sort();
+    expect(ids).toEqual(['blog-post', 'editorial', 'feature-doc', 'qa-plan', 'visual']);
+  });
+
+  it('--full emits stage counts + source classification', () => {
+    const res = pipeline(project, 'list', '--full');
+    expect(res.code).toBe(0);
+    const parsed = JSON.parse(res.stdout) as {
+      pipelines: Array<{
+        id: string;
+        name: string;
+        source: string;
+        linearStageCount: number;
+        lockedStageCount: number;
+        offPipelineStageCount: number;
+      }>;
+    };
+    const editorial = parsed.pipelines.find((p) => p.id === 'editorial');
+    expect(editorial).toBeDefined();
+    expect(editorial?.source).toBe('plugin-preset');
+    expect(editorial?.linearStageCount).toBe(6);
+    expect(editorial?.lockedStageCount).toBe(1);
+    expect(editorial?.offPipelineStageCount).toBe(2);
+  });
+
+  it('reports project-override classification when an override masks a preset', () => {
+    writePipelineOverride(project, 'editorial', {
+      id: 'editorial',
+      name: 'Editorial (Override)',
+      description: 'Project override',
+      linearStages: ['A', 'B', 'C'],
+      offPipelineStages: [],
+    });
+    const res = pipeline(project, 'list', '--full');
+    expect(res.code).toBe(0);
+    const parsed = JSON.parse(res.stdout) as {
+      pipelines: Array<{ id: string; source: string; linearStageCount: number }>;
+    };
+    const editorial = parsed.pipelines.find((p) => p.id === 'editorial');
+    expect(editorial?.source).toBe('project-override');
+    expect(editorial?.linearStageCount).toBe(3);
+  });
+});
+
+describe('deskwork pipeline show', () => {
+  it('emits the resolved JSON for a plugin preset', () => {
+    const res = pipeline(project, 'show', 'editorial');
+    expect(res.code).toBe(0);
+    const parsed = JSON.parse(res.stdout) as {
+      id: string;
+      linearStages: string[];
+      source: string;
+    };
+    expect(parsed.id).toBe('editorial');
+    expect(parsed.source).toBe('plugin-preset');
+    expect(parsed.linearStages).toEqual([
+      'Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published',
+    ]);
+  });
+
+  it('prefers a project override over the plugin preset', () => {
+    writePipelineOverride(project, 'editorial', {
+      id: 'editorial',
+      name: 'Editorial Override',
+      description: 'Operator override',
+      linearStages: ['A', 'B'],
+      offPipelineStages: [],
+    });
+    const res = pipeline(project, 'show', 'editorial');
+    expect(res.code).toBe(0);
+    const parsed = JSON.parse(res.stdout) as {
+      linearStages: string[];
+      source: string;
+    };
+    expect(parsed.source).toBe('project-override');
+    expect(parsed.linearStages).toEqual(['A', 'B']);
+  });
+
+  it('refuses when the pipeline does not exist', () => {
+    const res = pipeline(project, 'show', 'no-such-template');
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/not found/);
+  });
+
+  it('refuses when the id positional is missing', () => {
+    const res = pipeline(project, 'show');
+    expect(res.code).toBe(2);
+    expect(res.stderr).toMatch(/Usage: deskwork pipeline/);
+  });
+});
+
+describe('deskwork pipeline create', () => {
+  it('writes a new project-override template with the supplied shape', () => {
+    const res = pipeline(
+      project,
+      'create', 'my-blog',
+      '--shape', 'Idea,Drafting,Review,Live',
+      '--name', 'My Blog',
+    );
+    expect(res.stderr).toBe('');
+    expect(res.code).toBe(0);
+    const parsed = JSON.parse(res.stdout) as {
+      created: boolean;
+      linearStages: string[];
+      lockedStages: string[];
+      offPipelineStages: string[];
+    };
+    expect(parsed.created).toBe(true);
+    expect(parsed.linearStages).toEqual(['Idea', 'Drafting', 'Review', 'Live']);
+    expect(parsed.lockedStages).toEqual([]);
+    expect(parsed.offPipelineStages).toEqual([]);
+
+    const onDisk = readPipelineOverride(project, 'my-blog');
+    expect(onDisk['id']).toBe('my-blog');
+    expect(onDisk['name']).toBe('My Blog');
+    expect(onDisk['linearStages']).toEqual(['Idea', 'Drafting', 'Review', 'Live']);
+  });
+
+  it('defaults --name to the id when omitted', () => {
+    const res = pipeline(
+      project,
+      'create', 'my-blog',
+      '--shape', 'Idea,Drafting',
+    );
+    expect(res.code).toBe(0);
+    const onDisk = readPipelineOverride(project, 'my-blog');
+    expect(onDisk['name']).toBe('my-blog');
+  });
+
+  it('trims whitespace around comma-separated stages', () => {
+    const res = pipeline(
+      project,
+      'create', 'my-blog',
+      '--shape', ' Idea , Drafting , Live ',
+    );
+    expect(res.code).toBe(0);
+    const onDisk = readPipelineOverride(project, 'my-blog');
+    expect(onDisk['linearStages']).toEqual(['Idea', 'Drafting', 'Live']);
+  });
+
+  it('refuses to clobber a plugin preset id', () => {
+    const res = pipeline(
+      project,
+      'create', 'editorial',
+      '--shape', 'A,B,C',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/plugin preset.*read-only|customize pipeline editorial/i);
+    expect(pipelineOverrideExists(project, 'editorial')).toBe(false);
+  });
+
+  it('refuses when a project override already exists', () => {
+    writePipelineOverride(project, 'my-blog', {
+      id: 'my-blog',
+      name: 'My Blog',
+      description: 'x',
+      linearStages: ['A'],
+      offPipelineStages: [],
+    });
+    const res = pipeline(
+      project,
+      'create', 'my-blog',
+      '--shape', 'X,Y',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/project override already exists/);
+  });
+
+  it('refuses when --shape is missing', () => {
+    const res = pipeline(project, 'create', 'my-blog');
+    expect(res.code).toBe(2);
+    expect(res.stderr).toMatch(/Missing required flag --shape/);
+  });
+
+  it('refuses pipeline ids that fail the kebab-case charset', () => {
+    const res = pipeline(
+      project,
+      'create', 'UPPER',
+      '--shape', 'A,B',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/Invalid pipeline id/);
+  });
+
+  it('refuses pipeline ids that look like path-traversal', () => {
+    const res = pipeline(
+      project,
+      'create', '../../etc/foo',
+      '--shape', 'A,B',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/Invalid pipeline id/);
+  });
+
+  it('refuses a --shape value with a blank stage', () => {
+    const res = pipeline(
+      project,
+      'create', 'my-blog',
+      '--shape', 'Idea,,Live',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/blank/);
+  });
+
+  it('refuses an empty --shape', () => {
+    const res = pipeline(
+      project,
+      'create', 'my-blog',
+      '--shape', '',
+    );
+    expect(res.code).toBe(2);
+    expect(res.stderr).toMatch(/--shape requires a non-empty/);
+  });
+});
+
+describe('deskwork pipeline (generic)', () => {
+  it('prints usage when no verb is supplied', () => {
+    const res = pipeline(project);
+    expect(res.code).toBe(2);
+    expect(res.stderr).toMatch(/Usage: deskwork pipeline/);
+  });
+
+  it('prints an unknown-verb error', () => {
+    const res = pipeline(project, 'nope');
+    expect(res.code).toBe(2);
+    expect(res.stderr).toMatch(/Unknown pipeline verb: nope/);
+  });
+});
diff --git a/packages/cli/test/pipeline/update.test.ts b/packages/cli/test/pipeline/update.test.ts
new file mode 100644
index 0000000..4b8e9b2
--- /dev/null
+++ b/packages/cli/test/pipeline/update.test.ts
@@ -0,0 +1,334 @@
+/**
+ * deskwork CLI `pipeline update` — five mutually-exclusive operations.
+ *
+ * Phase 6 Task 6.2 (graphical-entries). Covers happy paths for each
+ * operation plus refusal modes (multi-flag, missing operation,
+ * referenced-stage removal, plugin-preset refusal, schema violations).
+ */
+
+import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
+import {
+  assertDeskworkBinPresent,
+  destroyProject,
+  makeProject,
+  pipeline,
+  pipelineRenamesExists,
+  readPipelineOverride,
+  readPipelineRenames,
+  writeLaneJson,
+  writePipelineOverride,
+  writeSidecar,
+} from './helpers.ts';
+
+beforeAll(() => { assertDeskworkBinPresent(); });
+
+let project: string;
+beforeEach(() => {
+  project = makeProject();
+  writePipelineOverride(project, 'my-blog', {
+    id: 'my-blog',
+    name: 'My Blog',
+    description: 'Operator pipeline',
+    linearStages: ['Idea', 'Drafting', 'Review', 'Live'],
+    offPipelineStages: ['Blocked', 'Cancelled'],
+  });
+});
+afterEach(() => { destroyProject(project); });
+
+describe('deskwork pipeline update --add-stage', () => {
+  it('appends to linearStages by default', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog', '--add-stage', 'Promoted',
+    );
+    expect(res.stderr).toBe('');
+    expect(res.code).toBe(0);
+    const onDisk = readPipelineOverride(project, 'my-blog');
+    expect(onDisk['linearStages']).toEqual([
+      'Idea', 'Drafting', 'Review', 'Live', 'Promoted',
+    ]);
+  });
+
+  it('honors --position', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog',
+      '--add-stage', 'Outlined',
+      '--position', '1',
+    );
+    expect(res.code).toBe(0);
+    const onDisk = readPipelineOverride(project, 'my-blog');
+    expect(onDisk['linearStages']).toEqual([
+      'Idea', 'Outlined', 'Drafting', 'Review', 'Live',
+    ]);
+  });
+
+  it('refuses when the stage already exists', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog', '--add-stage', 'Drafting',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/already exists/);
+  });
+
+  it('refuses an out-of-range --position', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog',
+      '--add-stage', 'New',
+      '--position', '99',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/out of range/);
+  });
+
+  it('refuses --position values that are not non-negative integers', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog',
+      '--add-stage', 'New',
+      '--position', '-1',
+    );
+    expect(res.code).toBe(2);
+    expect(res.stderr).toMatch(/non-negative integer/);
+  });
+});
+
+describe('deskwork pipeline update --rename-stage', () => {
+  it('renames in linearStages', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog',
+      '--rename-stage', 'Drafting',
+      '--to-stage', 'Writing',
+    );
+    expect(res.stderr).toBe('');
+    expect(res.code).toBe(0);
+    const onDisk = readPipelineOverride(project, 'my-blog');
+    expect(onDisk['linearStages']).toEqual([
+      'Idea', 'Writing', 'Review', 'Live',
+    ]);
+  });
+
+  it('appends a {from, to, at} entry to <id>-renames.json', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog',
+      '--rename-stage', 'Drafting',
+      '--to-stage', 'Writing',
+    );
+    expect(res.code).toBe(0);
+    expect(pipelineRenamesExists(project, 'my-blog')).toBe(true);
+    const migration = readPipelineRenames(project, 'my-blog');
+    expect(migration.pipelineId).toBe('my-blog');
+    expect(migration.renames).toHaveLength(1);
+    expect(migration.renames[0]).toMatchObject({
+      from: 'Drafting',
+      to: 'Writing',
+    });
+    expect(migration.renames[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
+  });
+
+  it('appends a second rename to the existing renames file', () => {
+    pipeline(
+      project, 'update', 'my-blog',
+      '--rename-stage', 'Drafting',
+      '--to-stage', 'Writing',
+    );
+    pipeline(
+      project, 'update', 'my-blog',
+      '--rename-stage', 'Review',
+      '--to-stage', 'Editing',
+    );
+    const migration = readPipelineRenames(project, 'my-blog');
+    expect(migration.renames).toHaveLength(2);
+    expect(migration.renames[0].from).toBe('Drafting');
+    expect(migration.renames[1].from).toBe('Review');
+  });
+
+  it('renames in offPipelineStages when the target lives there', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog',
+      '--rename-stage', 'Blocked',
+      '--to-stage', 'OnHold',
+    );
+    expect(res.code).toBe(0);
+    const onDisk = readPipelineOverride(project, 'my-blog');
+    expect(onDisk['offPipelineStages']).toEqual(['OnHold', 'Cancelled']);
+  });
+
+  it('refuses when <from> does not exist', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog',
+      '--rename-stage', 'Nope',
+      '--to-stage', 'Anything',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/not found/);
+  });
+
+  it('refuses when <to> already exists', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog',
+      '--rename-stage', 'Drafting',
+      '--to-stage', 'Review',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/already exists/);
+  });
+
+  it('refuses when --to-stage is omitted', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog',
+      '--rename-stage', 'Drafting',
+    );
+    expect(res.code).toBe(2);
+    expect(res.stderr).toMatch(/--rename-stage requires --to-stage/);
+  });
+});
+
+describe('deskwork pipeline update --remove-stage', () => {
+  it('removes from linearStages', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog', '--remove-stage', 'Review',
+    );
+    expect(res.code).toBe(0);
+    const onDisk = readPipelineOverride(project, 'my-blog');
+    expect(onDisk['linearStages']).toEqual(['Idea', 'Drafting', 'Live']);
+  });
+
+  it('removes from offPipelineStages', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog', '--remove-stage', 'Blocked',
+    );
+    expect(res.code).toBe(0);
+    const onDisk = readPipelineOverride(project, 'my-blog');
+    expect(onDisk['offPipelineStages']).toEqual(['Cancelled']);
+  });
+
+  it('refuses when entries reference the stage via lane binding', () => {
+    writeLaneJson(project, 'default', {
+      id: 'default',
+      name: 'Default',
+      pipelineTemplate: 'my-blog',
+      contentDir: 'docs',
+    });
+    writeSidecar(
+      project,
+      '550e8400-e29b-41d4-a716-446655440000',
+      'post-a',
+      { lane: 'default', currentStage: 'Review' },
+    );
+    const res = pipeline(
+      project, 'update', 'my-blog', '--remove-stage', 'Review',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/1 entry references.*post-a/);
+    const onDisk = readPipelineOverride(project, 'my-blog');
+    expect(onDisk['linearStages']).toContain('Review');
+  });
+
+  it('allows removal when referencing entries belong to a different-template lane', () => {
+    writeLaneJson(project, 'other', {
+      id: 'other',
+      name: 'Other',
+      pipelineTemplate: 'editorial',
+      contentDir: 'docs',
+    });
+    writeSidecar(
+      project,
+      '550e8400-e29b-41d4-a716-446655440001',
+      'unrelated-post',
+      { lane: 'other', currentStage: 'Drafting' },
+    );
+    const res = pipeline(
+      project, 'update', 'my-blog', '--remove-stage', 'Review',
+    );
+    expect(res.code).toBe(0);
+  });
+
+  it('refuses removal that would empty linearStages', () => {
+    writePipelineOverride(project, 'tiny', {
+      id: 'tiny',
+      name: 'Tiny',
+      description: 'x',
+      linearStages: ['Only'],
+      offPipelineStages: [],
+    });
+    const res = pipeline(
+      project, 'update', 'tiny', '--remove-stage', 'Only',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/leave linearStages empty/);
+  });
+});
+
+describe('deskwork pipeline update --set-locked', () => {
+  it('replaces lockedStages wholesale', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog', '--set-locked', 'Review,Live',
+    );
+    expect(res.code).toBe(0);
+    const onDisk = readPipelineOverride(project, 'my-blog');
+    expect(onDisk['lockedStages']).toEqual(['Review', 'Live']);
+  });
+
+  it('refuses stages not in linearStages', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog', '--set-locked', 'Drafting,Bogus',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/not in linearStages|subset/);
+  });
+});
+
+describe('deskwork pipeline update --set-off-pipeline', () => {
+  it('replaces offPipelineStages wholesale', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog',
+      '--set-off-pipeline', 'Blocked,Cancelled,Archived',
+    );
+    expect(res.code).toBe(0);
+    const onDisk = readPipelineOverride(project, 'my-blog');
+    expect(onDisk['offPipelineStages']).toEqual([
+      'Blocked', 'Cancelled', 'Archived',
+    ]);
+  });
+
+  it('refuses overlap with linearStages', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog',
+      '--set-off-pipeline', 'Blocked,Drafting',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/already in linearStages|either linear OR off-pipeline/);
+  });
+});
+
+describe('deskwork pipeline update (refusal modes)', () => {
+  it('refuses when no operation flag is supplied', () => {
+    const res = pipeline(project, 'update', 'my-blog');
+    expect(res.code).toBe(2);
+    expect(res.stderr).toMatch(/no operation flag/);
+  });
+
+  it('refuses when more than one operation flag is supplied', () => {
+    const res = pipeline(
+      project, 'update', 'my-blog',
+      '--add-stage', 'X',
+      '--remove-stage', 'Drafting',
+    );
+    expect(res.code).toBe(2);
+    expect(res.stderr).toMatch(/mutually exclusive/);
+  });
+
+  it('refuses to mutate a plugin preset that has no project override', () => {
+    const res = pipeline(
+      project, 'update', 'editorial', '--add-stage', 'X',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/plugin preset.*read-only|customize pipeline editorial/i);
+  });
+
+  it('refuses when no override exists for a non-preset id', () => {
+    const res = pipeline(
+      project, 'update', 'nonexistent', '--add-stage', 'X',
+    );
+    expect(res.code).not.toBe(0);
+    expect(res.stderr).toMatch(/no project override exists/);
+  });
+});
diff --git a/packages/core/src/lanes/index.ts b/packages/core/src/lanes/index.ts
index 276e7e3..d4789aa 100644
--- a/packages/core/src/lanes/index.ts
+++ b/packages/core/src/lanes/index.ts
@@ -21,6 +21,7 @@ export {
   listLaneConfigs,
   lanesDir,
   laneConfigPath,
+  type ListLaneConfigsOptions,
 } from './loader.ts';
 
 export { detectArtifactKind } from './detection.ts';
@@ -39,3 +40,26 @@ export {
 // on pipeline-template stage names; re-exported here for back-compat so
 // existing `@/lanes/stage-token` callers keep resolving.
 export { stageNameToFilesystemToken } from '../pipelines/stage-token.ts';
+
+// Phase 6 Task 6.1 — lane CRUD operations consumed by the CLI
+// `lane` verb. Each named export is the per-verb core function.
+export {
+  createLane,
+  showLane,
+  listLanes,
+  updateLane,
+  archiveLane,
+  restoreLane,
+  purgeLane,
+  moveEntryToLane,
+  type CreateLaneOptions,
+  type CreateLaneResult,
+  type ListLanesOptions,
+  type ListedLane,
+  type UpdateLaneOptions,
+  type UpdateLaneResult,
+  type ArchiveLaneResult,
+  type PurgeLaneResult,
+  type MoveEntryOptions,
+  type MoveEntryResult,
+} from './operations/index.ts';
diff --git a/packages/core/src/lanes/loader.ts b/packages/core/src/lanes/loader.ts
index f4f7455..0bdb8e1 100644
--- a/packages/core/src/lanes/loader.ts
+++ b/packages/core/src/lanes/loader.ts
@@ -30,8 +30,8 @@
  */
 
 import { existsSync, readdirSync, readFileSync } from 'node:fs';
-import { join, basename } from 'node:path';
-import { LaneConfigSchema, type LaneConfig } from './types.ts';
+import { join, basename, relative, resolve, isAbsolute } from 'node:path';
+import { LANE_ID_REGEX, LaneConfigSchema, type LaneConfig } from './types.ts';
 import { loadPipelineTemplate } from '../pipelines/loader.ts';
 
 /**
@@ -48,6 +48,67 @@ export function laneConfigPath(projectRoot: string, id: string): string {
   return join(lanesDir(projectRoot), `${id}.json`);
 }
 
+/**
+ * Defensive containment check: refuse any operator-supplied lane id
+ * whose resolved JSON path is not under `<projectRoot>/.deskwork/lanes/`.
+ *
+ * The Zod schema's `LANE_ID_REGEX` already prevents the path-traversal
+ * shape from passing validation in practice, but this check enforces
+ * the invariant at the filesystem boundary so the same exposure can't
+ * sneak in via a future code path that constructs a `LaneConfig`
+ * without going through the schema. Belt-and-suspenders by design.
+ *
+ * Refuses on:
+ *   - id whose resolved path escapes the lanes directory (e.g.
+ *     `../../etc/foo` or any string the regex would also reject).
+ *   - id that fails the `LANE_ID_REGEX` charset check.
+ */
+export function assertSafeLaneId(projectRoot: string, id: string): void {
+  if (!LANE_ID_REGEX.test(id)) {
+    throw new Error(
+      `Invalid lane id ${JSON.stringify(id)}: must be kebab-case [a-z0-9-], `
+      + `starting with [a-z0-9]. Lane ids are filenames under .deskwork/lanes/.`,
+    );
+  }
+  const lanesDirAbs = resolve(lanesDir(projectRoot));
+  const configAbs = resolve(laneConfigPath(projectRoot, id));
+  const rel = relative(lanesDirAbs, configAbs);
+  if (rel.startsWith('..') || isAbsolute(rel)) {
+    throw new Error(
+      `Invalid lane id ${JSON.stringify(id)}: resolved path ${configAbs} `
+      + `escapes the lanes directory ${lanesDirAbs}.`,
+    );
+  }
+}
+
+/**
+ * Refuse a `contentDir` whose resolved path escapes the project root.
+ * Lane configs constrain `contentDir` to the project tree; an
+ * operator passing `--content-dir ../../tmp/foo` (or any other shape
+ * that resolves higher in the filesystem) is a path-traversal
+ * exposure and is refused at the create / update boundaries. Mirrors
+ * `assertSafeLaneId` — same belt-and-suspenders shape.
+ *
+ * Absolute paths equal to or inside the project root are accepted
+ * verbatim; relative paths resolve against the project root.
+ */
+export function assertSafeContentDir(
+  projectRoot: string,
+  contentDir: string,
+): void {
+  const projectAbs = resolve(projectRoot);
+  const targetAbs = isAbsolute(contentDir)
+    ? resolve(contentDir)
+    : resolve(projectAbs, contentDir);
+  const rel = relative(projectAbs, targetAbs);
+  if (rel.startsWith('..') || isAbsolute(rel)) {
+    throw new Error(
+      `Invalid contentDir ${JSON.stringify(contentDir)}: resolved path `
+      + `${targetAbs} must resolve inside the project root ${projectAbs}.`,
+    );
+  }
+}
+
 /**
  * Read + parse + Zod-validate a single JSON file into a `LaneConfig`.
  * Throws with a descriptive message on every failure mode (file
@@ -104,6 +165,7 @@ export function loadLaneConfig(id: string, projectRoot: string): LaneConfig {
       `loadLaneConfig requires a non-empty id; received ${JSON.stringify(id)}`,
     );
   }
+  assertSafeLaneId(projectRoot, id);
   const path = laneConfigPath(projectRoot, id);
   if (!existsSync(path)) {
     throw new Error(
@@ -132,6 +194,23 @@ export function loadLaneConfig(id: string, projectRoot: string): LaneConfig {
   return lane;
 }
 
+/**
+ * Options accepted by `listLaneConfigs`.
+ *
+ * - `includeArchived` — when `false` (the default), lanes carrying a
+ *   non-empty `archivedAt` field are filtered OUT of the returned
+ *   list. When `true`, archived lanes appear alongside active ones.
+ *
+ * The default of `false` is intentional: prior to Phase 6 Task 6.1
+ * archived lanes did not exist, so every existing call site (dashboard
+ * renderer, calendar renderer) wants only active lanes. Callers that
+ * genuinely want the full set (the `lane list --include-archived`
+ * verb; doctor enumeration) opt in explicitly.
+ */
+export interface ListLaneConfigsOptions {
+  readonly includeArchived?: boolean;
+}
+
 /**
  * Enumerate every lane config id under `<projectRoot>/.deskwork/lanes/`.
  * Missing directory is treated as empty — a project with no lanes
@@ -142,15 +221,57 @@ export function loadLaneConfig(id: string, projectRoot: string): LaneConfig {
  * what's on disk. A malformed lane JSON still appears in the list; the
  * operator finds out about the malformation at load time.
  *
+ * Archived lanes (those whose JSON carries a non-empty `archivedAt`
+ * field) are filtered out by default. Pass `{ includeArchived: true }`
+ * to include them. The filter reads JSON and inspects the `archivedAt`
+ * field directly — it does NOT validate the full lane config (a
+ * malformed lane still appears in the list as before; the
+ * archived-filter degrades gracefully to "not archived" for any lane
+ * whose JSON fails to parse, mirroring the loader's read-only-on-
+ * enumeration contract).
+ *
  * @param projectRoot - Absolute path to the project root.
+ * @param options - Optional behavior toggles; defaults documented on
+ *   {@link ListLaneConfigsOptions}.
  */
-export function listLaneConfigs(projectRoot: string): string[] {
+export function listLaneConfigs(
+  projectRoot: string,
+  options: ListLaneConfigsOptions = {},
+): string[] {
+  const includeArchived = options.includeArchived ?? false;
   const dir = lanesDir(projectRoot);
   if (!existsSync(dir)) {
     return [];
   }
-  return readdirSync(dir)
+  const basenames = readdirSync(dir)
     .filter((entry) => entry.endsWith('.json'))
     .map((entry) => basename(entry, '.json'))
     .sort();
+  if (includeArchived) {
+    return basenames;
+  }
+  return basenames.filter((id) => !isArchivedOnDisk(projectRoot, id));
+}
+
+/**
+ * Inspect a lane's JSON file directly for the presence of a non-empty
+ * `archivedAt` field. Used by `listLaneConfigs` to filter archived
+ * lanes. Read-only: refuses to throw on malformed JSON (returns
+ * `false` so the lane still appears in non-archived lists; the
+ * malformation surfaces at `loadLaneConfig` time).
+ */
+function isArchivedOnDisk(projectRoot: string, id: string): boolean {
+  const path = laneConfigPath(projectRoot, id);
+  if (!existsSync(path)) {
+    return false;
+  }
+  try {
+    const raw = readFileSync(path, 'utf8');
+    const parsed: unknown = JSON.parse(raw);
+    if (parsed === null || typeof parsed !== 'object') return false;
+    const archivedAt = Reflect.get(parsed, 'archivedAt');
+    return typeof archivedAt === 'string' && archivedAt.length > 0;
+  } catch {
+    return false;
+  }
 }
diff --git a/packages/core/src/lanes/operations/archive.ts b/packages/core/src/lanes/operations/archive.ts
new file mode 100644
index 0000000..505b62a
--- /dev/null
+++ b/packages/core/src/lanes/operations/archive.ts
@@ -0,0 +1,88 @@
+/**
+ * lane archive / lane restore — flip the `archivedAt` field on a lane.
+ *
+ * Phase 6 Task 6.1 (graphical-entries). Soft-archive shape: the
+ * `archivedAt` field carries an ISO datetime that doubles as the
+ * boolean signal and the audit trail. Archive sets the field;
+ * restore clears it.
+ *
+ * Both operations are project-level config edits — no entries are
+ * touched. Entries that reference an archived lane keep their
+ * `lane` field intact; the dashboard / studio renderers skip
+ * archived lanes by default (because `listLaneConfigs` filters them
+ * out at the default call). To purge an archived lane completely,
+ * use `lane purge` — which refuses when entries still reference the
+ * lane, so the archive → purge path forces the operator through a
+ * `lane move` of every dependent entry first.
+ *
+ * Per the project's "content-management databases preserve, they
+ * don't delete" rule, archive is the preferred disposition for a
+ * lane the operator no longer wants surfaced.
+ */
+
+import { appendJournalEvent } from '../../journal/append.ts';
+import { loadLaneConfig } from '../loader.ts';
+import { type LaneConfig } from '../types.ts';
+import { commitLaneConfig } from './commit.ts';
+
+export interface ArchiveLaneResult {
+  readonly lane: LaneConfig;
+  readonly path: string;
+}
+
+export async function archiveLane(
+  projectRoot: string,
+  id: string,
+): Promise<ArchiveLaneResult> {
+  const existing = loadLaneConfig(id, projectRoot);
+  if (
+    typeof existing.archivedAt === 'string'
+    && existing.archivedAt.length > 0
+  ) {
+    throw new Error(
+      `Cannot archive lane "${id}": already archived (archivedAt=${existing.archivedAt}).`,
+    );
+  }
+
+  const at = new Date().toISOString();
+  const updated: LaneConfig = { ...existing, archivedAt: at };
+
+  const { lane, path } = commitLaneConfig(projectRoot, id, updated, 'archive');
+  await appendJournalEvent(projectRoot, {
+    kind: 'lane-archive',
+    at,
+    laneId: id,
+  });
+  return { lane, path };
+}
+
+export async function restoreLane(
+  projectRoot: string,
+  id: string,
+): Promise<ArchiveLaneResult> {
+  const existing = loadLaneConfig(id, projectRoot);
+  if (
+    existing.archivedAt === undefined
+    || (typeof existing.archivedAt === 'string' && existing.archivedAt.length === 0)
+  ) {
+    throw new Error(
+      `Cannot restore lane "${id}": not archived (no archivedAt field).`,
+    );
+  }
+
+  // Strip archivedAt; keep every other field including any
+  // passthrough extras (e.g. $rationale). `archivedAt` is schema-
+  // optional, so the destructured `rest` is structurally assignable
+  // to `LaneConfig` without an explicit cast.
+  const { archivedAt: _drop, ...rest } = existing;
+  void _drop;
+  const updated: LaneConfig = rest;
+
+  const { lane, path } = commitLaneConfig(projectRoot, id, updated, 'restore');
+  await appendJournalEvent(projectRoot, {
+    kind: 'lane-restore',
+    at: new Date().toISOString(),
+    laneId: id,
+  });
+  return { lane, path };
+}
diff --git a/packages/core/src/lanes/operations/commit.ts b/packages/core/src/lanes/operations/commit.ts
new file mode 100644
index 0000000..3c89824
--- /dev/null
+++ b/packages/core/src/lanes/operations/commit.ts
@@ -0,0 +1,60 @@
+/**
+ * Shared lane-config commit helper. Atomic write helper for lane
+ * config JSON files. Mirrors packages/core/src/sidecar/write.ts —
+ * the "commit" in the function name refers to writing-to-disk, not
+ * to anything git-related.
+ *
+ * Phase 6 Task 6.1 (graphical-entries). Centralizes the
+ * Zod-validate-and-write-to-disk shape used by every mutating lane
+ * operation (create, update, archive, restore). The journal-event
+ * append is intentionally NOT bundled here — each verb's event
+ * carries operation-specific details (changedFields, archivedAt
+ * timestamp, etc.) and is awaited by the caller separately.
+ *
+ * The write is atomic via a tmp+rename pattern: a crash mid-write
+ * leaves the tmp file (which is unlinked on rename failure) rather
+ * than a truncated lane config that subsequent `loadLaneConfig`
+ * reads would reject.
+ *
+ * The `verb` argument personalizes the error message so the operator
+ * sees which operation failed validation.
+ */
+
+import { renameSync, unlinkSync, writeFileSync } from 'node:fs';
+import { laneConfigPath } from '../loader.ts';
+import { LaneConfigSchema, type LaneConfig } from '../types.ts';
+
+export interface CommitResult {
+  readonly lane: LaneConfig;
+  readonly path: string;
+}
+
+export function commitLaneConfig(
+  projectRoot: string,
+  id: string,
+  candidate: LaneConfig,
+  verb: string,
+): CommitResult {
+  const validated = LaneConfigSchema.safeParse(candidate);
+  if (!validated.success) {
+    throw new Error(
+      `Cannot ${verb} lane "${id}": schema validation failed:\n`
+      + validated.error.message,
+    );
+  }
+  const path = laneConfigPath(projectRoot, id);
+  const tmpPath = `${path}.${process.pid}.tmp`;
+  const payload = JSON.stringify(validated.data, null, 2) + '\n';
+  try {
+    writeFileSync(tmpPath, payload, 'utf8');
+    renameSync(tmpPath, path);
+  } catch (err) {
+    // Clean up the tmp file if rename failed — don't leak `.tmp`
+    // files on disk. The catch is best-effort: an unlink failure
+    // re-throws the ORIGINAL write/rename error so the operator
+    // sees the root cause.
+    try { unlinkSync(tmpPath); } catch { /* tmp absent — ignore */ }
+    throw err;
+  }
+  return { lane: validated.data, path };
+}
diff --git a/packages/core/src/lanes/operations/create.ts b/packages/core/src/lanes/operations/create.ts
new file mode 100644
index 0000000..fa9a611
--- /dev/null
+++ b/packages/core/src/lanes/operations/create.ts
@@ -0,0 +1,98 @@
+/**
+ * lane create — write a new lane config to `.deskwork/lanes/<id>.json`.
+ *
+ * Phase 6 Task 6.1 (graphical-entries). The operation is project-level
+ * (no entry mutation); it validates the lane via `LaneConfigSchema`
+ * before writing and refuses to overwrite an existing file.
+ *
+ * The referenced pipeline template MUST resolve via
+ * `loadPipelineTemplate` at create time — a lane bound to a
+ * non-existent template is an invalid lane config. This is the same
+ * cross-validation `loadLaneConfig` performs on read; doing it at
+ * write time keeps the on-disk state consistent.
+ */
+
+import { existsSync, mkdirSync } from 'node:fs';
+import { dirname } from 'node:path';
+import { appendJournalEvent } from '../../journal/append.ts';
+import { loadPipelineTemplate } from '../../pipelines/loader.ts';
+import {
+  assertSafeContentDir,
+  assertSafeLaneId,
+  laneConfigPath,
+} from '../loader.ts';
+import { type LaneConfig } from '../types.ts';
+import { commitLaneConfig } from './commit.ts';
+
+export interface CreateLaneOptions {
+  readonly id: string;
+  readonly name: string;
+  readonly pipelineTemplate: string;
+  readonly contentDir: string;
+}
+
+export interface CreateLaneResult {
+  readonly lane: LaneConfig;
+  readonly path: string;
+}
+
+/**
+ * Write a new lane config. Refuses when:
+ *   - `<projectRoot>/.deskwork/lanes/<id>.json` already exists (the
+ *     operator must remove the existing file or use `lane update`).
+ *   - The lane fails Zod validation (e.g. empty id / name).
+ *   - The referenced pipeline template fails to resolve via
+ *     `loadPipelineTemplate(opts.pipelineTemplate, projectRoot)`.
+ *
+ * Emits a `lane-create` journal event on success.
+ */
+export async function createLane(
+  projectRoot: string,
+  opts: CreateLaneOptions,
+): Promise<CreateLaneResult> {
+  assertSafeLaneId(projectRoot, opts.id);
+  assertSafeContentDir(projectRoot, opts.contentDir);
+  const target = laneConfigPath(projectRoot, opts.id);
+  if (existsSync(target)) {
+    throw new Error(
+      `Cannot create lane "${opts.id}": file already exists at ${target}. `
+      + `Either remove the file first, or use "deskwork lane update ${opts.id}" `
+      + `to modify the existing lane.`,
+    );
+  }
+
+  // Cross-validate the pipeline template before assembling the lane —
+  // a lane bound to an unknown template is invalid by construction.
+  try {
+    loadPipelineTemplate(opts.pipelineTemplate, projectRoot);
+  } catch (err) {
+    const detail = err instanceof Error ? err.message : String(err);
+    throw new Error(
+      `Cannot create lane "${opts.id}": pipelineTemplate "${opts.pipelineTemplate}" `
+      + `does not resolve:\n${detail}`,
+    );
+  }
+
+  const candidate: LaneConfig = {
+    id: opts.id,
+    name: opts.name,
+    pipelineTemplate: opts.pipelineTemplate,
+    contentDir: opts.contentDir,
+  };
+
+  mkdirSync(dirname(target), { recursive: true });
+  const { lane, path } = commitLaneConfig(projectRoot, opts.id, candidate, 'create');
+
+  await appendJournalEvent(projectRoot, {
+    kind: 'lane-create',
+    at: new Date().toISOString(),
+    laneId: opts.id,
+    details: {
+      name: opts.name,
+      pipelineTemplate: opts.pipelineTemplate,
+      contentDir: opts.contentDir,
+    },
+  });
+
+  return { lane, path };
+}
diff --git a/packages/core/src/lanes/operations/index.ts b/packages/core/src/lanes/operations/index.ts
new file mode 100644
index 0000000..4b72621
--- /dev/null
+++ b/packages/core/src/lanes/operations/index.ts
@@ -0,0 +1,25 @@
+/**
+ * Lane operations — barrel export.
+ *
+ * Phase 6 Task 6.1 (graphical-entries). The CLI `lane` verb is a thin
+ * dispatcher over these core functions: each verb has a matching
+ * named export here. All operations are async (so the journal-event
+ * append can be awaited); side-effects are the lane JSON write, the
+ * sidecar / artifact relocation (on `move`), and the journal-event
+ * append.
+ */
+
+export { createLane } from './create.ts';
+export { showLane } from './show.ts';
+export { listLanes } from './list.ts';
+export { updateLane } from './update.ts';
+export { archiveLane, restoreLane } from './archive.ts';
+export { purgeLane } from './purge.ts';
+export { moveEntryToLane } from './move.ts';
+
+export type { CreateLaneOptions, CreateLaneResult } from './create.ts';
+export type { ListLanesOptions, ListedLane } from './list.ts';
+export type { UpdateLaneOptions, UpdateLaneResult } from './update.ts';
+export type { ArchiveLaneResult } from './archive.ts';
+export type { PurgeLaneResult } from './purge.ts';
+export type { MoveEntryOptions, MoveEntryResult } from './move.ts';
diff --git a/packages/core/src/lanes/operations/list.ts b/packages/core/src/lanes/operations/list.ts
new file mode 100644
index 0000000..e06b2c7
--- /dev/null
+++ b/packages/core/src/lanes/operations/list.ts
@@ -0,0 +1,41 @@
+/**
+ * lane list — enumerate lane configs in the project.
+ *
+ * Phase 6 Task 6.1 (graphical-entries). Wraps `listLaneConfigs` and
+ * loads each lane's metadata so the CLI handler can render id + name
+ * + pipelineTemplate + contentDir + archived state without making N+1
+ * calls to `loadLaneConfig` in the CLI layer.
+ *
+ * The `includeArchived` flag flows through to the loader. The result
+ * preserves the loader's alphabetical-by-id ordering; the CLI handler
+ * is responsible for any preferred-display-order overrides (e.g. the
+ * `.deskwork/lane-order.json` lookup landed in Phase 5).
+ */
+
+import { listLaneConfigs, loadLaneConfig } from '../loader.ts';
+import type { LaneConfig } from '../types.ts';
+
+export interface ListLanesOptions {
+  /** Include archived lanes (`archivedAt` set). Defaults to `false`. */
+  readonly includeArchived?: boolean;
+}
+
+export interface ListedLane {
+  readonly id: string;
+  readonly config: LaneConfig;
+  readonly archived: boolean;
+}
+
+export function listLanes(
+  projectRoot: string,
+  opts: ListLanesOptions = {},
+): ListedLane[] {
+  const includeArchived = opts.includeArchived ?? false;
+  const ids = listLaneConfigs(projectRoot, { includeArchived });
+  return ids.map((id) => {
+    const config = loadLaneConfig(id, projectRoot);
+    const archived =
+      typeof config.archivedAt === 'string' && config.archivedAt.length > 0;
+    return { id, config, archived };
+  });
+}
diff --git a/packages/core/src/lanes/operations/move.ts b/packages/core/src/lanes/operations/move.ts
new file mode 100644
index 0000000..e9d04d7
--- /dev/null
+++ b/packages/core/src/lanes/operations/move.ts
@@ -0,0 +1,342 @@
+/**
+ * lane move — relocate an entry from one lane to another.
+ *
+ * Phase 6 Task 6.1 (graphical-entries). The move:
+ *
+ *   1. Resolves the entry's current lane via the sidecar's `lane`
+ *      field. Migration-window default: an entry without a `lane`
+ *      field is treated as belonging to the `default` lane (matches
+ *      the doctor's lane-back-fill default). The move is refused
+ *      when the source lane and target lane are the same.
+ *
+ *   2. Resolves the target lane's pipeline template. The target
+ *      stage MUST be in the union of `linearStages ∪
+ *      offPipelineStages` of the target template. When the caller
+ *      omits `targetStage`, the move defaults to the target
+ *      template's FIRST `linearStages` entry.
+ *
+ *   3. Relocates the artifact file at
+ *      `<sourceContentDir>/<artifactPath>` to
+ *      `<targetContentDir>/<artifactPath>` (same relative path under
+ *      the lane's contentDir). When the source file does not exist,
+ *      the move is refused — the operator must repair the binding
+ *      before relocating.
+ *
+ *   4. Relocates the per-entry scrapbook directory at
+ *      `<sourceContentDir>/<slug>/scrapbook/` (when present) to the
+ *      target lane's parallel location. A missing scrapbook
+ *      directory is normal; the move proceeds.
+ *
+ *   5. Rewrites the sidecar with `lane = target`, `currentStage =
+ *      targetStage`. Per the PRD's open-question default,
+ *      `iterationByStage` is preserved verbatim — no stage-name
+ *      remapping. Old keys from the prior lane template become dead
+ *      entries that cause no harm (iterate uses `?? 0`).
+ *
+ *   6. Emits a `lane-move` journal event identifying source / target
+ *      lanes, source / target stages, and the artifact paths.
+ *
+ * The function uses `renameSync` for the artifact relocation
+ * (atomic on the same filesystem); when `renameSync` fails with
+ * `EXDEV` (cross-device) the fallback is a copy + delete loop so the
+ * move survives a contentDir that points at a separate mount.
+ */
+
+import {
+  copyFileSync,
+  cpSync,
+  existsSync,
+  mkdirSync,
+  renameSync,
+  rmSync,
+  unlinkSync,
+} from 'node:fs';
+import { dirname, isAbsolute, join, resolve } from 'node:path';
+import { appendJournalEvent } from '../../journal/append.ts';
+import { writeSidecar } from '../../sidecar/write.ts';
+import { readSidecar } from '../../sidecar/read.ts';
+import { loadPipelineTemplate } from '../../pipelines/loader.ts';
+import { loadLaneConfig } from '../loader.ts';
+
+const DEFAULT_LANE_ID = 'default';
+
+export interface MoveEntryOptions {
+  readonly uuid: string;
+  readonly toLane: string;
+  /**
+   * Stage in the TARGET lane's template to assign to the entry. When
+   * omitted, defaults to the target template's first `linearStages`
+   * entry. Must be in the union of the target template's
+   * `linearStages ∪ offPipelineStages`.
+   */
+  readonly targetStage?: string;
+}
+
+export interface MoveEntryResult {
+  readonly entryId: string;
+  readonly fromLane: string;
+  readonly toLane: string;
+  readonly fromStage: string;
+  readonly toStage: string;
+  readonly fromArtifactPath?: string;
+  readonly toArtifactPath?: string;
+}
+
+/**
+ * Resolve `<contentDir>` to an absolute path. Lane configs may
+ * declare `contentDir` as either absolute (taken verbatim) or
+ * relative (resolved against the project root).
+ */
+function resolveContentDirAbs(projectRoot: string, contentDir: string): string {
+  return isAbsolute(contentDir) ? contentDir : resolve(projectRoot, contentDir);
+}
+
+/**
+ * Type guard for the subset of Node ErrnoException we care about
+ * (just the `code` string). Keeps the cross-device fallback path
+ * type-safe without an unchecked `as NodeJS.ErrnoException`.
+ */
+function isErrnoCode(err: unknown, expected: string): boolean {
+  if (err === null || typeof err !== 'object') return false;
+  const maybe = (err as { code?: unknown }).code;
+  return typeof maybe === 'string' && maybe === expected;
+}
+
+/**
+ * Move a path with renameSync, falling back to a caller-supplied
+ * cross-device strategy on EXDEV. The fallback is responsible for
+ * both creating the destination and removing the source — the
+ * helper does not split copy/delete across calls.
+ *
+ * The parent directory of `dst` is mkdir'd on every call so callers
+ * don't have to thread that detail.
+ */
+function tryRenameWithFallback(
+  src: string,
+  dst: string,
+  exdevFallback: (src: string, dst: string) => void,
+): void {
+  mkdirSync(dirname(dst), { recursive: true });
+  try {
+    renameSync(src, dst);
+  } catch (err) {
+    if (!isErrnoCode(err, 'EXDEV')) throw err;
+    exdevFallback(src, dst);
+  }
+}
+
+function moveFile(src: string, dst: string): void {
+  tryRenameWithFallback(src, dst, (s, d) => {
+    copyFileSync(s, d);
+    unlinkSync(s);
+  });
+}
+
+function moveDir(src: string, dst: string): void {
+  tryRenameWithFallback(src, dst, (s, d) => {
+    cpSync(s, d, { recursive: true });
+    rmSync(s, { recursive: true, force: true });
+  });
+}
+
+export async function moveEntryToLane(
+  projectRoot: string,
+  opts: MoveEntryOptions,
+): Promise<MoveEntryResult> {
+  const sidecar = await readSidecar(projectRoot, opts.uuid);
+
+  const sourceLaneId = sidecar.lane ?? DEFAULT_LANE_ID;
+  if (sourceLaneId === opts.toLane) {
+    throw new Error(
+      `Cannot move entry ${sidecar.slug}: already in lane "${opts.toLane}".`,
+    );
+  }
+
+  const sourceLane = loadLaneConfig(sourceLaneId, projectRoot);
+  const targetLane = loadLaneConfig(opts.toLane, projectRoot);
+  if (
+    typeof targetLane.archivedAt === 'string'
+    && targetLane.archivedAt.length > 0
+  ) {
+    throw new Error(
+      `Cannot move entry ${sidecar.slug} into archived lane "${opts.toLane}". `
+      + `Restore the lane first via "deskwork lane restore ${opts.toLane}".`,
+    );
+  }
+
+  const targetTemplate = loadPipelineTemplate(
+    targetLane.pipelineTemplate,
+    projectRoot,
+  );
+
+  // Resolve targetStage — explicit operator value takes precedence;
+  // default falls back to the target template's first linearStage.
+  const targetStage = opts.targetStage ?? targetTemplate.linearStages[0];
+  if (targetStage === undefined) {
+    throw new Error(
+      `Cannot move entry ${sidecar.slug}: target lane "${opts.toLane}" `
+      + `template "${targetTemplate.id}" has no linearStages defined. `
+      + `Repair the template before moving.`,
+    );
+  }
+
+  const allowed = new Set<string>([
+    ...targetTemplate.linearStages,
+    ...targetTemplate.offPipelineStages,
+  ]);
+  if (!allowed.has(targetStage)) {
+    throw new Error(
+      `Cannot move entry ${sidecar.slug} to stage "${targetStage}": `
+      + `not in target lane "${opts.toLane}" template "${targetTemplate.id}". `
+      + `Allowed stages: ${[...allowed].join(', ')}.`,
+    );
+  }
+
+  const sourceContentDir = resolveContentDirAbs(
+    projectRoot,
+    sourceLane.contentDir,
+  );
+  const targetContentDir = resolveContentDirAbs(
+    projectRoot,
+    targetLane.contentDir,
+  );
+
+  // Relocate the artifact file. When `artifactPath` is set on the
+  // sidecar, the source file is at `<sourceContentDir>/<artifactPath>`;
+  // we move it to `<targetContentDir>/<artifactPath>` (same relative
+  // shape under the new contentDir).
+  let fromArtifactAbs: string | undefined;
+  let toArtifactAbs: string | undefined;
+  if (sidecar.artifactPath !== undefined) {
+    fromArtifactAbs = join(sourceContentDir, sidecar.artifactPath);
+    toArtifactAbs = join(targetContentDir, sidecar.artifactPath);
+    if (!existsSync(fromArtifactAbs)) {
+      throw new Error(
+        `Cannot move entry ${sidecar.slug}: source artifact does not exist at `
+        + `${fromArtifactAbs}. Repair the binding (e.g. via "deskwork doctor") `
+        + `before moving.`,
+      );
+    }
+    if (existsSync(toArtifactAbs)) {
+      throw new Error(
+        `Cannot move entry ${sidecar.slug}: target artifact already exists at `
+        + `${toArtifactAbs}. The target lane already holds a file at the same `
+        + `relative path; resolve the collision (rename / move / remove) before `
+        + `running lane move.`,
+      );
+    }
+  }
+
+  const sourceScrapbookDir = join(sourceContentDir, sidecar.slug, 'scrapbook');
+  const targetScrapbookDir = join(targetContentDir, sidecar.slug, 'scrapbook');
+
+  // Track which filesystem operations succeeded so the catch below
+  // can reverse them on a later failure (e.g. writeSidecar throwing
+  // after the artifact + scrapbook are already in the target lane).
+  let artifactMoved = false;
+  let scrapbookMoved = false;
+
+  if (fromArtifactAbs !== undefined && toArtifactAbs !== undefined) {
+    moveFile(fromArtifactAbs, toArtifactAbs);
+    artifactMoved = true;
+  }
+
+  // Relocate the per-entry scrapbook directory when present. Lives at
+  // `<contentDir>/<slug>/scrapbook/` per the slug-template convention
+  // — see packages/core/src/scrapbook/paths.ts (_scrapbookDirSlug).
+  if (existsSync(sourceScrapbookDir)) {
+    if (existsSync(targetScrapbookDir)) {
+      // Rollback the artifact relocation so the operator's state is
+      // consistent before re-running.
+      if (artifactMoved && fromArtifactAbs !== undefined && toArtifactAbs !== undefined) {
+        moveFile(toArtifactAbs, fromArtifactAbs);
+      }
+      throw new Error(
+        `Cannot move entry ${sidecar.slug}: target scrapbook directory already `
+        + `exists at ${targetScrapbookDir}. Resolve the collision before moving.`,
+      );
+    }
+    moveDir(sourceScrapbookDir, targetScrapbookDir);
+    scrapbookMoved = true;
+  }
+
+  const at = new Date().toISOString();
+  const fromStage = sidecar.currentStage;
+  const updated = {
+    ...sidecar,
+    lane: opts.toLane,
+    currentStage: targetStage,
+    updatedAt: at,
+  };
+
+  // Wrap the sidecar write in a rollback. If the sidecar write throws
+  // AFTER the artifact + scrapbook have been moved, the entry is
+  // half-moved: filesystem says "target lane" but sidecar still says
+  // "source lane". Reverse the successful filesystem moves before
+  // re-throwing so the operator's state is consistent.
+  try {
+    await writeSidecar(projectRoot, updated);
+  } catch (err) {
+    try {
+      if (scrapbookMoved) {
+        moveDir(targetScrapbookDir, sourceScrapbookDir);
+      }
+      if (
+        artifactMoved
+        && fromArtifactAbs !== undefined
+        && toArtifactAbs !== undefined
+      ) {
+        moveFile(toArtifactAbs, fromArtifactAbs);
+      }
+    } catch (rollbackErr) {
+      const rollbackDetail = rollbackErr instanceof Error
+        ? rollbackErr.message
+        : String(rollbackErr);
+      const writeDetail = err instanceof Error ? err.message : String(err);
+      throw new Error(
+        `Failed to move entry ${sidecar.slug}: sidecar write failed `
+        + `(${writeDetail}) AND rollback of filesystem moves failed `
+        + `(${rollbackDetail}). Operator intervention required.`,
+      );
+    }
+    const detail = err instanceof Error ? err.message : String(err);
+    throw new Error(
+      `Failed to move entry ${sidecar.slug}: sidecar write failed `
+      + `(${detail}); filesystem moves rolled back.`,
+    );
+  }
+
+  const moveDetails: {
+    fromLane: string;
+    toLane: string;
+    fromStage: string;
+    toStage: string;
+    fromArtifactPath?: string;
+    toArtifactPath?: string;
+  } = {
+    fromLane: sourceLaneId,
+    toLane: opts.toLane,
+    fromStage,
+    toStage: targetStage,
+  };
+  if (fromArtifactAbs !== undefined) moveDetails.fromArtifactPath = fromArtifactAbs;
+  if (toArtifactAbs !== undefined) moveDetails.toArtifactPath = toArtifactAbs;
+
+  await appendJournalEvent(projectRoot, {
+    kind: 'lane-move',
+    at,
+    entryId: sidecar.uuid,
+    details: moveDetails,
+  });
+
+  const result: MoveEntryResult = {
+    entryId: sidecar.uuid,
+    fromLane: sourceLaneId,
+    toLane: opts.toLane,
+    fromStage,
+    toStage: targetStage,
+    ...(fromArtifactAbs !== undefined && { fromArtifactPath: fromArtifactAbs }),
+    ...(toArtifactAbs !== undefined && { toArtifactPath: toArtifactAbs }),
+  };
+  return result;
+}
diff --git a/packages/core/src/lanes/operations/purge.ts b/packages/core/src/lanes/operations/purge.ts
new file mode 100644
index 0000000..0362f55
--- /dev/null
+++ b/packages/core/src/lanes/operations/purge.ts
@@ -0,0 +1,73 @@
+/**
+ * lane purge — delete a lane config JSON from disk.
+ *
+ * Phase 6 Task 6.1 (graphical-entries). Refused (loudly) when any
+ * entry still references the lane. The operator must move every
+ * dependent entry to another lane via `lane move <slug> --to <other>`
+ * first.
+ *
+ * Per the project's "content-management databases preserve, they
+ * don't delete" rule, purge is the rarely-used corner case for a
+ * lane that was created in error or that's genuinely no longer
+ * relevant and has no historical entries. The preferred disposition
+ * for a lane with history is `lane archive`.
+ *
+ * The refusal lists the first `PURGE_DEPENDENTS_SAMPLE_LIMIT`
+ * dependent entry slugs (with a `+N more` suffix when there are
+ * additional dependents) so the operator can find them quickly.
+ */
+
+import { unlinkSync } from 'node:fs';
+import { appendJournalEvent } from '../../journal/append.ts';
+import { readAllSidecars } from '../../sidecar/read-all.ts';
+import { laneConfigPath, loadLaneConfig } from '../loader.ts';
+
+/**
+ * Cap on the number of dependent slugs included verbatim in the
+ * refusal error before falling back to `+N more`. Five keeps the
+ * error message scannable while still giving the operator concrete
+ * names to grep for.
+ */
+const PURGE_DEPENDENTS_SAMPLE_LIMIT = 5;
+
+export interface PurgeLaneResult {
+  readonly purgedPath: string;
+}
+
+export async function purgeLane(
+  projectRoot: string,
+  id: string,
+): Promise<PurgeLaneResult> {
+  // Loading the lane up front gives us a useful "lane not found"
+  // error before we walk every sidecar.
+  loadLaneConfig(id, projectRoot);
+
+  const sidecars = await readAllSidecars(projectRoot);
+  const dependents = sidecars
+    .filter((entry) => entry.lane === id)
+    .map((entry) => entry.slug);
+
+  if (dependents.length > 0) {
+    const sample = dependents.slice(0, PURGE_DEPENDENTS_SAMPLE_LIMIT);
+    const remainder = dependents.length - sample.length;
+    const suffix = remainder > 0 ? `, +${remainder} more` : '';
+    throw new Error(
+      `Cannot purge lane "${id}": ${dependents.length} `
+      + `${dependents.length === 1 ? 'entry references' : 'entries reference'} `
+      + `it (${sample.join(', ')}${suffix}). Move each entry to another lane `
+      + `with "deskwork lane move <slug> --to <other>" before purging.`,
+    );
+  }
+
+  const path = laneConfigPath(projectRoot, id);
+  unlinkSync(path);
+
+  await appendJournalEvent(projectRoot, {
+    kind: 'lane-purge',
+    at: new Date().toISOString(),
+    laneId: id,
+    details: { purgedPath: path },
+  });
+
+  return { purgedPath: path };
+}
diff --git a/packages/core/src/lanes/operations/show.ts b/packages/core/src/lanes/operations/show.ts
new file mode 100644
index 0000000..943fe8e
--- /dev/null
+++ b/packages/core/src/lanes/operations/show.ts
@@ -0,0 +1,21 @@
+/**
+ * lane show — return a fully-resolved lane config (including the
+ * archived state) for the operator-supplied id. Thin convenience
+ * around `loadLaneConfig`.
+ *
+ * Phase 6 Task 6.1 (graphical-entries). `loadLaneConfig` already
+ * filters nothing — it returns the on-disk lane including the
+ * `archivedAt` field when present. This wrapper exists so the CLI
+ * handler has a single, named entry point to consume rather than
+ * routing through the loader directly. Keeping the operations module
+ * the single import surface for `lane.ts` keeps the CLI thin and
+ * makes future lifecycle-side-effects (e.g. emitting a `lane-view`
+ * journal event for audit) easy to add without re-plumbing the CLI.
+ */
+
+import { loadLaneConfig } from '../loader.ts';
+import type { LaneConfig } from '../types.ts';
+
+export function showLane(projectRoot: string, id: string): LaneConfig {
+  return loadLaneConfig(id, projectRoot);
+}
diff --git a/packages/core/src/lanes/operations/update.ts b/packages/core/src/lanes/operations/update.ts
new file mode 100644
index 0000000..47dc820
--- /dev/null
+++ b/packages/core/src/lanes/operations/update.ts
@@ -0,0 +1,110 @@
+/**
+ * lane update — mutate a subset of fields on an existing lane config.
+ *
+ * Phase 6 Task 6.1 (graphical-entries). Accepts optional patches for
+ * `name`, `pipelineTemplate`, and `contentDir`. The lane's `id`
+ * cannot change (it's the filename). The `archivedAt` field is owned
+ * by `archive` / `restore` and is not mutable through `update`.
+ *
+ * Cross-validation:
+ *   - If `pipelineTemplate` is patched, the new template MUST resolve
+ *     via `loadPipelineTemplate` before the write commits.
+ *   - The assembled lane is re-validated against the Zod schema
+ *     before the write.
+ *
+ * Refusal:
+ *   - When no patch fields are supplied, the operation is a no-op and
+ *     throws. Operators are required to specify what changed so the
+ *     journal event records meaningful before/after deltas.
+ *
+ * Emits a `lane-update` journal event on success.
+ */
+
+import { appendJournalEvent } from '../../journal/append.ts';
+import { loadPipelineTemplate } from '../../pipelines/loader.ts';
+import { assertSafeContentDir, loadLaneConfig } from '../loader.ts';
+import { type LaneConfig } from '../types.ts';
+import { commitLaneConfig } from './commit.ts';
+
+export interface UpdateLaneOptions {
+  readonly id: string;
+  readonly name?: string;
+  readonly pipelineTemplate?: string;
+  readonly contentDir?: string;
+}
+
+export interface UpdateLaneResult {
+  readonly lane: LaneConfig;
+  readonly path: string;
+  readonly changedFields: readonly string[];
+}
+
+export async function updateLane(
+  projectRoot: string,
+  opts: UpdateLaneOptions,
+): Promise<UpdateLaneResult> {
+  const existing = loadLaneConfig(opts.id, projectRoot);
+
+  const patches: Record<string, string> = {};
+  if (opts.name !== undefined) patches['name'] = opts.name;
+  if (opts.pipelineTemplate !== undefined) {
+    patches['pipelineTemplate'] = opts.pipelineTemplate;
+  }
+  if (opts.contentDir !== undefined) {
+    assertSafeContentDir(projectRoot, opts.contentDir);
+    patches['contentDir'] = opts.contentDir;
+  }
+
+  const changedFields = Object.keys(patches);
+  if (changedFields.length === 0) {
+    throw new Error(
+      `Cannot update lane "${opts.id}": no patch fields supplied. `
+      + `Pass at least one of --name, --template, --content-dir.`,
+    );
+  }
+
+  // Cross-validate the patched pipeline template up front so we don't
+  // half-write a broken lane.
+  if (patches['pipelineTemplate'] !== undefined) {
+    try {
+      loadPipelineTemplate(patches['pipelineTemplate'], projectRoot);
+    } catch (err) {
+      const detail = err instanceof Error ? err.message : String(err);
+      throw new Error(
+        `Cannot update lane "${opts.id}": pipelineTemplate "${patches['pipelineTemplate']}" `
+        + `does not resolve:\n${detail}`,
+      );
+    }
+  }
+
+  const before: Record<string, unknown> = {};
+  const after: Record<string, unknown> = {};
+  for (const field of changedFields) {
+    // `existing` is a LaneConfig — schema `.passthrough()` widens
+    // the inferred type to accept arbitrary keys, so direct
+    // property access via Reflect.get is sound without an
+    // explicit cast and avoids `any`.
+    before[field] = Reflect.get(existing, field);
+    after[field] = patches[field];
+  }
+
+  const updated: LaneConfig = {
+    ...existing,
+    ...patches,
+  };
+
+  const { lane, path } = commitLaneConfig(projectRoot, opts.id, updated, 'update');
+
+  await appendJournalEvent(projectRoot, {
+    kind: 'lane-update',
+    at: new Date().toISOString(),
+    laneId: opts.id,
+    details: {
+      changedFields,
+      before,
+      after,
+    },
+  });
+
+  return { lane, path, changedFields };
+}
diff --git a/packages/core/src/lanes/types.ts b/packages/core/src/lanes/types.ts
index e1c7ecf..02a6540 100644
--- a/packages/core/src/lanes/types.ts
+++ b/packages/core/src/lanes/types.ts
@@ -40,11 +40,44 @@
 
 import { z } from 'zod';
 
+/**
+ * Soft-archive marker (Phase 6 Task 6.1). When present, the lane is
+ * considered "archived" — listings hide it by default, dashboard /
+ * studio renderers skip it, but the JSON file stays on disk along with
+ * every entry that referenced the lane. Restoring strips the field.
+ *
+ * The value is an ISO datetime carrying the moment the archive verb
+ * ran. The truthiness of the field is the boolean signal; the
+ * datetime is the audit trail. Per the project's "content-management
+ * databases preserve, they don't delete" rule, archive is the
+ * preferred disposition over destructive deletion — `purge` is gated
+ * and refuses when any entry still references the lane.
+ */
+/**
+ * Canonical lane id charset: kebab-case starting with [a-z0-9], allowing
+ * `[a-z0-9-]` thereafter. The convention was documented above in the
+ * docblock; encoding it in the schema makes invalid ids fail at parse
+ * time AND closes the path-traversal exposure (an id like `../../etc/foo`
+ * resolves outside `.deskwork/lanes/` if the schema only enforces
+ * non-empty).
+ *
+ * Operations that resolve `<id>` to a filesystem path (loader, create)
+ * additionally enforce the lanes-dir containment invariant via a
+ * defensive path check — belt-and-suspenders; the regex prevents the
+ * case and the path check enforces the invariant at the filesystem
+ * boundary.
+ */
+export const LANE_ID_REGEX = /^[a-z0-9][a-z0-9-]*$/;
+
 export const LaneConfigSchema = z.object({
-  id: z.string().min(1, 'id must be a non-empty string'),
+  id: z.string().regex(
+    LANE_ID_REGEX,
+    'lane id must be kebab-case [a-z0-9-], starting with [a-z0-9]',
+  ),
   name: z.string().min(1, 'name must be a non-empty string'),
   pipelineTemplate: z.string().min(1, 'pipelineTemplate must be a non-empty string'),
   contentDir: z.string().min(1, 'contentDir must be a non-empty string'),
+  archivedAt: z.string().datetime().optional(),
 }).passthrough();
 
 /**
@@ -67,7 +100,7 @@ export type LaneConfig = z.infer<typeof LaneConfigSchema>;
  */
 export type StrictLaneConfig = Pick<
   LaneConfig,
-  'id' | 'name' | 'pipelineTemplate' | 'contentDir'
+  'id' | 'name' | 'pipelineTemplate' | 'contentDir' | 'archivedAt'
 >;
 
 /**
diff --git a/packages/core/src/pipelines/index.ts b/packages/core/src/pipelines/index.ts
index b2aa278..0d72137 100644
--- a/packages/core/src/pipelines/index.ts
+++ b/packages/core/src/pipelines/index.ts
@@ -15,6 +15,13 @@ export {
 export {
   loadPipelineTemplate,
   listAvailablePipelineTemplates,
+  pipelineOverridesDir,
+  pipelineOverridePath,
+  pipelinePluginDefaultPath,
+  assertSafePipelineId,
+  isPluginPresetPipeline,
+  hasPipelineOverride,
+  PIPELINE_ID_REGEX,
 } from './loader.ts';
 
 export {
@@ -29,3 +36,24 @@ export {
 } from './helpers.ts';
 
 export { stageNameToFilesystemToken } from './stage-token.ts';
+
+// Phase 6 Task 6.2 — pipeline-template CRUD operations consumed by
+// the CLI `pipeline` verb. Each named export is the per-verb core
+// function.
+export {
+  listPipelines,
+  showPipeline,
+  createPipeline,
+  updatePipeline,
+  deletePipeline,
+  type ListedPipeline,
+  type PipelineSource,
+  type ShowPipelineResult,
+  type CreatePipelineOptions,
+  type CreatePipelineResult,
+  type UpdatePipelineOperation,
+  type UpdatePipelineOptions,
+  type UpdatePipelineResult,
+  type DeletePipelineOptions,
+  type DeletedPipelineResult,
+} from './operations/index.ts';
diff --git a/packages/core/src/pipelines/loader.ts b/packages/core/src/pipelines/loader.ts
index 7a0149c..4dc81a1 100644
--- a/packages/core/src/pipelines/loader.ts
+++ b/packages/core/src/pipelines/loader.ts
@@ -40,10 +40,24 @@
  */
 
 import { existsSync, readdirSync, readFileSync } from 'node:fs';
-import { dirname, join, basename } from 'node:path';
+import { dirname, join, basename, isAbsolute, relative, resolve } from 'node:path';
 import { fileURLToPath } from 'node:url';
 import { PipelineTemplateSchema, type PipelineTemplate } from './types.ts';
 
+/**
+ * Canonical pipeline id charset: kebab-case starting with [a-z0-9],
+ * allowing `[a-z0-9-]` thereafter. Mirrors `LANE_ID_REGEX` over in
+ * `lanes/types.ts` — pipeline ids end up as JSON filenames under
+ * `.deskwork/pipelines/` and `dist/pipelines/`, so the same character
+ * restrictions and path-traversal exposure apply.
+ *
+ * Operations that resolve `<id>` to a filesystem path (loader,
+ * create, update, delete) enforce the override-dir containment
+ * invariant via `assertSafePipelineId` — belt-and-suspenders by design
+ * mirrors Task 6.1's approach to lane ids.
+ */
+export const PIPELINE_ID_REGEX = /^[a-z0-9][a-z0-9-]*$/;
+
 /**
  * Directory shipping the plugin's built-in preset templates. The path
  * is resolved relative to the compiled module's location (works in
@@ -54,10 +68,87 @@ const PLUGIN_DEFAULTS_DIR = dirname(fileURLToPath(import.meta.url));
 /**
  * Directory inside a project where operator overrides live.
  */
-function projectOverridesDir(projectRoot: string): string {
+export function pipelineOverridesDir(projectRoot: string): string {
   return join(projectRoot, '.deskwork', 'pipelines');
 }
 
+/**
+ * Path to a specific pipeline-override JSON file under the project.
+ * Returns the path even if the file does not exist on disk (the
+ * caller resolves the override-takes-precedence semantics).
+ */
+export function pipelineOverridePath(projectRoot: string, id: string): string {
+  return join(pipelineOverridesDir(projectRoot), `${id}.json`);
+}
+
+/**
+ * Path to a built-in plugin-default pipeline JSON, regardless of
+ * whether it exists. Resolves relative to this module's location so it
+ * works in both source-mode (tsx) and built-mode (node dist/).
+ */
+export function pipelinePluginDefaultPath(id: string): string {
+  return join(PLUGIN_DEFAULTS_DIR, `${id}.json`);
+}
+
+/**
+ * Defensive containment check: refuse any operator-supplied pipeline
+ * id whose resolved JSON path is not under
+ * `<projectRoot>/.deskwork/pipelines/`.
+ *
+ * The `PIPELINE_ID_REGEX` charset check above already rejects the
+ * path-traversal shape, but this function enforces the invariant at
+ * the filesystem boundary so the same exposure cannot sneak in via a
+ * future code path that constructs a path without going through the
+ * regex. Belt-and-suspenders, mirrors `assertSafeLaneId`.
+ *
+ * Refuses on:
+ *   - id that fails the `PIPELINE_ID_REGEX` charset check.
+ *   - id whose resolved path escapes the pipelines directory.
+ */
+export function assertSafePipelineId(projectRoot: string, id: string): void {
+  if (!PIPELINE_ID_REGEX.test(id)) {
+    throw new Error(
+      `Invalid pipeline id ${JSON.stringify(id)}: must be kebab-case `
+      + `[a-z0-9-], starting with [a-z0-9]. Pipeline ids are filenames `
+      + `under .deskwork/pipelines/.`,
+    );
+  }
+  const overrideDirAbs = resolve(pipelineOverridesDir(projectRoot));
+  const overrideAbs = resolve(pipelineOverridePath(projectRoot, id));
+  const rel = relative(overrideDirAbs, overrideAbs);
+  if (rel.startsWith('..') || isAbsolute(rel)) {
+    throw new Error(
+      `Invalid pipeline id ${JSON.stringify(id)}: resolved path `
+      + `${overrideAbs} escapes the pipelines directory ${overrideDirAbs}.`,
+    );
+  }
+}
+
+/**
+ * Inspect whether a pipeline template id is resolvable as a built-in
+ * plugin preset. `loadPipelineTemplate` returns the override first if
+ * present; this helper exists for operations that need to distinguish
+ * "plugin-shipped read-only template" from "project-override the
+ * operator wrote" (e.g. `pipeline delete` refuses on plugin presets).
+ *
+ * Returns `true` when the plugin-default JSON exists for `id`,
+ * regardless of whether a project override also exists. Does NOT
+ * validate the JSON.
+ */
+export function isPluginPresetPipeline(id: string): boolean {
+  return existsSync(pipelinePluginDefaultPath(id));
+}
+
+/**
+ * Inspect whether the project carries an override for the given
+ * pipeline id. Used by mutating operations (update, delete) to refuse
+ * with a clear "create a project override first via customize" error
+ * when only the plugin preset exists.
+ */
+export function hasPipelineOverride(projectRoot: string, id: string): boolean {
+  return existsSync(pipelineOverridePath(projectRoot, id));
+}
+
 /**
  * Read + parse + Zod-validate a single JSON file into a
  * `PipelineTemplate`. Throws with a descriptive message on every
@@ -115,12 +206,13 @@ export function loadPipelineTemplate(id: string, projectRoot: string): PipelineT
       `loadPipelineTemplate requires a non-empty id; received ${JSON.stringify(id)}`,
     );
   }
+  assertSafePipelineId(projectRoot, id);
   // Override-takes-precedence: project path wins when present.
-  const overridePath = join(projectOverridesDir(projectRoot), `${id}.json`);
+  const overridePath = pipelineOverridePath(projectRoot, id);
   if (existsSync(overridePath)) {
     return readAndValidate(overridePath, id);
   }
-  const defaultPath = join(PLUGIN_DEFAULTS_DIR, `${id}.json`);
+  const defaultPath = pipelinePluginDefaultPath(id);
   if (existsSync(defaultPath)) {
     return readAndValidate(defaultPath, id);
   }
@@ -159,7 +251,7 @@ function listJsonBasenames(dir: string): string[] {
  * @param projectRoot - Absolute path to the project root.
  */
 export function listAvailablePipelineTemplates(projectRoot: string): string[] {
-  const overrideIds = listJsonBasenames(projectOverridesDir(projectRoot));
+  const overrideIds = listJsonBasenames(pipelineOverridesDir(projectRoot));
   const defaultIds = listJsonBasenames(PLUGIN_DEFAULTS_DIR);
   // De-duplicate by id; overrides win, but for enumeration both sources
   // contribute the same id to the same slot in the de-dup set, so
diff --git a/packages/core/src/pipelines/operations/commit.ts b/packages/core/src/pipelines/operations/commit.ts
new file mode 100644
index 0000000..b7ddf1e
--- /dev/null
+++ b/packages/core/src/pipelines/operations/commit.ts
@@ -0,0 +1,60 @@
+/**
+ * Shared pipeline-template commit helper. Atomic write helper for
+ * project-override pipeline JSON files. Mirrors
+ * `packages/core/src/lanes/operations/commit.ts` — the "commit" in the
+ * function name refers to writing-to-disk, not to anything git-related.
+ *
+ * Phase 6 Task 6.2 (graphical-entries). Centralizes the
+ * Zod-validate-and-write-to-disk shape used by every mutating pipeline
+ * operation (create, update). The journal-event append is intentionally
+ * NOT bundled here — each verb's event carries operation-specific
+ * details (changedFields, operation discriminator, etc.) and is awaited
+ * by the caller separately.
+ *
+ * The write is atomic via a tmp+rename pattern: a crash mid-write
+ * leaves the tmp file (which is unlinked on rename failure) rather
+ * than a truncated pipeline template that subsequent
+ * `loadPipelineTemplate` reads would reject.
+ *
+ * The `verb` argument personalizes the error message so the operator
+ * sees which operation failed validation.
+ */
+
+import { renameSync, unlinkSync, writeFileSync } from 'node:fs';
+import { pipelineOverridePath } from '../loader.ts';
+import { PipelineTemplateSchema, type PipelineTemplate } from '../types.ts';
+
+export interface CommitResult {
+  readonly template: PipelineTemplate;
+  readonly path: string;
+}
+
+export function commitPipelineTemplate(
+  projectRoot: string,
+  id: string,
+  candidate: PipelineTemplate,
+  verb: string,
+): CommitResult {
+  const validated = PipelineTemplateSchema.safeParse(candidate);
+  if (!validated.success) {
+    throw new Error(
+      `Cannot ${verb} pipeline "${id}": schema validation failed:\n`
+      + validated.error.message,
+    );
+  }
+  const path = pipelineOverridePath(projectRoot, id);
+  const tmpPath = `${path}.${process.pid}.tmp`;
+  const payload = JSON.stringify(validated.data, null, 2) + '\n';
+  try {
+    writeFileSync(tmpPath, payload, 'utf8');
+    renameSync(tmpPath, path);
+  } catch (err) {
+    // Clean up the tmp file if rename failed — don't leak `.tmp`
+    // files on disk. The catch is best-effort: an unlink failure
+    // re-throws the ORIGINAL write/rename error so the operator
+    // sees the root cause.
+    try { unlinkSync(tmpPath); } catch { /* tmp absent — ignore */ }
+    throw err;
+  }
+  return { template: validated.data, path };
+}
diff --git a/packages/core/src/pipelines/operations/create.ts b/packages/core/src/pipelines/operations/create.ts
new file mode 100644
index 0000000..1b19ad2
--- /dev/null
+++ b/packages/core/src/pipelines/operations/create.ts
@@ -0,0 +1,135 @@
+/**
+ * pipeline create — write a new pipeline-template override JSON to
+ * `.deskwork/pipelines/<id>.json`.
+ *
+ * Phase 6 Task 6.2 (graphical-entries). Two-arg shape:
+ *
+ *   - `id`     — kebab-case identifier; becomes the JSON filename
+ *                basename and the JSON's `id` field.
+ *   - `shape`  — array of linear-stage names that defines the
+ *                pipeline. `lockedStages` defaults to empty;
+ *                `offPipelineStages` defaults to empty. The `update`
+ *                verb adjusts those after creation.
+ *
+ * Refusal modes:
+ *   - The id collides with a plugin preset (`editorial`, `blog-post`,
+ *     `feature-doc`, `qa-plan`, `visual` — read-only). The operator
+ *     should pick a different id or use
+ *     `customize pipeline <preset-id>` to create an override that
+ *     mutates the preset.
+ *   - A project override JSON already exists at the target path. The
+ *     operator should use `pipeline update` to mutate it, or move the
+ *     existing file aside.
+ *   - The provided shape fails the underlying
+ *     `PipelineTemplateSchema` validation (empty linearStages,
+ *     duplicate stages, `Cancelled` in linearStages, stage-token
+ *     collisions, etc.).
+ *
+ * Emits a `pipeline-create` journal event on success.
+ */
+
+import { mkdirSync } from 'node:fs';
+import { dirname } from 'node:path';
+import { appendJournalEvent } from '../../journal/append.ts';
+import {
+  assertSafePipelineId,
+  hasPipelineOverride,
+  isPluginPresetPipeline,
+  pipelineOverridePath,
+} from '../loader.ts';
+import { type PipelineTemplate } from '../types.ts';
+import { commitPipelineTemplate } from './commit.ts';
+
+export interface CreatePipelineOptions {
+  readonly id: string;
+  readonly name?: string;
+  readonly description?: string;
+  readonly linearStages: readonly string[];
+  readonly lockedStages?: readonly string[];
+  readonly offPipelineStages?: readonly string[];
+}
+
+export interface CreatePipelineResult {
+  readonly template: PipelineTemplate;
+  readonly path: string;
+}
+
+export async function createPipeline(
+  projectRoot: string,
+  opts: CreatePipelineOptions,
+): Promise<CreatePipelineResult> {
+  assertSafePipelineId(projectRoot, opts.id);
+
+  if (isPluginPresetPipeline(opts.id)) {
+    throw new Error(
+      `Cannot create pipeline "${opts.id}": "${opts.id}" is a built-in plugin `
+      + `preset and is read-only. Pick a different id, or run `
+      + `"deskwork customize pipeline ${opts.id}" to create a project override `
+      + `that mutates the preset.`,
+    );
+  }
+
+  if (hasPipelineOverride(projectRoot, opts.id)) {
+    throw new Error(
+      `Cannot create pipeline "${opts.id}": project override already exists `
+      + `at ${pipelineOverridePath(projectRoot, opts.id)}. Use `
+      + `"deskwork pipeline update ${opts.id}" to mutate it, or move the `
+      + `existing file aside.`,
+    );
+  }
+
+  if (opts.linearStages.length === 0) {
+    throw new Error(
+      `Cannot create pipeline "${opts.id}": linearStages is empty. `
+      + `Pass at least one stage via --shape "<stage1>,<stage2>,...".`,
+    );
+  }
+  for (const stage of opts.linearStages) {
+    if (stage.trim().length === 0) {
+      throw new Error(
+        `Cannot create pipeline "${opts.id}": linearStages contains a blank `
+        + `entry. Use comma-separated non-empty stage names.`,
+      );
+    }
+  }
+
+  const linearStages = [...opts.linearStages];
+  const lockedStages = opts.lockedStages !== undefined
+    ? [...opts.lockedStages]
+    : [];
+  const offPipelineStages = opts.offPipelineStages !== undefined
+    ? [...opts.offPipelineStages]
+    : [];
+
+  const candidate: PipelineTemplate = {
+    id: opts.id,
+    name: opts.name ?? opts.id,
+    description: opts.description ?? `Custom pipeline ${opts.id}`,
+    linearStages,
+    lockedStages,
+    offPipelineStages,
+  };
+
+  const target = pipelineOverridePath(projectRoot, opts.id);
+  mkdirSync(dirname(target), { recursive: true });
+  const { template, path } = commitPipelineTemplate(
+    projectRoot,
+    opts.id,
+    candidate,
+    'create',
+  );
+
+  await appendJournalEvent(projectRoot, {
+    kind: 'pipeline-create',
+    at: new Date().toISOString(),
+    pipelineId: opts.id,
+    details: {
+      name: template.name,
+      linearStages: [...template.linearStages],
+      lockedStages: [...(template.lockedStages ?? [])],
+      offPipelineStages: [...template.offPipelineStages],
+    },
+  });
+
+  return { template, path };
+}
diff --git a/packages/core/src/pipelines/operations/delete.ts b/packages/core/src/pipelines/operations/delete.ts
new file mode 100644
index 0000000..e5f71a2
--- /dev/null
+++ b/packages/core/src/pipelines/operations/delete.ts
@@ -0,0 +1,182 @@
+/**
+ * pipeline delete — remove a project-override pipeline template JSON.
+ *
+ * Phase 6 Task 6.2 (graphical-entries). Refusal-heavy:
+ *
+ *   - Plugin presets are read-only. The operator should run
+ *     `customize pipeline <id>` to create an override, then edit it.
+ *   - The override is referenced by one or more lanes' `pipelineTemplate`
+ *     field. Refused unless `--reassign-lanes-to <other-id>` is passed,
+ *     in which case every dependent lane is re-bound to `<other-id>`
+ *     (which must itself resolve via `loadPipelineTemplate`) before
+ *     the override JSON is unlinked.
+ *
+ * The `--reassign-lanes-to` path is the operator's explicit escape
+ * hatch: stage-compatibility between the doomed template's stages and
+ * the replacement template is the operator's problem. Entries keep
+ * their `currentStage` verbatim; if the new template lacks one of the
+ * stages an entry occupies, doctor will surface the mismatch on the
+ * next audit. Reassign is a forcing function, not a stage-rewrite.
+ *
+ * Emits a `pipeline-delete` journal event on success. `reassignedLanes`
+ * carries the list of lane re-bindings (empty when no lanes
+ * referenced the doomed template).
+ */
+
+import { existsSync, unlinkSync } from 'node:fs';
+import { appendJournalEvent } from '../../journal/append.ts';
+import {
+  listLaneConfigs,
+  loadLaneConfig,
+} from '../../lanes/loader.ts';
+import { commitLaneConfig } from '../../lanes/operations/commit.ts';
+import type { LaneConfig } from '../../lanes/types.ts';
+import {
+  hasPipelineOverride,
+  isPluginPresetPipeline,
+  loadPipelineTemplate,
+  pipelineOverridePath,
+} from '../loader.ts';
+
+export interface DeletePipelineOptions {
+  readonly id: string;
+  readonly reassignLanesTo?: string;
+}
+
+export interface DeletedPipelineResult {
+  readonly purgedPath: string;
+  readonly reassignedLanes: readonly {
+    readonly laneId: string;
+    readonly from: string;
+    readonly to: string;
+  }[];
+}
+
+export async function deletePipeline(
+  projectRoot: string,
+  opts: DeletePipelineOptions,
+): Promise<DeletedPipelineResult> {
+  // Plugin-preset refusal fires before override-presence so the
+  // diagnostic names the right surface (the preset's read-only-ness)
+  // rather than "missing override."
+  if (
+    isPluginPresetPipeline(opts.id)
+    && !hasPipelineOverride(projectRoot, opts.id)
+  ) {
+    throw new Error(
+      `Cannot delete pipeline "${opts.id}": "${opts.id}" is a built-in `
+      + `plugin preset and cannot be deleted. Run `
+      + `"deskwork customize pipeline ${opts.id}" to create a project `
+      + `override, then edit it.`,
+    );
+  }
+
+  if (!hasPipelineOverride(projectRoot, opts.id)) {
+    throw new Error(
+      `Cannot delete pipeline "${opts.id}": no project override exists at `
+      + `${pipelineOverridePath(projectRoot, opts.id)}.`,
+    );
+  }
+
+  // Enumerate dependent lanes. We include archived ones — an archived
+  // lane still binds an entry's pipelineTemplate at resolve time, so
+  // deleting the template would break the binding even though the
+  // lane is hidden from the dashboard.
+  const allLaneIds = listLaneConfigs(projectRoot, { includeArchived: true });
+  const dependents: { id: string; config: LaneConfig }[] = [];
+  for (const laneId of allLaneIds) {
+    try {
+      const cfg = loadLaneConfig(laneId, projectRoot);
+      if (cfg.pipelineTemplate === opts.id) {
+        dependents.push({ id: laneId, config: cfg });
+      }
+    } catch {
+      // Malformed lane config: skip. Doctor will surface the issue
+      // separately; we don't want to block the pipeline-delete
+      // diagnostic with an unrelated lane-config error.
+      continue;
+    }
+  }
+
+  if (dependents.length > 0 && opts.reassignLanesTo === undefined) {
+    const sample = dependents.slice(0, 5).map((d) => d.id);
+    const remainder = dependents.length - sample.length;
+    const suffix = remainder > 0 ? `, +${remainder} more` : '';
+    throw new Error(
+      `Cannot delete pipeline "${opts.id}": ${dependents.length} `
+      + `${dependents.length === 1 ? 'lane references' : 'lanes reference'} `
+      + `it (${sample.join(', ')}${suffix}). Either rebind each lane with `
+      + `"deskwork lane update <lane> --template <other>", or force via `
+      + `"deskwork pipeline delete ${opts.id} --reassign-lanes-to <other-id>".`,
+    );
+  }
+
+  // If reassign was requested, validate the target template exists
+  // BEFORE we touch any lane on disk. The two-phase shape (verify, then
+  // rewrite) makes a partial-failure mid-walk less likely; a tmp+rename
+  // per lane keeps each individual write atomic.
+  if (
+    opts.reassignLanesTo !== undefined
+    && opts.reassignLanesTo.length > 0
+  ) {
+    if (opts.reassignLanesTo === opts.id) {
+      throw new Error(
+        `Cannot delete pipeline "${opts.id}": --reassign-lanes-to value `
+        + `is the same id being deleted.`,
+      );
+    }
+    try {
+      loadPipelineTemplate(opts.reassignLanesTo, projectRoot);
+    } catch (err) {
+      const detail = err instanceof Error ? err.message : String(err);
+      throw new Error(
+        `Cannot delete pipeline "${opts.id}": replacement template `
+        + `"${opts.reassignLanesTo}" does not resolve:\n${detail}`,
+      );
+    }
+  }
+
+  const reassigned: { laneId: string; from: string; to: string }[] = [];
+  if (
+    opts.reassignLanesTo !== undefined
+    && opts.reassignLanesTo.length > 0
+  ) {
+    for (const { id: laneId, config } of dependents) {
+      const updated: LaneConfig = {
+        ...config,
+        pipelineTemplate: opts.reassignLanesTo,
+      };
+      commitLaneConfig(projectRoot, laneId, updated, 'pipeline-delete reassign');
+      reassigned.push({
+        laneId,
+        from: opts.id,
+        to: opts.reassignLanesTo,
+      });
+    }
+  }
+
+  // Unlink the override. We use existsSync as a final guard so a race
+  // (the file disappearing between the early hasPipelineOverride check
+  // and the unlink) surfaces as a clear "already deleted" error rather
+  // than ENOENT bubble-through.
+  const path = pipelineOverridePath(projectRoot, opts.id);
+  if (!existsSync(path)) {
+    throw new Error(
+      `Cannot delete pipeline "${opts.id}": override at ${path} disappeared `
+      + `between refusal-check and unlink (concurrent removal?).`,
+    );
+  }
+  unlinkSync(path);
+
+  await appendJournalEvent(projectRoot, {
+    kind: 'pipeline-delete',
+    at: new Date().toISOString(),
+    pipelineId: opts.id,
+    details: {
+      purgedPath: path,
+      reassignedLanes: reassigned,
+    },
+  });
+
+  return { purgedPath: path, reassignedLanes: reassigned };
+}
diff --git a/packages/core/src/pipelines/operations/index.ts b/packages/core/src/pipelines/operations/index.ts
new file mode 100644
index 0000000..d4e5989
--- /dev/null
+++ b/packages/core/src/pipelines/operations/index.ts
@@ -0,0 +1,29 @@
+/**
+ * Pipeline operations — barrel export.
+ *
+ * Phase 6 Task 6.2 (graphical-entries). The CLI `pipeline` verb is a
+ * thin dispatcher over these core functions: each verb has a matching
+ * named export here. All mutating operations are async (so the
+ * journal-event append can be awaited); side-effects are the pipeline
+ * JSON write, lane-config rewrites (on `delete --reassign-lanes-to`),
+ * and the journal-event append.
+ */
+
+export { listPipelines, type ListedPipeline, type PipelineSource } from './list.ts';
+export { showPipeline, type ShowPipelineResult } from './show.ts';
+export {
+  createPipeline,
+  type CreatePipelineOptions,
+  type CreatePipelineResult,
+} from './create.ts';
+export {
+  updatePipeline,
+  type UpdatePipelineOperation,
+  type UpdatePipelineOptions,
+  type UpdatePipelineResult,
+} from './update.ts';
+export {
+  deletePipeline,
+  type DeletePipelineOptions,
+  type DeletedPipelineResult,
+} from './delete.ts';
diff --git a/packages/core/src/pipelines/operations/list.ts b/packages/core/src/pipelines/operations/list.ts
new file mode 100644
index 0000000..7da8e4f
--- /dev/null
+++ b/packages/core/src/pipelines/operations/list.ts
@@ -0,0 +1,54 @@
+/**
+ * pipeline list — enumerate every pipeline template visible to the
+ * project, classifying each as `project-override` (operator-authored
+ * JSON under `.deskwork/pipelines/`) or `plugin-preset` (shipped with
+ * `@deskwork/core`).
+ *
+ * Phase 6 Task 6.2 (graphical-entries). The CLI handler defaults to
+ * emitting just ids; passing `--full` causes the handler to load each
+ * template and report its stage counts + override-vs-preset source.
+ * This module hands the handler both the id-only and the detail-rich
+ * shapes; the CLI handler picks the slice it needs based on the
+ * `--full` boolean.
+ *
+ * Stage counts are derived from the loaded template. A malformed
+ * project override surfaces as a load-time error here (just like
+ * `lane list` surfaces malformed lane configs) rather than as a silent
+ * "missing" entry in the picker.
+ */
+
+import {
+  hasPipelineOverride,
+  listAvailablePipelineTemplates,
+  loadPipelineTemplate,
+} from '../loader.ts';
+import type { PipelineTemplate } from '../types.ts';
+
+export type PipelineSource = 'project-override' | 'plugin-preset';
+
+export interface ListedPipeline {
+  readonly id: string;
+  readonly template: PipelineTemplate;
+  readonly source: PipelineSource;
+  readonly linearStageCount: number;
+  readonly lockedStageCount: number;
+  readonly offPipelineStageCount: number;
+}
+
+export function listPipelines(projectRoot: string): ListedPipeline[] {
+  const ids = listAvailablePipelineTemplates(projectRoot);
+  return ids.map((id) => {
+    const template = loadPipelineTemplate(id, projectRoot);
+    const source: PipelineSource = hasPipelineOverride(projectRoot, id)
+      ? 'project-override'
+      : 'plugin-preset';
+    return {
+      id,
+      template,
+      source,
+      linearStageCount: template.linearStages.length,
+      lockedStageCount: template.lockedStages?.length ?? 0,
+      offPipelineStageCount: template.offPipelineStages.length,
+    };
+  });
+}
diff --git a/packages/core/src/pipelines/operations/show.ts b/packages/core/src/pipelines/operations/show.ts
new file mode 100644
index 0000000..532a7d9
--- /dev/null
+++ b/packages/core/src/pipelines/operations/show.ts
@@ -0,0 +1,34 @@
+/**
+ * pipeline show — return the fully-resolved pipeline template plus the
+ * source-classification flag (project-override vs plugin-preset).
+ *
+ * Phase 6 Task 6.2 (graphical-entries). Thin convenience around
+ * `loadPipelineTemplate` + `hasPipelineOverride`. Mirrors `lane show`
+ * — keeps the CLI handler thin by routing through the operations
+ * surface rather than the loader directly, so future lifecycle
+ * side-effects (audit-trail emission, etc.) can land without
+ * re-plumbing the CLI.
+ */
+
+import {
+  hasPipelineOverride,
+  loadPipelineTemplate,
+} from '../loader.ts';
+import type { PipelineTemplate } from '../types.ts';
+import type { PipelineSource } from './list.ts';
+
+export interface ShowPipelineResult {
+  readonly template: PipelineTemplate;
+  readonly source: PipelineSource;
+}
+
+export function showPipeline(
+  projectRoot: string,
+  id: string,
+): ShowPipelineResult {
+  const template = loadPipelineTemplate(id, projectRoot);
+  const source: PipelineSource = hasPipelineOverride(projectRoot, id)
+    ? 'project-override'
+    : 'plugin-preset';
+  return { template, source };
+}
diff --git a/packages/core/src/pipelines/operations/update.ts b/packages/core/src/pipelines/operations/update.ts
new file mode 100644
index 0000000..5855c20
--- /dev/null
+++ b/packages/core/src/pipelines/operations/update.ts
@@ -0,0 +1,492 @@
+/**
+ * pipeline update — mutate a project-override pipeline template.
+ *
+ * Phase 6 Task 6.2 (graphical-entries). Five mutually-exclusive
+ * operations the CLI surfaces as flags. Exactly one operation runs per
+ * `update` invocation; the CLI handler is responsible for refusing
+ * multiply-flagged invocations.
+ *
+ *   - `add-stage`        — insert `<stage>` into linearStages at
+ *                          `<position>` (default = end).
+ *   - `rename-stage`     — rename `<from>` to `<to>` wherever it
+ *                          appears (linearStages / lockedStages /
+ *                          offPipelineStages). Appends a sidecar
+ *                          migration entry to
+ *                          `<id>-renames.json` so doctor (Phase 6
+ *                          Task 6.5) can offer affected-entry
+ *                          remediation later.
+ *   - `remove-stage`     — remove `<stage>` from whichever list
+ *                          contains it. Refused when any entry's
+ *                          `currentStage` references it.
+ *   - `set-locked`       — replace `lockedStages` wholesale.
+ *                          Cross-validates the new set is a subset of
+ *                          `linearStages`.
+ *   - `set-off-pipeline` — replace `offPipelineStages` wholesale.
+ *                          Cross-validates disjointness from
+ *                          `linearStages`.
+ *
+ * Refusal modes (shared):
+ *   - The id resolves to a plugin preset (read-only). The operator
+ *     should run `customize pipeline <preset-id>` to create an
+ *     override first.
+ *   - No project override exists for `<id>` — `update` requires the
+ *     override to be on disk.
+ *
+ * Emits a `pipeline-update` journal event on success carrying the
+ * operation discriminator + before/after fields where appropriate.
+ */
+
+import { existsSync, readFileSync, writeFileSync } from 'node:fs';
+import { join } from 'node:path';
+import { z } from 'zod';
+import { appendJournalEvent } from '../../journal/append.ts';
+import { readAllSidecars } from '../../sidecar/read-all.ts';
+import {
+  hasPipelineOverride,
+  isPluginPresetPipeline,
+  loadPipelineTemplate,
+  pipelineOverridesDir,
+} from '../loader.ts';
+import { type PipelineTemplate } from '../types.ts';
+import { commitPipelineTemplate } from './commit.ts';
+
+/**
+ * Sidecar migration file schema. Co-located with the only writer (this
+ * module). Phase 6 Task 6.5's doctor consumer will import this same
+ * schema for the read side once it lands.
+ */
+const RenameMigrationSchema = z.object({
+  pipelineId: z.string().min(1),
+  renames: z.array(z.object({
+    from: z.string().min(1),
+    to: z.string().min(1),
+    at: z.string().datetime(),
+  })),
+});
+
+type RenameMigration = z.infer<typeof RenameMigrationSchema>;
+
+export type UpdatePipelineOperation =
+  | { readonly op: 'add-stage'; readonly stage: string; readonly position?: number }
+  | { readonly op: 'rename-stage'; readonly from: string; readonly to: string }
+  | { readonly op: 'remove-stage'; readonly stage: string }
+  | { readonly op: 'set-locked'; readonly stages: readonly string[] }
+  | { readonly op: 'set-off-pipeline'; readonly stages: readonly string[] };
+
+export interface UpdatePipelineOptions {
+  readonly id: string;
+  readonly operation: UpdatePipelineOperation;
+}
+
+export interface UpdatePipelineResult {
+  readonly template: PipelineTemplate;
+  readonly path: string;
+}
+
+export async function updatePipeline(
+  projectRoot: string,
+  opts: UpdatePipelineOptions,
+): Promise<UpdatePipelineResult> {
+  // Pre-flight: refuse on read-only presets so the operator gets a
+  // pointer to `customize pipeline <id>` rather than a confusing
+  // "no override exists" error. The plugin-preset check fires before
+  // the override-presence check because a project that hasn't yet
+  // customized a preset will fail both — naming the preset surface is
+  // the more actionable diagnostic.
+  if (
+    isPluginPresetPipeline(opts.id)
+    && !hasPipelineOverride(projectRoot, opts.id)
+  ) {
+    throw new Error(
+      `Cannot update pipeline "${opts.id}": "${opts.id}" is a built-in `
+      + `plugin preset and is read-only. Run `
+      + `"deskwork customize pipeline ${opts.id}" to create a project `
+      + `override first.`,
+    );
+  }
+
+  if (!hasPipelineOverride(projectRoot, opts.id)) {
+    throw new Error(
+      `Cannot update pipeline "${opts.id}": no project override exists. `
+      + `Create one with "deskwork pipeline create ${opts.id} --shape ..." `
+      + `or "deskwork customize pipeline ${opts.id}" (to clone a preset).`,
+    );
+  }
+
+  const existing = loadPipelineTemplate(opts.id, projectRoot);
+  const candidate = applyOperation(existing, opts.operation, opts.id);
+
+  // Operations that read entry state for refusal-checks run after we
+  // have the candidate (so the error includes what's about to change)
+  // but before the commit. `remove-stage` is the only such case today.
+  if (opts.operation.op === 'remove-stage') {
+    await refuseRemoveStageWhenReferenced(
+      projectRoot,
+      opts.id,
+      opts.operation.stage,
+    );
+  }
+
+  const { template, path } = commitPipelineTemplate(
+    projectRoot,
+    opts.id,
+    candidate,
+    'update',
+  );
+
+  // The rename-stage migration sidecar fires AFTER the commit succeeds
+  // so a doomed write doesn't leave a stranded migration entry.
+  if (opts.operation.op === 'rename-stage') {
+    appendRenameMigration(
+      projectRoot,
+      opts.id,
+      opts.operation.from,
+      opts.operation.to,
+    );
+  }
+
+  await appendJournalEvent(projectRoot, {
+    kind: 'pipeline-update',
+    at: new Date().toISOString(),
+    pipelineId: opts.id,
+    details: buildEventDetails(opts.operation, existing),
+  });
+
+  return { template, path };
+}
+
+/**
+ * Apply a single operation to the template, returning a fresh
+ * candidate template. Pure function — no I/O.
+ */
+function applyOperation(
+  existing: PipelineTemplate,
+  op: UpdatePipelineOperation,
+  id: string,
+): PipelineTemplate {
+  switch (op.op) {
+    case 'add-stage':
+      return applyAddStage(existing, op.stage, op.position, id);
+    case 'rename-stage':
+      return applyRenameStage(existing, op.from, op.to, id);
+    case 'remove-stage':
+      return applyRemoveStage(existing, op.stage, id);
+    case 'set-locked':
+      return applySetLocked(existing, op.stages, id);
+    case 'set-off-pipeline':
+      return applySetOffPipeline(existing, op.stages, id);
+  }
+}
+
+function applyAddStage(
+  existing: PipelineTemplate,
+  stage: string,
+  position: number | undefined,
+  id: string,
+): PipelineTemplate {
+  if (stage.trim().length === 0) {
+    throw new Error(
+      `Cannot update pipeline "${id}": --add-stage value is blank.`,
+    );
+  }
+  const allKnown = collectKnownStages(existing);
+  if (allKnown.has(stage)) {
+    throw new Error(
+      `Cannot update pipeline "${id}": stage "${stage}" already exists `
+      + `in this template.`,
+    );
+  }
+  const linearStages = [...existing.linearStages];
+  const insertAt = position ?? linearStages.length;
+  if (insertAt < 0 || insertAt > linearStages.length) {
+    throw new Error(
+      `Cannot update pipeline "${id}": --position ${insertAt} is out of `
+      + `range. linearStages currently has ${linearStages.length} entries; `
+      + `pass a value in [0, ${linearStages.length}].`,
+    );
+  }
+  linearStages.splice(insertAt, 0, stage);
+  return { ...existing, linearStages };
+}
+
+function applyRenameStage(
+  existing: PipelineTemplate,
+  from: string,
+  to: string,
+  id: string,
+): PipelineTemplate {
+  if (from.trim().length === 0 || to.trim().length === 0) {
+    throw new Error(
+      `Cannot update pipeline "${id}": --rename-stage requires both `
+      + `<from> and <to> non-empty.`,
+    );
+  }
+  if (from === to) {
+    throw new Error(
+      `Cannot update pipeline "${id}": --rename-stage <from> and <to> `
+      + `are identical (${from}).`,
+    );
+  }
+  const allKnown = collectKnownStages(existing);
+  if (!allKnown.has(from)) {
+    throw new Error(
+      `Cannot update pipeline "${id}": stage "${from}" not found. `
+      + `Known stages: ${[...allKnown].join(', ')}.`,
+    );
+  }
+  if (allKnown.has(to)) {
+    throw new Error(
+      `Cannot update pipeline "${id}": cannot rename to "${to}" — that `
+      + `name already exists in this template.`,
+    );
+  }
+  return {
+    ...existing,
+    linearStages: existing.linearStages.map((s) => (s === from ? to : s)),
+    ...(existing.lockedStages !== undefined && {
+      lockedStages: existing.lockedStages.map((s) => (s === from ? to : s)),
+    }),
+    offPipelineStages: existing.offPipelineStages.map((s) =>
+      s === from ? to : s,
+    ),
+  };
+}
+
+function applyRemoveStage(
+  existing: PipelineTemplate,
+  stage: string,
+  id: string,
+): PipelineTemplate {
+  const allKnown = collectKnownStages(existing);
+  if (!allKnown.has(stage)) {
+    throw new Error(
+      `Cannot update pipeline "${id}": stage "${stage}" not found. `
+      + `Known stages: ${[...allKnown].join(', ')}.`,
+    );
+  }
+  const linearStages = existing.linearStages.filter((s) => s !== stage);
+  if (linearStages.length === 0 && existing.linearStages.length > 0) {
+    throw new Error(
+      `Cannot update pipeline "${id}": removing "${stage}" would leave `
+      + `linearStages empty. A pipeline must have at least one linear stage.`,
+    );
+  }
+  return {
+    ...existing,
+    linearStages,
+    ...(existing.lockedStages !== undefined && {
+      lockedStages: existing.lockedStages.filter((s) => s !== stage),
+    }),
+    offPipelineStages: existing.offPipelineStages.filter((s) => s !== stage),
+  };
+}
+
+function applySetLocked(
+  existing: PipelineTemplate,
+  stages: readonly string[],
+  id: string,
+): PipelineTemplate {
+  const linearSet = new Set(existing.linearStages);
+  for (const stage of stages) {
+    if (stage.trim().length === 0) {
+      throw new Error(
+        `Cannot update pipeline "${id}": --set-locked contains a blank entry.`,
+      );
+    }
+    if (!linearSet.has(stage)) {
+      throw new Error(
+        `Cannot update pipeline "${id}": locked stage "${stage}" is not in `
+        + `linearStages (${existing.linearStages.join(', ')}). lockedStages `
+        + `must be a subset of linearStages.`,
+      );
+    }
+  }
+  return { ...existing, lockedStages: [...stages] };
+}
+
+function applySetOffPipeline(
+  existing: PipelineTemplate,
+  stages: readonly string[],
+  id: string,
+): PipelineTemplate {
+  const linearSet = new Set(existing.linearStages);
+  for (const stage of stages) {
+    if (stage.trim().length === 0) {
+      throw new Error(
+        `Cannot update pipeline "${id}": --set-off-pipeline contains a `
+        + `blank entry.`,
+      );
+    }
+    if (linearSet.has(stage)) {
+      throw new Error(
+        `Cannot update pipeline "${id}": "${stage}" is already in `
+        + `linearStages — a stage is either linear OR off-pipeline, not both.`,
+      );
+    }
+  }
+  return { ...existing, offPipelineStages: [...stages] };
+}
+
+/**
+ * Collect every stage name visible on the template across all three
+ * lists. Used for "does this name already exist" refusal checks.
+ */
+function collectKnownStages(template: PipelineTemplate): Set<string> {
+  const set = new Set<string>(template.linearStages);
+  if (template.lockedStages !== undefined) {
+    for (const s of template.lockedStages) set.add(s);
+  }
+  for (const s of template.offPipelineStages) set.add(s);
+  return set;
+}
+
+/**
+ * Refuse `remove-stage` when any entry's `currentStage` still
+ * references the doomed stage AND that entry is bound to a lane whose
+ * pipelineTemplate is the one being mutated. Walking only the
+ * matching-template entries keeps the error message focused — entries
+ * in other lanes are unaffected by the mutation.
+ */
+async function refuseRemoveStageWhenReferenced(
+  projectRoot: string,
+  pipelineId: string,
+  stage: string,
+): Promise<void> {
+  const sidecars = await readAllSidecars(projectRoot);
+  if (sidecars.length === 0) return;
+
+  // Lazy-load lane configs so we resolve each entry's template once.
+  // Importing here (rather than at the top of the module) avoids a
+  // load-order cycle with `lanes/operations/move.ts` which also reads
+  // sidecars + pipelines.
+  const { loadLaneConfig } = await import('../../lanes/loader.ts');
+
+  const offenders: string[] = [];
+  for (const entry of sidecars) {
+    if (entry.lane === undefined) continue;
+    let laneConfig;
+    try {
+      laneConfig = loadLaneConfig(entry.lane, projectRoot);
+    } catch {
+      // Malformed / missing lane config: skip — doctor surfaces that
+      // separately. We don't want to mask the remove-stage diagnostic
+      // behind an unrelated lane-config error.
+      continue;
+    }
+    if (laneConfig.pipelineTemplate !== pipelineId) continue;
+    if (entry.currentStage === stage) offenders.push(entry.slug);
+  }
+
+  if (offenders.length === 0) return;
+
+  const sample = offenders.slice(0, 5);
+  const remainder = offenders.length - sample.length;
+  const suffix = remainder > 0 ? `, +${remainder} more` : '';
+  throw new Error(
+    `Cannot update pipeline "${pipelineId}": ${offenders.length} `
+    + `${offenders.length === 1 ? 'entry references' : 'entries reference'} `
+    + `stage "${stage}" via currentStage (${sample.join(', ')}${suffix}). `
+    + `Induct each entry to another stage before removing.`,
+  );
+}
+
+/**
+ * Append a single `{from, to, at}` entry to
+ * `<projectRoot>/.deskwork/pipelines/<id>-renames.json` for downstream
+ * doctor consumption (Phase 6 Task 6.5). The file format:
+ *
+ *   {
+ *     "pipelineId": "<id>",
+ *     "renames": [ { "from": "X", "to": "Y", "at": "<iso>" }, ... ]
+ *   }
+ *
+ * The first rename creates the file; subsequent renames append to the
+ * `renames` array. The write is whole-file (read + rewrite) — small
+ * payloads, append-only access pattern, no concurrent writers.
+ */
+function appendRenameMigration(
+  projectRoot: string,
+  pipelineId: string,
+  from: string,
+  to: string,
+): void {
+  const path = join(
+    pipelineOverridesDir(projectRoot),
+    `${pipelineId}-renames.json`,
+  );
+  let payload: RenameMigration;
+  if (existsSync(path)) {
+    const raw = readFileSync(path, 'utf8');
+    let parsed: unknown;
+    try {
+      parsed = JSON.parse(raw);
+    } catch {
+      // Malformed migration file: start over. The old file is
+      // unreadable; preserving its broken contents would block future
+      // renames forever.
+      parsed = null;
+    }
+    const validated = RenameMigrationSchema.safeParse(parsed);
+    payload = validated.success
+      ? validated.data
+      : { pipelineId, renames: [] };
+  } else {
+    payload = { pipelineId, renames: [] };
+  }
+  payload.renames.push({ from, to, at: new Date().toISOString() });
+  writeFileSync(path, JSON.stringify(payload, null, 2) + '\n', 'utf8');
+}
+
+/**
+ * Build the journal event's `details` object for a given operation.
+ * Each branch shapes the discriminated-union member that matches the
+ * operation kind.
+ */
+function buildEventDetails(
+  op: UpdatePipelineOperation,
+  existing: PipelineTemplate,
+): {
+  operation: 'add-stage';
+  stage: string;
+  position: number;
+} | {
+  operation: 'rename-stage';
+  from: string;
+  to: string;
+} | {
+  operation: 'remove-stage';
+  stage: string;
+} | {
+  operation: 'set-locked';
+  before: string[];
+  after: string[];
+} | {
+  operation: 'set-off-pipeline';
+  before: string[];
+  after: string[];
+} {
+  switch (op.op) {
+    case 'add-stage':
+      return {
+        operation: 'add-stage',
+        stage: op.stage,
+        position: op.position ?? existing.linearStages.length,
+      };
+    case 'rename-stage':
+      return { operation: 'rename-stage', from: op.from, to: op.to };
+    case 'remove-stage':
+      return { operation: 'remove-stage', stage: op.stage };
+    case 'set-locked':
+      return {
+        operation: 'set-locked',
+        before: [...(existing.lockedStages ?? [])],
+        after: [...op.stages],
+      };
+    case 'set-off-pipeline':
+      return {
+        operation: 'set-off-pipeline',
+        before: [...existing.offPipelineStages],
+        after: [...op.stages],
+      };
+  }
+}
diff --git a/packages/core/src/schema/journal-events.ts b/packages/core/src/schema/journal-events.ts
index 07e8c99..27a26e1 100644
--- a/packages/core/src/schema/journal-events.ts
+++ b/packages/core/src/schema/journal-events.ts
@@ -116,6 +116,185 @@ const LaneMigrationEvent = z.object({
   details: z.record(z.string(), z.unknown()).optional(),
 });
 
+/**
+ * Phase 6 Task 6.1 (graphical-entries): lane-lifecycle events emitted
+ * by the `/deskwork:lane` verb family. Each event is project-scoped
+ * (no `entryId`); `laneId` identifies the lane the operation acted on
+ * and `details` carries kind-specific context (the source / target
+ * fields on `lane-update` / `lane-move`, the stage chosen on
+ * `lane-move`, etc.).
+ *
+ * The six kinds mirror the six mutating verbs:
+ *
+ *   - `lane-create`  — a new lane config was written.
+ *   - `lane-update`  — an existing lane's `name`, `pipelineTemplate`,
+ *                      or `contentDir` was updated.
+ *   - `lane-archive` — a lane was soft-archived (its `archivedAt`
+ *                      field was set; the JSON stays on disk).
+ *   - `lane-restore` — a lane's `archivedAt` field was cleared.
+ *   - `lane-purge`   — a lane's JSON was deleted from disk. Refused
+ *                      when any entry still references the lane.
+ *   - `lane-move`    — an entry was moved from one lane to another;
+ *                      the entry's `lane` and `currentStage` were
+ *                      updated and the artifact file (plus
+ *                      scrapbook) was relocated under the new lane's
+ *                      `contentDir`.
+ *
+ * `lane-move` additionally carries `entryId` (UUID) because the move
+ * is also an entry-state mutation; the dashboard / studio surfaces
+ * may key on it. The other five kinds are project-level and do not
+ * carry an entry id.
+ */
+const LaneCreateEvent = z.object({
+  kind: z.literal('lane-create'),
+  at: z.string().datetime(),
+  laneId: z.string().min(1),
+  details: z.object({
+    name: z.string().min(1),
+    pipelineTemplate: z.string().min(1),
+    contentDir: z.string().min(1),
+  }),
+});
+
+const LaneUpdateEvent = z.object({
+  kind: z.literal('lane-update'),
+  at: z.string().datetime(),
+  laneId: z.string().min(1),
+  details: z.object({
+    changedFields: z.array(z.string().min(1)).min(1),
+    before: z.record(z.string(), z.unknown()),
+    after: z.record(z.string(), z.unknown()),
+  }),
+});
+
+const LaneArchiveEvent = z.object({
+  kind: z.literal('lane-archive'),
+  at: z.string().datetime(),
+  laneId: z.string().min(1),
+});
+
+const LaneRestoreEvent = z.object({
+  kind: z.literal('lane-restore'),
+  at: z.string().datetime(),
+  laneId: z.string().min(1),
+});
+
+const LanePurgeEvent = z.object({
+  kind: z.literal('lane-purge'),
+  at: z.string().datetime(),
+  laneId: z.string().min(1),
+  details: z.object({
+    purgedPath: z.string().min(1),
+  }),
+});
+
+const LaneMoveEvent = z.object({
+  kind: z.literal('lane-move'),
+  at: z.string().datetime(),
+  entryId: z.string().uuid(),
+  details: z.object({
+    fromLane: z.string().min(1),
+    toLane: z.string().min(1),
+    fromStage: StageStringSchema,
+    toStage: StageStringSchema,
+    fromArtifactPath: z.string().optional(),
+    toArtifactPath: z.string().optional(),
+  }),
+});
+
+/**
+ * Phase 6 Task 6.2 (graphical-entries): pipeline-template-lifecycle
+ * events emitted by the `/deskwork:pipeline` verb family. Each event is
+ * project-scoped (no `entryId`); `pipelineId` identifies the template
+ * the operation acted on and `details` carries kind-specific context.
+ *
+ * Three kinds mirror the three mutating verbs:
+ *
+ *   - `pipeline-create` — a new pipeline template was written to
+ *                         `<projectRoot>/.deskwork/pipelines/<id>.json`.
+ *   - `pipeline-update` — an existing project-override pipeline was
+ *                         mutated (stage added / renamed / removed,
+ *                         lockedStages or offPipelineStages replaced).
+ *                         The `operation` discriminator names which of
+ *                         the five mutation flavors ran, with shape-
+ *                         specific `before` / `after` fields.
+ *   - `pipeline-delete` — a project-override pipeline JSON was deleted
+ *                         from disk. `reassignedLanes` carries the
+ *                         list of lane ids that were re-bound (empty
+ *                         when no lanes referenced the template).
+ *
+ * Plugin presets are read-only — none of these events fire against
+ * the packaged defaults; the mutating verbs refuse with a "create a
+ * project override first" error before reaching the journal append.
+ */
+const PipelineCreateEvent = z.object({
+  kind: z.literal('pipeline-create'),
+  at: z.string().datetime(),
+  pipelineId: z.string().min(1),
+  details: z.object({
+    name: z.string().min(1),
+    linearStages: z.array(z.string().min(1)).min(1),
+    lockedStages: z.array(z.string().min(1)),
+    offPipelineStages: z.array(z.string().min(1)),
+  }),
+});
+
+const PipelineUpdateAddStage = z.object({
+  operation: z.literal('add-stage'),
+  stage: z.string().min(1),
+  position: z.number().int().nonnegative(),
+});
+
+const PipelineUpdateRenameStage = z.object({
+  operation: z.literal('rename-stage'),
+  from: z.string().min(1),
+  to: z.string().min(1),
+});
+
+const PipelineUpdateRemoveStage = z.object({
+  operation: z.literal('remove-stage'),
+  stage: z.string().min(1),
+});
+
+const PipelineUpdateSetLocked = z.object({
+  operation: z.literal('set-locked'),
+  before: z.array(z.string().min(1)),
+  after: z.array(z.string().min(1)),
+});
+
+const PipelineUpdateSetOffPipeline = z.object({
+  operation: z.literal('set-off-pipeline'),
+  before: z.array(z.string().min(1)),
+  after: z.array(z.string().min(1)),
+});
+
+const PipelineUpdateEvent = z.object({
+  kind: z.literal('pipeline-update'),
+  at: z.string().datetime(),
+  pipelineId: z.string().min(1),
+  details: z.discriminatedUnion('operation', [
+    PipelineUpdateAddStage,
+    PipelineUpdateRenameStage,
+    PipelineUpdateRemoveStage,
+    PipelineUpdateSetLocked,
+    PipelineUpdateSetOffPipeline,
+  ]),
+});
+
+const PipelineDeleteEvent = z.object({
+  kind: z.literal('pipeline-delete'),
+  at: z.string().datetime(),
+  pipelineId: z.string().min(1),
+  details: z.object({
+    purgedPath: z.string().min(1),
+    reassignedLanes: z.array(z.object({
+      laneId: z.string().min(1),
+      from: z.string().min(1),
+      to: z.string().min(1),
+    })),
+  }),
+});
+
 export const JournalEventSchema = z.discriminatedUnion('kind', [
   EntryCreatedEvent,
   EntryIngestedEvent,
@@ -125,6 +304,15 @@ export const JournalEventSchema = z.discriminatedUnion('kind', [
   StageTransitionEvent,
   EntryAnnotationEvent,
   LaneMigrationEvent,
+  LaneCreateEvent,
+  LaneUpdateEvent,
+  LaneArchiveEvent,
+  LaneRestoreEvent,
+  LanePurgeEvent,
+  LaneMoveEvent,
+  PipelineCreateEvent,
+  PipelineUpdateEvent,
+  PipelineDeleteEvent,
 ]);
 
 export type JournalEvent = z.infer<typeof JournalEventSchema>;
diff --git a/packages/core/test/lanes/loader.test.ts b/packages/core/test/lanes/loader.test.ts
index bdabfc8..b8eb818 100644
--- a/packages/core/test/lanes/loader.test.ts
+++ b/packages/core/test/lanes/loader.test.ts
@@ -124,6 +124,24 @@ describe('loadLaneConfig', () => {
     expect(() => loadLaneConfig('   ', projectRoot)).toThrow(/non-empty id/);
   });
 
+  it('refuses lane ids whose charset escapes the kebab-case convention', () => {
+    for (const bad of ['UPPER', 'with space', 'with/slash', 'leading-dash-ok', '-bad']) {
+      // Sanity: kebab-case must start with [a-z0-9], so "-bad" fails;
+      // "leading-dash-ok" passes the regex (starts with 'l') and is
+      // included as a confirm-not-refused case below.
+      if (bad === 'leading-dash-ok') continue;
+      expect(() => loadLaneConfig(bad, projectRoot)).toThrow(/Invalid lane id/);
+    }
+  });
+
+  it('refuses a path-traversal-shaped lane id at the loader boundary', () => {
+    // The regex catches this case (`.` and `/` are not in the charset),
+    // and the path-containment check enforces the invariant at the
+    // filesystem boundary. Either layer should refuse — the test just
+    // confirms loadLaneConfig rejects with a recognizable error.
+    expect(() => loadLaneConfig('../../etc/foo', projectRoot)).toThrow(/Invalid lane id/);
+  });
+
   it('cross-validates a lane bound to a project-override pipeline template', () => {
     // Write a custom pipeline override the lane references — the loader's
     // cross-validation must resolve it via loadPipelineTemplate's
@@ -225,6 +243,59 @@ describe('listLaneConfigs', () => {
     const ids = listLaneConfigs(projectRoot);
     expect(ids).toEqual(['default']);
   });
+
+  it('filters archived lanes out by default (Phase 6 Task 6.1)', () => {
+    writeLane(projectRoot, 'default', {
+      id: 'default',
+      name: 'Default',
+      pipelineTemplate: 'editorial',
+      contentDir: 'docs',
+    });
+    writeLane(projectRoot, 'stale', {
+      id: 'stale',
+      name: 'Stale',
+      pipelineTemplate: 'editorial',
+      contentDir: 'docs',
+      archivedAt: '2026-05-28T10:00:00.000Z',
+    });
+    expect(listLaneConfigs(projectRoot)).toEqual(['default']);
+  });
+
+  it('returns archived lanes when includeArchived=true (Phase 6 Task 6.1)', () => {
+    writeLane(projectRoot, 'default', {
+      id: 'default',
+      name: 'Default',
+      pipelineTemplate: 'editorial',
+      contentDir: 'docs',
+    });
+    writeLane(projectRoot, 'stale', {
+      id: 'stale',
+      name: 'Stale',
+      pipelineTemplate: 'editorial',
+      contentDir: 'docs',
+      archivedAt: '2026-05-28T10:00:00.000Z',
+    });
+    expect(listLaneConfigs(projectRoot, { includeArchived: true })).toEqual([
+      'default',
+      'stale',
+    ]);
+  });
+
+  it('degrades gracefully on malformed JSON when filtering archived lanes', () => {
+    // Malformed JSON should not break the archived-filter pass; the
+    // lane appears in the (non-archived) list and surfaces its
+    // malformation at loadLaneConfig time.
+    const dir = lanesDir(projectRoot);
+    mkdirSync(dir, { recursive: true });
+    writeFileSync(join(dir, 'broken.json'), '{ not json', 'utf8');
+    writeLane(projectRoot, 'default', {
+      id: 'default',
+      name: 'Default',
+      pipelineTemplate: 'editorial',
+      contentDir: 'docs',
+    });
+    expect(listLaneConfigs(projectRoot)).toEqual(['broken', 'default']);
+  });
 });
 
 describe('path helpers', () => {
diff --git a/packages/core/test/schema/journal-events.test.ts b/packages/core/test/schema/journal-events.test.ts
index 59c3417..92b9c08 100644
--- a/packages/core/test/schema/journal-events.test.ts
+++ b/packages/core/test/schema/journal-events.test.ts
@@ -65,4 +65,121 @@ describe('JournalEventSchema', () => {
     };
     expect(JournalEventSchema.safeParse(event).success).toBe(true);
   });
+
+  it('parses a lane-create event (Phase 6 Task 6.1)', () => {
+    const event: JournalEvent = {
+      kind: 'lane-create',
+      at: '2026-05-28T10:00:00.000Z',
+      laneId: 'mockups',
+      details: {
+        name: 'Mockups',
+        pipelineTemplate: 'visual',
+        contentDir: 'src/mockups',
+      },
+    };
+    expect(JournalEventSchema.safeParse(event).success).toBe(true);
+  });
+
+  it('parses a lane-update event (Phase 6 Task 6.1)', () => {
+    const event: JournalEvent = {
+      kind: 'lane-update',
+      at: '2026-05-28T10:00:00.000Z',
+      laneId: 'mockups',
+      details: {
+        changedFields: ['name'],
+        before: { name: 'Mockups' },
+        after: { name: 'Visual Mockups' },
+      },
+    };
+    expect(JournalEventSchema.safeParse(event).success).toBe(true);
+  });
+
+  it('parses a lane-archive event (Phase 6 Task 6.1)', () => {
+    const event: JournalEvent = {
+      kind: 'lane-archive',
+      at: '2026-05-28T10:00:00.000Z',
+      laneId: 'stale-lane',
+    };
+    expect(JournalEventSchema.safeParse(event).success).toBe(true);
+  });
+
+  it('parses a lane-restore event (Phase 6 Task 6.1)', () => {
+    const event: JournalEvent = {
+      kind: 'lane-restore',
+      at: '2026-05-28T10:00:00.000Z',
+      laneId: 'stale-lane',
+    };
+    expect(JournalEventSchema.safeParse(event).success).toBe(true);
+  });
+
+  it('parses a lane-purge event (Phase 6 Task 6.1)', () => {
+    const event: JournalEvent = {
+      kind: 'lane-purge',
+      at: '2026-05-28T10:00:00.000Z',
+      laneId: 'empty-lane',
+      details: { purgedPath: '/proj/.deskwork/lanes/empty-lane.json' },
+    };
+    expect(JournalEventSchema.safeParse(event).success).toBe(true);
+  });
+
+  it('parses a lane-move event (Phase 6 Task 6.1)', () => {
+    const event: JournalEvent = {
+      kind: 'lane-move',
+      at: '2026-05-28T10:00:00.000Z',
+      entryId: '550e8400-e29b-41d4-a716-446655440000',
+      details: {
+        fromLane: 'default',
+        toLane: 'mockups',
+        fromStage: 'Drafting',
+        toStage: 'Sketch',
+        fromArtifactPath: 'old/path.md',
+        toArtifactPath: 'new/path.md',
+      },
+    };
+    expect(JournalEventSchema.safeParse(event).success).toBe(true);
+  });
+
+  it('parses a pipeline-create event (Phase 6 Task 6.2)', () => {
+    const event: JournalEvent = {
+      kind: 'pipeline-create',
+      at: '2026-05-28T10:00:00.000Z',
+      pipelineId: 'my-blog',
+      details: {
+        name: 'My Blog',
+        linearStages: ['Idea', 'Drafting', 'Review', 'Live'],
+        lockedStages: [],
+        offPipelineStages: [],
+      },
+    };
+    expect(JournalEventSchema.safeParse(event).success).toBe(true);
+  });
+
+  it('parses a pipeline-update rename-stage event (Phase 6 Task 6.2)', () => {
+    const event: JournalEvent = {
+      kind: 'pipeline-update',
+      at: '2026-05-28T10:00:00.000Z',
+      pipelineId: 'my-blog',
+      details: {
+        operation: 'rename-stage',
+        from: 'Drafting',
+        to: 'Writing',
+      },
+    };
+    expect(JournalEventSchema.safeParse(event).success).toBe(true);
+  });
+
+  it('parses a pipeline-delete event with reassigned lanes (Phase 6 Task 6.2)', () => {
+    const event: JournalEvent = {
+      kind: 'pipeline-delete',
+      at: '2026-05-28T10:00:00.000Z',
+      pipelineId: 'old-blog',
+      details: {
+        purgedPath: '/proj/.deskwork/pipelines/old-blog.json',
+        reassignedLanes: [
+          { laneId: 'default', from: 'old-blog', to: 'editorial' },
+        ],
+      },
+    };
+    expect(JournalEventSchema.safeParse(event).success).toBe(true);
+  });
 });
diff --git a/plugins/deskwork/skills/customize/SKILL.md b/plugins/deskwork/skills/customize/SKILL.md
index 5792615..77b9e4e 100644
--- a/plugins/deskwork/skills/customize/SKILL.md
+++ b/plugins/deskwork/skills/customize/SKILL.md
@@ -1,6 +1,6 @@
 ---
 name: customize
-description: Copy a deskwork plugin default (a studio template page renderer or a doctor rule) into the project's .deskwork/<category>/<name>.ts so the operator can edit it. The plugin loads the override automatically — no fork required. Categories are templates and doctor; prompts is reserved for future use.
+description: Copy a deskwork plugin default (a studio template page renderer, a doctor rule, or a pipeline-template preset) into the project's .deskwork/<category>/<name>.<ext> so the operator can edit it. The plugin loads the override automatically — no fork required. Categories are templates, doctor, and pipeline; prompts is reserved for future use.
 ---
 
 ## Customize — drop-in overrides for studio templates and doctor rules
@@ -11,11 +11,12 @@ This is the customization layer for studio templates and doctor rules. Operators
 
 ### Categories
 
-| Category | What it overrides | Where the default lives |
-|---|---|---|
-| `templates` | A studio page renderer (dashboard, content tree, scrapbook, review surface, manual) | `packages/studio/src/pages/<name>.ts` |
-| `doctor` | A doctor rule (audit + plan + apply) | `packages/core/src/doctor/rules/<name>.ts` |
-| `prompts` | Reserved for future use — no defaults to copy yet | n/a |
+| Category | What it overrides | Where the default lives | Project copy lands at |
+|---|---|---|---|
+| `templates` | A studio page renderer (dashboard, content tree, scrapbook, review surface, manual) | `packages/studio/src/pages/<name>.ts` | `.deskwork/templates/<name>.ts` |
+| `doctor` | A doctor rule (audit + plan + apply) | `packages/core/src/doctor/rules/<name>.ts` | `.deskwork/doctor/<name>.ts` |
+| `pipeline` | A pipeline-template preset (Phase 6 Task 6.2) | `packages/core/src/pipelines/<name>.json` | `.deskwork/pipelines/<name>.json` |
+| `prompts` | Reserved for future use — no defaults to copy yet | n/a | n/a |
 
 In scope today: dashboard, content (top-level and project drilldown), scrapbook, review, manual (help). Not yet wired: shortform desk, scrapbook viewer's secret subpage, error pages.
 
@@ -25,6 +26,7 @@ Ask the operator which category they want to customize.
 
 - `templates` — modify a studio page's rendered HTML (e.g., re-skin the dashboard, hide a section, add a banner).
 - `doctor` — modify or replace a binding-validation rule (e.g., a stricter check for a project-specific frontmatter field, or a custom report).
+- `pipeline` — clone a pipeline preset (`editorial`, `blog-post`, `feature-doc`, `qa-plan`, `visual`) into the project as a starting point for a tailored template. After the copy, edit the JSON directly or mutate via `deskwork pipeline update <name>` (see `/deskwork:pipeline`).
 - `prompts` — not available yet. If the operator asks for `prompts`, surface that the category is reserved and there's no default source to copy.
 
 ### Step 2 — pick a name
@@ -33,6 +35,7 @@ The `name` is the file basename WITHOUT the `.ts` extension. Common picks:
 
 - Templates: `dashboard`, `content`, `content-project`, `scrapbook`, `review`, `help`.
 - Doctor rules: `missing-frontmatter-id`, `orphan-frontmatter-id`, `duplicate-id`, `slug-collision`, `schema-rejected`, `workflow-stale`, `calendar-uuid-missing`, `legacy-top-level-id-migration`.
+- Pipeline presets: `editorial`, `blog-post`, `feature-doc`, `qa-plan`, `visual`.
 
 If the operator names something that doesn't exist as a built-in, the helper exits with an actionable error listing the available basenames. Re-prompt with one of the listed names.
 
diff --git a/plugins/deskwork/skills/lane/SKILL.md b/plugins/deskwork/skills/lane/SKILL.md
new file mode 100644
index 0000000..12400a5
--- /dev/null
+++ b/plugins/deskwork/skills/lane/SKILL.md
@@ -0,0 +1,76 @@
+---
+name: lane
+description: CRUD on lane configs — list, show, create, update, archive, restore, purge, and move entries between lanes. Lanes bind a content directory to a pipeline template; each project hosts one or more lanes and every entry lives in exactly one lane.
+---
+
+## Lane — manage lane configs
+
+A **lane** binds a content directory to a pipeline template. Each project hosts one or more lanes; every entry lives in exactly one lane. Lane configs are stored at `<projectRoot>/.deskwork/lanes/<id>.json` and are project-owned (no plugin defaults).
+
+The `lane` verb is a CRUD family. Eight subcommands cover the lane lifecycle from creation through soft-archive to (rare) hard purge, plus cross-lane entry moves.
+
+### Subcommands
+
+| Verb | Purpose |
+|---|---|
+| `list` | enumerate lanes (active by default; pass `--include-archived` for the full set) |
+| `show <id>` | print a single lane's config |
+| `create <id>` | write a new lane config |
+| `update <id>` | mutate `name` / `template` / `content-dir` on an existing lane |
+| `archive <id>` | soft-archive a lane (sets `archivedAt`; preserves the file + history) |
+| `restore <id>` | clear `archivedAt` |
+| `purge <id>` | hard-delete the lane JSON (refused while entries reference the lane) |
+| `move <slug> --to <lane-id>` | relocate an entry into another lane (moves artifact + scrapbook on disk) |
+
+### Input
+
+```
+/deskwork:lane list [--include-archived]
+/deskwork:lane show <id>
+/deskwork:lane create <id> --template <pipeline-id> --content-dir <path> [--name <label>]
+/deskwork:lane update <id> [--name <label>] [--template <id>] [--content-dir <path>]
+/deskwork:lane archive <id>
+/deskwork:lane restore <id>
+/deskwork:lane purge <id>
+/deskwork:lane move <slug-or-uuid> --to <lane-id> [--target-stage <name>]
+```
+
+### Steps
+
+1. Resolve the operator-supplied lane id or entry slug.
+2. Run the matching subcommand via `deskwork lane <verb> [args...]`:
+   - **`list`** enumerates lanes via `listLaneConfigs` and emits id / name / pipelineTemplate / contentDir / archived state per lane. Active lanes only by default; `--include-archived` appends archived lanes (those carrying a non-empty `archivedAt`).
+   - **`show <id>`** loads the lane config and emits its fields. Surfaces `archivedAt` when present so the operator sees the audit timestamp.
+   - **`create <id> --template <pipeline-id> --content-dir <path>`** writes `<projectRoot>/.deskwork/lanes/<id>.json`. The `--name <label>` flag is optional (defaults to the id). The referenced pipeline template MUST resolve (plugin preset or `.deskwork/pipelines/<id>.json` override) — the CLI refuses if it doesn't.
+   - **`update <id>`** mutates the lane config in place. At least one of `--name`, `--template`, `--content-dir` is required. When `--template` is patched, the new template is cross-validated before the write commits. The lane's `id` is immutable.
+   - **`archive <id>`** sets `archivedAt` to the current ISO datetime. The lane disappears from default `list` output and is skipped by the dashboard and calendar renderers. Entries that reference the archived lane are not modified — they keep their `lane` field and continue to resolve via the lane config on disk.
+   - **`restore <id>`** removes `archivedAt`. The lane reappears in `list` output and is rendered again.
+   - **`purge <id>`** deletes the JSON file. REFUSED when any entry still references the lane (see Error handling). When refused, the operator must `lane move <slug> --to <other>` each dependent entry first.
+   - **`move <slug-or-uuid> --to <lane-id> [--target-stage <name>]`** updates the entry's `lane` and `currentStage` fields and relocates the artifact + scrapbook on disk. Defaults `--target-stage` to the target lane's first `linearStages` entry; pass `--target-stage <name>` to override (must be in the target template's `linearStages ∪ offPipelineStages`). The entry's `iterationByStage` counters are preserved verbatim — no stage-name remapping.
+
+### Defaults
+
+- `lane list` excludes archived lanes by default. Pass `--include-archived` for the full set.
+- `lane create --name <label>` defaults to the lane id when omitted.
+- `lane move --target-stage <name>` defaults to the target lane's first `linearStages` entry.
+
+### Error handling
+
+- **`create <id>` when the file already exists.** Refused with `Cannot create lane "<id>": file already exists at <path>.` Pointer: use `lane update` to modify the existing lane.
+- **`create <id>` with an unknown pipeline template.** Refused with `pipelineTemplate "<id>" does not resolve` and the loader's underlying error (which lists the searched paths).
+- **`update <id>` with no patch flags.** Refused with `no patch fields supplied. Pass at least one of --name, --template, --content-dir.`
+- **`update <id>` with an unknown pipeline template.** Refused with the same shape as `create`.
+- **`archive <id>` when already archived.** Refused with `already archived (archivedAt=<timestamp>).`
+- **`restore <id>` when not archived.** Refused with `not archived (no archivedAt field).`
+- **`purge <id>` while entries reference the lane.** Refused with `<N> entr{y,ies} reference it (<slug1>, <slug2>, ...). Move each entry to another lane with "deskwork lane move <slug> --to <other>" before purging.` The first five dependent slugs are listed; a `+N more` suffix appears when there are additional dependents. `--force` is intentionally NOT supported — the operator must move each entry out first so no entry is orphaned.
+- **`move <slug> --to <id>` to the same lane.** Refused with `already in lane "<id>".`
+- **`move <slug> --to <id>` into an archived lane.** Refused with `Cannot move entry <slug> into archived lane "<id>". Restore the lane first via "deskwork lane restore <id>".`
+- **`move <slug> --target-stage <name>` with a stage not in the target template.** Refused with the allowed-stages list (`Allowed stages: <linear> ∪ <off-pipeline>`).
+- **`move <slug>` when the source artifact does not exist on disk.** Refused with `source artifact does not exist at <path>. Repair the binding (e.g. via "deskwork doctor") before moving.`
+- **`move <slug>` when the target artifact path already exists.** Refused with `target artifact already exists at <path>. The target lane already holds a file at the same relative path; resolve the collision (rename / move / remove) before running lane move.`
+
+### Safety rules
+
+- **Archive is the preferred disposition for retired lanes**, not purge. Per the project's content-management rule, the database remembers terminal states; `purge` exists only for genuinely-no-history cases (lanes created in error). The dashboard and calendar renderers skip archived lanes automatically.
+- **`move` is the only verb that touches entries.** The other seven verbs operate on lane config files only; entries that reference a lane are left untouched (including when the lane is archived).
+- **`purge` refusal lists are the audit signal.** Don't grep around for who-references-the-lane; the CLI does the audit and lists the slugs.
diff --git a/plugins/deskwork/skills/pipeline/SKILL.md b/plugins/deskwork/skills/pipeline/SKILL.md
new file mode 100644
index 0000000..fc6a20f
--- /dev/null
+++ b/plugins/deskwork/skills/pipeline/SKILL.md
@@ -0,0 +1,97 @@
+---
+name: pipeline
+description: CRUD on pipeline templates — list, show, create, update, delete. Pipeline templates define the per-pipeline stage vocabulary lanes bind to. Plugin presets (editorial, blog-post, feature-doc, qa-plan, visual) are read-only; project overrides live at .deskwork/pipelines/<id>.json and take precedence at load time.
+---
+
+## Pipeline — manage pipeline templates
+
+A **pipeline template** names a pipeline's linear stages (the ordered list that captures the artifact's lifecycle), its `lockedStages` (pre-terminal review-freeze stops on the linear path), and its `offPipelineStages` (cul-de-sacs like `Blocked`, `Cancelled`, `Archived`). Each **lane** binds to exactly one pipeline template via the lane's `pipelineTemplate` field.
+
+Pipeline templates resolve in two tiers:
+
+- **Plugin presets** — `editorial`, `blog-post`, `feature-doc`, `qa-plan`, `visual` — ship with `@deskwork/core` and are read-only. Operators cannot mutate or delete them.
+- **Project overrides** — JSON files at `<projectRoot>/.deskwork/pipelines/<id>.json`. Override an existing preset by id (`editorial` here masks the bundled `editorial`), or invent a brand-new id. Loaders prefer the override when both exist.
+
+The `pipeline` verb is a CRUD family. Five subcommands cover the template lifecycle from creation through stage-by-stage mutation to deletion (with mandatory lane-reassignment when entries depend on the template).
+
+### Subcommands
+
+| Verb | Purpose |
+|---|---|
+| `list` | enumerate visible templates (presets + overrides). `--full` adds stage counts + source |
+| `show <id>` | print a single resolved template's JSON |
+| `create <id>` | write a new project-override template (the `--shape` flag carries the linear-stage list) |
+| `update <id>` | mutate a project-override template via one of five mutually-exclusive operation flags |
+| `delete <id>` | remove a project-override template (refused unless either no lane references it, or `--reassign-lanes-to <other-id>` is passed) |
+
+### Input
+
+```
+/deskwork:pipeline list [--full]
+/deskwork:pipeline show <id>
+/deskwork:pipeline create <id> --shape "<s1>,<s2>,..." [--name <label>] [--description <text>]
+/deskwork:pipeline update <id> --add-stage <name> [--position N]
+/deskwork:pipeline update <id> --rename-stage <from> --to-stage <to>
+/deskwork:pipeline update <id> --remove-stage <name>
+/deskwork:pipeline update <id> --set-locked "<s1>,<s2>,..."
+/deskwork:pipeline update <id> --set-off-pipeline "<s1>,<s2>,..."
+/deskwork:pipeline delete <id> [--reassign-lanes-to <other-id>]
+```
+
+### Steps
+
+1. Resolve the operator-supplied pipeline id.
+2. Run the matching subcommand via `deskwork pipeline <verb> [args...]`:
+
+   - **`list`** enumerates every visible template id (presets unioned with overrides; override-takes-precedence). The default shape emits ids only. Pass `--full` to load each template and emit id + name + source (`project-override` | `plugin-preset`) + linear / locked / off-pipeline stage counts. A malformed override JSON surfaces as a load-time error rather than silently disappearing from the list.
+
+   - **`show <id>`** loads the resolved template (project override if present, plugin preset otherwise) and emits the JSON shape — id, name, description, linearStages, lockedStages, offPipelineStages — plus the `source` flag.
+
+   - **`create <id> --shape "<s1>,<s2>,..."`** writes a brand-new project-override template at `<projectRoot>/.deskwork/pipelines/<id>.json`. `--shape` accepts a comma-separated list of stage names; the order is the linear pipeline order. `--name <label>` defaults to the id, `--description <text>` defaults to a generic "Custom pipeline <id>" string. `lockedStages` and `offPipelineStages` start empty; the `update` verb populates them.
+
+   - **`update <id>`** mutates a project-override template. Exactly ONE operation flag per invocation:
+     - `--add-stage <name> [--position N]` — insert `<name>` into `linearStages` at zero-based position `N` (default = end). Refused when `<name>` already exists anywhere on the template.
+     - `--rename-stage <from> --to-stage <to>` — rename `<from>` to `<to>` wherever it appears (linearStages, lockedStages, offPipelineStages). Refused when `<from>` doesn't exist or `<to>` already exists. Appends a `{from, to, at}` migration entry to `<projectRoot>/.deskwork/pipelines/<id>-renames.json` (doctor — Phase 6 Task 6.5 — reads this for affected-entry remediation).
+     - `--remove-stage <name>` — remove `<name>` from whichever list contains it. Refused when any entry's `currentStage` references `<name>` AND that entry's lane binds to this template. Refused when removing would leave `linearStages` empty.
+     - `--set-locked "<s1>,<s2>,..."` — replace `lockedStages` wholesale. All entries must be in `linearStages`.
+     - `--set-off-pipeline "<s1>,<s2>,..."` — replace `offPipelineStages` wholesale. No entry may already be in `linearStages` (a stage is either linear OR off-pipeline, not both).
+
+   - **`delete <id>`** removes a project-override template JSON. Refused for plugin presets (use `customize pipeline <id>` to create an override instead). Refused when any lane has `pipelineTemplate === <id>`, unless `--reassign-lanes-to <other-id>` is passed — in which case every dependent lane is re-bound to `<other-id>` (which must itself resolve) before the doomed JSON is unlinked. Stage compatibility between the old and new template is the operator's problem; doctor surfaces entries whose `currentStage` isn't valid on the new template.
+
+### Defaults
+
+- `pipeline list` emits ids only by default. `--full` adds stage counts + source.
+- `pipeline create --name` defaults to the id when omitted.
+- `pipeline create --description` defaults to a generic "Custom pipeline <id>" string when omitted.
+- `pipeline create` leaves `lockedStages` and `offPipelineStages` empty; the `update` verb adjusts them.
+- `pipeline update --add-stage --position` defaults to the end of `linearStages`.
+
+### Error handling
+
+- **`create <id>` when `<id>` collides with a plugin preset.** Refused with a pointer to `deskwork customize pipeline <id>` (which copies the preset into the project for operator editing).
+- **`create <id>` when a project override already exists.** Refused with a pointer to `deskwork pipeline update <id>` (or move the existing file aside first).
+- **`create <id>` with an empty or blank-entry `--shape`.** Refused with the usage hint.
+- **`create <id>` whose stage list fails Zod validation** (duplicate stages, `Cancelled` in `linearStages`, stage-name tokens that collide, etc.). Refused with the schema's per-issue error list.
+- **`update <id>` against a plugin preset (no override).** Refused with a pointer to `deskwork customize pipeline <id>` to create an override first.
+- **`update <id>` with zero or multiple operation flags.** Refused (exit 2) — exactly one of `--add-stage`, `--rename-stage`, `--remove-stage`, `--set-locked`, `--set-off-pipeline`.
+- **`update <id> --rename-stage <from>` without `--to-stage <to>`.** Refused (exit 2).
+- **`update <id> --add-stage <name>` when `<name>` already exists.** Refused.
+- **`update <id> --rename-stage <from> --to-stage <to>` when `<from>` doesn't exist.** Refused with the list of known stages.
+- **`update <id> --rename-stage` when `<to>` already exists.** Refused.
+- **`update <id> --remove-stage <name>` when entries reference the stage** (their `currentStage === <name>` AND their lane binds to this template). Refused with the list of offender slugs (first 5 + `+N more` suffix). The operator must induct each entry to another stage before retrying.
+- **`update <id> --remove-stage <name>` when removing would empty `linearStages`.** Refused.
+- **`update <id> --set-locked <stages>` with a stage not in `linearStages`.** Refused (lockedStages must be a subset of linearStages).
+- **`update <id> --set-off-pipeline <stages>` overlapping `linearStages`.** Refused (a stage is either linear OR off-pipeline).
+- **`delete <id>` against a plugin preset.** Refused with a pointer to `customize pipeline <id>`.
+- **`delete <id>` when no project override exists.** Refused with the searched path.
+- **`delete <id>` when lanes reference the template (no `--reassign-lanes-to`).** Refused with the list of dependent lane ids (first 5 + `+N more` suffix) and pointers to (a) `deskwork lane update <lane> --template <other>` (per-lane), (b) the forcing `--reassign-lanes-to <other-id>` (batch rebind).
+- **`delete <id> --reassign-lanes-to <other-id>` where `<other-id>` doesn't resolve.** Refused with the loader's underlying error.
+- **`delete <id> --reassign-lanes-to <id>` (same id).** Refused.
+
+### Safety rules
+
+- **Plugin presets are immutable.** The five built-in presets (`editorial`, `blog-post`, `feature-doc`, `qa-plan`, `visual`) cannot be edited or deleted directly. The `customize pipeline <id>` skill copies the preset into the project; subsequent `pipeline update` / `pipeline delete` operates on the project copy.
+- **Stage rename writes a migration sidecar.** Each `--rename-stage` invocation appends an entry to `<id>-renames.json` alongside the template. Doctor (Phase 6 Task 6.5) consumes the file to identify entries whose `currentStage` still uses the old stage name. The migration sidecar is append-only; deleting it loses the audit trail.
+- **`delete` is the rarely-used corner case.** Per the project's content-management rule, prefer keeping the template in place (entries' `currentStage` values remain valid). Delete is for genuinely-no-history templates created in error. When there IS history (active lanes), the operator must rebind every dependent lane first — either per-lane via `lane update` or in batch via `--reassign-lanes-to`.
+- **Stage compatibility is the operator's problem on `--reassign-lanes-to`.** Re-binding lanes does NOT rewrite each entry's `currentStage`. If the new template lacks a stage that an existing entry occupies, doctor surfaces the mismatch on the next audit; the operator inducts each affected entry to a valid stage.
+- **`customize pipeline <id>` is the convenience wrapper.** When the goal is "I want to tweak the editorial preset," the right entry point is `deskwork customize pipeline editorial` (which copies the preset to the project, where `pipeline update` then mutates it). `pipeline create` is for brand-new operator-authored pipelines with no preset basis.


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
