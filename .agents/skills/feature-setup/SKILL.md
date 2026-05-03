---
name: feature-setup
description: "Create feature infrastructure: branch, worktree, and docs files from a prior feature-definition draft."
---

# Feature Setup

1. Resolve the slug and read `.agents/.tmp/feature-definition-<slug>.md` if present.
2. Create the branch and worktree.
3. Create `docs/1.0/001-IN-PROGRESS/<slug>/`.
4. Create:
   - `prd.md`
   - `workplan.md`
   - `README.md`
   - `implementation-summary.md`
5. Seed the PRD and workplan from the approved feature-definition draft.
6. Report the created paths and the next required operator action: review and approve the PRD/workplan in-repo before `feature-issues` or `feature-implement`.
