---

> **RETIRED.** `dw-lifecycle` has been superseded by `stack-control`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

# /dw-lifecycle:install-scope-discovery

Scaffold the project-side `.dw-lifecycle/scope-discovery/` config directory in the adopting project. The bootstrap copies operator-facing templates from the plugin (README, LAYOUT, refactor-preconditions-checklist, .jscpd.json) and seeds the three operator-curated registries (`clones.yaml`, `anti-patterns.yaml`, `adopter-manifests.yaml`) with empty arrays so the parsers and schemas accept them out of the box.

Idempotent by design: re-running against an already-populated tree is a no-op (per-file "already present" report). `--force` overwrites everything; `--dry-run` plans without writing.

## Steps

1. Confirm the target project (defaults to `cwd`). Override with `--target <path>` for cases where the operator is dispatching from outside the project root.
2. Shell out to the helper:

```
dw-lifecycle install-scope-discovery [--target <path>] [--force] [--dry-run]
```

The helper:
   - Creates `<target>/.dw-lifecycle/scope-discovery/` if absent.
   - Copies the four bundled templates from `plugins/dw-lifecycle/templates/scope-discovery/` into the config dir.
   - Writes empty-array seeds for `clones.yaml`, `anti-patterns.yaml`, `adopter-manifests.yaml`.
   - Reports per-file actions (`created` / `overwritten` / `skipped`) to stdout.

3. Report: the resolved target, the seven files written or skipped, and the summary counts.

## Flags

| Flag | Meaning |
|---|---|
| `--target <path>` | Override the target project root. Default: `process.cwd()`. |
| `--force` | Overwrite files that already exist. Default: skip with a per-file "already present" note. |
| `--dry-run` | Print the planned actions; do not write to disk. |
| `--help`, `-h` | Show help. |

## Error handling

- **Built-in template missing.** Helper exits 2 with the resolved template path in the error message. Either the plugin install is corrupted (reinstall) or a packaging defect — file an issue.
- **Target directory write failure.** Helper exits 2 with the OS-level error message. Common causes: insufficient permissions, read-only filesystem.
- **Pre-existing files.** Without `--force`, existing files are skipped, the rest are written, exit 0. The skipped files are listed with reason `already present`.

## When to use

Run `install-scope-discovery` once per adopting project as part of the protocol's onboarding. After this, the operator authors the registries (anti-patterns, adopter-manifests, clones baseline via `dw-lifecycle refresh-clones-baseline`). No additional install step is needed for the enforcement chain — per the Phase 24 no-git-hook-enforcement contract (see `docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md` + `.claude/rules/enforcement-lives-in-skills.md`), the structural chain + Step 0 + audit-barrage discipline ship in the skill bodies (`/dw-lifecycle:session-start`, `/dw-lifecycle:implement`, `/dw-lifecycle:session-end`, `/dw-lifecycle:review`) that adopters get from `claude plugin install`. The pre-Phase-24 `install-scope-discovery-hooks` + `install-agent-prompts` verbs were retired.
