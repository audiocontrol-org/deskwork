---
name: feature-ship
description: "Prepare feature for merge: verify acceptance criteria, run tests, create PR."
user_invocable: true
---

# Feature Ship

1. **Identify feature** from worktree/branch.

2. **Verify workplan completeness:**
   - Read workplan, check all acceptance criteria are marked complete
   - If unchecked criteria remain, report and ask user

3. **Run tests:**
   - `npm test`
   - `npm run test:integration`
   - `npm run test:e2e`
   - If tests fail, report and stop

4. **Run code review** (delegate to code-reviewer or invoke `/feature-review` logic).

5. **Push branch:**
   - `git push -u origin feature/<slug>`

6. **Create pull request:**
   ```bash
   gh pr create --title "<title>" --body "## Summary
   [1-3 bullets]

   ## Test plan
   - [ ] [acceptance criteria as checklist]"
   ```
   - No Claude attribution in PR body

7. **Update README** with PR URL.

8. **Report:** PR URL, test results, review status, next steps.
