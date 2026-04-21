---
name: feature-setup
description: "Create feature infrastructure: git branch, worktree, docs directory, and documentation files."
user_invocable: true
---

# Feature Setup

1. **Determine feature slug and read definition:**
   - If invoked with an argument, use that as the slug
   - Otherwise, ask the user for the feature slug
   - Check for `/tmp/feature-definition-<slug>.md` — if it exists, use its contents
   - If no definition file exists, create blank templates and suggest running `/feature-define` first

2. **Create branch and worktree:**
   ```bash
   git worktree add ~/work/deskwork-work/<slug> -b feature/<slug>
   ```
   - Run from the main repository directory
   - If worktree already exists, report it and skip

3. **Create docs directory:**
   ```bash
   mkdir -p docs/1.0/001-IN-PROGRESS/<slug>
   ```

4. **Create documentation files:**
   - `docs/1.0/001-IN-PROGRESS/<slug>/prd.md` — PRD from definition file or template
   - `docs/1.0/001-IN-PROGRESS/<slug>/workplan.md` — workplan from definition file or template
   - `docs/1.0/001-IN-PROGRESS/<slug>/README.md` — status table with phases
   - `docs/1.0/001-IN-PROGRESS/<slug>/implementation-summary.md` — draft template
   - Use the Write tool for each file

5. **Report results:**
   - Branch name, worktree path, docs path, files created
   - Next step: review the docs, then run `/feature-issues`
