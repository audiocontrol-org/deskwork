### Lane ids can escape `.deskwork/lanes/` during load

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   high
Surface:    `packages/core/src/lanes/loader.ts:43-45`, `packages/core/src/lanes/loader.ts:96-110`, `packages/core/src/lanes/types.ts:42-46`

`loadLaneConfig` only rejects empty or whitespace-only ids, then passes the raw id into `laneConfigPath`, which does `join(lanesDir(projectRoot), `${id}.json`)`. An id like `../config` resolves outside `.deskwork/lanes/` to `.deskwork/config.json`; an absolute-ish or separator-containing id can make the loader read arbitrary JSON under the project root family rather than a lane file. The schema has the same issue: `LaneConfigSchema.id` is only `z.string().min(1)`.

This breaks the lane id invariant implied by `.deskwork/lanes/<id>.json` and by the prior UI fix that required canonical lane ids. A reasonable correction is to define and enforce one lane-id regex in core, use it in `LaneConfigSchema`, `loadLaneConfig`, and `listLaneConfigs`, and reject ids containing path separators before constructing a filesystem path.

### Artifact detection classifies missing files as valid artifacts

Finding-ID: AUDIT-BARRAGE-codex-02
Status:     open
Severity:   medium
Surface:    `packages/core/src/lanes/detection.ts:44-70`, `packages/core/test/lanes/detection.test.ts:15-50`

`detectArtifactKind` only probes the filesystem for existing directories. For every file-shaped artifact, it dispatches purely by extension, so `/path/to/post.md`, `/path/to/mockup.html`, and `/path/to/sketch.png` are accepted even when nothing exists at those paths. The tests explicitly lock this in as “extension-based dispatch (no filesystem probe)”, but the feature scope says this classifies on-disk artifacts.

That can let migration populate `artifactKind` for stale or mistyped `artifactPath` values, turning a missing artifact into apparently valid metadata. A reasonable correction is to require the path to exist, require file cases to be regular files, and keep the current directory-with-`index.html` rule for `html-mockup`.

### Lane bootstrap can leave a lane file without its migration journal event

Finding-ID: AUDIT-BARRAGE-codex-03
Status:     open
Severity:   medium
Surface:    `packages/core/src/lanes/bootstrap.ts:102-123`

`bootstrapDefaultLaneIfMissing` writes `.deskwork/lanes/default.json` before appending the `lane-migration` journal event. If `appendJournalEvent` fails after the write, the project is left with a default lane but no migration audit record. The next invocation returns `already-exists` at lines 64-66 and never repairs the missing event.

The function’s documented behavior is “writes ... and appends a `lane-migration` journal event,” so this partial-success state violates the migration contract and makes audit history depend on a transient write failure. A reasonable correction is to make the operation compensating: if journal append fails, remove the just-created lane file or record enough state to retry the missing event when the lane already exists and was created by this bootstrap.
