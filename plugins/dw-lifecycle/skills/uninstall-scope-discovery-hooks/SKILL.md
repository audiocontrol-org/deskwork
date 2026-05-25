---
name: uninstall-scope-discovery-hooks
description: "Reverse install-scope-discovery-hooks and install-agent-prompts; drift-check before removing managed files"
---

# /dw-lifecycle:uninstall-scope-discovery-hooks

Remove the pre-commit hook and Step 0 agent-prompt mirrors that the install commands wrote. Reads the shared manifest at `.dw-lifecycle/scope-discovery/hooks-installed.json`, drift-checks each managed file (recomputed sha256 vs. manifest), and removes the file (or strips the managed block when the file contains other operator-authored content).

Drift refusal is the default: if the file has been modified post-install, the uninstall command refuses to remove it unless `--force-uninstall` is passed. This prevents accidental loss of operator edits inside or adjacent to the managed block.

## Steps

1. Confirm the target project (defaults to `cwd`); confirm `.dw-lifecycle/scope-discovery/hooks-installed.json` exists.
2. Shell out to the helper:

```
dw-lifecycle uninstall-scope-discovery-hooks \
    [--target <path>] [--force-uninstall] [--dry-run]
```

The helper:
   - Loads the manifest, iterates each managed file record.
   - For each file: recomputes sha256, compares against the manifest entry.
   - On match: strips the managed block (delimited by markers) or deletes the whole file if the block is the entire content.
   - On drift: skips with reason `skipped-drift` (exit 2 at the end of the run unless every drifted file was successfully handled under `--force-uninstall`).
   - Best-effort unsets `git config core.hooksPath` when it points at `.githooks` and the fresh-githooks install is being removed.
   - Removes the manifest only when EVERY entry landed on a clean disposition (`removed-file`, `stripped-block`, or `skipped-missing`).

3. Report: per-file action and the final manifest disposition.

## What the markers identify

| File type | Begin marker | End marker |
|---|---|---|
| Hook (`.githooks/pre-commit`, `.husky/pre-commit`) | `# >>> dw-lifecycle scope-discovery hook >>>` | `# <<< dw-lifecycle scope-discovery hook <<<` |
| Agent prompt (`.claude/agents/*.md`) | `<!-- dw-lifecycle:scope-discovery:step-0:begin -->` | `<!-- dw-lifecycle:scope-discovery:step-0:end -->` |

Operator-authored content above or below the markers is preserved; only the block between (and the markers themselves) are removed.

## Flags

| Flag | Meaning |
|---|---|
| `--target <path>` | Override the target project root. Default: `process.cwd()`. |
| `--force-uninstall` | Remove files even when sha256 drift is detected. Use sparingly; the drift may be a legitimate operator edit you want to preserve. |
| `--dry-run` | Print the plan; do not modify anything. |
| `--help`, `-h` | Show help. |

## Error handling

- **No manifest.** Helper exits 2 with `no hooks-installed.json manifest at <path>; nothing to uninstall. If you installed by hand, remove the files manually.`
- **Drift detected without `--force-uninstall`.** Helper exits 2; the drifted file stays in place, the rest are removed cleanly, and the manifest is left in place. Re-run with `--force-uninstall` after inspecting the drift.
- **Missing file (already absent).** Reported as `skipped-missing`; counts toward the clean-disposition check (the operator may have removed the file by hand before running uninstall).

## When to use

Run when removing the scope-discovery enforcement chain from a project — typically when the protocol is being retired, when migrating to a different tooling stack, or when re-installing fresh after upgrading the plugin to a version with breaking changes. After a clean uninstall, `/dw-lifecycle:install-scope-discovery-hooks` and `/dw-lifecycle:install-agent-prompts` can be re-run to re-establish the chain.
