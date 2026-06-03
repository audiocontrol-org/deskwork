---
name: migrate-from-pilot
description: "Migrate a scope-discovery pilot project's tools/ + docs/ layout into a dw-lifecycle adopter's .dw-lifecycle/scope-discovery/ config dir; emit a per-file contribute-back-vs-customize-override report"
---

# /dw-lifecycle:migrate-from-pilot

Migrate a scope-discovery pilot project — typically the audiocontrol pilot, but the verb works for any project that ships the canonical pilot layout (`tools/scope-discovery/` + `docs/scope-discovery/`) — into a dw-lifecycle adopter's `.dw-lifecycle/scope-discovery/` config directory.

Two-track behavior:

1. **CONFIG** (YAMLs at `<pilot-root>/docs/scope-discovery/`) is copied verbatim into the adopter tree at `<target>/.dw-lifecycle/scope-discovery/`.
2. **CODE** (TypeScript at `<pilot-root>/tools/scope-discovery/`) is diffed per-file against the plugin defaults shipped under `plugins/dw-lifecycle/src/scope-discovery/`. The verb produces a markdown report that categorizes each pilot file as identical, pilot-ahead (contribute-back candidate), pilot-behind (sync from plugin), or diverges (customize-override candidate). The verb does NOT auto-customize — the operator reads the report and decides which files to push upstream as a contribution and which to land locally via `/dw-lifecycle:customize`.

Default behavior is DRY-RUN — the plan is printed, no files are written. Pass `--apply` to copy CONFIG into the adopter tree.

## Steps

1. Identify the pilot project root. For audiocontrol, that's the repo whose root contains `tools/scope-discovery/` + `docs/scope-discovery/`. For any other pilot, identify the path that mirrors the canonical layout.
2. Confirm the adopter target (defaults to `cwd`). Pass `--target <path>` when dispatching from outside the adopter project root.
3. Shell out to the helper:

```
dw-lifecycle migrate-from-pilot --pilot-root <path> \
                                 [--target <path>] \
                                 [--apply] [--force] \
                                 [--report-out <path>] \
                                 [--quiet]
```

The helper:
   - Refuses if `<pilot-root>/tools/scope-discovery/` is absent (the migration source isn't a scope-discovery pilot).
   - Enumerates CONFIG YAMLs the pilot ships at `docs/scope-discovery/{clones,anti-patterns,adopter-manifests,deprecation-queue}.yaml`. Each present YAML is planned as a copy into the adopter tree; absent YAMLs are skipped with an `absent-on-pilot` note.
   - Diffs each pilot `tools/scope-discovery/<name>.ts` against the plugin default at `plugins/dw-lifecycle/src/scope-discovery/<name>.ts`. Categorizes each file with a status symbol + suggested action.
   - In `--apply` mode, materializes the planned CONFIG copies; in dry-run mode (default), writes nothing.
   - Emits the report to stdout, or to `--report-out <path>` when set.

4. Report: the resolved pilot/target, the CONFIG entries (status + reason), and the CODE diff table (file / status / lines-diff / suggested action).

## Flags

| Flag | Meaning |
|---|---|
| `--pilot-root <path>` | **Required.** Pilot project root containing `tools/scope-discovery/` + `docs/scope-discovery/`. |
| `--target <path>` | Adopter project root where `.dw-lifecycle/scope-discovery/` will be created/updated. Default: `process.cwd()`. |
| `--apply` | Destructive. Copy CONFIG into the adopter tree. Default is dry-run. |
| `--force` | Overwrite existing `<target>/.dw-lifecycle/scope-discovery/<file>.yaml` instead of refusing on divergent target. |
| `--report-out <path>` | Write the markdown report to disk. Default: stdout. Relative paths resolve against `--target`. |
| `--quiet` | Suppress the per-run stderr summary. |
| `--help`, `-h` | Show help. |

## CODE-diff legend

| Symbol | Status | Meaning + suggested action |
|---|---|---|
| ✓ | `identical` | No divergence; nothing to do. |
| ↑ | `pilot-ahead` | Pilot has lines the plugin lacks. **Contribute-back candidate** — file an issue + PR upstream so the plugin defaults absorb the pilot's improvements. |
| ↓ | `pilot-behind` | Plugin has lines the pilot lacks. Pilot is stale relative to the plugin defaults — sync via `/dw-lifecycle:customize scope-discovery <name>` (or simply rely on the plugin defaults, since the adopter doesn't need the pilot version). |
| ≠ | `diverges` | Both sides have unique lines. **Customize-override candidate** — copy the pilot version to `<target>/.dw-lifecycle/scope-discovery/<file>.ts` via `/dw-lifecycle:customize`. |
| + | `pilot-only` | Pilot ships a file the plugin does not. **Contribute-back candidate** for an entirely new module. |
| — | `plugin-only` | Plugin ships a file the pilot does not. Nothing to migrate. |

## Error handling

- **Pilot directory missing.** Helper exits 2 with the resolved path. The pilot root must contain `tools/scope-discovery/`; pass `--pilot-root <path>` pointing at a directory that does.
- **Target conflict refused.** When the adopter already has a `.dw-lifecycle/scope-discovery/<file>.yaml` with content that differs from the pilot's, the helper refuses to overwrite without `--force`. The plan reports `conflict-refused` for each affected file; passing `--apply` without `--force` exits 2.
- **Write failure.** Permission errors / read-only filesystem surface with the OS-level message. Exit 2.

## When to use

Run `migrate-from-pilot` once per pilot adoption. The verb is the bridge from a project that ran scope-discovery via the pilot's `tools/` + `docs/` layout to a project that consumes scope-discovery via the dw-lifecycle plugin. After the migration:

1. **Read the CODE diff report.** Files marked `pilot-ahead` or `pilot-only` are contribute-back candidates — file issues against the dw-lifecycle plugin so its defaults absorb the pilot's improvements. Files marked `diverges` are customize-override candidates — drop them into `<target>/.dw-lifecycle/scope-discovery/<name>.ts` via `/dw-lifecycle:customize` to keep the pilot's behavior locally.
2. **Verify the CONFIG copies.** The verb migrates the operator-curated YAMLs verbatim; no schema migration in v1. If the pilot's schemaVersion differs from the plugin's current schema, `/dw-lifecycle:doctor` flags it via the `scope-discovery-schema-stale` rule with concrete migration steps.
3. **No hook-wiring step needed (post-Phase 24).** The pre-Phase-24 install verbs (`/dw-lifecycle:install-scope-discovery-hooks`, `/dw-lifecycle:install-agent-prompts`) were retired under the no-git-hook-enforcement contract (see `docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md` + `.claude/rules/enforcement-lives-in-skills.md`). The structural chain + Step 0 + audit-barrage discipline now ship in the skill bodies (`/dw-lifecycle:session-start`, `/dw-lifecycle:implement`, `/dw-lifecycle:session-end`, `/dw-lifecycle:review`) the adopter gets from `claude plugin install`. After migration, the operator can pick up `/dw-lifecycle:implement` directly.

The verb is idempotent: re-running with the same pilot + target produces the same plan when nothing has changed on either side. `--apply` is a no-op once CONFIG already matches.
