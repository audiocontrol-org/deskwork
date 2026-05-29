---
name: pipeline
description: CRUD on pipeline templates — list, show, create, update, delete. Pipeline templates define the per-pipeline stage vocabulary lanes bind to. Plugin presets (editorial, blog-post, feature-doc, qa-plan, visual) are read-only; project overrides live at .deskwork/pipelines/<id>.json and take precedence at load time.
---

## Pipeline — manage pipeline templates

A **pipeline template** names a pipeline's linear stages (the ordered list that captures the artifact's lifecycle), its `lockedStages` (pre-terminal review-freeze stops on the linear path), and its `offPipelineStages` (cul-de-sacs like `Blocked`, `Cancelled`, `Archived`). Each **lane** binds to exactly one pipeline template via the lane's `pipelineTemplate` field.

Pipeline templates resolve in two tiers:

- **Plugin presets** — `editorial`, `blog-post`, `feature-doc`, `qa-plan`, `visual` — ship with `@deskwork/core` and are read-only. Operators cannot mutate or delete them.
- **Project overrides** — JSON files at `<projectRoot>/.deskwork/pipelines/<id>.json`. Override an existing preset by id (`editorial` here masks the bundled `editorial`), or invent a brand-new id. Loaders prefer the override when both exist.

The `pipeline` verb is a CRUD family. Five subcommands cover the template lifecycle from creation through stage-by-stage mutation to deletion (with mandatory lane-reassignment when entries depend on the template).

### Subcommands

| Verb | Purpose |
|---|---|
| `list` | enumerate visible templates (presets + overrides). `--full` adds stage counts + source |
| `show <id>` | print a single resolved template's JSON |
| `create <id>` | write a new project-override template (the `--shape` flag carries the linear-stage list) |
| `update <id>` | mutate a project-override template via one of five mutually-exclusive operation flags |
| `delete <id>` | remove a project-override template (refused unless either no lane references it, or `--reassign-lanes-to <other-id>` is passed) |

### Input

```
/deskwork:pipeline list [--full]
/deskwork:pipeline show <id>
/deskwork:pipeline create <id> --shape "<s1>,<s2>,..." [--name <label>] [--description <text>]
/deskwork:pipeline update <id> --add-stage <name> [--position N]
/deskwork:pipeline update <id> --rename-stage <from> --to-stage <to>
/deskwork:pipeline update <id> --remove-stage <name>
/deskwork:pipeline update <id> --set-locked "<s1>,<s2>,..."
/deskwork:pipeline update <id> --set-off-pipeline "<s1>,<s2>,..."
/deskwork:pipeline delete <id> [--reassign-lanes-to <other-id>]
```

### Steps

1. Resolve the operator-supplied pipeline id.
2. Run the matching subcommand via `deskwork pipeline <verb> [args...]`:

   - **`list`** enumerates every visible template id (presets unioned with overrides; override-takes-precedence). The default shape emits ids only. Pass `--full` to load each template and emit id + name + source (`project-override` | `plugin-preset`) + linear / locked / off-pipeline stage counts. A malformed override JSON surfaces as a load-time error rather than silently disappearing from the list.

   - **`show <id>`** loads the resolved template (project override if present, plugin preset otherwise) and emits the JSON shape — id, name, description, linearStages, lockedStages, offPipelineStages — plus the `source` flag.

   - **`create <id> --shape "<s1>,<s2>,..."`** writes a brand-new project-override template at `<projectRoot>/.deskwork/pipelines/<id>.json`. `--shape` accepts a comma-separated list of stage names; the order is the linear pipeline order. `--name <label>` defaults to the id, `--description <text>` defaults to a generic "Custom pipeline <id>" string. `lockedStages` and `offPipelineStages` start empty; the `update` verb populates them.

   - **`update <id>`** mutates a project-override template. Exactly ONE operation flag per invocation:
     - `--add-stage <name> [--position N]` — insert `<name>` into `linearStages` at zero-based position `N` (default = end). Refused when `<name>` already exists anywhere on the template.
     - `--rename-stage <from> --to-stage <to>` — rename `<from>` to `<to>` wherever it appears (linearStages, lockedStages, offPipelineStages). Refused when `<from>` doesn't exist or `<to>` already exists. Appends a `{from, to, at}` migration entry to `<projectRoot>/.deskwork/pipelines/<id>-renames.json` (doctor — Phase 6 Task 6.5 — reads this for affected-entry remediation).
     - `--remove-stage <name>` — remove `<name>` from whichever list contains it. Refused when any entry's `currentStage` references `<name>` AND that entry's lane binds to this template. Refused when removing would leave `linearStages` empty.
     - `--set-locked "<s1>,<s2>,..."` — replace `lockedStages` wholesale. All entries must be in `linearStages`.
     - `--set-off-pipeline "<s1>,<s2>,..."` — replace `offPipelineStages` wholesale. No entry may already be in `linearStages` (a stage is either linear OR off-pipeline, not both).

   - **`delete <id>`** removes a project-override template JSON. Refused for plugin presets (use `customize pipeline <id>` to create an override instead). Refused when any lane has `pipelineTemplate === <id>`, unless `--reassign-lanes-to <other-id>` is passed — in which case every dependent lane is re-bound to `<other-id>` (which must itself resolve) before the doomed JSON is unlinked. Stage compatibility between the old and new template is the operator's problem; doctor surfaces entries whose `currentStage` isn't valid on the new template.

### Defaults

- `pipeline list` emits ids only by default. `--full` adds stage counts + source.
- `pipeline create --name` defaults to the id when omitted.
- `pipeline create --description` defaults to a generic "Custom pipeline <id>" string when omitted.
- `pipeline create` leaves `lockedStages` and `offPipelineStages` empty; the `update` verb adjusts them.
- `pipeline update --add-stage --position` defaults to the end of `linearStages`.

### Error handling

- **`create <id>` when `<id>` collides with a plugin preset.** Refused with a pointer to `deskwork customize pipeline <id>` (which copies the preset into the project for operator editing).
- **`create <id>` when a project override already exists.** Refused with a pointer to `deskwork pipeline update <id>` (or move the existing file aside first).
- **`create <id>` with an empty or blank-entry `--shape`.** Refused with the usage hint.
- **`create <id>` whose stage list fails Zod validation** (duplicate stages, `Cancelled` in `linearStages`, stage-name tokens that collide, etc.). Refused with the schema's per-issue error list.
- **`update <id>` against a plugin preset (no override).** Refused with a pointer to `deskwork customize pipeline <id>` to create an override first.
- **`update <id>` with zero or multiple operation flags.** Refused (exit 2) — exactly one of `--add-stage`, `--rename-stage`, `--remove-stage`, `--set-locked`, `--set-off-pipeline`.
- **`update <id> --rename-stage <from>` without `--to-stage <to>`.** Refused (exit 2).
- **`update <id> --add-stage <name>` when `<name>` already exists.** Refused.
- **`update <id> --rename-stage <from> --to-stage <to>` when `<from>` doesn't exist.** Refused with the list of known stages.
- **`update <id> --rename-stage` when `<to>` already exists.** Refused.
- **`update <id> --remove-stage <name>` when entries reference the stage** (their `currentStage === <name>` AND their lane binds to this template). Refused with the list of offender slugs (first 5 + `+N more` suffix). The operator must induct each entry to another stage before retrying.
- **`update <id> --remove-stage <name>` when removing would empty `linearStages`.** Refused.
- **`update <id> --set-locked <stages>` with a stage not in `linearStages`.** Refused (lockedStages must be a subset of linearStages).
- **`update <id> --set-off-pipeline <stages>` overlapping `linearStages`.** Refused (a stage is either linear OR off-pipeline).
- **`delete <id>` against a plugin preset.** Refused with a pointer to `customize pipeline <id>`.
- **`delete <id>` when no project override exists.** Refused with the searched path.
- **`delete <id>` when lanes reference the template (no `--reassign-lanes-to`).** Refused with the list of dependent lane ids (first 5 + `+N more` suffix) and pointers to (a) `deskwork lane update <lane> --template <other>` (per-lane), (b) the forcing `--reassign-lanes-to <other-id>` (batch rebind).
- **`delete <id> --reassign-lanes-to <other-id>` where `<other-id>` doesn't resolve.** Refused with the loader's underlying error.
- **`delete <id> --reassign-lanes-to <id>` (same id).** Refused.

### Safety rules

- **Plugin presets are immutable.** The five built-in presets (`editorial`, `blog-post`, `feature-doc`, `qa-plan`, `visual`) cannot be edited or deleted directly. The `customize pipeline <id>` skill copies the preset into the project; subsequent `pipeline update` / `pipeline delete` operates on the project copy.
- **Stage rename writes a migration sidecar.** Each `--rename-stage` invocation appends an entry to `<id>-renames.json` alongside the template. Doctor (Phase 6 Task 6.5) consumes the file to identify entries whose `currentStage` still uses the old stage name. The migration sidecar is append-only; deleting it loses the audit trail.
- **`delete` is the rarely-used corner case.** Per the project's content-management rule, prefer keeping the template in place (entries' `currentStage` values remain valid). Delete is for genuinely-no-history templates created in error. When there IS history (active lanes), the operator must rebind every dependent lane first — either per-lane via `lane update` or in batch via `--reassign-lanes-to`.
- **Stage compatibility is the operator's problem on `--reassign-lanes-to`.** Re-binding lanes does NOT rewrite each entry's `currentStage`. If the new template lacks a stage that an existing entry occupies, doctor surfaces the mismatch on the next audit; the operator inducts each affected entry to a valid stage.
- **`customize pipeline <id>` is the convenience wrapper.** When the goal is "I want to tweak the editorial preset," the right entry point is `deskwork customize pipeline editorial` (which copies the preset to the project, where `pipeline update` then mutates it). `pipeline create` is for brand-new operator-authored pipelines with no preset basis.
