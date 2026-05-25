---
name: scope-inventory
description: "Fan parallel discovery agents over a feature's PRD + module-root and emit a validated scope-manifest.yaml"
---

# /dw-lifecycle:scope-inventory

Inventory the surfaces a feature will touch BEFORE implementation begins. Fans the four universal discovery agents (UI route enumerator, pattern matrix, clone-detector reader, PRD-themed pattern hunter) plus any Phase 4 config-activated agents (regime-holdout detector, editor-symmetry scanner, adopter-manifest checker) in parallel and writes a schema-validated `scope-manifest.yaml` plus per-agent evidence JSON. The manifest is the source of truth the implementer reads before writing code.

## Steps

1. Confirm the feature `slug` (required) and the PRD path (defaults to `docs/<v>/001-IN-PROGRESS/<slug>/prd.md`).
2. Identify the module-root the scan should walk. Default is `src/`; override with `--module-root` when the project's source tree lives elsewhere.
3. Shell out to the helper. Run from the worktree root (the helper resolves config relative to it):

```
dw-lifecycle scope-inventory <slug> [--prd-path <path>] [--module-root <path>] \
                                    [--out <path>] [--evidence-trail]
```

The helper:
   - Fans the four universal agents in parallel.
   - Checks Phase 4 gate files (`.dw-lifecycle/scope-discovery/{anti-patterns,adopter-manifests,editor-symmetry.md}`) and activates the relevant config-driven agents only when their activator file is present — agents not activated pay zero scan cost.
   - Runs the synthesis pass in-process, dedupes `(file, id)` cross-cuts, and renders the strawman manifest.
   - Validates the manifest against `scope-manifest.yaml.schema.json` before writing.
   - Writes the manifest to `--out` (default: `docs/<v>/001-IN-PROGRESS/<slug>/scope-manifest.yaml`) and emits per-agent JSON + a `synthesis.md` digest under `scope-inventory/runs/<stamp>-<runId>/` when `--evidence-trail` is set.

4. Report: the manifest path, the modules emitted, the agents that ran (with skipped agents listed by name), and any synthesis warnings.

## Flags

| Flag | Meaning |
|---|---|
| `--slug <slug>` | Feature slug (kebab-case). Required when not embedded in the positional argument. |
| `--module-root <path>` | Source-tree root for code-emitting agents. Defaults to `src/`. |
| `--out <path>` | Manifest output path. Defaults to `docs/<v>/001-IN-PROGRESS/<slug>/scope-manifest.yaml`. |
| `--prd-path <path>` | PRD location for the PRD-themed pattern hunter. Defaults to the canonical feature PRD path. |
| `--evidence-trail` | Persist per-agent JSON + synthesis digest under `scope-inventory/runs/<stamp>-<runId>/` for replay + audit. |

## Error handling

- **Module-root absent.** Helper aborts: name a real path via `--module-root`, or scaffold the directory before re-running.
- **PRD missing.** PRD-themed pattern hunter cannot tokenize. Helper aborts; create the PRD or pass an explicit `--prd-path`.
- **Schema validation fails.** The synthesis produced a manifest the validator rejected. Helper aborts without writing; the failing keypath is reported so the agent author can fix the upstream schema-typed code, not the manifest.
- **Router strategy ambiguous.** The UI route enumerator detected two competing router signatures (e.g. React-Router + Next.js). Helper aborts asking the operator to disambiguate; configure a single strategy via `customize` or remove the contender. Additional default router strategies (Vue / Next / SvelteKit) are tracked at [#286](https://github.com/audiocontrol-org/deskwork/issues/286).

## When to use

Run scope-inventory once per feature, immediately after `/dw-lifecycle:setup` produces the PRD. The manifest the protocol writes is the single artifact the implementer consults for "what surfaces does this feature touch?" — answering that question by hand is the failure mode the protocol was built to prevent. Re-run scope-inventory when the PRD's scope changes substantially (new themes, new module-roots) so the manifest stays the source of truth.
