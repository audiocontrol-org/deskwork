### Pipeline template rename/archive/restore/purge are missing

Finding-ID: AUDIT-BARRAGE-codex-01  
Status:     open  
Severity:   blocking  
Surface:    `packages/cli/src/commands/pipeline.ts:5-15`, `packages/cli/src/commands/pipeline.ts:80-136`, `packages/core/src/pipelines/operations/index.ts:11-28`, `plugins/deskwork/skills/pipeline/SKILL.md:13-25`

The audited feature scope says Task 6.2 ships the `/deskwork:pipeline` family with `list/show/create/update/archive/restore/purge/rename`, and specifically that rename migrates lane `pipelineTemplate` bindings from the old id to the new id atomically. The implementation exposes only `list | show | create | update | delete`; there is no pipeline-id `rename`, no soft archive/restore, and no purge verb matching the lane lifecycle.

This is not just naming drift. The only “rename” implemented is `update --rename-stage`, which changes stage labels and writes a stage-rename sidecar. It does not rename the template id or migrate lanes bound to the old template id. A reasonable fix is to add the missing pipeline lifecycle verbs and core operations, including a template-id rename path that writes the new override, migrates every dependent lane config, removes the old override, and rolls back on partial failure.

### Stage-rename sidecar is enumerated as a fake pipeline template

Finding-ID: AUDIT-BARRAGE-codex-02  
Status:     open  
Severity:   high  
Surface:    `packages/core/src/pipelines/operations/update.ts:410-459`, `packages/core/src/pipelines/loader.ts:251-260`, `packages/core/src/pipelines/operations/list.ts:38-40`

`appendRenameMigration` writes `<projectRoot>/.deskwork/pipelines/<id>-renames.json` next to real template override files. `listAvailablePipelineTemplates` enumerates every `*.json` basename in `.deskwork/pipelines`, and `listPipelines` immediately calls `loadPipelineTemplate(id, projectRoot)` for each returned id.

After the first successful `deskwork pipeline update my-blog --rename-stage ...`, `deskwork pipeline list --full` will discover `my-blog-renames` as a template id and try to parse the migration sidecar as a `PipelineTemplate`. That fails schema validation or id matching, so a successful rename poisons the template picker. Store migration files outside the template override directory, or make the enumerator ignore sidecar filenames with a strict template-file index.

### `remove-stage` misses legacy default-lane entries

Finding-ID: AUDIT-BARRAGE-codex-03  
Status:     open  
Severity:   medium  
Surface:    `packages/core/src/pipelines/operations/update.ts:367-395`

`refuseRemoveStageWhenReferenced` skips every sidecar whose `entry.lane` is `undefined`. That conflicts with the lane migration convention used elsewhere in this diff: `lane move` treats missing `lane` as the migration-window `default` lane. If a project has a `default` lane bound to `my-blog` and legacy entries without a `lane` field at `currentStage: "Review"`, `pipeline update my-blog --remove-stage Review` will allow the stage removal even though those entries still occupy it.

The refusal check should resolve missing `entry.lane` the same way the rest of the lane-aware code does: treat it as `default`, load that lane, and only skip when the entry truly cannot be associated with the mutated template. Add a regression test with a default-lane entry whose sidecar lacks `lane`.

### `delete --reassign-lanes-to` can leave a partial rebind

Finding-ID: AUDIT-BARRAGE-codex-04  
Status:     open  
Severity:   medium  
Surface:    `packages/core/src/pipelines/operations/delete.ts:179-222`

The batch reassign path commits each dependent lane one by one, then unlinks the pipeline override, then appends the journal event. If a later lane write fails, earlier lanes remain rebound while the old pipeline still exists. If `unlinkSync` fails, all lane reassignments may already be on disk. If `appendJournalEvent` fails after unlink, the template is gone and lanes are rebound without the lifecycle event.

Each individual lane write is atomic, but the multi-file operation is not. Since this command is explicitly a batch mutation, it needs transaction-style rollback or a staging order with compensating writes: preserve original lane configs, restore already-reassigned lanes on failure, and avoid deleting the template until the reassign set is known to be durable.

### `lane move` trusts sidecar paths when moving files

Finding-ID: AUDIT-BARRAGE-codex-05  
Status:     open  
Severity:   high  
Surface:    `packages/core/src/lanes/operations/move.ts:210-231`, `packages/core/src/schema/entry.ts:213-218`

`lane move` builds filesystem paths with `join(sourceContentDir, sidecar.artifactPath)` and `join(targetContentDir, sidecar.artifactPath)` without verifying that the resolved paths stay under the lane content directories. `EntrySchema` leaves `artifactPath` as an unconstrained optional string. A malformed sidecar with `artifactPath: "../outside.md"` can make the move operate outside the lane content tree. The scrapbook path has the same shape through `sidecar.slug`.

This is the same class of path-boundary issue that the diff hardens for lane ids and `contentDir`, but the entry-controlled relative paths remain unchecked at the move boundary. Resolve both source and target paths, compare them against the resolved content directories, and refuse any artifact or scrapbook path that escapes.
