---
name: feature-extend
description: "Extend a feature mid-implementation: add phases to PRD, workplan, and create new GitHub issues."
user_invocable: true
---

# Feature Extend

Adds new phases to an in-progress feature without creating new infrastructure.

### Step 1: Identify Feature and Current State
- Read existing PRD, workplan, README
- Check existing GitHub issues
- Report current state

### Step 2: Interview
- **What new capability?**
- **Why now?**
- **Does this change existing phases?**

### Step 3: Propose New Phases
- Determine next phase number
- Propose phases with tasks and acceptance criteria

### Step 4: Update PRD
- Append to scope section (do not rewrite existing content)
- Ensure the PRD has `deskwork.id` frontmatter. If it doesn't (legacy feature predating the deskwork-baked workflow), add it now via `deskwork ingest` so the extension can flow through review.

### Step 5: Update Workplan
- Append new phases following existing format

### Step 6: Re-iterate the extended PRD via deskwork (REQUIRED — do NOT skip)
- The PRD content changed. Per the project's feature lifecycle (`.claude/CLAUDE.md`), every PRD change goes through deskwork's review/iterate/approve cycle BEFORE issues are filed.
- If a deskwork workflow exists for this feature's PRD (most common case): the operator clicks Iterate in the studio (transitions to `iterating`), then run `deskwork iterate --site <site> <feature-slug>` to snapshot the extended PRD as v(n+1). Wait for approval (workflow state `applied`).
- If no workflow exists yet (legacy feature), run `deskwork review-start --site <site> <feature-slug>` to start one. Wait for approval.
- **Do NOT proceed to step 7 (GitHub issues) until the workflow is `applied`.** Filing issues for un-reviewed scope is the "I unilaterally added phases" failure mode that motivated this gate.

### Step 7: Create GitHub Issues (only after PRD approval)
- Find parent issue from workplan's GitHub Tracking section
- Create implementation issues for new phases
- Update workplan's tracking table

### Step 8: Report
- Summary of additions, updated phase count, deskwork workflow id + studio review URL, GitHub issues filed
- If approval is still pending, mark the report explicitly: "PRD review in progress; issues will be filed after approval."
