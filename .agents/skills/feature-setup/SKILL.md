---
name: feature-setup
description: Create feature infrastructure: branch, worktree, docs files, and deskwork PRD registration from a prior feature-definition draft.
---

# Feature Setup

1. Resolve the slug and read `.agents/.tmp/feature-definition-<slug>.md` if present.
2. Create the branch and worktree.
3. Create `docs/1.0/001-IN-PROGRESS/<slug>/`.
4. Create:
   - `prd.md` with `deskwork.id` frontmatter
   - `workplan.md`
   - `README.md`
   - `implementation-summary.md`
5. Register the PRD with deskwork using the project's configured collection/site.
6. Start the deskwork review workflow and capture the review URL.
7. Report the created paths and the next required operator action: PRD review until `applied`.
