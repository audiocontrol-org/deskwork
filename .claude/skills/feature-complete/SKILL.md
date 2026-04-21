---
name: feature-complete
description: "Mark feature complete: move docs to 003-COMPLETE, update ROADMAP, close issues. Runs on feature branch BEFORE merge."
user_invocable: true
---

# Feature Complete

Runs on the feature branch before merge so bookkeeping is part of the PR.

1. **Identify feature** from worktree/branch. Error if on `main`.

2. **Verify PR exists:**
   - `gh pr list --head feature/<slug> --state open`

3. **Move docs:**
   ```bash
   mkdir -p docs/1.0/003-COMPLETE
   git mv docs/1.0/001-IN-PROGRESS/<slug> docs/1.0/003-COMPLETE/<slug>
   ```

4. **Update feature README** — all phases to "Complete", add PR link.

5. **Update ROADMAP.md** — move feature to 003-COMPLETE section.

6. **Commit and push:**
   ```bash
   git add -A
   git commit -m "docs: complete <slug> — move to 003-COMPLETE"
   git push
   ```

7. **Close GitHub issues:**
   - `gh issue close <number> --comment "Completed in PR #<pr-number>"`

8. **Report:** docs moved, ROADMAP updated, issues closed, next steps.
