---
name: install-drift
description: "Advisory check (stackctl install-drift) that warns — non-blocking — when a project's locally-sourced .specify Spec Kit extension copies (deskwork-governance, spec-governance) have drifted from the plugin's source of truth after a marketplace update; an in-sync copy is silent"
---

# /stack-control:install-drift

Thin adapter over the `stackctl install-drift` verb. When a project carries local `.specify/extensions/<name>/` copies of the Spec Kit extensions this plugin ships, those copies can silently fall behind the plugin source across a marketplace update. This check compares each installed extension copy to its plugin source file-by-file (content hash) and **warns** when they diverge. It never blocks — exit code is always 0.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook.

## When to use

- After a plugin marketplace update, to confirm the local `.specify` extension copies match the new plugin source.
- During session-start health checks (the native session-start surface calls this verb when it lands).

## Steps

1. Run from the project root:

   ```bash
   stackctl install-drift                       # checks the current project
   stackctl install-drift --project-root <path> # check a specific project
   ```

2. Read the output:
   - **In sync** → a single summary line, no warnings.
   - **Drifted** → a `WARNING` per extension naming the changed/missing files. This is advisory; re-run the plugin install to refresh the local copies.

## Notes

- Only files that are part of the plugin source set (under `plugins/stack-control/spec-kit/<name>/`) are compared. Files the installer generates on top of the source are not flagged.
- The check is intentionally non-blocking: it informs, it does not gate.
