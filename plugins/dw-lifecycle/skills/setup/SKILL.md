---
name: setup
description: "Create branch + worktree + version-aware docs/<v>/<status>/<slug>/ + populate PRD/workplan/README"
---

# /dw-lifecycle:setup

Provision a new feature: branch, worktree, status-organized docs directory, and scaffolded PRD/workplan/README from templates.

## Prerequisite

`/dw-lifecycle:install` must have run successfully on the host project. Setup needs `.dw-lifecycle/config.json` (the project-level config that tells dw-lifecycle where the docs tree lives, what the version-status conventions are, etc.). If the host hasn't been bootstrapped, setup fails with `No .dw-lifecycle/config.json found ... Run /dw-lifecycle:install first.` Run `/dw-lifecycle:install` first; then `/dw-lifecycle:setup` for each feature.

## Steps

1. Confirm `slug` (kebab-case) and target version (defaults to `config.docs.defaultTargetVersion`).
2. *(Optional)* Invoke `superpowers:using-git-worktrees` for branch + worktree creation if the operator wants the worktree pre-created. The branch name MUST be `<config.branches.prefix><slug>` (default `feature/<slug>`); the helper detects and reuses an existing branch+worktree at this name. If you skip this step, the helper creates the branch+worktree itself at `dirname(<main-repo>)/<expanded-config.worktrees.naming>`.
3. Invoke `superpowers:writing-plans` to generate the workplan content from the feature definition (if `--definition <path>` given) or from a fresh design conversation. The output is the body of `workplan.md`.
4. Shell out to the helper. Run from the main worktree OR from the pre-created feature worktree — the helper resolves config from the main worktree either way:

```
dw-lifecycle setup <slug> [--target <version>] [--title <title>] [--definition <path>]
```

The helper:
   - Detects an existing branch+worktree matching `<config.branches.prefix><slug>` and reuses it (no duplicate branch, no doubled-name worktree).
   - Otherwise creates the branch + worktree itself.
   - Creates `docs/<version>/<status>/<slug>/` in the (resolved) worktree.
   - Renders templates (`prd.md`, `workplan.md`, `README.md`) with placeholder substitution.
   - Records the target version in frontmatter so it travels with the feature.

5. Report: branch name, worktree path, docs directory, files scaffolded.

## Error handling

- **Branch already exists with no checked-out worktree.** Helper aborts: pick a different slug, remove the orphan branch (`git branch -D <name>`), or check the branch out in a worktree before re-running.
- **Doc directory already exists.** Helper aborts. Never overwrites — investigate the existing directory first.
- **Version directory missing.** Helper creates it atomically. `/dw-lifecycle:doctor` flags any version directories present in the file tree but absent from `config.docs.knownVersions`.
