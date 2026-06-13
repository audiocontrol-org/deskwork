---

> **RETIRED.** `dw-lifecycle` has been superseded by `stack-control`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

# /dw-lifecycle:install-shortcuts

Install user-level slash-command shortcuts for `/dw-lifecycle:*` commands. This writes shim files into `~/.claude/commands/<shim>.md` that forward to the namespaced `/dw-lifecycle:<command>` form, so the operator can type `/dw-implement` (or whichever scheme they picked) instead of `/dw-lifecycle:implement`.

This skill is opt-in. It is the documented workaround for Claude Code's mandatory `/<plugin>:` prefix on plugin commands — see upstream [anthropics/claude-code#15882](https://github.com/anthropics/claude-code/issues/15882) and [#23589](https://github.com/anthropics/claude-code/issues/23589). The feature retires when the first-class alias mechanism in #23589 lands.

## Steps

1. **Confirm the operator wants shortcuts installed.** This writes to `~/.claude/commands/` — a user-global namespace shared by every Claude Code session on this machine.

2. **Render the three naming schemes for the operator to pick from:**

   | Scheme | Pattern | Example mappings | Trade-off |
   |---|---|---|---|
   | **A** | 2-letter `dw<initial>` w/ disambiguation suffixes | `dwi` (implement), `dws` (setup), `dwsh` (ship), `dwss` (session-start), `dwd` (define), `dwr` (review) | Terse but cryptic; ~half need disambiguation suffixes |
   | **B** | 3-letter `dw-<2-char>` | `dw-im`, `dw-se`, `dw-sh`, `dw-ss`, `dw-de`, `dw-re` | Regular pattern, zero collisions, hyphen makes prefix readable |
   | **C** | `dw-<verb>` (default) | `dw-implement`, `dw-setup`, `dw-ship`, `dw-session-start`, `dw-define`, `dw-review` | Verbose but self-documenting; preserves discoverability |

   Default is **C** unless the operator picks otherwise.

3. **Invoke the CLI helper** with the operator-picked scheme:

   ```
   dw-lifecycle install-shortcuts --scheme=<A|B|C>
   ```

   Useful flags:
   - `--dry-run` — print intended writes without touching the filesystem. Run this first if the operator wants to preview.
   - `--rename <prefix>` — replace the scheme's default prefix (`dw-` for B/C, `dw` for A) with a custom one. Example: `--scheme=C --rename=mt` produces `mt-implement`, `mt-setup`, etc. The prefix must be lowercase alphanumeric with optional internal dashes (must start and end with an alphanumeric character).
   - `--force` — overwrite any **foreign** shim file (not previously installed by this plugin) at a colliding path. The helper refuses by default if a colliding file isn't part of a prior dw-lifecycle install.
   - `--replace` — if a prior dw-lifecycle shortcut install exists (manifest at `~/.claude/commands/.dw-lifecycle-shortcuts.json`), uninstall it first before installing the new scheme. Without `--replace`, a prior install is treated as a collision and the helper refuses.

4. **Surface the result** to the operator. The helper prints a JSON report listing each shim written and the manifest path. Quote it back briefly:
   - How many shims were installed
   - Which scheme
   - Manifest path (`~/.claude/commands/.dw-lifecycle-shortcuts.json`)
   - One example shortcut (e.g. `/dw-implement` forwards to `/dw-lifecycle:implement`)
   - The uninstall hint: `Run /dw-lifecycle:uninstall-shortcuts to remove all shortcuts and the manifest cleanly.`

## Error handling

- **Foreign file collision (exit 2).** A file at `~/.claude/commands/<target>.md` exists and is not part of a prior dw-lifecycle install. The helper lists the offending paths and refuses. Options:
  - Inspect each colliding file with the operator and decide whether to keep or overwrite.
  - Re-run with `--force` to overwrite.
  - Re-run with a different `--rename <prefix>` to avoid the collision entirely.
- **Prior dw-lifecycle manifest (exit 2).** A prior install exists. Options:
  - Re-run with `--replace` to migrate to the new scheme cleanly.
  - Run `/dw-lifecycle:uninstall-shortcuts` first if the operator wants the prior install gone before deciding.
- **Invalid `--rename` prefix (exit 1).** The prefix must match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` — lowercase alphanumeric with optional internal dashes, must start and end with an alphanumeric character. Pathological inputs like `-`, `--`, `-mt`, `mt-` are rejected.

## Manifest

The helper writes `~/.claude/commands/.dw-lifecycle-shortcuts.json` recording the scheme picked, the rename prefix (if any), the plugin version that wrote the install, and the list of shim files. The manifest is what `/dw-lifecycle:uninstall-shortcuts` reads to roll back cleanly. **Do not edit the manifest by hand** — it would put the uninstall into drift-refusal mode.
