---
name: uninstall-shortcuts
description: "Remove the user-level slash-command shortcuts for /dw-lifecycle:* commands"
---

# /dw-lifecycle:uninstall-shortcuts

Roll back the install written by `/dw-lifecycle:install-shortcuts`. Reads the manifest at `~/.claude/commands/.dw-lifecycle-shortcuts.json`, drift-checks each shim's on-disk content against the canonical body (`/dw-lifecycle:<command> $ARGUMENTS`), removes the shims, then removes the manifest. The manifest is deleted last as a recovery breadcrumb — if a deletion fails mid-flight, the manifest stays on disk and a re-run picks up where the previous run stopped.

## Steps

1. **Confirm the operator wants the shortcuts removed.** This deletes files in `~/.claude/commands/` — user-global namespace.

2. **Run a dry-run preview first** so the operator sees exactly which files will be removed:

   ```
   dw-lifecycle uninstall-shortcuts --dry-run
   ```

   The helper prints each shim path it would remove plus the manifest path. Touches no files. If drift is detected during the dry-run, the helper still raises the drift refusal — the operator must know that a real run would refuse before they commit.

3. **Invoke the real removal:**

   ```
   dw-lifecycle uninstall-shortcuts
   ```

   Useful flags:
   - `--force-uninstall` — override drift refusal. Use when the operator wants the shims removed even though one or more have been hand-edited. Modified content is overwritten and deleted.

4. **Surface the result** to the operator:
   - How many shims were removed
   - Whether the manifest is gone
   - Any **missing shims** the manifest referenced that weren't on disk (recorded but non-fatal — the operator probably deleted them by hand)
   - Any **drifted shims** if `--force-uninstall` was used (recorded for telemetry — the operator may want to know what they overrode)

## Error handling

- **Drift detected (exit 2).** One or more shim files have been modified since install. The helper lists each drifted path with a brief `expected:` / `actual:` diff. Options:
  - Inspect each drifted file with the operator. If the modifications matter, copy the file elsewhere before continuing.
  - Re-run with `--force-uninstall` to remove the drifted shims anyway.
- **Missing manifest (exit 1).** No prior install exists at `~/.claude/commands/.dw-lifecycle-shortcuts.json`. Nothing to uninstall. The helper says so and exits.
- **Missing shims (not a failure).** The manifest names a shim that isn't on disk. The helper records the missing entry and continues. The operator may have removed the file manually; the manifest cleanup proceeds normally.

## When to use

- The operator wants to switch to a different naming scheme. Run uninstall-shortcuts, then `/dw-lifecycle:install-shortcuts` with the new scheme. (Alternatively, `/dw-lifecycle:install-shortcuts --replace` does both in one shot.)
- Claude Code ships a first-class alias mechanism (per [#23589](https://github.com/anthropics/claude-code/issues/23589)) and the operator wants to retire the shim approach.
- The operator is uninstalling the dw-lifecycle plugin and wants the shortcuts gone too.
