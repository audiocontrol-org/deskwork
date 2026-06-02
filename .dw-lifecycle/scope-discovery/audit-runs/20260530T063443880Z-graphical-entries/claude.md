I've grounded my findings against the current tree (the audited commit `d144ba2` has follow-up fixes `ecb69ce` on top — I've excluded the already-fixed journal-order and stage-token-duplicate issues). Here are my findings.

### Multi-lane calendar renderer silently drops entries whose `currentStage` is absent from their lane's template — reintroduces the exact #247 failure mode

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   high
Surface:    `packages/core/src/calendar/render.ts:86-98` (`renderStageSections` / `bucketize`), `:179-201` (multi-lane grouping + orphan lane)

`#247`'s stated fix is "stop silently dropping entries whose stage the renderer doesn't know about." The multi-lane path reintroduces that exact bug in two places. `bucketize` (line 91) only creates buckets for `templateStageOrder(template)`; any entry whose `currentStage` is not in `byStage` is matched against `byStage.get(e.currentStage)` → `undefined` → never pushed. The render loop (lines 93-96) then iterates only the template's declared stages, so the entry never appears in the output. Two concrete vectors: (a) an entry bound to a valid lane but carrying a `currentStage` the lane's template no longer declares (a legacy stage, or a template that was edited to drop a stage entries still reference) vanishes from its lane section; (b) an orphan entry (line 189 — `lane` undefined, OR a `lane` id whose config was deleted) is rendered through `EDITORIAL_FALLBACK` (line 199), so a deleted-visual-lane entry sitting at `Sketched`/`Iterating` has no matching editorial-fallback bucket and disappears from the "(unassigned)" section too.

This is the same shape as AUDIT-37 finding #1 (member-section drop) but on the canonical calendar surface — and the calendar is the SSOT the doctor reconciles against, so a dropped row here is more consequential than a dropped composed-view card. There is no "unbucketed" tail and no count reconciliation; the entry is gone with no indication. A reasonable fix: after bucketizing, collect any entry whose `currentStage` produced no bucket into an explicit `## (unrecognized stage)` tail per lane (or per the unassigned block), mirroring the loud-surface bias the rest of Phase 4 adopts. The multi-lane regression tests (`regenerate-multilane.test.ts`) only assert entries in *known* stages appear — add a case with an entry whose stage is outside its lane template and assert it still renders somewhere.

### Corrupt / unparseable sidecars are silently skipped during lane migration — "no silent fallbacks" violation

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    `packages/core/src/doctor/lane-migration.ts:145-158`

`migrateLaneMembership` walks every `*.json` in the entries dir; a `readFile` failure (`catch { continue }`, line 148) and a `JSON.parse` / `EntrySchema.safeParse` failure (`if (!result.success) continue;` line 154, `catch { continue }` line 156) are all swallowed. The sidecar is not counted in `examined` (incremented at line 159, after the parse guards), not migrated, and produces no diagnostic. This is the same root cause AUDIT-39 flagged in `entry-review/data.ts` (corrupt sidecar misreported), surfacing in a new file: a schema-parse failure, malformed JSON, or permission error is conflated with "nothing to do" and hidden from the operator. The project's `.claude/CLAUDE.md` § Error Handling forbids exactly this — fallbacks/silent skips are bug factories.

Concretely, an operator runs `doctor` expecting a project-wide lane back-fill; a sidecar that fails schema validation (e.g. a partially-written file, or one carrying a field a newer schema rejects) is silently left without `lane`, then later trips `resolveEntryTemplate`'s migration-window default or a downstream "lane required" error far from the migration that should have caught it. A reasonable fix: distinguish ENOENT/genuinely-absent from parse/validation/IO failures; count every `.json` examined; and either surface skipped-corrupt sidecars in `LaneMigrationResult` (e.g. `skippedCorrupt: string[]`) so the doctor can report them, or throw with the offending path. The migration test suite has no corrupt-sidecar case to assert the chosen behavior.

### `iterateEntry` now refuses the editorial `Final` stage (locked) — a behavior change from prior with no editorial regression test

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   medium
Surface:    `packages/core/src/iterate/iterate.ts:99-106`

The pre-Phase-4 `iterateEntry` refused only `Published`, `Blocked`, and `Cancelled` — an entry at `Final` was iterable. The refactor adds `isLockedStageInTemplate` (line 99), and editorial's `lockedStages` is `['Final']`, so iterate on a `Final` editorial entry now throws "Cannot iterate: entry is at locked stage 'Final'…". That is a semantic change to the established editorial workflow, not just a generalization: any operator (or `/deskwork:iterate` skill invocation) that previously pinned a new revision while an entry sat in `Final` now hits a hard error and must `induct` back to `Drafting` first.

It may well be the intended state-machine semantics (Final is the pre-publication freeze), but it's shipped as an untested, un-changelogged behavior change. `iterate.test.ts` adds no editorial case asserting `Final` refuses iterate (the only `Final` reference, line 141, is an unrelated per-stage-counter fixture); the visual-preset suite tests the `Approved` lock but nothing pins the editorial `Final` lock, so the regression that *changed editorial behavior* is uncovered. Evidence the operator cares about iterate not over-gating: the discipline rules ("Empty revisions beat missed changes") and the removed `#188` content-diff gate both push toward iterate being permissive. Recommend: confirm the `Final`-refuses-iterate intent explicitly against DESKWORK-STATE-MACHINE.md, and add an editorial regression test asserting the refusal (so the change is locked in deliberately rather than as a side effect of the locked-stage generalization).

### `regenerateCalendar` now reads + parses every lane config on every stage transition — one malformed lane file breaks all six verbs, after the sidecar is already mutated

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   medium
Surface:    `packages/core/src/calendar/render.ts:111-121` (`loadLaneContexts`), called by `regenerateCalendar` at the tail of `approve`/`block`/`cancel`/`induct`/`publish`

`loadLaneContexts` calls `loadLaneConfig` and `loadPipelineTemplate` per lane with no error handling — any throw propagates out of `renderCalendar` → `regenerateCalendar`. Every verb calls `await regenerateCalendar(projectRoot)` as its final step, *after* `writeSidecar` and `appendJournalEvent` have already run (see e.g. `approve.ts` step ordering). So a single malformed `.deskwork/lanes/*.json` (or a lane pointing at a missing/invalid pipeline template) makes every stage transition for *every* entry throw — and throw at a point where the sidecar mutation and journal event have already landed. The caller sees a failure while the transition partially succeeded on disk: state advanced, calendar stale, error surfaced.

Pre-Phase-4 `renderCalendar` was pure over the entry list and could only fail on the final `writeFile` — the lane-config read multiplies the blast radius from "this entry" to "the whole project, on any verb." This couples per-entry transitions to the validity of unrelated lane files. A reasonable fix: make `regenerateCalendar`'s failure non-fatal to the transition (the calendar can be reconciled by `doctor --fix`, which is its documented recovery path per the #148 comment), OR validate lane configs once up-front and surface a single actionable error rather than failing mid-transition; at minimum, the partial-state window (sidecar written, calendar regen threw) should be called out and tested.

### `deriveArtifactKindFromPath` persists a wrong `artifactKind` for multi-file HTML mockups — extension heuristic disagrees with the authoritative `detectArtifactKind`

Finding-ID: AUDIT-BARRAGE-claude-05
Status:     open
Severity:   medium
Surface:    `packages/core/src/doctor/lane-migration.ts:deriveArtifactKindFromPath` (`.html → 'single-file-html'`); test acknowledgement at `packages/core/test/doctor/lane-migration.test.ts:131-138`

The migration derives `artifactKind` purely from the path extension: any `.html` path → `'single-file-html'`. But the project's authoritative classifier `detectArtifactKind` probes the filesystem and (per the test's own comment, lines 132-135) would classify a *directory* of HTML as `html-mockup`. So for a multi-file HTML mockup whose `artifactPath` ends in `index.html`, the migration writes `artifactKind: 'single-file-html'` — a value that contradicts what `detectArtifactKind` produces for the same artifact. Because the migration is idempotent and skips entries that already carry `artifactKind` (line 163), the wrong value is permanent: no later run corrects it.

This is a guess-that-can-be-wrong written as persistent state — adjacent to the "no fallbacks / no mock data" principle. The visual/`mockups` lane (the headline use case of graphical-entries) is precisely where multi-file HTML mockups live, so this is not a corner case for this feature. A reasonable fix: have the migration call the same `detectArtifactKind` probe used elsewhere (it's already filesystem-touching code in a doctor pass, so the "path-only because the artifact might be moved" justification is weak for a doctor run), or only back-fill the kinds the path heuristic can classify unambiguously (`.md`, image extensions) and leave HTML for the filesystem-aware rule rather than guessing single-vs-multi-file.

### `EDITORIAL_FALLBACK` duplicates `pipelines/editorial.json` — config-as-code with a manual "keep in sync" comment and a Phase 8 deferral

Finding-ID: AUDIT-BARRAGE-claude-06
Status:     open
Severity:   low
Surface:    `packages/core/src/calendar/render.ts:130-145`

`EDITORIAL_FALLBACK` hardcodes the editorial template's `linearStages` / `lockedStages` / `offPipelineStages` inline, duplicating `packages/core/src/pipelines/editorial.json`. The code even documents the hazard ("this constant duplicates … and the two MUST stay in sync"). Meanwhile `lanes/resolve.ts` sources editorial via `loadPipelineTemplate('editorial', projectRoot)` — so the codebase now has two different ways to obtain the editorial stage list, one authoritative and one a manually-synced copy. If the preset's stage list changes, the renderer's no-project-root path silently drifts. The comment defers cleanup to "Phase 8 … this constant can be deleted" with no issue link backing the deferral.

The stated justification is that test fixtures call `renderCalendar(entries)` with no project root and the preset must therefore be resolvable without disk. That's solvable without duplicating the data — e.g. load the editorial preset from the bundled package resource (it ships with `@deskwork/core`) rather than re-typing its stages. At minimum the Phase 8 deletion should be tracked as a GitHub issue per the project's deferral discipline rather than living only as a code comment.

### Deferral phrase in `induct` CLI comment; `induct` CLI remains editorial-narrow so the "verbs are universal" goal is unmet at the CLI layer

Finding-ID: AUDIT-BARRAGE-claude-07
Status:     open
Severity:   low
Surface:    `packages/cli/src/commands/induct.ts:84-95`

The CLI comment states operators using non-editorial templates "should invoke the core helper directly **until a lane-aware CLI lands**" — a future-work deferral embedded in a code comment with no issue link, the pattern the project's "Just for now is bullshit" rule and this audit's hard-constraints call out. Beyond the phrasing: the substance is that `induct.ts` still validates `flags.to` with the editorial-narrow `isLinearPipelineTarget` guard, so a `visual`-lane entry cannot be inducted to `Sketched`/`Iterating`/`Approved` via the CLI even though the core `inductEntry` verb (this same diff) now fully supports it. Phase 4's headline ("verbs are universal and stage-gated only") is delivered in core but only half-wired at the CLI entry point for `induct` — an adopter driving a non-editorial lane through the documented CLI hits the editorial guard.

This may be a legitimately-scoped boundary, but per project discipline the gap and the "later" promise belong in a tracked issue + workplan entry, not a comment. Recommend filing the lane-aware-CLI gap as a GitHub issue and replacing the comment's deferral phrasing with a reference to it (or widening the CLI guard now, since `resolveEntryStrictTemplate` is available to validate `flags.to` against the entry's actual template).

### Doc drift: `renderCalendar` docstring promises `## Lane:` headers but the code emits `# Lane:` (h1)

Finding-ID: AUDIT-BARRAGE-claude-08
Status:     open
Severity:   low
Surface:    `packages/core/src/calendar/render.ts:157-159` (docstring) vs `:194` and `:199` (emit)

The `renderCalendar` docstring says the lane-aware mode "emits one `## Lane: <name>` block per lane" (h2), but the implementation writes `` `# Lane: ${ctx.name}\n\n` `` (line 194) and `` `# Lane: (unassigned)\n\n` `` (line 199) — h1 headers. The multi-lane test (`regenerate-multilane.test.ts`) correctly asserts `# Lane: Default`, so the code is consistent with the test; only the docstring is wrong. Minor, but the heading level is meaningful here: the output already opens with `# Editorial Calendar` (h1), so per-lane blocks at h1 produce sibling top-level headings rather than nested sections, which affects any downstream markdown TOC/renderer. Worth deciding intentionally (h1 vs h2) and fixing the docstring to match — and confirming the doctor's section-agnostic UUID scan (`orphan-frontmatter-id.ts`, which this diff makes heading-agnostic) is the only consumer, since a parser keyed on `##` would miss these `#` lane headers.
