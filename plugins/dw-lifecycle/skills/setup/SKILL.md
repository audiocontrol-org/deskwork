---
name: dw-lifecycle:setup
description: "Create branch + worktree + version-aware docs/<v>/<status>/<slug>/ + populate PRD/workplan/README"
user_invocable: true
---

# /dw-lifecycle:setup

Provision a new feature: branch, worktree, status-organized docs directory, and scaffolded PRD/workplan/README from templates.

## Steps

1. Confirm `slug` (kebab-case) and target version (defaults to `config.docs.defaultTargetVersion`).
2. Invoke `superpowers:using-git-worktrees` for branch + worktree creation. The worktree path follows `config.worktrees.naming`.
3. Invoke `superpowers:writing-plans` to generate the workplan content from the feature definition (if `--definition <path>` given) or from a fresh design conversation. The output is the body of `workplan.md`.
4. Shell out to the helper:

```
dw-lifecycle setup <slug> [--target <version>] [--title <title>] [--definition <path>]
```

The helper:
   - Creates `docs/<version>/<status>/<slug>/` in the new worktree
   - Renders templates (`prd.md`, `workplan.md`, `README.md`) with placeholder substitution
   - Records the target version in frontmatter so it travels with the feature

5. Report: branch name, worktree path, docs directory, files scaffolded.

## Error handling

- **Branch already exists.** Helper aborts. Operator picks a different slug or checks out the existing branch manually.
- **Doc directory already exists.** Helper aborts. Never overwrites — investigate the existing directory first.
- **Version directory missing.** Helper creates it atomically. `/dw-lifecycle:doctor` flags any version directories present in the file tree but absent from `config.docs.knownVersions`.
