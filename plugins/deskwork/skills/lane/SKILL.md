---
name: lane
description: CRUD on lane configs — list, show, create, update, archive, restore, purge, and move entries between lanes. Lanes bind a content directory to a pipeline template; each project hosts one or more lanes and every entry lives in exactly one lane.
---

## Lane — manage lane configs

A **lane** binds a content directory to a pipeline template. Each project hosts one or more lanes; every entry lives in exactly one lane. Lane configs are stored at `<projectRoot>/.deskwork/lanes/<id>.json` and are project-owned (no plugin defaults).

The `lane` verb is a CRUD family. Eight subcommands cover the lane lifecycle from creation through soft-archive to (rare) hard purge, plus cross-lane entry moves.

### Subcommands

| Verb | Purpose |
|---|---|
| `list` | enumerate lanes (active by default; pass `--include-archived` for the full set) |
| `show <id>` | print a single lane's config |
| `create <id>` | write a new lane config |
| `update <id>` | mutate `name` / `template` / `content-dir` on an existing lane |
| `archive <id>` | soft-archive a lane (sets `archivedAt`; preserves the file + history) |
| `restore <id>` | clear `archivedAt` |
| `purge <id>` | hard-delete the lane JSON (refused while entries reference the lane) |
| `move <slug> --to <lane-id>` | relocate an entry into another lane (moves artifact + scrapbook on disk) |

### Input

```
/deskwork:lane list [--include-archived]
/deskwork:lane show <id>
/deskwork:lane create <id> --template <pipeline-id> --content-dir <path> [--name <label>]
/deskwork:lane update <id> [--name <label>] [--template <id>] [--content-dir <path>]
/deskwork:lane archive <id>
/deskwork:lane restore <id>
/deskwork:lane purge <id>
/deskwork:lane move <slug-or-uuid> --to <lane-id> [--target-stage <name>]
```

### Steps

1. Resolve the operator-supplied lane id or entry slug.
2. Run the matching subcommand via `deskwork lane <verb> [args...]`:
   - **`list`** enumerates lanes via `listLaneConfigs` and emits id / name / pipelineTemplate / contentDir / archived state per lane. Active lanes only by default; `--include-archived` appends archived lanes (those carrying a non-empty `archivedAt`).
   - **`show <id>`** loads the lane config and emits its fields. Surfaces `archivedAt` when present so the operator sees the audit timestamp.
   - **`create <id> --template <pipeline-id> --content-dir <path>`** writes `<projectRoot>/.deskwork/lanes/<id>.json`. The `--name <label>` flag is optional (defaults to the id). The referenced pipeline template MUST resolve (plugin preset or `.deskwork/pipelines/<id>.json` override) — the CLI refuses if it doesn't.
   - **`update <id>`** mutates the lane config in place. At least one of `--name`, `--template`, `--content-dir` is required. When `--template` is patched, the new template is cross-validated before the write commits. The lane's `id` is immutable.
   - **`archive <id>`** sets `archivedAt` to the current ISO datetime. The lane disappears from default `list` output and is skipped by the dashboard and calendar renderers. Entries that reference the archived lane are not modified — they keep their `lane` field and continue to resolve via the lane config on disk.
   - **`restore <id>`** removes `archivedAt`. The lane reappears in `list` output and is rendered again.
   - **`purge <id>`** deletes the JSON file. REFUSED when any entry still references the lane (see Error handling). When refused, the operator must `lane move <slug> --to <other>` each dependent entry first.
   - **`move <slug-or-uuid> --to <lane-id> [--target-stage <name>]`** updates the entry's `lane` and `currentStage` fields and relocates the artifact + scrapbook on disk. Defaults `--target-stage` to the target lane's first `linearStages` entry; pass `--target-stage <name>` to override (must be in the target template's `linearStages ∪ offPipelineStages`). The entry's `iterationByStage` counters are preserved verbatim — no stage-name remapping.

### Defaults

- `lane list` excludes archived lanes by default. Pass `--include-archived` for the full set.
- `lane create --name <label>` defaults to the lane id when omitted.
- `lane move --target-stage <name>` defaults to the target lane's first `linearStages` entry.

### Error handling

- **`create <id>` when the file already exists.** Refused with `Cannot create lane "<id>": file already exists at <path>.` Pointer: use `lane update` to modify the existing lane.
- **`create <id>` with an unknown pipeline template.** Refused with `pipelineTemplate "<id>" does not resolve` and the loader's underlying error (which lists the searched paths).
- **`update <id>` with no patch flags.** Refused with `no patch fields supplied. Pass at least one of --name, --template, --content-dir.`
- **`update <id>` with an unknown pipeline template.** Refused with the same shape as `create`.
- **`archive <id>` when already archived.** Refused with `already archived (archivedAt=<timestamp>).`
- **`restore <id>` when not archived.** Refused with `not archived (no archivedAt field).`
- **`purge <id>` while entries reference the lane.** Refused with `<N> entr{y,ies} reference it (<slug1>, <slug2>, ...). Move each entry to another lane with "deskwork lane move <slug> --to <other>" before purging.` The first five dependent slugs are listed; a `+N more` suffix appears when there are additional dependents. `--force` is intentionally NOT supported — the operator must move each entry out first so no entry is orphaned.
- **`move <slug> --to <id>` to the same lane.** Refused with `already in lane "<id>".`
- **`move <slug> --to <id>` into an archived lane.** Refused with `Cannot move entry <slug> into archived lane "<id>". Restore the lane first via "deskwork lane restore <id>".`
- **`move <slug> --target-stage <name>` with a stage not in the target template.** Refused with the allowed-stages list (`Allowed stages: <linear> ∪ <off-pipeline>`).
- **`move <slug>` when the source artifact does not exist on disk.** Refused with `source artifact does not exist at <path>. Repair the binding (e.g. via "deskwork doctor") before moving.`
- **`move <slug>` when the target artifact path already exists.** Refused with `target artifact already exists at <path>. The target lane already holds a file at the same relative path; resolve the collision (rename / move / remove) before running lane move.`

### Safety rules

- **Archive is the preferred disposition for retired lanes**, not purge. Per the project's content-management rule, the database remembers terminal states; `purge` exists only for genuinely-no-history cases (lanes created in error). The dashboard and calendar renderers skip archived lanes automatically.
- **`move` is the only verb that touches entries.** The other seven verbs operate on lane config files only; entries that reference a lane are left untouched (including when the lane is archived).
- **`purge` refusal lists are the audit signal.** Don't grep around for who-references-the-lane; the CLI does the audit and lists the slugs.
