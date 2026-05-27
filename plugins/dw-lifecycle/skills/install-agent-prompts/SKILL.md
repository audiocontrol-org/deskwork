---
name: install-agent-prompts
description: "Append the Step 0 refactor-precondition verification fragment to .claude/agents/code-reviewer.md and codebase-auditor.md"
---

# /dw-lifecycle:install-agent-prompts

Append the canonical Step 0 — refactor-precondition verification fragment to the adopting project's `.claude/agents/code-reviewer.md` and `.claude/agents/codebase-auditor.md` files. The fragment instructs sub-agents to run `dw-lifecycle check-refactor-preconditions` / `dw-lifecycle check-anti-patterns --gate-mode` before reviewing a diff, so refactor commits with missing Step 0a/0b fields surface at review time rather than post-merge.

Idempotent: an already-installed fragment is detected via HTML-comment marker pair and the installer skips. The installer REFUSES to auto-create agent files — `.claude/agents/` is operator-owned content; the install command augments, never bootstraps.

## Steps

1. Confirm the target project (defaults to `cwd`).
2. Confirm `.claude/agents/code-reviewer.md` and `.claude/agents/codebase-auditor.md` already exist. The installer does NOT create these files; the operator must author them first (or follow the Claude Code documentation for adding standard agent definitions).
3. Shell out to the helper:

```
dw-lifecycle install-agent-prompts \
    [--target <path>] [--merge] [--force] [--dry-run]
```

The helper:
   - Reads the canonical fragment from `plugins/dw-lifecycle/templates/scope-discovery/agent-step-0-fragment.md`.
   - Detects the fragment markers in each target file; appends only if not already present.
   - Records each appended file in `.dw-lifecycle/scope-discovery/hooks-installed.json` (shared manifest with `install-scope-discovery-hooks`).

4. Report: per-file action (`appended` / `skipped` / `missing`) and the manifest path.

## The fragment

The Step 0 fragment instructs the sub-agent to:

1. Detect changes to `.dw-lifecycle/scope-discovery/clones.yaml` and run `dw-lifecycle check-refactor-preconditions`. Each finding becomes a review comment.
2. Detect diffs that look like refactors but have no `clones.yaml` update; ask the author to run `dw-lifecycle check-clones`.
3. Detect anti-pattern findings under the diff via `dw-lifecycle check-anti-patterns --gate-mode`.

The fragment defers Step 0 ONLY for pure-docs / pure-comment / version-bump / revert commits. The full text is at `plugins/dw-lifecycle/templates/scope-discovery/agent-step-0-fragment.md`.

## Flags

| Flag | Meaning |
|---|---|
| `--target <path>` | Override the target project root. Default: `process.cwd()`. |
| `--merge` | Re-append even if file already has the fragment (no-op due to marker dedup; semantic clarity for retry runs). |
| `--force` | Synonym for `--merge`. |
| `--dry-run` | Print the plan; do not write. |
| `--help`, `-h` | Show help. |

## Error handling

- **Agent file missing.** Helper exits 2 with `(agent file not present; install-agent-prompts does not auto-create files in .claude/agents/...)`. Create the file first (operator-owned), then re-run.
- **Built-in fragment missing.** Helper exits 2 — plugin install is corrupted; reinstall.
- **Write failure.** Helper exits 2 with the OS-level error.

## When to use

Run once during onboarding after `/dw-lifecycle:install-scope-discovery` and ideally before `/dw-lifecycle:install-scope-discovery-hooks` (the hook chain enforces what the agent prompts will trigger sub-agents to verify). Re-run after upgrading the plugin if the fragment changed; the installer's idempotent marker dedup prevents duplicate blocks.
