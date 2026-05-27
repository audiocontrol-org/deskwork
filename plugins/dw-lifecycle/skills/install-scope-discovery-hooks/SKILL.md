---
name: install-scope-discovery-hooks
description: "Wire a pre-commit hook that runs the scope-discovery gate chain (clones, anti-patterns, adopters, refactor-preconditions, editor-symmetry)"
---

# /dw-lifecycle:install-scope-discovery-hooks

Wire a project pre-commit hook that runs the scope-discovery gate chain on every commit. The hook is non-short-circuiting: each gate's failure increments a counter, the hook only exits 1 after every gate has run so the operator sees the full picture in one commit attempt rather than fixing one failure and discovering the next on the retry.

Detects the project's hook layout: `.husky/` directory or `package.json` listing `husky` routes the hook into `.husky/pre-commit`; an existing `.githooks/pre-commit` requires `--merge` (append managed block) or `--replace` (overwrite); neither present is the fresh-githooks path (`.githooks/pre-commit` + `git config core.hooksPath .githooks`).

## Steps

1. Confirm the target project (defaults to `cwd`); confirm `.dw-lifecycle/scope-discovery/` has been bootstrapped via `/dw-lifecycle:install-scope-discovery` (or that the operator authored the registries by hand).
2. Shell out to the helper:

```
dw-lifecycle install-scope-discovery-hooks \
    [--target <path>] [--merge] [--replace] [--force] [--dry-run]
```

The helper:
   - Auto-detects Husky (via `.husky/` dir or `package.json` dependency).
   - Honors `--merge` / `--replace` / `--force` when an existing `.githooks/pre-commit` is present (default: refuse).
   - Writes the managed block delimited by `# >>> dw-lifecycle scope-discovery hook >>>` / `# <<< dw-lifecycle scope-discovery hook <<<` markers so subsequent re-runs are idempotent.
   - Records each managed file in `.dw-lifecycle/scope-discovery/hooks-installed.json` with timestamp, installer version, husky_detected flag, path, and sha256.

3. Report: the resolved mode (`fresh-githooks` / `husky` / `merge-githooks` / `replace-githooks`), the per-action list, and the manifest path.

## Gate chain wired by the hook

| Gate | Behavior |
|---|---|
| `dw-lifecycle check-clones --gate-mode` | Exit 1 if a NEW clone group surfaces (not yet dispositioned in `clones.yaml`). Pre-Phase-6 installations have `dw-lifecycle detect-clones --gate-mode` in the chain; the legacy alias still works. Re-run `/dw-lifecycle:install-scope-discovery-hooks --replace` to migrate the hook to the canonical `check-clones` name. |
| `dw-lifecycle check-anti-patterns --gate-mode` | Exit 1 on any anti-pattern match. |
| `dw-lifecycle check-adopters --gate-mode` | Exit 1 on adopter-manifest holdouts (files that should use a canonical primitive but don't). |
| `dw-lifecycle check-disposition-survivor` | Exit 1 if a previously-dispositioned clone has reverted to `pending`. |
| `dw-lifecycle check-editor-symmetry --gate-mode` | Exit 1 on editor-symmetry violations. Runs only if `adopter-manifests.yaml` is present. |

## Flags

| Flag | Meaning |
|---|---|
| `--target <path>` | Override the target project root. Default: `process.cwd()`. |
| `--merge` | Append the managed block to an existing `.githooks/pre-commit`. |
| `--replace` | Overwrite an existing `.githooks/pre-commit`. |
| `--force` | Synonym for `--replace`. |
| `--dry-run` | Print the plan; do not write. |
| `--help`, `-h` | Show help. |

## Error handling

- **Existing hook + no flag.** Helper exits 2 with instructions: pass `--merge` to append, `--replace` / `--force` to overwrite, or remove the existing file first.
- **Target not a git repo.** Helper exits 2 when the fresh-githooks path tries to set `core.hooksPath`; the operator runs `git init` first.
- **Husky detected but `.husky/` not writable.** Helper exits 2 with the OS-level error; the operator fixes permissions and re-runs.

## When to use

Run after `/dw-lifecycle:install-scope-discovery` and after the operator has authored at least one registry. The hook chain runs on every commit thereafter; commits that fail a gate are rejected until the violations are addressed (or explicitly dispositioned via `/dw-lifecycle:dispose-clone` or `/dw-lifecycle:batch-dispose`). To remove the hook later, run `/dw-lifecycle:uninstall-scope-discovery-hooks`.
