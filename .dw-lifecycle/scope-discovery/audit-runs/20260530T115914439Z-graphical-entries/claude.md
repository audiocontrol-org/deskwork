I walked the diff for **graphical-entries Phase 6 Tasks 6.1 + 6.2** (`/deskwork:lane` + `/deskwork:pipeline` CLI families). I focused on the audit-named surfaces: CLI argument-parsing edge cases, refusal semantics across verbs, atomic-write correctness, the rename-migration round-trip, and CLI exit-code conventions. I cross-checked against the prior audit log to avoid re-litigating dispositioned findings. Findings below.

---

### `pipeline update --rename-stage` writes `<id>-renames.json` into the override dir, which the loader enumerates as a phantom template — breaks `pipeline list` after any rename

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   high
Surface:    `packages/core/src/pipelines/operations/update.ts:appendRenameMigration` (writes `${pipelineId}-renames.json` into `pipelineOverridesDir`) vs `packages/core/src/pipelines/loader.ts:listAvailablePipelineTemplates` (`:251`) + `packages/core/src/pipelines/operations/list.ts:listPipelines`

`appendRenameMigration` writes the migration sidecar to `join(pipelineOverridesDir(projectRoot), \`${pipelineId}-renames.json\`)` — i.e. *the same directory* `listAvailablePipelineTemplates` scans for templates. That function returns every `.json` basename in the override dir with no exclusion for the `-renames` suffix, so after a single `pipeline update my-blog --rename-stage X --to-stage Y`, the id `my-blog-renames` is emitted as a pipeline template. `listPipelines` then calls `loadPipelineTemplate('my-blog-renames', …)` for *every* id, which finds `my-blog-renames.json`, reads it, and Zod-validates it against `PipelineTemplateSchema` — it has `pipelineId`/`renames` keys, not `linearStages`, so validation throws. The throw propagates out of `listPipelines`, so **both `pipeline list` and `pipeline list --full` break for the whole project after any rename**. `customize pipeline`'s `listAvailable` picker is polluted identically, and `pipeline show my-blog-renames` resolves to a confusing schema error.

This is the same class as AUDIT-20260530-03 (stray `.json` becomes phantom template) but it is *guaranteed* on every rename rather than hypothetical, and the `update.test.ts` rename tests never run `pipeline list` afterward so it shipped untested. Fix: store the migration sidecar outside the enumerated namespace (e.g. `.deskwork/pipelines/.renames/<id>.json` or a single non-`.json` index), OR have `listJsonBasenames`/`listAvailablePipelineTemplates` skip the `-renames.json` suffix, AND add a regression test that runs `pipeline list` after a rename.

---

### `pipeline delete --reassign-lanes-to ""` (empty string) bypasses the dependent-lane refusal and orphans every dependent lane

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   high
Surface:    `packages/core/src/pipelines/operations/delete.ts:deletePipeline` (refusal guard, validation guard, rebind loop)

The dependent-lane refusal is gated on `dependents.length > 0 && opts.reassignLanesTo === undefined`, while validation and the rebind loop are both gated on `opts.reassignLanesTo !== undefined && opts.reassignLanesTo.length > 0`. An empty-string value (`--reassign-lanes-to ""`, or `--reassign-lanes-to=`, or an unset shell variable) sets `reassignLanesTo === ''`, which is **neither `undefined` nor length-`> 0`**. Trace with one dependent lane: the refusal check is `true && ('' === undefined)` → `false` (no refusal); the validation block is `('' !== undefined) && (0 > 0)` → `false` (no `loadPipelineTemplate` check); the rebind loop is skipped for the same reason; then `unlinkSync(path)` fires. The override is deleted and the dependent lanes are left pointing at a now-missing `pipelineTemplate` — exactly the data-integrity failure the guard exists to prevent, executed silently with exit 0.

The sibling `lane move --to ""` path is incidentally protected (`assertSafeLaneId('')` fails the regex), and `lane create --content-dir ""` is caught by the schema's `min(1)` — `delete`'s reassign value is the one operator-controlled flag that reaches a destructive `unlinkSync` without an empty-string guard. Fix: normalize empty-string flags to `undefined` at the CLI boundary, or change the guards to `opts.reassignLanesTo == null || opts.reassignLanesTo.length === 0` so an empty reassign target is treated as "no target" and the dependent-lane refusal fires. Add a refusal test for `--reassign-lanes-to ''` with a dependent lane.

---

### `appendRenameMigration` is non-atomic and silently discards a corrupt renames file, contradicting the append-only audit-trail promise

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   medium
Surface:    `packages/core/src/pipelines/operations/update.ts:appendRenameMigration` (read + `writeFileSync` direct), and `plugins/deskwork/skills/pipeline/SKILL.md` Safety-rules ("migration sidecar is append-only … deleting it loses the audit trail")

Every other write in this feature uses the tmp+rename atomic pattern (`lanes/operations/commit.ts`, `pipelines/operations/commit.ts`), but `appendRenameMigration` does a direct `writeFileSync(path, …)` — a crash mid-write truncates `<id>-renames.json`. Worse, on the read side the function catches a `JSON.parse` failure and sets `parsed = null`, after which `RenameMigrationSchema.safeParse(null)` fails and it falls back to `{ pipelineId, renames: [] }` — **silently discarding the entire prior rename history** on any corruption. The SKILL.md tells the operator this file is the append-only audit trail that doctor (Task 6.5) will consume for affected-entry remediation, but the code itself will reset it to empty without surfacing the loss, defeating the remediation path the rename feature exists to enable.

There is also an ordering hazard: the rename is committed by `commitPipelineTemplate` first, then `appendRenameMigration` runs synchronously; if it throws (disk full, permissions), the template is already renamed on disk but no migration record exists and the journal event never fires. Fix: write the renames file via the same tmp+rename helper, and on a corrupt existing file refuse/throw with the path (or quarantine it) rather than silently starting fresh — losing the audit trail is the exact "silent fallback" the project's no-fallback rule prohibits.

---

### `listLanes` / `listPipelines` throw on a single malformed config, breaking the entire list command — undermining the loader's deliberate graceful-degradation contract

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   medium
Surface:    `packages/core/src/lanes/operations/list.ts:listLanes` (N+1 `loadLaneConfig`), `packages/core/src/pipelines/operations/list.ts:listPipelines` (N+1 `loadPipelineTemplate`), vs `packages/core/src/lanes/loader.ts:listLaneConfigs` + `isArchivedOnDisk`

`listLaneConfigs` was deliberately written to tolerate corrupt files — its `isArchivedOnDisk` helper catches parse errors and returns `false` so "a malformed lane still appears in the list" (the `broken.json` test at `loader.test.ts:285` asserts `['broken', 'default']`). But the operation layer immediately undoes that: `listLanes` maps every returned id through `loadLaneConfig(id)`, which throws on the malformed lane, so `lane list` fails wholesale and the operator can't see *any* of their lanes — the opposite of what the loader's graceful degradation was protecting. `listPipelines` has the identical shape via `loadPipelineTemplate`, and this is also the propagation vector for finding -01 (the phantom `-renames` template). This is the same coupling shape as the already-dispositioned AUDIT-20260530-17 (one bad lane file breaks an operation for the whole project), surfacing on the read path.

Fix: have `listLanes`/`listPipelines` collect per-id load failures into the result (e.g. a `malformed: {id, error}[]` channel the CLI surfaces) rather than letting the first corrupt file abort the enumeration — so `lane list` shows the healthy lanes plus a flagged-broken section. Add a `lane list` test with one corrupt lane JSON present asserting the healthy lanes still emit.

---

### `lane move` of a pre-migration entry (no `lane` field) fails confusingly when no `default` lane config exists

Finding-ID: AUDIT-BARRAGE-claude-05
Status:     open
Severity:   low
Surface:    `packages/core/src/lanes/operations/move.ts:moveEntryToLane` (`sourceLaneId = sidecar.lane ?? DEFAULT_LANE_ID`, then `loadLaneConfig(sourceLaneId, projectRoot)`)

The docblock states an entry without a `lane` field "is treated as belonging to the `default` lane (matches the doctor's lane-back-fill default)." But the very next use of `sourceLaneId` is `loadLaneConfig('default', projectRoot)`, which throws `Lane config "default" not found` if the project never created a `default` lane (a real migration-window state, since lanes are project-owned with no plugin defaults). The error surfaced to the operator is about a *missing default lane config*, not about the entry they asked to move, and the `sourceLane` is only consumed for `sourceContentDir` resolution. An operator moving a freshly-ingested pre-lane entry into a new lane gets a confusing failure pointing at the wrong object.

Fix: when `sidecar.lane` is undefined and no `default` lane exists, either fall back to the project's configured `contentDir` for the source path, or refuse with a message naming the *entry* and instructing the operator to run lane back-fill (doctor) first. No test covers the no-`default`-lane move path.

---

### Rollback-test silently no-ops (returns "pass") when it cannot simulate the write failure — the contract goes unverified on root/CI sandboxes

Finding-ID: AUDIT-BARRAGE-claude-06
Status:     open
Severity:   low
Surface:    `packages/cli/test/lane/move.test.ts:264-280` ("rolls back artifact + scrapbook when writeSidecar fails")

The test chmods the entries dir to `0o555`, then pre-flights a write; if the write *succeeds* (running as root, common in CI sandboxes) it `return`s early — which Vitest records as a passing test, not a skip. So the move-rollback path (the headline data-safety fix from AUDIT-20260528-42) is silently unverified in exactly the environments most likely to run as root, and the green checkmark misrepresents coverage. Per the project's UI-verification ethos ("a passing test of the wrong assertions is worse than no test"), a test that can't exercise its contract should announce that, not pass quietly.

Fix: call Vitest's `ctx.skip()` (or `it.skipIf`) on the can't-simulate branch so the run reports SKIPPED with a reason, rather than a bare `return` that reads as a pass. Optionally drive the failure deterministically by mocking `writeSidecar` to throw instead of relying on filesystem permissions.
