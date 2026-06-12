---
name: feature-setup
description: "Create feature infrastructure: branch, worktree, and docs files from a prior feature-definition draft."
---

# Feature Setup

DEPRECATED. The old repo-wide branch/worktree/docs feature setup flow is no
longer canonical.

Use the stack-control Spec Kit workflow instead:

1. Keep feature artifacts under `plugins/stack-control/specs/`
2. Use `plugins/stack-control/skills/define/SKILL.md` and `extend/SKILL.md`
3. Do not create new repo-wide `docs/1.0/001-IN-PROGRESS/<slug>/` feature scaffolds through this path
