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

5. **Bump version** (release-shaped phases only — skip for docs-only or refactor PRs):
   - Determine the bump per `RELEASING.md` heuristic: **minor** for new user-visible capability, **patch** for a fix that keeps behavior compatible. The plugin is `0.x.y` so judgment-based, not strict semver.
   - Run: `npm run version:bump <semver>` (writes 9 manifests atomically: root + 3 workspace `package.json`, 2 plugin shell `package.json`, 2 `plugin.json`, marketplace.json top-level + per-plugin entries).
   - Verify the diff (`git diff` should touch only version strings). Commit as `chore: release v<semver>`.
   - **Do NOT tag here** — tagging happens after the PR merges to main, in step 10.

6. **Push branch:**
   - `git push -u origin feature/<slug>`

7. **Create pull request:**
   ```bash
   gh pr create --title "<title>" --body "## Summary
   [1-3 bullets]

   ## Test plan
   - [ ] [acceptance criteria as checklist]"
   ```
   - No Claude attribution in PR body

8. **Update README** with PR URL.

9. **Wait for PR merge.** Check status checks pass (`gh pr checks <n>`); resolve any merge conflicts (typically version-string conflicts when prior squash-merge collides with the bump — keep ours/0.x.y from the feature branch). Merge with `gh pr merge <n> --squash --delete-branch` (the local-checkout step may fail if `main` is checked out in another worktree; the server-side merge still succeeds — verify with `gh pr view <n> --json state`).

10. **Tag the release** (only after PR is merged to main):
    ```bash
    git fetch origin
    git tag -a v<semver> origin/main -m "Release v<semver>

    - <highlight 1>
    - <highlight 2>"
    git push origin v<semver>
    ```
    The tag push triggers `.github/workflows/release.yml` which runs build + tests + creates the GitHub release with auto-generated notes. Watch with `gh run watch <run-id>` or via the Monitor tool. Verify the release lands at `https://github.com/<org>/<repo>/releases/tag/v<semver>`.

11. **Report:** PR URL, test results, review status, version released, GitHub release URL, next steps.
