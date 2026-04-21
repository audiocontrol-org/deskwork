---
name: feature-teardown
description: "Remove local feature infrastructure: worktree and branch. Infrastructure-only, no opinion on feature status."
user_invocable: true
---

# Feature Teardown

1. **Identify feature** from argument or current directory.

2. **Verify worktree exists:**
   ```bash
   git worktree list
   ```

3. **Check for uncommitted changes:**
   ```bash
   git -C ~/work/deskwork-work/<slug> status --porcelain
   ```
   - If uncommitted changes exist, warn and ask for confirmation

4. **Remove worktree:**
   ```bash
   git worktree remove ~/work/deskwork-work/<slug>
   ```

5. **Delete local branch:**
   ```bash
   git branch -d feature/<slug>
   ```
   - Use `-d` (not `-D`) — refuse if unmerged
   - If fails, report and ask user about `-D`

6. **Prune stale references:**
   ```bash
   git worktree prune
   ```

7. **Report:** worktree removed, branch deleted/retained, note to run `/feature-complete` first if needed.
